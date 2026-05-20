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
