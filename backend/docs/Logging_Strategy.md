# Logging Strategy

## Purpose

Define a consistent, production-ready logging approach for the backend using Pino. The goals are:

- Structured JSON logs in production, human-friendly logs in development.
- Traceability across HTTP, WebSocket, and background services.
- Redaction of sensitive data by default.
- Minimal noise in high-traffic endpoints with sampling.

## Architecture Overview

- Base logger: [backend/src/utils/logger.js](../src/utils/logger.js)
  - JSON in production, pretty in development.
  - Silent in tests unless `LOG_LEVEL` is set.
  - Global redaction of sensitive fields.
- HTTP logging: `pino-http` middleware in [backend/src/server.js](../src/server.js)
  - Request ID generation and propagation.
  - Enriched log context with `userId` and `userRole` when available.
  - Auto-ignore for `/health` and `/api/health`.
  - Sampling with `LOG_SAMPLE_RATE` (0..1) for non-error requests.
- Component scoping: services and middlewares use `logger.child({ component: "..." })`.
  - Example: `gameEngine`, `rfidService`, `redisService`.

## Log Format and Fields

Base fields added to every log entry:

- `service`: `rfid-games-backend`
- `env`: runtime environment
- `version`: backend package version
- `time`: ISO timestamp (Pino stdTimeFunctions)

HTTP logs include:

- `req`: method, url, headers (redacted)
- `res`: statusCode
- `requestId`: request identifier
- `userId`: authenticated user id (if present)
- `userRole`: authenticated user role (if present)

## Redaction Policy

Sensitive fields are redacted centrally. Examples:

- Authorization headers
- Cookies
- Access/refresh tokens
- Passwords

This is enforced at the logger level and applies to all child loggers.

## Sampling Policy

To reduce noise from high-volume routes, non-error HTTP logs can be sampled using:

- `LOG_SAMPLE_RATE` (0..1)
  - `1` means no sampling (default)
  - `0.2` means roughly 20% of info-level requests are logged

Errors and warnings are never sampled.

## Conventions

- Use Spanish messages in logs (consistent with existing codebase).
- Prefer structured fields over string interpolation for queryable data.
- Use component-scoped loggers for clarity.
- Avoid logging raw payloads unless sanitized.

## Operational Notes

- In production, ship JSON logs to the central log collector.
- In development, `pino-pretty` improves readability.
- In tests, logs are silent by default to keep output clean.

## Sprint 0 pre-v1.0.0 — Nuevo evento de seguridad + slow-query log (ADR-164)

### `RFID_LOCK_TIMEOUT` (securityLogger)
Registrado en `backend/src/utils/securityLogger.js` con:

```js
RFID_LOCK_TIMEOUT: {
  level: 'error',
  message: 'Operación RFID excedió el timeout y se liberó el lock',
  sentry: { threshold: 3, windowMs: 60 * 1000, level: 'warning' }
}
```

Disparado por `executeWithRfidLock` en `realtime/socketHandlers.js` cuando una operación interna excede `RFID_OPERATION_TIMEOUT_MS=10s` (configurable). Sentry recibe el alert si llegan 3 incidentes en una ventana de 60s — espiga genuina = degradación de Mongo o Redis. Payload incluye `userId`, `timeoutMs`. Sin PII de menores.

### Slow-query log de `gamePlayRepository.aggregate`
`backend/src/repositories/gamePlayRepository.js` envuelve cada `aggregate()` en try/catch + medición de tiempo:
- Si `elapsedMs > SLOW_AGGREGATE_WARN_MS=5000` (configurable) → `logger.warn(alert:true, {elapsedMs, maxTimeMS, firstStage, slowThresholdMs})`.
- Si MongoDB aborta con `MaxTimeMSExpired` → `logger.error(alert:true, ...)`.

El log estructurado incluye `firstStage` (`$match`, `$lookup`, etc.) para identificar el pipeline culpable sin necesidad de incluir el cuerpo entero. Útil para detectar candidatos de materialización antes de que afecten UX.

### Nueva métrica observada por `/api/metrics`
`runtimeMetrics.websocket.rfidLockTimeouts` incrementa por cada disparo del timeout. Dashboard de observabilidad debe incluir esta serie en producción — espiga súbita correlaciona con degradación de Atlas o Upstash.

---

## 10. Log Shipping a Grafana Cloud Loki (T-904 Fase B, ADR-166)

### 10.1 Arquitectura

```
                    ┌──────────────────────┐
   código → logger ─┤ Pino multistream     ├─→ stdout (captura Koyeb ~72h)
                    │                      ├─→ pino-loki batch ─→ Grafana Cloud Loki
                    └──────────────────────┘                              (retention 14 días)
```

- `backend/src/utils/logger.js` decide en runtime si añade el target Loki.
- `pino-loki` mantiene buffer interno con batch cada `LOG_SHIPPING_INTERVAL_S=5s`.
- Si Loki cae, los logs se acumulan en buffer + reintento con backoff. El proceso **nunca falla** por esto: stdout sigue funcionando y el operador ve un warning en stderr al boot si faltan credenciales.

