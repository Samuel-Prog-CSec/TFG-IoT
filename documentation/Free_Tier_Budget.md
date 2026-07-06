# Free Tier Budget — EduPlay RFID v1.0.0

> **Propósito:** documento único de presupuesto y límites del despliegue
> sobre tiers gratuitos y sobre el recurso propio (VPS). Centraliza qué
> cuota tiene cada servicio que sigue siendo cloud, cuánto consume el
> proyecto en su dimensionamiento objetivo, cómo se monitoriza la
> proximidad al límite (o, en el caso de la VPS, al agotamiento de
> recursos propios) y cuál es el plan B si toca migrar a un tier de pago.
>
> **Audiencia:** Samuel (super_admin) y cualquier persona que herede la
> operación del proyecto tras la defensa del TFG.
>
> **Última actualización:** 06-07-2026 — migración de Koyeb (backend +
> worker) y Cloudflare Pages (frontend) a una VPS Contabo autoalojada;
> MongoDB y Redis dejan de ser servicios cloud (Atlas/Upstash) y pasan a
> autoalojados en la misma VPS. Ver `docs/plans/2026-07-06-migracion-despliegue-vps-contabo-design.md`
> y `Deploy_VPS.md`. El histórico previo (ADR-226 y anteriores, con las
> filas de Koyeb/Atlas/Upstash/Cloudflare Pages) se conserva más abajo
> como referencia de cómo se gestionó el free tier hasta esa fecha.

---

## 1. Resumen ejecutivo

Cada fila resume el límite duro 2026 del free tier, el consumo estimado
para el escenario objetivo del proyecto (un centro educativo con cinco
docentes y veinticinco alumnos por aula, dos sesiones semanales), cómo
se monitoriza, cuándo se debería pensar en escalar y el coste del tier
de pago mínimo si finalmente se migra.

| Servicio | Límite duro 2026 | Consumo estimado | Monitoreo | Umbral migración | Coste plan B |
|---|---|---|---|---|---|
| **VPS Contabo (recursos propios)** | 11 GB RAM / 191 GB disco / 6 vCPU — fijo, sin cuota externa de terceros | ~3,875 GB RAM por stack × 2 stacks (staging + prod) ≈ 7,75 GB de los 11 GB (límites `deploy.resources.limits` de `docker-compose.prod.yml`); disco dominado por `mongo-data` (crece con retención RGPD) | `free -h` / `df -h` manual, o cron con alerta por email al superar un umbral fijo | No aplica un "umbral de migración" en el sentido cloud (no hay tier de pago al que subir): el umbral es operativo — ver §2.0 | No aplica (recurso propio ya pagado/cedido); si se agota, la opción es ampliar el plan Contabo o repartir servicios en una segunda VPS |
| Supabase Storage | 1 GB ficheros, 5 GB egress/mes, 50 MB max upload | 200-400 MB ficheros, 0,5-1 GB egress | Supabase Studio (manual mensual) | >80% egress o >800 MB storage | Pro $25/mes |
| Sentry SaaS | 5 K errores + 10 K transacciones/mes | 1-2K errores, 3-5K transacciones | Sentry Stats (manual mensual) + email Sentry | >80% cuota mensual | Team $26/mes |
| UptimeRobot | 50 monitors, intervalo mínimo 5 min | 4-5 monitors | UptimeRobot dashboard | >40 monitors o necesidad de SMS | Pro $7/mes (con SMS) |
| GitHub Actions | Ilimitado en repos públicos | ~300-480 min/mes | GitHub billing (manual mensual) | Visibilidad pasa a privada y supera 2K min | $0,008/min privado |
| Grafana Cloud Loki | 50 GB ingest/mes, retención 14 días | ~5-15 GB/mes | Grafana Cloud Usage | >80% ingest | Pro plan ≈ $8/mes |

> **MongoDB Atlas M0, Upstash Redis, Koyeb y Cloudflare Pages ya no forman parte del stack** (migración 06-07-2026, ver `Deploy_VPS.md`): Mongo y Redis pasan a autoalojados en la misma VPS (sin cuota de terceros, sujetos solo al límite físico de la fila "VPS Contabo" de arriba); el backend/worker/frontend corren en Docker Compose en la misma VPS; no hay hosting de terceros para el frontend. El detalle histórico de esas cuatro filas (útil para entender decisiones de coste pasadas) se conserva en §2.1-§2.4 marcado como retirado.

