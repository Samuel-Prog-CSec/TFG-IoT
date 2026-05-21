# Free Tier Budget — EduPlay RFID v1.0.0

> **Propósito:** documento único de presupuesto y límites del despliegue
> cloud sobre tiers gratuitos. Centraliza qué cuota tiene cada servicio,
> cuánto consume el proyecto en su dimensionamiento objetivo, cómo se
> monitoriza la proximidad al límite y cuál es el plan B si toca migrar
> a un tier de pago.
>
> **Audiencia:** Samuel (super_admin) y cualquier persona que herede la
> operación del proyecto tras la defensa del TFG.
>
> **Última actualización:** 21-05-2026 (T-910, ADR-168).

---

## 1. Resumen ejecutivo

Cada fila resume el límite duro 2026 del free tier, el consumo estimado
para el escenario objetivo del proyecto (un centro educativo con cinco
docentes y veinticinco alumnos por aula, dos sesiones semanales), cómo
se monitoriza, cuándo se debería pensar en escalar y el coste del tier
de pago mínimo si finalmente se migra.

| Servicio | Límite duro 2026 | Consumo estimado | Monitoreo | Umbral migración | Coste plan B |
|---|---|---|---|---|---|
| MongoDB Atlas M0 | 512 MB storage, CPU compartida, conexiones 500 | 200-300 MB tras 6 meses | Detector `atlas_storage_quota` (interno) + Atlas Charts | >80% storage o p95 queries > 800 ms sostenido | Atlas M2 ≈ $9/mes |
| Upstash Redis | 256 MB, 500 000 cmds/mes (≈10K/día medio), 200 GB BW | 50-80K cmds/mes | Detector `upstash_commands_quota` (interno) + Upstash Console | >80% diario proyectado o memoria > 200 MB | Pay-as-you-go ≈ $0,2 por 100K cmds |
| Koyeb (Backend + Worker, eco) | 0,1 vCPU, 512 MB RAM, ~100 GB BW/mes por servicio | 60-80 MB RAM, 8-15 GB BW | Koyeb metrics + UptimeRobot (warming) | Cold start > 5 s sostenido o RAM > 400 MB | Eco paid ≈ $1,61/mes/servicio |
| Cloudflare Pages | Bandwidth ilimitado, 500 builds/mes, 100 dominios | 1-2 builds/día (≈45/mes) | CF Analytics (manual mensual) | >300 builds/mes o pico de bandwidth anómalo | Pro $20/mes (no necesario por bandwidth) |
| Supabase Storage | 1 GB ficheros, 5 GB egress/mes, 50 MB max upload | 200-400 MB ficheros, 0,5-1 GB egress | Supabase Studio (manual mensual) | >80% egress o >800 MB storage | Pro $25/mes |
| Sentry SaaS | 5 K errores + 10 K transacciones/mes | 1-2K errores, 3-5K transacciones | Sentry Stats (manual mensual) + email Sentry | >80% cuota mensual | Team $26/mes |
| UptimeRobot | 50 monitors, intervalo mínimo 5 min | 4-5 monitors | UptimeRobot dashboard | >40 monitors o necesidad de SMS | Pro $7/mes (con SMS) |
| GitHub Actions | Ilimitado en repos públicos | ~300-480 min/mes | GitHub billing (manual mensual) | Visibilidad pasa a privada y supera 2K min | $0,008/min privado |
| Grafana Cloud Loki | 50 GB ingest/mes, retención 14 días | ~5-15 GB/mes | Grafana Cloud Usage | >80% ingest | Pro plan ≈ $8/mes |

**Lectura rápida:** el escenario objetivo del proyecto entra holgadamente
en el free tier. Los dos cuellos de botella reales aparecerían si crece
la base de usuarios (Atlas M0 degrada bajo concurrencia ~50 usuarios y
Upstash 500K cmds/mes se acerca con tráfico intenso). El detalle por
servicio está en §2; el cálculo del escenario objetivo en §3.

