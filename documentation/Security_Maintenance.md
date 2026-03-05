<!-- markdownlint-disable MD007 MD022 MD029 MD032 -->

# Mantenimiento de Seguridad - Febrero 2026

## Resumen Ejecutivo

Este documento resume el hardening de seguridad aplicado en la rama `Maintenance`, con foco en:
- Robo de credenciales y secuestro de sesiones.
- Control de acceso (ownership) por profesor.
- Proteccion CSRF y almacenamiento seguro de refresh tokens.
- Revalidacion en WebSocket y segmentacion de eventos RFID.
- Limites de crecimiento y proteccion anti-bot.
- Higiene de dependencias y CI.

## Cambios Implementados (Resumen)

1. **Refresh token en cookie `httpOnly`**
   - Se elimina el uso de `localStorage` para `refreshToken`.
   - El refresh se realiza solo con cookie `httpOnly` (`refreshToken`) y body vacío.
   - El backend no devuelve `refreshToken` en body ni acepta `refreshToken` en request body.

2. **CSRF Double-Submit**
   - Cookie `csrfToken` (no `httpOnly`) + header `X-CSRF-Token`.
   - Requerido en POST/PUT/PATCH/DELETE, incluyendo `POST /api/auth/refresh`.

3. **Eliminacion total de `AUTH_BYPASS_FOR_DEV`**
   - Toda ruta protegida requiere autenticacion real.

4. **Ownership estricto por profesor**
   - Profesores solo pueden acceder/modificar sus alumnos, sesiones, partidas y analiticas.
   - `super_admin` mantiene visibilidad total.

5. **Revalidacion en WebSocket por evento sensible**
   - Se revalida access token y sessionId en `join_play`, `start_play`, `pause_play`, `resume_play`, `next_round`, `rfid_scan_from_client`.

6. **RFID rooms por profesor + sesion**
   - Evita fugas de UID entre profesores.

7. **Limite de eventos de GamePlay**
   - Se limita el crecimiento de `events` para evitar DoS por volumen.

8. **Anti-bot en registro**
   - Rate limit especifico y honeypot en `/auth/register`.

9. **Higiene de dependencias**
   - Dependabot mensual y `npm audit` en CI.

10. **Locks distribuidos de tarjetas (multi-instancia)**
   - Reserva atómica de UIDs en Redis con `SET NX`.
   - Leases con TTL + heartbeat para evitar locks huérfanos.
   - Liberación con verificación de owner (`playId`) para prevenir borrado cruzado.

11. **Persistencia atómica de eventos de partida**
   - `addEventAtomic` reduce write amplification por ronda.
   - Score, métricas y avance de ronda se actualizan en una sola operación.
   - Política configurable para checkpoint `round_start`.

## Vulnerabilidades y Mitigaciones

### 1) Robo de credenciales (Account Takeover)
**Riesgo:** Si roban el access/refresh token, el atacante mantiene sesiones activas.
**Mitigacion:**
- Refresh en cookie `httpOnly`.
- Revocacion total en cambio de password y logout.
- Revalidacion WS por evento.

### 2) CSRF (Cross-Site Request Forgery)
**Riesgo:** Con cookies, un atacante podria forzar acciones en segundo plano.
**Mitigacion:**
- Double-submit CSRF: `csrfToken` + `X-CSRF-Token`.
- Validacion de Origin/Referer para defensa en profundidad.

### 3) IDOR / Acceso entre profesores
**Riesgo:** Un profesor podria acceder a alumnos/partidas/analiticas de otro.
**Mitigacion:**
- Ownership por `createdBy` en controllers.
- `super_admin` mantiene acceso global.

### 4) WebSocket sin revalidacion
**Riesgo:** Tokens expirados siguen usando sockets activos.
**Mitigacion:**
- Revalidacion de token y session en eventos sensibles.

### 5) Fuga de UID por rooms globales
**Riesgo:** Lecturas RFID visibles a otros profesores.
**Mitigacion:**
- Rooms por profesor + sesion.
- Eventos RFID se dirigen solo al owner.

### 6) DoS por crecimiento de eventos
**Riesgo:** `GamePlay.events` crece indefinidamente.
**Mitigacion:**
- Cap de eventos por partida.

### 7) Bots en registro
**Riesgo:** Creacion masiva de profesores.
**Mitigacion:**
- Rate limit estricto.
- Honeypot.

