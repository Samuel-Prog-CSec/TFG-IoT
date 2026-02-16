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
   - El refresh se realiza solo con cookie `httpOnly` (`refreshToken`).

2. **CSRF Double-Submit**
   - Cookie `csrfToken` (no `httpOnly`) + header `X-CSRF-Token`.
   - Requerido en POST/PUT/PATCH/DELETE.

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
   - Dependabot semanal y `npm audit` en CI.

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
- Dependabot semanal.
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

## Pendientes Recomendados (Mejora Futura)

- **MFA (TOTP)** para `teacher` y `super_admin`.
- **Alertas proactivas** ante multiples intentos fallidos o reutilizacion de refresh tokens.
- **Device binding avanzado** para sensores RFID (firma o token por sensor).

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