---

## 2. Servicio por servicio

### 2.1 MongoDB Atlas M0

**Límite duro:** 512 MB de storage compartido entre `dataSize` e
`indexSize`. CPU y RAM compartidas (shared instance). Hasta 500
conexiones simultáneas teóricas, en la práctica varios cientos se notan
en latencia.

**Soft limit:** las queries que tocan colecciones grandes empiezan a
degradar (p95 > 800 ms) cuando la concurrencia supera ~50 usuarios
activos simultáneos, mucho antes de tocar el techo de storage.

**Consumo estimado:**
- Datos: usuarios (1-2 KB), mazos y contextos (3-8 KB), sesiones
  (10-30 KB), partidas (15-40 KB), métricas materializadas (5-10 KB).
- Crecimiento esperado tras 6 meses de operación 1 centro: 200-300 MB.
- Índices: ~15-25% del tamaño de datos según `db.stats()`.

**Monitoreo:**
- **Interno (T-910):** detector `atlas_storage_quota` corre cada 5 min,
  consulta `db.stats({ scale: 1 })` con caché de 1 hora y emite
  SmartAlert al cruzar el 80% del presupuesto (configurable vía
  `ATLAS_STORAGE_BUDGET_MB`).
- **Externo:** Atlas UI → Metrics → "Storage" + "Connections".

**Umbral de migración:** cualquier alerta `critical` (>95%), o p95 de
`analytics.classroomSummary` sostenido > 800 ms tras T-907 (ADR-158).

**Plan B:** Atlas M2 (~$9/mes) — 2 GB storage, CPU dedicada compartida
pero menos saturada, mejor latencia. No requiere migración: cambio de
tier en la misma cuenta sin downtime.

**Adaptaciones ya implementadas (no nuevas en T-910):**
- Pool Mongoose con `maxPoolSize: 10`, `serverSelectionTimeoutMS: 10000`
  y circuit breaker (T-902, ADR-093).
- Worker `data-retention` que aplica purga RGPD diaria (T-908).
- Auditoría de índices en hot paths (T-907, ADR-158).
- `mongodump` mensual documentado en Runbook §13.

### 2.2 Upstash Redis

**Límite duro:** 256 MB de memoria. 500 000 comandos/mes (≈10 000/día
medio sostenido). 200 GB de bandwidth/mes.

**Soft limit:** Upstash empieza a evictar entradas (LRU) cuando se acerca
a 256 MB; con `noeviction` (ADR-094) preferimos errores antes que
silenciosa pérdida de datos.

**Consumo estimado:**
- Rate-limit (`rl:*`), sesiones Socket.IO, locks de partida, idempotencia
  startPlay, cache slim-user, cache analytics, BullMQ queues.
- Memoria estable: 80-120 MB con cache analytics calentado.
- Comandos: 30-80K/mes para uso típico (revisado en staging con tráfico
  sintético).

**Monitoreo:**
- **Interno (T-910):** detector `upstash_commands_quota` lee
  `runtimeMetrics.redis.commandsEstimatedDaily` (proyección lineal por
  categoría producida en T-907, ADR-158) y emite SmartAlert al 80% del
  presupuesto diario configurable (`UPSTASH_DAILY_BUDGET`).
- **Interno (T-910):** detector `rate_limit_store_fallback` vigila que
  los limiters HTTP no hayan caído a MemoryStore (síntoma de Redis
  intermitente que rompe el rate limit distribuido).
- **Externo:** Upstash Console → Metrics → "Commands per day" y "Memory
  usage".

**Umbral de migración:** alerta `critical` (>95%) o memoria > 200 MB
sostenida.

**Plan B:** Upstash Pay-as-you-go (~$0,20 por 100 000 comandos). Para un
mes con 1 millón de comandos saldría ≈ $2/mes. Cambio sin downtime.

