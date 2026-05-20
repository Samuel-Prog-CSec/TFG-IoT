# Dashboard operativo — EduPlay RFID v1.0.0

> **Propósito:** una sola página que centralice los 6 paneles donde vive
> la observabilidad de producción. Sin esto, ante un incidente abres 6
> pestañas distintas y pierdes 5 minutos antes de empezar a diagnosticar.
>
> **Audiencia:** Samuel (super_admin) y, en el futuro, cualquier persona
> que herede la operación.
>
> **Última actualización:** 20-05-2026 (T-904, ADRs 165/166).

---

## 1. Mapa de consolas

Cada fila apunta a una consola externa con su URL, ámbito y qué se mira ahí
en primer lugar cuando llega una alerta.

| Sistema | URL (placeholder) | Ámbito | Qué se mira primero |
|---|---|---|---|
| **MongoDB Atlas** | https://cloud.mongodb.com → Project `eduplay-prod` | prod + staging | Slow queries, conexiones activas, transfer/semana |
| **Upstash Redis** | https://console.upstash.com → DB `eduplay-prod` | prod + staging | Memory usage, commands/day, eviction events |
| **Koyeb** | https://app.koyeb.com → org `<KOYEB_ORG>` | prod + staging | CPU/RAM/Network por servicio, logs (~72h), restart count |
| **Cloudflare** | https://dash.cloudflare.com → site `<dominio>` | global | Traffic, cache hit ratio, WAF blocks, rate limit triggers |
| **Sentry Performance** | https://sentry.io → org `<SENTRY_ORG_SLUG>` → projects | prod + staging | p95 por span, error rate, new errors, breadcrumbs |
| **Grafana Cloud Loki** | https://grafana.com → stack `eduplay-rfid` → Explore | prod + staging | LogQL queries, saved views, alerts |
| **UptimeRobot** | https://uptimerobot.com/dashboard | prod + staging | 4 monitors + status page pública |

> Sustituye los `<placeholders>` por URLs reales tras T-901.

---

## 2. Status page pública

URL pública con los 4 monitores principales, enlazada desde el README raíz:

```
https://stats.uptimerobot.com/eduplay-rfid
```

Visible para cualquiera con el enlace. Los monitores se muestran con
nombres genéricos ("API", "Frontend", "API (staging)", "Frontend (staging)")
para no exponer URLs internas de Koyeb. Branding opcional con el logo del
proyecto.

---

## 3. Saved queries por sistema

### 3.1 Grafana Cloud Loki — LogQL

Cada query asume el stack `eduplay-rfid`. Pegar en *Explore* → data source Loki.

#### Errores 5xx por endpoint, últimas 24h

```logql
sum by (req_url) (
  count_over_time(
    {app="eduplay-rfid", env="production"}
    | json
    | res_statusCode >= 500
    [24h]
  )
)
```

#### Slow queries (Mongoose aggregate >5s)

```logql
{app="eduplay-rfid", env="production"}
| json
| component=~"gamePlayRepository|analyticsService"
| msg=~"(?i)slow"
```

Detalle: el backend emite `logger.warn` cuando un `aggregate` tarda más de
`SLOW_AGGREGATE_WARN_MS` (default 5000 ms, ADR-164).

#### Auth fails spike por minuto

```logql
sum by (component) (
  rate({app="eduplay-rfid", env="production"}
    | json
    | msg=~"(?i)auth fail|invalid credentials|account locked"
    [1m])
)
```

#### Rate-limit hits por IP

```logql
sum by (req_ip) (
  rate({app="eduplay-rfid", env="production"}
    | json
    | msg=~"(?i)rate.?limit"
    [5m])
)
```

#### Correlacionar una partida concreta

```logql
{app="eduplay-rfid", env="production"}
| json
| playId="<playId>"
```

Salida en orden cronológico: lock distribuido → reservas card → primer
challenge → scans → endPlay → métricas estudiante.

### 3.2 Sentry Performance

- **Dashboard "Gameplay"** filtrando por `op:gameplay`: muestra p50/p95/p99
  de `gameplay.startPlay`, `gameplay.endPlay`, `gameplay.pauseResume`,
  `gameplay.sequence.processScan`.
- **Dashboard "RFID"** filtrando por `op:rfid.scan`: latencia de scan
  por mode (modeState está en breadcrumbs).
- **Dashboard "Analytics"** filtrando por `op:analytics`: p95 de
  `analytics.classroomSummary` y `analytics.studentSummary` — alerta si
  >800 ms sostenido (regresión Atlas M0).

### 3.3 Atlas Charts

- `gameplays_completed_per_day` (line chart de la colección `game_plays`
  filtrando `status="completed"`).
- `connections_used_24h` (Atlas metrics nativo, panel "Connections").

### 3.4 Upstash Console

- Panel "Metrics" → graph "Commands per day". Free tier 10K/día, alerta
  desde Sentry si subimos del 80% (ver §5.2).

