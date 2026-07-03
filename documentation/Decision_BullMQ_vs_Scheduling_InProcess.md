# Decisión pendiente: BullMQ vs scheduling in-process para jobs periódicos

> **Estado:** propuesta para decidir en sesión dedicada. No implementada.
> **Contexto:** auditoría de mantenimiento 2026-07-02 (hallazgo RD-1).
> **Ámbito:** Backend / Infraestructura de jobs. **Deploy objetivo:** Upstash Redis free tier.
> **Autor del análisis:** revisión "ojos nuevos" full-stack.

Este documento describe el problema de coste de BullMQ sobre Upstash free tier, las
opciones para resolverlo, y lo que se gana y se pierde con cada una, para poder
decidir con criterio en una sesión futura. **No se ha tocado el código de jobs**;
en la sesión 2026-07-02 solo se aplicaron mitigaciones de bajo riesgo (ver más
abajo).

---

## 1. El problema

El proceso `worker` arranca **4 workers BullMQ** (`src/workers/index.js`):

- `data-retention` (RGPD, cron)
- `alert-detection` (alertas pedagógicas, cron)
- `system-alert-detection` (alertas de sistema, cron)
- `analytics-reconcile` (reconciliación nocturna, cron)

BullMQ, por diseño, hace **polling activo de Redis incluso en reposo**: cada worker
espera trabajo con `BZPOPMIN`/`BRPOPLPUSH` sobre las colas, con un **timeout máximo
de bloqueo interno de ~10 s** (constante `maximumBlockTimeout` de la librería, no
configurable vía `drainDelay` cuando hay *delayed jobs* pendientes — y un cron
repetible SIEMPRE deja un delayed job programado). Al expirar cada espera, ejecuta
un `EVALSHA moveToActive`, y periódicamente un *stalled check* (`stalledInterval`,
30 s por defecto).

### Coste estimado en reposo (sin usuarios)

| Fuente | Comandos/día (estimado) |
|---|---|
| Polling BullMQ en idle: 4 workers × (BZPOPMIN/10s + moveToActive + stalled/30s) | **~80.000** |
| Cron system-alerts (tras mitigación */15): PING + 7 ZCOUNT + getJobCounts + SCAN/DEL | ~2.900 |
| Lifecycle de jobs repetibles (~4 crons) | ~2.000–4.000 |
| **Total idle aprox.** | **~85.000–90.000/día ≈ ~2,6 M/mes** |

El **free tier de Upstash** ofrece del orden de **500.000 comandos/mes**. El consumo
idle estimado lo supera en **~5×** — **solo con el backend en reposo, sin una sola
partida jugada**. El ~85 % del coste proviene del polling de BullMQ, que además es
**invisible para la telemetría interna** (el tracker de comandos solo instrumenta
`redisService`; BullMQ usa conexiones propias — ver hallazgo RD-2).

> ⚠️ **Antes de decidir: MEDIR.** Estas cifras son estimaciones basadas en el
> comportamiento documentado de BullMQ 5.x. **Validar el consumo real en la consola
> de Upstash** durante 24 h de idle antes de invertir en el rediseño. Si el
> consumo real fuera mucho menor (p. ej. Upstash agrupa/optimiza el polling), la
> urgencia baja.

---

## 2. Por qué ocurre (y por qué las mitigaciones no bastan)

BullMQ está pensado para Redis **self-hosted** o planes con **coste por memoria/hora**,
no por comando. En esos entornos el polling es gratis. Upstash factura **por comando**,
así que el patrón "espera activa" de BullMQ se vuelve caro en reposo.

Subir `drainDelay` **no ayuda**: con delayed jobs presentes, el timeout de bloqueo
se capa a 10 s dentro de la librería. Consolidar en 1 cola/1 worker + `skipStalledCheck`
reduciría a ~17K/día — **sigue por encima** del presupuesto (~500K/mes ≈ 16K/día).

---

## 3. Opciones

### Opción A — Mantener BullMQ (statu quo)
- **Se gana:** cero trabajo; reintentos, backoff, dashboards y semántica de colas
  robusta ya implementados; útil si algún día hay jobs *ad-hoc* de verdad (colas.
  Hoy `gdpr-exports` y `notifications` están registradas pero **sin productores**).
- **Se pierde / riesgo:** el free tier de Upstash **no es viable** con este patrón;
  habría que pasar a un plan de pago (~coste mensual estimado) o aceptar throttling.
  Para un TFG, el coste recurrente es el problema principal.