**Adaptaciones ya implementadas:**
- Tracker de comandos por categoría con extrapolación lineal (T-907 D).
- Caché LRU en memoria (`auth:user` 30s, `cache:mechanic` 60s,
  `cache:context` 60s) que evita golpear Redis para keys calientes
  (T-907 D).
- Helper `runPipeline` para colapsar varios comandos en un round trip.
- `keyPrefix` por entorno para reutilizar la misma DB si fuera necesario.

### 2.3 Koyeb (Backend + Worker)

**Límite duro:** instancias `eco` con 0,1 vCPU, 512 MB RAM, ≈100 GB de
bandwidth mensual por servicio.

**Soft limit:** Koyeb eco **hiberna** el contenedor tras unos minutos
sin tráfico. El primer request post-hibernación sufre cold start (~2-4
segundos).

**Consumo estimado:** RAM 60-80 MB en idle, picos de hasta 200 MB con
analítica concurrente. CPU < 10 % bajo carga normal. Bandwidth muy por
debajo de 100 GB para el escenario objetivo.

**Monitoreo:**
- **Externo:** Koyeb dashboard → "Metrics" por servicio. Logs en tiempo
  real (retention ~72 h, después en Grafana Loki).

**Umbral de migración:** RAM sostenida > 400 MB (riesgo OOM en eco) o
cold start > 5 s repetido.

**Plan B:** Koyeb Eco de pago (~$1,61/mes por servicio) — sin
hibernación, misma capacidad. Para producción real se recomendaría
Starter ($5/mes).

**Adaptaciones ya implementadas:**
- Liveness (`/health/live`) vs readiness (`/health/ready`) probes
  separados (T-902, ADR-092).
- Graceful shutdown con drain BullMQ y Socket.IO (T-902, ADR-093).
- Pool Mongoose y Redis tuneados para latencia de cloud.
- **Cold-start warming pasivo** vía monitors UptimeRobot pinging
  `/health/live` cada 5 min (ver §2.7 y T-904).
- `preview-deploy.yml` deshabilitado por defecto vía
  `vars.PREVIEW_DEPLOYS_ENABLED` para preservar la cuota Koyeb (ver §4).

### 2.4 Cloudflare Pages + DNS/Proxy

**Límite duro:** bandwidth ilimitado, 500 builds/mes, 100 dominios
personalizados, 20 000 ficheros por proyecto, 25 MB por asset.

**Soft limit:** 500 builds/mes equivale a ≈16/día, holgado para un
proyecto con merges esporádicos.

**Consumo estimado:** 1-2 builds/día (push a `main` y `Maintenance`).

**Monitoreo:**
- **Externo:** Cloudflare Dashboard → Analytics tab "Traffic" + Pages
  deploys log.

**Umbral de migración:** no aplica por bandwidth (gratis ilimitado);
solo si se necesitan Workers, R2 o features Pro de seguridad avanzada.

**Plan B:** Pro $20/mes — Workers, mayor cuota, soporte premium. No es
necesario para v1.0.0.

**Adaptaciones ya implementadas:**
- Compresión Brotli y Gzip en build Vite (T-907, ADR-159).
- Source maps `hidden` en producción.
- Bundle size budget bloqueante en CI (6 MB total / 900 KB gz JS) que
  bloquea fusiones que inflen el bundle (ver §4).
- WAF managed (OWASP Core Ruleset) + rate-limit edge documentados en
  T-905 (ADR-160).

### 2.5 Supabase Storage

**Límite duro:** 1 GB de ficheros, 5 GB de egress mensual, 50 MB por
upload, 50 K usuarios mensuales activos (no aplica — no usamos auth).

**Soft limit:** 5 GB de egress mensual es lo más ajustado; equivale a
unas 5 000 descargas de un asset típico de 1 MB.

**Consumo estimado:** ~200-400 MB de assets de tarjetas (subidas
docentes), egress ~0,5-1 GB/mes para escenario objetivo.