**Lectura rápida:** el escenario objetivo del proyecto entra holgadamente
en los recursos propios de la VPS (7,75 GB de RAM reservada sobre 11 GB
disponibles, ~70% con margen amplio para picos). Ya no hay "cuellos de
botella de free tier" en el sentido cloud — el límite real es el hardware
fijo de la VPS, que se vigila con umbrales de monitoreo propios (§2.0)
en vez de cuotas de terceros. El detalle por servicio (incluido el
histórico retirado) está en §2; el cálculo del escenario objetivo en §3.

> **Reducciones de coste Upstash (ADR-224, 01-07-2026).** Tras ver el detector
> `upstash_commands_quota` disparar una crítica al 97,1% del presupuesto diario,
> se recortaron consumidores de comandos sin cambiar comportamiento a `scale=1`:
> (1) los `PUBLISH`/`SUBSCRIBE` de coordinación entre instancias (modo RFID e
> invalidación de LRU) ahora se auto-gatean tras `SOCKET_ADAPTER_ENABLED`
> (`config/scaling.js`); (2) el `ZREMRANGEBYRANK` no-op de los leaderboards pasa a
> muestreo ~2% por partida (−12 comandos/partida); (3) la L1 en memoria de
> mecánicas/contextos se cableó en `cacheGet` (ahorra un GET Redis por lectura de
> dashboard). Nota de observabilidad: el detector `memory_pressure` medía
> `heapUsed/heapTotal` (~90% siempre en Node = falso positivo perpetuo); ahora mide
> **RSS/`MEMORY_LIMIT_MB`** (Koyeb free ≈512MB), coherente con el umbral "RAM > 400 MB"
> de la fila de Koyeb.

> **Reducción adicional (ADR-229, 04-07-2026).** El rate-limit **HTTP** usaba
> `RedisStore` sin gatear por escala — **un comando Upstash por request** en todas
> las `/api/*`. En `scale=1` el contador no necesita ser distribuido (una sola
> instancia cuenta igual con MemoryStore), así que `createRedisStore` retorna
> MemoryStore cuando `!isMultiInstanceEnabled()` — mismo criterio que pub/sub y el
> adapter Socket.IO — **sin** marcar `rateLimitStoreFallbackCount` (elección
> deliberada, no pérdida de Redis; el detector `rate_limit_store_fallback` sigue
> vigilando fallos reales en multi-instancia). Ahorra un estimado de ~6-12K
> comandos/día bajo carga de aula; el store distribuido se reactiva junto al resto
> de coordinación al activar `SOCKET_ADAPTER_ENABLED`. `config/security.js`.

---

## 2. Servicio por servicio

### 2.0 VPS Contabo (recursos propios)

**Límite duro:** hardware fijo, sin cuota de terceros — 6 vCPU (AMD EPYC), 11 GB RAM, 191 GB
disco libre. Ubuntu 24.04.4 LTS. Cedida por el tutor del TFG (ver `Deploy_VPS.md` §0).

**Qué corre en la VPS:** dos stacks Docker Compose paralelos, `eduplay-staging` y
`eduplay-prod`, cada uno con su propio `frontend` + `backend` + `worker` + `mongo` + `redis`
(aislamiento total de datos entre entornos). Nginx y Certbot corren a nivel de sistema
operativo (fuera de Docker), delante de ambos stacks.

**Consumo estimado (límites `deploy.resources.limits` de `docker-compose.prod.yml`, por stack):**

| Servicio | Límite de memoria |
|---|---|
| frontend | 128 MB |
| backend | 1 GB |
| worker | 256 MB |
| mongo | 2 GB |
| redis | 512 MB |
| **Total por stack** | **~3,875 GB** |
| **Total (staging + prod)** | **~7,75 GB de los 11 GB disponibles** |