### 8) Dependencias vulnerables
**Riesgo:** Exploits conocidos en librerias.
**Mitigacion:**
- Dependabot mensual.
- `npm audit` en CI.

### 9) Colisión de tarjetas entre instancias backend
**Riesgo:** Dos instancias podrían reservar el mismo UID simultáneamente.
**Mitigacion:**
- Claim atómico en Redis (`SET NX`).
- TTL + heartbeat de leases.
- Liberación condicionada por owner.

### 10) Inconsistencias por escrituras múltiples por ronda
**Riesgo:** Divergencia de score/métricas/ronda por updates separados bajo carga.
**Mitigacion:**
- Persistencia atómica de evento+score+métricas+avance de ronda.
- Reducción de checkpoints redundantes (`round_start` opcional).

### 11) Observabilidad Limitada y Evasión de Retenciones (Agujeros Negros)
**Riesgo:** Un atacante provoca fallos silenciosos no registrados, o el frontend client-side experimenta excepciones (ej. manipulación manual de estado, inyección) que el servidor ignora, facilitando la exploración encubierta. Las trazas de errores y fallos de la base de código proporcionan mapas tácticos para futuros ataques.
**Mitigacion (Sentry Telemetry Integrada):**
- Monitorización determinista full-stack: Las caídas de UI, transiciones HTTP fallidas y desbordamientos en WebSockets son interceptadas e indexadas.
- Saneamiento y Anonimización: Integración rigurosa de `beforeSend` para purgar tokens de sesión, IPs y cabeceras PII, cumpliendo normativas (GDPR) sin sacrificar fidelidad forense.
- Trazabilidad Inmutable: Fallos intencionados activan Sentry Alerting de inmediato antes de que el actor malicioso recupere control, logueando su pseudo-ID de AuthContext.

## Pendientes Recomendados (Mejora Futura)

- **MFA (TOTP)** para `teacher` y `super_admin`.
- **Alertas proactivas** ante multiples intentos fallidos o reutilizacion de refresh tokens.
- **Device binding avanzado** para sensores RFID (firma o token por sensor).

## Politica de auditoria en CI (Febrero 2026)

Se establece una politica dual para dependencias:

1. **Gate bloqueante (runtime):** `npm run audit:prod`
   - Ejecuta auditoria de backend y frontend con `--omit=dev`.
   - Este check **debe pasar** para permitir merge.

2. **Reporte no bloqueante (tooling):** `npm run audit:all`
   - Incluye auditoria completa (root + backend + frontend con devDependencies).
   - Se usa para seguimiento de deuda tecnica en lint/test/build tooling.

### Rationale

- Forzar `overrides` globales (por ejemplo `minimatch`) para eliminar todo warning de dev tooling puede romper `eslint` o `jest` por incompatibilidades de API.
- El enfoque adoptado prioriza **seguridad efectiva en produccion** sin degradar estabilidad de desarrollo.

## Gobernanza de dependencias (operativa)

- **Automatizacion mensual:** Dependabot genera PRs cada mes para backend, frontend y GitHub Actions.
- **Revision mensual:** se realiza triage y mantenimiento planificado de vulnerabilidades de tooling.
- **Sin registro formal de excepciones:** la gestion de deuda se controla por la revision mensual y por estado en PR/CI.
- **Playbook oficial:** ver `documentation/03-Gestion_Dependencias.md`.

## Referencias de Implementacion

- CSRF y cookies: [backend/src/config/security.js](backend/src/config/security.js)
- Login/refresh cookies: [backend/src/controllers/authController.js](backend/src/controllers/authController.js)
- Logout y revocacion: [backend/src/middlewares/auth.js](backend/src/middlewares/auth.js)
- Ownership: [backend/src/controllers/userController.js](backend/src/controllers/userController.js), [backend/src/controllers/gamePlayController.js](backend/src/controllers/gamePlayController.js)
- WebSocket revalidacion: [backend/src/server.js](backend/src/server.js)
- RFID rooms: [backend/src/server.js](backend/src/server.js)
- Cap de eventos: [backend/src/models/GamePlay.js](backend/src/models/GamePlay.js)
- CI: [.github/workflows/build.yml](.github/workflows/build.yml)
- Dependabot: [.github/dependabot.yml](.github/dependabot.yml)
- Plan de gestion: [documentation/03-Gestion_Dependencias.md](documentation/03-Gestion_Dependencias.md)