### 10.2 Activación

```bash
LOG_SHIPPING_ENABLED=true
LOG_SHIPPING_HOST=https://logs-prod-eu-west-0.grafana.net
LOG_SHIPPING_USER=123456              # Grafana Cloud Loki data source username
LOG_SHIPPING_TOKEN=glc_xxx            # API token (Bearer / API Key)
LOG_SHIPPING_LEVEL=info               # opcional, default 'info'
LOG_SHIPPING_INTERVAL_S=5             # opcional, default 5
```

Si `LOG_SHIPPING_ENABLED!=true` o faltan `HOST`/`TOKEN`, el logger degrada a stdout-only sin crashear. Comportamiento cubierto por `backend/tests/loggerTransport.test.js`.

### 10.3 Labels emitidos

| Label | Valor | Origen |
|---|---|---|
| `app` | `eduplay-rfid` | constante en el transport |
| `env` | `development | staging | production` | `APP_ENV` o `NODE_ENV` |
| `service` | `backend | worker` | `LOG_SERVICE_LABEL` (worker.js lo setea a `worker`) |
| `version` | `0.5.1`, `1.0.0`, ... | `package.json` version |
| `component` | `gameEngine`, `worker.dataRetention`, `socketHandlers`, ... | child logger (`propsToLabels`) |

Adicionalmente cualquier `level`, `time`, `playId`, `sessionId`, `userId`, etc. va al **payload JSON** del log line — accesible vía `| json` en LogQL pero no como label (evita explosión de cardinalidad).

### 10.4 Helper de contexto estructurado

```js
const { withPlayContext } = require('../utils/loggerContext');

const playLogger = withPlayContext(logger, { playId, sessionId, userId, mechanic });
playLogger.info('Score actualizado'); // → log line con playId, sessionId, userId, mechanic
```

Reglas:
- Pasar siempre valores que admitan `String(...)` (ObjectId, Date, number, string).
- `undefined`/`null` se omiten — Pino los serializaría como `null` y contaminaría queries `playId != ""`.
- Estos mismos campos se usan como **atributos de span Sentry** (`play.id`, `session.id`, etc.) — ver ADR-165.

### 10.5 Saved queries LogQL

Cuatro queries de referencia (también en `documentation/Operational_Dashboard.md` §3.1):

```logql
# 1. Errores 5xx por endpoint últimas 24h
sum by (req_url) (
  count_over_time(
    {app="eduplay-rfid", env="production"} | json | res_statusCode >= 500 [24h]
  )
)

# 2. Slow queries del repository
{app="eduplay-rfid", env="production"}
| json
| component=~"gamePlayRepository|analyticsService"
| msg=~"(?i)slow"

# 3. Auth fails spike por minuto
sum by (component) (
  rate({app="eduplay-rfid", env="production"}
    | json
    | msg=~"(?i)auth fail|invalid credentials|account locked"
    [1m])
)

# 4. Rate-limit hits por IP
sum by (req_ip) (
  rate({app="eduplay-rfid", env="production"}
    | json
    | msg=~"(?i)rate.?limit"
    [5m])
)

# 5. Correlacionar una partida concreta
{app="eduplay-rfid", env="production"} | json | playId="<playId>"
```

### 10.6 Retención y cuota

- **Retention**: 14 días (default Grafana Cloud free tier).
- **Cuota**: 50 GB/mes (free). Uso estimado: ~150 MB/mes incluso en QA intensivo — margen 300×.
- Si la cuota se acerca al 50% en QA pre-release, considerar:
  - Bajar `LOG_SHIPPING_LEVEL` a `warn` (filtra debug + info, deja warning y error).
  - Subir `LOG_SHIPPING_INTERVAL_S` a 10s (más batch, menos round-trips).

### 10.7 Fallos conocidos del transport

| Síntoma | Causa | Acción |
|---|---|---|
| Warning "Loki shipping deshabilitado (faltan credenciales)" al boot | `LOG_SHIPPING_ENABLED=true` pero `HOST` o `TOKEN` faltan | Verificar env vars en Koyeb |
| Warning "pino-loki no está instalado" | Dependencia removida o npm install fallido | `npm install pino-loki` (es dep regular, no devDep) |
| Logs llegan a Loki sólo intermitentemente | `LOG_SHIPPING_INTERVAL_S` demasiado alto + reinicios frecuentes | Bajar interval a 3s temporalmente |
| URL Loki devuelve 401 en stderr | Token expirado o regenerado | Rotar token según `documentation/Secrets_Rotation.md` |

### 10.8 Failure mode

Si Grafana Cloud cae:
- Buffer interno de `pino-loki` acumula hasta saturarse (default 1 MB).
- Cuando satura, descarta logs y emite warning a `process.stderr`.
- Stdout sigue funcionando — los logs siguen en Koyeb dashboard (~72h retention).
- **Acción operativa**: ninguna inmediata, sólo si Grafana Cloud no se recupera en 24h considerar deshabilitar transport temporalmente con `LOG_SHIPPING_ENABLED=false`.

El proceso del backend **nunca** muere por un fallo de Loki.