`backend` (512 MB → 1 GB) y `mongo` (1 GB → 2 GB) se subieron respecto a los límites
iniciales de esta migración: 512 MB en `backend` era literalmente el techo exacto del free
tier de Koyeb, no un análisis de necesidad real, y más margen reduce el riesgo de OOM ante
picos (analítica concurrente, varias partidas simultáneas). En Mongo, WiredTiger usa la RAM
disponible como caché de páginas — con 1 GB esa caché era pequeña y limitaba el rendimiento de
queries si el dataset crece; con margen de sobra en la VPS, subirlo es prácticamente gratis.
`worker` y `redis` se dejan igual: su consumo real estimado (Redis ~80-120 MB típico) está muy
por debajo de sus límites actuales, sin presión que justifique subirlos. Los límites de CPU
tampoco se tocan — los 6 vCPU se comparten entre los dos stacks + Nginx + Certbot + el runner
de GitHub Actions, así que ahí el margen es proporcionalmente más ajustado que en RAM.

El resto (≈3,25 GB) queda de margen para el propio sistema operativo, picos de memoria por
encima del límite blando de Docker, el swap de 2 GB configurado como red de seguridad
(`Deploy_VPS.md` §1), y cualquier proceso de mantenimiento (backups, `mongodump`, etc.). Sigue
siendo margen amplio (~30% de la RAM total) sin acercarse a un escenario de presión real.

**Monitoreo:**

- **Manual:** `free -h` (RAM) y `df -h` (disco) por SSH. Sin cron automático todavía — pendiente
  de instalar (ver más abajo).
- **Recomendado, no implementado aún:** cron diario que compare `free -h`/`df -h` contra un
  umbral fijo (p. ej. RAM libre < 1 GB, disco libre < 20 GB) y envíe un email de alerta. A
  diferencia de los detectores SmartAlert internos de Atlas/Upstash (§2.1/§2.2, ahora
  históricos), este monitoreo vigila el **host**, no la aplicación — no hay endpoint HTTP que
  lo exponga hoy.
- **Docker:** `docker stats` (ad-hoc) o `docker compose -p eduplay-prod ps` para verificar que
  ningún contenedor está reiniciando en bucle por OOM (`docker compose ... logs --tail 50` +
  `docker inspect` código de salida 137 = OOM-killed).

**Umbral operativo (no hay "migración" a un tier de pago):** si el consumo real se acerca al
límite físico (p. ej. RAM libre < 1 GB sostenida, disco libre < 20 GB), las opciones son
optimizar el propio uso (bajar límites de memoria de servicios sobredimensionados, purgar
`mongo-data` vía la política de retención RGPD ya existente, rotar logs Docker) antes de
plantear ampliar el plan Contabo o repartir un stack en una segunda VPS. No existe un "plan B"
de pago instantáneo como en un proveedor cloud — cualquier ampliación es una gestión con el
proveedor (o el tutor, mientras la VPS sea cedida).

**Deuda conocida:**

- Los detectores SmartAlert internos `atlas_storage_quota` y `upstash_commands_quota`
  (`backend/src/services/analytics/systemDetectors/`) siguen en el código y siguen pudiendo
  ejecutarse contra Mongo/Redis self-hosted (las queries `db.stats()` y el conteo de comandos
  siguen siendo válidas), pero sus umbrales (`ATLAS_STORAGE_BUDGET_MB` ≈ 512 MB,
  `UPSTASH_DAILY_BUDGET` ≈ 10K/día) ya no corresponden a ningún límite real — el límite real
  ahora es el disco/RAM de la VPS entera, no una cuota por servicio. Quedan como trabajo
  pendiente de una futura sesión de mantenimiento: recalibrarlos contra el disco de la VPS o
  retirarlos si el cron de monitoreo de host (arriba) los sustituye.
- El cron de monitoreo de host descrito arriba está documentado pero **no instalado** en la VPS
  todavía (mismo estado que los backups automáticos, ver `Deploy_VPS.md` §7).

### 2.1 MongoDB Atlas M0 (RETIRADO — histórico, sustituido por Mongo self-hosted)

> Esta subsección documenta un servicio que **ya no se usa** (migración 06-07-2026 a la VPS
> Contabo — ver `Deploy_VPS.md`). Se conserva como referencia histórica de la gestión del free
> tier previa; no es aplicable a la operación actual.

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