**Monitoreo:**
- **Externo (manual mensual):** Supabase Studio → Project Settings →
  Usage. Sentry + email de Supabase ante umbrales propios.

**Umbral de migración:** >80% de egress sostenido o crecimiento de
storage > 800 MB.

**Plan B:** Supabase Pro $25/mes — 100 GB storage, 200 GB egress.

**Adaptaciones ya implementadas:**
- Pipeline de upload genera thumbnails WebP 256×256 con
  `Cache-Control: max-age=31536000` (T-908).
- CDN nativo de Supabase Storage entrega assets cacheados a clientes.

### 2.6 Sentry SaaS

**Límite duro:** 5 K errores + 10 K transacciones de performance por mes
(cuota compartida).

**Soft limit:** cuando se acerca al 80%, Sentry envía email automático;
si se cruza, los eventos extra se descartan.

**Consumo estimado:** 1-2K errores y 3-5K transacciones/mes con
sampleRate prod 0,1 y staging 0,5.

**Monitoreo:**
- **Externo (manual mensual + email Sentry):** Sentry → Stats → Quotas.

**Umbral de migración:** >80% mensual sostenido durante dos meses.

**Plan B:** Sentry Team $26/mes — 50K errores + 100K transacciones.

**Adaptaciones ya implementadas:**
- Sampling per-env (`SENTRY_TRACES_SAMPLE_RATE`) con defaults 0,1 prod
  / 0,5 staging / 1,0 dev (T-904, ADR-165).
- Sentry dynamic import en frontend (`requestIdleCallback`) para no
  bloquear LCP (T-907, ADR-159).
- Sourcemaps subidos solo opcionalmente vía
  `.github/workflows/sentry-release.yml` (`workflow_dispatch`).

### 2.7 UptimeRobot

**Límite duro:** 50 monitors HTTP/keyword/ping, intervalo mínimo 5 min,
retención de logs 3 meses.

**Consumo estimado:** 4 monitors obligatorios (T-904) + status page
pública.

**Monitoreo:** UptimeRobot dashboard.

**Umbral de migración:** necesidad de SMS, voz, o intervalos < 5 min.

**Plan B:** Pro $7/mes — incluye SMS.

**Adaptaciones ya implementadas:**
- 4 monitors apuntando a `/health/live` (no `/health/ready`): preservan
  cuota Upstash y evitan falsos positivos por circuit breaker abierto.
- **Cold-start warming pasivo:** el ping cada 5 min mantiene a Koyeb
  eco activo entre demos sin coste adicional.
- Status page pública `https://stats.uptimerobot.com/eduplay-rfid`.

### 2.8 GitHub Actions

**Límite duro:** ilimitado para repos públicos; 2 000 min/mes en repos
privados con free tier.

**Consumo estimado:** ~5-8 min por build × 1-2 builds/día → 300-480
min/mes.

**Monitoreo:** GitHub → Settings → Billing.

**Umbral de migración:** sólo si el repo se vuelve privado y se acerca
a 2 000 min/mes.

**Plan B:** $0,008/min en runners Linux estándar (2 000 min ≈ $16/mes).

**Adaptaciones ya implementadas (relevantes para free-tier):**
- `concurrency.cancel-in-progress: true` en CI cancela runs obsoletas
  del mismo PR (ahorro de minutos).
- `paths-ignore` excluye cambios solo-docs (`documentation/**`,
  `development/**`, `**.md`) — los commits que tocan únicamente
  documentación no consumen minutos.
- `cache: npm` con `cache-dependency-path` evita reinstalar
  dependencias por workflow.
- Smoke test `/health/ready` con `sleep 15` × 8 acotado por timeout.

### 2.9 Grafana Cloud Loki

**Límite duro:** 50 GB de logs ingestados/mes, 14 días de retención,
3 usuarios activos.

**Consumo estimado:** 5-15 GB/mes según verbosidad de Pino y staging vs
prod.

