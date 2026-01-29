# Security Logging

## Propósito

Establecer un sistema de logging de seguridad uniforme, con trazabilidad, sanitización de datos sensibles y alertas en Sentry. La solución mantiene Winston como backend de logging actual, pero está preparada para migración a PinoJS sin cambios en la interfaz pública.

## Decisiones de diseño

### 1) Módulo independiente

Se creó un módulo dedicado `securityLogger` que centraliza `logSecurityEvent()`. Esto evita dispersión de reglas de seguridad en múltiples archivos y facilita la migración futura a PinoJS sin tocar los controladores o middlewares.

**Aporte:**

- Consistencia de formato y campos.
- Menos duplicidad de lógica de sanitización.
- Cambio de logger subyacente con impacto mínimo.

### 2) Severidad dinámica por evento

Cada evento tiene una severidad base y umbrales de escalado. Cuando un evento se repite en una ventana temporal, el nivel se eleva automáticamente.

**Aporte:**

- Reduce ruido en condiciones normales.
- En ataques reales eleva el nivel y dispara alertas.

### 3) Alertas Sentry específicas por evento

Las alertas no son globales; cada evento crítico tiene su propia ventana y umbral. Por ejemplo, `AUTH_TOKEN_THEFT_DETECTED` alerta inmediata, mientras que `SECURITY_RATE_LIMITED` alerta al superar un umbral.

**Aporte:**

- Menos falsos positivos.
- Alertas más accionables.

### 4) Correlación obligatoria (degradación a warn)

Para HTTP se exige `requestId`; para WebSocket, `socketId`. Si faltan, se degradan a `warn` y se añade `correlationWarning`.

**Aporte:**

- Trazabilidad en incidentes.
- Evita romper flujos en producción si falta la correlación.

## Matriz de eventos (resumen)

| Evento | Nivel base | Umbral Sentry | Descripción |
| --- | --- | --- | --- |
| AUTH_LOGIN_SUCCESS | info | - | Login exitoso |
| AUTH_LOGIN_FAILED | warn | 10 / 60s | Fallo de login |
| AUTH_REGISTER_SUCCESS | info | - | Registro de profesor |
| AUTH_REGISTER_FAILED | warn | 5 / 60s | Fallo de registro |
| AUTH_PASSWORD_CHANGED | info | - | Cambio de contraseña |
| AUTH_PASSWORD_CHANGE_FAILED | warn | - | Error al cambiar contraseña |
| AUTH_REFRESH_SUCCESS | info | - | Refresh correcto |
| AUTH_REFRESH_FAILED | warn | 10 / 60s | Refresh fallido |
| AUTH_TOKEN_REVOKED | info | - | Token revocado |
| AUTH_TOKENS_REVOKED_ALL | warn | 3 / 60s | Revocación global |
| AUTH_TOKEN_THEFT_DETECTED | error | inmediato | Reuso de refresh token |
| AUTH_TOKEN_INVALID | warn | - | Token inválido/expirado |
| AUTH_TOKEN_FINGERPRINT_MISMATCH | warn | - | Fingerprint incorrecto |
| AUTH_REFRESH_TOKEN_REUSED | warn | - | Reuso dentro de grace period |
| AUTH_SESSION_INVALIDATED | info | - | Sesión invalidada |
| AUTH_BYPASS_ENABLED | warn | - | Bypass en desarrollo |
| AUTHZ_ACCESS_DENIED | warn | 20 / 60s | Acceso denegado |
| WS_AUTH_FAILED | warn | 10 / 60s | Auth WebSocket fallida |
| SECURITY_RATE_LIMITED | warn | 10 / 60s | Rate limit excedido |
| SECURITY_PAYLOAD_TOO_LARGE | warn | 5 / 60s | Payload excesivo |
| SECURITY_RFID_DEDUPE | info | - | Dedupe RFID |
| SECURITY_RFID_EVENT_INVALID | warn | 10 / 60s | Evento RFID inválido |

## Sanitización de datos

Se enmascaran campos sensibles como `password`, `token`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `fp`, `fingerprint` y similares.

**Aporte:**

- Cumplimiento de buenas prácticas de seguridad.
- Menor exposición de datos en logs y Sentry.

## Ejemplos de payloads sanitizados

### Login fallido

```json
{
  "securityEvent": "AUTH_LOGIN_FAILED",
  "reason": "INVALID_PASSWORD",
  "email": "profesor@escuela.com",
  "source": "http",
  "requestId": "4d4a4d8e",
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0"
}
```

### Rate limit WebSocket

```json
{
  "securityEvent": "SECURITY_RATE_LIMITED",
  "eventName": "rfid_scan_from_client",
  "socketId": "abc123",
  "userId": "66f1c2...",
  "blocked": true,
  "retryAfterMs": 60000
}
```

## Integración

- Controladores y middlewares usan `logSecurityEvent()` como salida única de seguridad.
- WebSocket aplica el mismo esquema, con `socketId` obligatorio.
- Sentry se activa con `SENTRY_ENABLED=true` y `SENTRY_DSN`.