### 2.2 Upstash Redis (RETIRADO — histórico, sustituido por Redis self-hosted)

> Retirado en la misma migración que §2.1 — Redis pasa a autoalojado en la VPS (contenedor
> `redis` de `docker-compose.yml`, `requirepass` propio). Se conserva como referencia histórica.

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

> ⚠️ **Riesgo abierto — coste idle de BullMQ (ADR-226, hallazgo RD-1).** Las
> cifras de arriba **no incluían el polling activo de BullMQ en reposo**. Los 4
> workers cron hacen `BZPOPMIN`/`moveToActive`/stalled-check contra Upstash de
> forma continua aunque no haya trabajo, con un estimado de **~80-90K
> comandos/día ≈ ~2,6 M/mes — ~5× el free tier, sin una sola partida jugada**.
> Ese consumo es además **invisible** para el detector interno
> `upstash_commands_quota` (solo instrumenta `redisService`; BullMQ usa
> conexiones propias). **Acción pendiente: medir el consumo real en la consola
> de Upstash durante 24 h de idle** y decidir el rediseño de la capa de jobs
> (scheduling in-process con lock `SET NX` vs. mantener BullMQ vs. cron externo).
> Análisis completo y opciones en
> [`Decision_BullMQ_vs_Scheduling_InProcess.md`](./Decision_BullMQ_vs_Scheduling_InProcess.md).
> Mitigaciones de bajo riesgo ya aplicadas (cron `*/15`, `getJobCounts` a 4
> estados, invalidación de cache condicional) reducen el resto del coste pero no
> el polling, que es el ~85% del total.

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

### 2.3 Koyeb (Backend + Worker) (RETIRADO — histórico, sustituido por Docker Compose en la VPS)

> Retirado en la migración a la VPS Contabo — backend y worker corren ahora en contenedores
> Docker en la misma VPS que el resto del stack (`docker-compose.yml` + `docker-compose.prod.yml`,
> proyectos `eduplay-staging`/`eduplay-prod`). Se conserva como referencia histórica.

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

### 2.4 Cloudflare Pages + DNS/Proxy (RETIRADO — histórico, sustituido por Nginx+Certbot en la VPS)

> Retirado en la migración a la VPS Contabo — el frontend se sirve desde el mismo contenedor
> Nginx del stack (mismo origen que el backend, sin CORS), y el reverse proxy con TLS lo hace
> Nginx a nivel de sistema operativo + Certbot (Let's Encrypt directo, sin Cloudflare por
> delante — decisión explícita, ver `Deploy_VPS.md` §4). El DNS usa DuckDNS (subdominios
> gratuitos), no Cloudflare. Cloudflare Turnstile (CAPTCHA, `TURNSTILE_SECRET`) es un producto
> independiente y **sigue en uso** — no tiene relación con el hosting retirado aquí. Se conserva
> esta subsección como referencia histórica.

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
| Storage Mongo (self-hosted) | 1 GamePlay ≈ 25 KB; 125 alumnos × 2 sesiones/sem × 5 rondas = 1 250 plays/sem × 25 KB = 30 MB/sem → 1,5 GB/año | Con retención RGPD activa, estable 200-300 MB — despreciable frente a los 191 GB de disco de la VPS (antes era el límite duro de Atlas M0; ahora es solo una fracción mínima del disco propio) |
| Comandos Redis (self-hosted) | 1 partida ≈ 30-50 comandos (auth, rate-limit, lock RFID, sesión, idempotencia). 1 500 partidas/sem × 50 = 75 K cmds/sem | ~300K cmds/mes — ya no hay cuota de comandos que vigilar (antes 60% del free tier de Upstash), solo el uso de CPU/RAM del contenedor `redis` (512 MB de límite, ver §2.0) |
| Egress Supabase | 25 alumnos × 2 sesiones/sem × 15 KB de assets renderizados ≈ 750 KB/sem por aula × 5 = 3,75 MB/sem | ~15 MB/mes (despreciable frente a 5 GB) |
| Tráfico frontend (Nginx en la VPS) | Carga inicial ≈ 600 KB gz × 5 docentes × 10 logins/día | < 1 GB/mes — sin cuota de bandwidth que vigilar (antes gratis-ilimitado en Cloudflare Pages; ahora el tráfico sale directo de la VPS sin límite de proveedor, solo limitado por el ancho de banda contratado con Contabo) |
| Sentry transacciones | sampleRate 0,1 sobre ~1500 partidas/mes con 5 spans por partida = ~750 transacciones | 7,5 % del free tier |
| Grafana Loki ingest | Logs estructurados Pino ~500 bytes/event × 50 events por partida × 1500 partidas = ~37 MB/mes | < 0,1 % del free tier |