**Monitoreo:** Grafana Cloud Usage page.

**Umbral de migración:** >80% sostenido o necesidad de >14 días
retención.

**Plan B:** Grafana Cloud Pro ≈ $8/mes.

**Adaptaciones ya implementadas:**
- `pino-loki` configurable vía `LOG_SHIPPING_ENABLED` (T-904,
  ADR-166). Si la cuota empieza a apretar se desactiva sin riesgo —
  Koyeb retiene logs ~72 h como fallback.

---

## 3. Dimensionamiento objetivo TFG

El proyecto se dimensiona para el **escenario base** de un centro
educativo, no para masificación. La hipótesis de carga es:

- **1 centro educativo activo**.
- **5 docentes** dados de alta.
- **5 aulas** × 25 alumnos = 125 alumnos en total.
- **2 sesiones semanales** por aula × 5 aulas = 10 sesiones/sem.
- **15-25 partidas por sesión** (3-5 alumnos secuenciales × 5 rondas).

**Estimación derivada:**

| Recurso | Cálculo | Resultado |
|---|---|---|
| Storage Atlas | 1 GamePlay ≈ 25 KB; 125 alumnos × 2 sesiones/sem × 5 rondas = 1 250 plays/sem × 25 KB = 30 MB/sem → 1,5 GB/año | Cabe en M0 menos de 4 meses sin retención; con retención RGPD activa, estable 200-300 MB |
| Comandos Upstash | 1 partida ≈ 30-50 comandos (auth, rate-limit, lock RFID, sesión, idempotencia). 1 500 partidas/sem × 50 = 75 K cmds/sem | ~300K cmds/mes (60% del free tier) |
| Egress Supabase | 25 alumnos × 2 sesiones/sem × 15 KB de assets renderizados ≈ 750 KB/sem por aula × 5 = 3,75 MB/sem | ~15 MB/mes (despreciable frente a 5 GB) |
| Tráfico Cloudflare Pages | Carga inicial ≈ 600 KB gz × 5 docentes × 10 logins/día | < 1 GB/mes (gratis ilimitado) |
| Sentry transacciones | sampleRate 0,1 sobre ~1500 partidas/mes con 5 spans por partida = ~750 transacciones | 7,5 % del free tier |
| Grafana Loki ingest | Logs estructurados Pino ~500 bytes/event × 50 events por partida × 1500 partidas = ~37 MB/mes | < 0,1 % del free tier |

**Conclusión:** el escenario objetivo entra holgadamente. Los márgenes
de seguridad permiten absorber picos puntuales (festivales escolares,
formación de docentes, etc.) sin migrar a paid.

---

## 4. Alertas tempranas

| Servicio | Mecanismo | Umbral | Acción |
|---|---|---|---|
| Upstash commands | Detector `upstash_commands_quota` (interno) | warning ≥80%, critical ≥95% del presupuesto diario | SmartAlert visible en `/admin/system-alerts` + notificación realtime al super_admin si critical. Runbook §13b |
| Atlas storage | Detector `atlas_storage_quota` (interno) | warning ≥80%, critical ≥95% de 512 MB | Idem. Runbook §13a |
| Rate limit distribuido | Detector `rate_limit_store_fallback` (interno) | cualquier ocurrencia > 0 | SmartAlert warning. Runbook §13b |
| Cache LRU memoria | Detector `in_memory_cache_low_hit` (interno) | hit ratio < 40% sostenido 4 muestras | SmartAlert warning. Performance_Notes §cache-lru |
| Cloudflare Pages bandwidth | Workflow mensual (issue checklist) | revisión manual | Issue automática el día 1 de cada mes |
| Sentry quota | Email automático Sentry + workflow mensual | 80% Sentry / revisión manual | Runbook §13d |
| Supabase egress | Workflow mensual (issue checklist) | revisión manual | Runbook §13c |
| GitHub Actions minutes | Workflow mensual (issue checklist) | revisión manual | Sólo aplica si el repo se hace privado |
| Grafana Loki ingest | Workflow mensual (issue checklist) | revisión manual | Apagar `LOG_SHIPPING_ENABLED` si necesario |

