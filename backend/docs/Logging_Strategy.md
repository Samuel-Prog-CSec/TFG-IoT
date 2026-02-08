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