**Conclusión:** el escenario objetivo entra holgadamente tanto en los
servicios cloud que quedan (Supabase, Sentry, Grafana Loki) como en los
recursos propios de la VPS. Los márgenes de seguridad permiten absorber
picos puntuales (festivales escolares, formación de docentes, etc.) sin
necesidad de escalar ningún servicio ni ampliar el plan de la VPS.

---

## 4. Alertas tempranas

| Servicio | Mecanismo | Umbral | Acción |
|---|---|---|---|
| Recursos VPS (RAM/disco) | Manual (`free -h`/`df -h`) — cron con email pendiente de instalar | Sin umbral automático todavía; recomendado RAM libre < 1 GB o disco libre < 20 GB | Ver §2.0. Optimizar consumo o ampliar plan Contabo |
| Rate limit distribuido | Detector `rate_limit_store_fallback` (interno) | cualquier ocurrencia > 0 | SmartAlert warning. Runbook §13b |
| Cache LRU memoria | Detector `in_memory_cache_low_hit` (interno) | hit ratio < 40% sostenido 4 muestras | SmartAlert warning. Performance_Notes §cache-lru |
| Sentry quota | Email automático Sentry + workflow mensual | 80% Sentry / revisión manual | Runbook §13d |
| Supabase egress | Workflow mensual (issue checklist) | revisión manual | Runbook §13c |
| GitHub Actions minutes | Workflow mensual (issue checklist) | revisión manual | Sólo aplica si el repo se hace privado |
| Grafana Loki ingest | Workflow mensual (issue checklist) | revisión manual | Apagar `LOG_SHIPPING_ENABLED` si necesario |

> Los detectores `upstash_commands_quota` y `atlas_storage_quota` siguen existiendo en el código
> pero ya no vigilan ningún límite real (§2.0, "Deuda conocida") — se retiran de esta tabla de
> alertas activas hasta que se recalibren o se retiren del código.

El workflow `.github/workflows/free-tier-monthly-review.yml` se dispara
el día 1 de cada mes a las 09:00 UTC y crea una issue con la checklist
de los servicios sin telemetría interna gratuita (ya no incluye Koyeb,
Atlas, Upstash ni Cloudflare Pages). La lista de servicios "con
SmartAlert" no necesita la issue mensual porque el detector ya vigila
continuamente.

---

## 5. Revisión mensual checklist (servicios externos)

Para cada servicio sin detector interno, abrir el dashboard y verificar
las métricas listadas. El workflow mensual crea automáticamente esta
checklist como issue de GitHub el día 1 de cada mes:

- **Sentry** → Stats → Quotas. Verificar errores y transacciones
  mensuales acumulados < 80% de las cuotas (5 K y 10 K respectivamente).
- **Supabase** → Project Settings → Usage. Verificar storage < 800 MB y
  egress mensual < 4 GB.
- **GitHub Actions** → Settings → Billing. Sólo relevante si el repo es
  privado: verificar minutos consumidos < 1500 (el deploy corre en el
  runner self-hosted `contabo-vps` y no consume minutos de GitHub).
- **Grafana Cloud Loki** → Usage. Verificar ingest mensual < 40 GB.
- **UptimeRobot** → Dashboard. Verificar que los 4 monitors están
  verdes y que la status page pública responde.
- **VPS Contabo** → `df -h /` y `free -h` por SSH. Verificar disco y RAM
  libres dentro de rango (ver §2.0).

Cuando un valor cruce el 80%, abrir el playbook correspondiente del
Runbook (§13c-d; ya no aplican §13a/§13b, específicos de Atlas/Upstash
retirados).

---

## 6. Plan B detallado (migración a paid)