El workflow `.github/workflows/free-tier-monthly-review.yml` se dispara
el día 1 de cada mes a las 09:00 UTC y crea una issue con la checklist
de los servicios sin telemetría interna gratuita. La lista de servicios
"con SmartAlert" no necesita la issue mensual porque el detector ya
vigila continuamente.

---

## 5. Revisión mensual checklist (servicios externos)

Para cada servicio sin detector interno, abrir el dashboard y verificar
las métricas listadas. El workflow mensual crea automáticamente esta
checklist como issue de GitHub el día 1 de cada mes:

- **Sentry** → Stats → Quotas. Verificar errores y transacciones
  mensuales acumulados < 80% de las cuotas (5 K y 10 K respectivamente).
- **Supabase** → Project Settings → Usage. Verificar storage < 800 MB y
  egress mensual < 4 GB.
- **Cloudflare** → Analytics → Traffic. Verificar builds del mes < 300
  y traffic anómalo.
- **GitHub Actions** → Settings → Billing. Sólo relevante si el repo es
  privado: verificar minutos consumidos < 1500.
- **Grafana Cloud Loki** → Usage. Verificar ingest mensual < 40 GB.
- **UptimeRobot** → Dashboard. Verificar que los 4 monitors están
  verdes y que la status page pública responde.

Cuando un valor cruce el 80%, abrir el playbook correspondiente del
Runbook (§13a-e).

---

## 6. Plan B detallado (migración a paid)

Si todos los servicios tuvieran que escalar simultáneamente al tier de
pago mínimo:

| Servicio | Tier paid mínimo | Coste mensual estimado |
|---|---|---|
| MongoDB Atlas M2 | M2 (2 GB, dedicated shared CPU) | $9 |
| Upstash Pay-as-you-go | $0,20 por 100K cmds | $1-3 |
| Koyeb Eco × 2 servicios | $1,61/mes/servicio | $3,22 |
| Cloudflare Pages | Free suficiente | $0 |
| Supabase Pro | 100 GB storage, 200 GB egress | $25 |
| Sentry Team | 50K errores + 100K transacciones | $26 |
| UptimeRobot Pro | 50 monitors + SMS | $7 |
| Grafana Cloud Pro | 100 GB ingest | $8 |
| **Total** | | **≈ $79/mes** |

Para el escenario objetivo TFG, ninguno de estos upgrades es necesario.
Documentado aquí para que cualquier sucesor sepa el coste real de operar
sin restricciones del free tier.

---

## 7. Referencias

- **ADR-168** — Estrategia de presupuesto free-tier: detectores
  internos SmartAlert + revisión mensual externa.
- **ADR-158** — Telemetría comandos Upstash + LRU memoria + pipeline
  helper (T-907).
- **ADR-159** — Bundle frontend reduction (T-907).
- **ADR-160** — Cloudflare cache + WAF + rate-limit edge (T-907 / T-905).
- **ADR-165** — Sentry Performance instrumentación + sampling per-env
  (T-904).
- **ADR-166** — Log shipping con Grafana Cloud Loki + `pino-loki`
  (T-904).
- **Runbook_Operacional.md** §13a/§13b/§13c/§13d/§13e — playbooks de
  respuesta ante cruce del 80% en cada servicio.
- **Operational_Dashboard.md** — mapa de las 6 consolas externas y
  saved queries.
- **DEPLOY_GUIA_COMPLETA.md** — pasos manuales de aprovisionamiento.
- **Secrets_Rotation.md** — política de rotación de credenciales.

---

*Documento mantenido por Samuel Blanchart Pérez. Actualizar cada vez
que cambien las cuotas free tier de algún proveedor o cuando se añada o
elimine un servicio del stack.*