### 3.5 Cloudflare Analytics

- Tab "Traffic": cache hit ratio (objetivo ≥85% para los assets versionados).
- Tab "Security": eventos del WAF managed (OWASP Core Ruleset) +
  bloqueos del rate limit edge (`30 req/10s` a `/api/*`, ADR-160).

### 3.6 Koyeb metrics

- Por servicio (`api-prod`, `worker-prod`, `api-staging`, `worker-staging`):
  CPU %, RAM %, network in/out, restart count.
- Logs en tiempo real con retention ~72h. **Para forensics más antiguos
  ir a Grafana Loki** (ADR-166).

---

## 4. Verificación post-deploy

Después de cada deploy a producción (manual o automático tras tag `v*`),
recorrer estos 6 paneles en orden:

1. **UptimeRobot** → status page: los 4 monitores en verde.
2. **Sentry** → Performance → últimas 30 min: aparecen transactions de
   `gameplay.startPlay` y `gameplay.endPlay` con `environment=production`.
3. **Grafana Loki** → Explore → query `{app="eduplay-rfid", env="production"}`:
   stream activo, sin warnings persistentes.
4. **Koyeb** → api-prod: CPU < 30% en idle, RAM < 200 MB, restart count 0
   tras 5 min.
5. **Cloudflare** → Analytics: traffic recibido en últimos 5 min.
6. **Atlas** → cluster `eduplay-cluster`: replica set healthy, connections
   < 50.

Si alguno falla: → Runbook `documentation/Runbook_Operacional.md`.

---

## 5. Alertas

### 5.1 Sentry Alerts (4 reglas obligatorias para v1.0.0)

A configurar manualmente desde la UI Sentry (`Alerts → Create Alert`).
Cada alerta apunta a un playbook concreto del Runbook.

| Alert | Type | Trigger | Action | Playbook |
|---|---|---|---|---|
| **Prod error rate > 5% in 5 min** | Metric Alert | `event.type:error environment:production`, count > 5% throughput over 5 min | Email + Sentry inbox | Runbook §17.1 |
| **Nuevo tipo de error en prod** | Issue Alert | An issue is first seen, `environment:production` | Email | Runbook §17.2 |
| **Auth failures spike** | Issue Alert | Event matches `message:"auth fail"` or `"account locked"`, count > 20 in 1 min | Email | Runbook §17.3 |
| **Rate-limit fallback regression** | Issue Alert | Event matches `message:"rate-limit store fallback"`, count > 0 | Email | Runbook §17.4 |

Setup detallado en `development/DEPLOY_GUIA_COMPLETA.md` Bloque 9.

### 5.2 UptimeRobot Monitors (4 monitores obligatorios)

| Monitor | URL | Frecuencia | Acción al fallar |
|---|---|---|---|
| API prod | `$KOYEB_PROD_URL/health/live` | 5 min | Email + Runbook §18.1 |
| API staging | `$KOYEB_STAGING_URL/health/live` | 5 min | Email |
| Frontend prod | `https://eduplay-frontend.pages.dev` | 5 min | Email + Runbook §18.2 |
| Frontend staging | `https://maintenance.eduplay-frontend.pages.dev` | 5 min | Email |

> ⚠️ Apuntar SIEMPRE a `/health/live` (no `/health/ready`). El liveness no
> toca Mongo/Redis: no gasta commands Upstash y no se vuelve falso-positivo
> cuando el circuit breaker Redis se abre por carga puntual.

Setup detallado en `DEPLOY_GUIA_COMPLETA.md` Bloque 8.3.

### 5.3 Alertas pendientes (futuro)

- LogQL alerts en Grafana Cloud Loki para complementar Sentry. Diferido a
  post-v1.0.0; las 4 alertas Sentry cubren el 80% de casos críticos.
- Slack integration (los Email actuales bastan para un super_admin único).

---

## 6. Onboarding rápido

Si nunca has tocado este proyecto:

1. Lee `README.md` (raíz) — visión 5 min.
2. Lee `documentation/Runbook_Operacional.md` — los playbooks por incidente.
3. Lee `backend/docs/Logging_Strategy.md` — cómo está estructurado el log.
4. Pide acceso a Samuel para las 6 consolas (cuenta de invitación según
   convenga).

---

## 7. Rotación de credenciales

Para los secretos de observabilidad (Sentry DSN, Loki token, UptimeRobot
API key), ver `documentation/Secrets_Rotation.md` § "Observabilidad".

---

## 8. Referencias

- ADR-165: Sentry Performance instrumentación + sampling per-env.
- ADR-166: Log shipping con Grafana Cloud Loki + `pino-loki`.
- ADR-160: Cloudflare cache + WAF + rate-limit edge.
- ADR-097..099 (T-905 hardening): contexto histórico de la observabilidad de seguridad.
- T-904 task definition: `documentation/sprints/Sprint6_Tareas.md` §T-904.