Si todos los servicios cloud que quedan tuvieran que escalar
simultáneamente al tier de pago mínimo:

| Servicio | Tier paid mínimo | Coste mensual estimado |
|---|---|---|
| Supabase Pro | 100 GB storage, 200 GB egress | $25 |
| Sentry Team | 50K errores + 100K transacciones | $26 |
| UptimeRobot Pro | 50 monitors + SMS | $7 |
| Grafana Cloud Pro | 100 GB ingest | $8 |
| **Total** | | **≈ $66/mes** |

La VPS Contabo no tiene un "tier de pago" al que escalar dentro del mismo
proveedor en el sentido cloud — si el hardware fijo (11 GB RAM/191 GB
disco/6 vCPU) se agotara, la alternativa sería ampliar el plan Contabo o
repartir un stack en una segunda VPS, ambas gestiones fuera del ciclo de
"upgrade de tier" instantáneo típico de un proveedor cloud (ver §2.0).

Para el escenario objetivo TFG, ninguno de estos upgrades es necesario.
Documentado aquí para que cualquier sucesor sepa el coste real de operar
sin restricciones del free tier.

---

## 7. Referencias

- **ADR-168** — Estrategia de presupuesto free-tier: detectores
  internos SmartAlert + revisión mensual externa (contexto previo a la
  migración a VPS; sigue vigente para los servicios cloud que quedan).
- **ADR-158** — Telemetría comandos Upstash + LRU memoria + pipeline
  helper (T-907) — histórico, Upstash retirado.
- **ADR-159** — Bundle frontend reduction (T-907).
- **ADR-160** — Cloudflare cache + WAF + rate-limit edge (T-907 / T-905) — histórico, Cloudflare-en-frente retirado.
- **ADR-165** — Sentry Performance instrumentación + sampling per-env
  (T-904).
- **ADR-166** — Log shipping con Grafana Cloud Loki + `pino-loki`
  (T-904).
- **ADR de la migración a VPS Contabo** — ver
  `docs/plans/2026-07-06-migracion-despliegue-vps-contabo-design.md` y la
  entrada correspondiente en `Architecture_Decisions.md`.
- **Runbook_Operacional.md** §13c/§13d — playbooks de respuesta ante
  cruce del 80% en Supabase egress y Sentry quota (§13a/§13b eran
  específicos de Atlas/Upstash, retirados).
- **Operational_Dashboard.md** — mapa de las consolas externas y saved
  queries.
- **Deploy_VPS.md** — pasos de aprovisionamiento de la VPS.
- **Secrets_Rotation.md** — política de rotación de credenciales.

---

## Optimizaciones pre-v1.0.0 (ADR-170 a ADR-176)

La sesión de performance pre-v1.0.0 redujo el consumo proyectado:

| Métrica | Antes | Después | Mejora |
|---|---|---|---|
| Upstash commands/día (escenario típico) | ~10.4K (4% sobre cuota) | ~7.2K (28% bajo cuota) | -30% |
| Atlas bytes wire-level por aggregation analytics | 5-30 MB | 250 KB - 6 MB | -80% |
| `endPlay` cleanup round-trips | 4 RTT | 2 RTT | -50% |
| Persistencia RFID mode (setex + publish) | 2 RTT | 1 RTT | -50% |

**Drivers del ahorro:**

1. **T-931 — Materialización Redis** (ADR-171): dashboards leen ZSETs (O(log N + M)) en vez de aggregations Mongo con `$lookup × 2`.
2. **Proyección post-`$lookup` + `$match` early** (ADR-170): 6 funciones analytics filtran sessionIds del profesor ANTES del `$lookup`, reduciendo 50× el scan inicial.
3. **Pipelining** (B.3 + B.7): `setex + publish` y `del PLAY + del LOCK + publish` agrupados en pipeline.
4. **Pool Mongoose** (ADR-176): `maxIdleTimeMS: 60s`. La reducción de bytes wire-level por
   `compressors: ['snappy', 'zstd']` que documentaba originalmente esta fila **se retiró**: el
   driver `mongodb` v7 exige el módulo nativo opcional del compresor instalado y, si falta,
   lanza `MongoMissingDependencyError` en el primer comando en vez de degradar a wire sin
   comprimir — y el Dockerfile de producción (`npm ci --only=production`) no lo instala. Con
   Mongo autoalojado en la misma red Docker que el backend (VPS, sin el salto WAN de Atlas que
   motivó esta optimización) el ahorro ya no compensa el riesgo de esa dependencia nativa.