### Opción B — Reemplazar BullMQ por scheduling in-process (recomendada a valorar)
Los 4 jobs son **crons puros sin productores ad-hoc**. Un scheduler in-process
(`node-cron` o `setInterval`) en `worker.js`, con un **lock distribuido `SET NX EX`**
en Redis para evitar solapamiento si algún día hay >1 worker, cubre exactamente el
caso de uso.

- **Se gana:** **~0 comandos Redis en idle** (el scheduler vive en memoria del
  proceso; solo toca Redis cuando el job efectivamente corre). Encaja de lleno en el
  free tier. Menos dependencias (se puede retirar `bullmq`).
- **Se pierde / riesgo:**
  - Se pierden reintentos automáticos con backoff, la cola de jobs fallidos y el
    dashboard de BullMQ. Para crons idempotentes esto es asumible (la siguiente
    corrida reintenta), pero hay que **añadir manejo de error + logging** en cada job.
  - El lock `SET NX` debe estar **bien hecho** (TTL > duración máxima del job, release
    en `finally`, tolerancia a expiración) para no ejecutar dos veces ni bloquearse.
  - Si en el futuro se implementan `gdpr-exports`/`notifications` como colas reales
    con productores (p. ej. exportaciones bajo demanda encoladas), habría que
    reintroducir una cola — pero eso puede convivir: crons in-process + una cola
    puntual solo cuando exista un productor real.
  - Cambio en infraestructura de jobs → requiere **verificación cuidadosa** de que
    retención RGPD, detección de alertas y reconciliación siguen ejecutándose con la
    cadencia correcta (tests + observación en staging).

### Opción C — Migrar a un scheduler serverless externo (cron de la plataforma)
Koyeb / GitHub Actions / Cloudflare Cron dispara un endpoint HTTP protegido que
ejecuta cada job.
- **Se gana:** cero polling; el trigger vive fuera del proceso; se puede escalar el
  worker a cero.
- **Se pierde / riesgo:** acopla los jobs a la plataforma de deploy; hay que exponer
  y **proteger** endpoints de trigger (auth/secreto); más piezas móviles. Menos
  portable que la opción B.

---

## 4. Recomendación

**Valorar la Opción B** (scheduling in-process con lock `SET NX`) en una sesión
dedicada, **después de confirmar el consumo real en Upstash**. Es la que mejor encaja
con la restricción dura del proyecto (free tier) y con la naturaleza real de los jobs
(crons idempotentes, sin productores ad-hoc). El coste es un refactor acotado de la
capa de jobs con verificación en staging; el beneficio es eliminar ~85 % del consumo
Redis idle y hacer el free tier viable.

Mientras tanto, **no bloquea el deploy**: con el `worker` apagado o el cron muy
espaciado se puede operar temporalmente, y las mitigaciones de bajo riesgo ya
reducen algo el coste.

---

## 5. Mitigaciones YA aplicadas (sesión 2026-07-02, bajo riesgo)

Estas NO requieren rediseño y ya están en el código:

- **Cron `system-alert-detection` de */5 → */15 min** por defecto
  (`config/systemAlerts.js`): ~3× menos corridas del detector.
- **`getJobCounts` del detector de backlog**: de 5 estados a 4 (se eliminó
  `completed`, que se pedía pero no se usaba) — 1 comando menos por cola y corrida
  (`systemDetectors/queueBacklog.js`).
- **Invalidación de cache de system-alerts condicional**: el `SCAN + DEL` solo corre
  si hubo cambios reales (created/updated/escalated/…); antes se ejecutaba cada
  corrida aunque no cambiara nada (`systemAlertDetectionService.js`).

## 6. Trabajo relacionado a incluir en la sesión de rediseño

- **RD-2 (telemetría ciega):** el detector `upstash_commands_quota` mide el snapshot
  LOCAL del worker y no ve el backend HTTP ni BullMQ/rate-limit-redis/pub-sub. Sea
  cual sea la decisión sobre BullMQ, la telemetría de cuota debería basarse en un
  contador compartido en Redis o en el consumo real de Upstash para ser fiable.
- Reconciliar `documentation/Free_Tier_Budget.md`, cuyas cifras (§1 vs §3) no
  incluían el coste idle de BullMQ y quedan desactualizadas.