5. **Cache jitter ±10%** (ADR-174): elimina spikes thundering herd.

**Reconciliación nocturna T-931**: cron 00:30 horario servidor reescribe leaderboards + studentMetrics desde Mongo. Coste ~14 ZINCRBY + 1 pipeline HINCRBY por endPlay.

---

## Actualización 2026-06-30 (ADR-223) — endurecimiento de consumo Upstash

Decisiones de la auditoría de mantenimiento que reducen el consumo del free-tier de Upstash y fijan el modelo de despliegue:

- **Invariante `scale=1` para el servicio de juego (`api-*`).** El motor es *stateful en memoria*; un rework HA (estado+timers a Redis) dispararía el nº de comandos muy por encima del free-tier (10k/día). Multi-instancia no aporta a la escala objetivo del TFG. **No habilitar `scale>1` sin migrar antes a un Redis de pago.**
- **Adapter Socket.IO tras flag `SOCKET_ADAPTER_ENABLED` (off por defecto).** En single-instance evitaba un `PUBLISH` por cada broadcast de sala (sin consumidor) = coste puro. Activar solo al escalar.
- **10 índices monocampo redundantes eliminados** (migración `migrate:drop-redundant-indexes`, 79→69 índices): menos write-amplification y storage de índice en Atlas M0 (512MB).
- **Pendiente (ALTO):** la invalidación de caché analytics por `endPlay` hace `SCAN` del keyspace completo (3× por partida) → sustituir por índice inverso (`SMEMBERS`+`DEL`). Ver ADR-223.

## Actualización 2026-07-02 (ADR-225) — reducción de comandos Upstash en el hot-path de partidas

Al jugar las partidas en vivo se detectaron dos consumidores Upstash evitables en `scale=1`, ambos en el camino más frecuente (eventos de socket durante una partida):

- **Rate-limiter de sockets auto-gateado a in-memory.** Se instanciaba con Redis-on en producción → un `EVALSHA` por CADA evento de socket (scans, heartbeats, control). Ahora usa `useRedis: isMultiInstanceEnabled()` (misma señal `SOCKET_ADAPTER_ENABLED` que el adapter y el pub/sub). En single-instance: **0 comandos de rate-limiting** (~1.800/día ahorrados en el escenario objetivo). Ver ADR-225 y `Rate_Limiting_Analysis.md` §escaneos.
- **Heartbeat de leases 30s → 45s** (TTL 90s, margen 2×): ~10 renovaciones/partida en vez de ~20 (~300/día ahorrados). El lease solo sirve para recovery tras reinicio de Koyeb a `scale=1`.

Efecto combinado: el consumo de la capa realtime de gameplay baja de ~3-5K a ~1-3K comandos/día en el escenario objetivo, ampliando el margen frente a los background jobs (worker SmartAlert cada 15 min, refresh de tokens, analytics). La estimación «1 partida ≈ 30-50 comandos» de la §3 se mantiene conservadora (con estos cambios el escaneo hardware con HMAC son 2 comandos: rate-limit ya no aplica en scale=1, queda el CAS del HMAC).

> **Nota post-migración VPS (06-07-2026).** Las dos actualizaciones de arriba se escribieron
> cuando Redis era Upstash y el motivador explícito era la cuota de comandos/día del free tier.
> Con Redis autoalojado en la VPS esa cuota ya no existe (§2.0), pero el **invariante
> `scale=1` sigue vigente por el motivo arquitectónico original** (el motor de partidas es
> stateful en memoria; un rework multi-instancia sigue sin aportar a la escala objetivo del
> TFG) — no se ha revisitado esta decisión, solo cambió su justificación de coste.

---

*Documento mantenido por Samuel Blanchart Pérez. Actualizar cada vez
que cambien las cuotas free tier de algún proveedor o cuando se añada o
elimine un servicio del stack.*
