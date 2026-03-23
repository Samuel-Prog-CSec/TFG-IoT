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

## Hardening Fase 2 (Marzo 2026)

Segunda ronda de endurecimiento de seguridad tras auditoría completa del backend (middleware, validadores, WebSocket, Redis, logging).

### Cambios implementados

#### 12. Validación enum de `sortBy` en paginación base

El schema base `paginationSchema` (`commonValidator.js`) exponía `sortBy: z.string().optional()`, permitiendo que cualquier string arbitrario llegara como clave de ordenación a MongoDB. Aunque todos los endpoints de dominio (sessions, plays, cards, users, decks, contexts, mechanics) sobreescriben `sortBy` con `z.enum([...])`, la ruta `GET /api/admin/pending` usaba el schema base sin sobreescritura, habilitando un vector de **sort injection** — un atacante podría enviar `?sortBy={"$where":"sleep(5000)"}` para ejecutar operadores de MongoDB en el campo `sort`.

**Solución:** Se restringe `sortBy` en el schema base a `z.enum(['createdAt', 'updatedAt']).optional().default('createdAt')`. Todos los endpoints de dominio que ya sobreescriben este campo no se ven afectados. El admin route queda protegido automáticamente por herencia del schema base.

**Impacto:** Cierra el único endpoint que permitía `sortBy` arbitrario sin validación enum.

#### 13. Límites explícitos de body parsing (JSON / URL-encoded)

Express 5 aplica un límite de `100kb` por defecto para `express.json()`, pero dependía de una configuración implícita no documentada. Se ha hecho explícito con `{ limit: '100kb' }` tanto en `express.json()` como en `express.urlencoded()` para documentar la intención y prevenir regresiones si el framework cambiara el default.

**Impacto:** Previene payloads excesivamente grandes que podrían consumir memoria del proceso Node.js (vector DoS de bajo esfuerzo).

#### 14. HPP (HTTP Parameter Pollution)

Express parsea `?role=admin&role=student` como `req.query.role = ['admin', 'student']` (array). Si un schema Zod espera `z.string()`, rechazará el array con un error de validación. Sin embargo, si algún middleware o controller accede a `req.query` antes de la validación, podría recibir un tipo inesperado.

Se añade el middleware `hpp` (npm) que normaliza los query params duplicados quedándose con el último valor, proporcionando defensa en profundidad antes de que la validación Zod actúe.

**Paquete:** `hpp` (0 dependencias transitivas, ampliamente auditado).

**Impacto:** Cierra el vector de inyección de arrays en query params para cualquier código que acceda a `req.query` previo a la validación Zod.

#### 15. Header `Permissions-Policy`

Helmet no incluye el header `Permissions-Policy` por defecto. Sin este header, los navegadores permiten que la página acceda a APIs como cámara, micrófono, geolocalización y pagos.

Se añade un middleware que emite:
```
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(self)
```

- **`usb=(self)`**: Necesario porque la plataforma utiliza Web Serial API para la lectura de tarjetas RFID desde el navegador. Web Serial depende de la política de permisos USB.
- El resto de APIs del navegador se deniegan explícitamente.

**Impacto:** Reduce la superficie de ataque del navegador, impidiendo que scripts de terceros o XSS usen APIs sensibles del dispositivo.

#### 16. Rate limiting con key compuesta (userId + IP)

Los rate limiters `createResourceRateLimiter` y `eventRateLimiter` usaban `req.ip` como clave por defecto. En entornos escolares donde todos los dispositivos comparten la misma IP (NAT), un solo alumno podría agotar el límite de requests para toda la clase.

Se añade un `keyGenerator` personalizado que usa `userId` cuando el usuario está autenticado (estos limiters se aplican después del middleware `authenticate`), cayendo a `req.ip` para requests no autenticados. Los rate limiters `authRateLimiter` y `registerRateLimiter` siguen siendo IP-based ya que el usuario no está autenticado en esos puntos.

**Impacto:** El rate limiting es ahora per-usuario real, no per-IP, evitando bloqueos colectivos detrás de NAT compartido.

#### 17. Sanitización de control characters en logging (Log Injection)

Pino en producción emite JSON estructurado donde los control characters (`\n`, `\t`, etc.) se escapan automáticamente (`\n` → `\\n`), por lo que los parsers de logs no se confunden. Sin embargo, en desarrollo con `pino-pretty`, los control characters se muestran raw, permitiendo que un input de usuario como `"Pepe\n[ERROR] CRITICAL: Database dump"` aparezca como dos líneas separadas en la consola, confundiendo al desarrollador.

Se añade un serializer personalizado `userInput` al logger Pino que elimina caracteres de control (rango `U+0000–U+001F` y `U+007F`). Los desarrolladores deben usar `logger.info({ userInput: nombre }, 'mensaje')` cuando logueen inputs del usuario directamente.

**Impacto:** Previene log forgery en desarrollo. En producción el riesgo ya era bajo por serialización JSON.

#### 18. Auditoría de seguridad frontend

Se auditó el frontend React completo con los siguientes resultados positivos (sin cambios necesarios):

- **Tokens en memoria**: Los access tokens se almacenan exclusivamente en estado React (AuthContext), nunca en `localStorage` ni `sessionStorage`. Los refresh tokens viajan en cookie `httpOnly`.
- **Sin XSS**: No se encontraron usos de `dangerouslySetInnerHTML` ni inyección de HTML raw. ESLint prohíbe `eval()` y `new Function()`.
- **Sentry con filtro PII**: `beforeSend` sanea tokens, IPs y datos personales antes de enviar eventos a Sentry.
- **Socket.IO con auth.token**: El token se envía en `handshake.auth.token`, no en query params (que aparecerían en logs de servidor).
- **Formularios con autoComplete**: Los campos de contraseña usan `autoComplete="current-password"` / `autoComplete="new-password"` correctamente.
- **ErrorBoundary**: Oculta stack traces en producción, mostrando solo mensajes genéricos al usuario.

#### 19. Hardening Nginx — Headers de seguridad

Nginx sirve los archivos estáticos de la SPA directamente (sin pasar por Express/Helmet). Se añadieron los siguientes headers y directivas de seguridad:

- **`server_tokens off`**: Oculta la versión de Nginx en headers de respuesta y páginas de error.
- **`X-Frame-Options: DENY`**: Cambiado de `SAMEORIGIN` a `DENY` (la app no usa iframes).
- **`Strict-Transport-Security`**: HSTS con `max-age=31536000; includeSubDomains; preload` para forzar HTTPS.
- **`Permissions-Policy`**: Restringe APIs del navegador (`camera=(), microphone=(), geolocation=(), payment=(), usb=(self)`). `usb=(self)` es necesario para Web Serial API (lectura RFID).
- **`Content-Security-Policy`**: CSP para archivos estáticos: `default-src 'self'`, `script-src 'self'`, `style-src` con Google Fonts, `connect-src` con Sentry y WebSockets, `frame-ancestors 'none'`.
- **`client_max_body_size 10m`**: Limita el tamaño de request body en el proxy (ligeramente mayor que el límite de 8MB del backend para mejor UX de errores).

**Nota:** Los headers del bloque `server {}` se aplican a las respuestas de archivos estáticos. Las respuestas del API proxy heredan los headers de Helmet del backend.

#### 20. Mongo Express con autenticación (Docker debug profile)

Mongo Express tenía `ME_CONFIG_BASICAUTH=false`, lo que exponía la base de datos sin contraseña si alguien activaba el perfil debug accidentalmente.

**Solución:** Se habilitó BasicAuth con credenciales configurables por variables de entorno:
- `ME_CONFIG_BASICAUTH=true`
- `ME_CONFIG_BASICAUTH_USERNAME=${MONGO_EXPRESS_USER:-admin}`
- `ME_CONFIG_BASICAUTH_PASSWORD=${MONGO_EXPRESS_PASSWORD:-devAdm1n!}`

**Impacto:** Previene acceso no autorizado a la base de datos a través de la UI de debug.

### Auditorías realizadas (sin cambios necesarios)

#### Auditoría ReDoS — Todas las regex seguras

Se auditaron todas las expresiones regulares custom del proyecto:

| Patrón | Ubicación | Resultado |
|--------|-----------|-----------|
| `/^[0-9a-fA-F]{24}$/` | `commonValidator.js` (ObjectId) | Segura: longitud fija, clase de caracteres simple |
| `/^[0-9A-F]{8}$\|^[0-9A-F]{14}$/` | `commonValidator.js` (UID RFID) | Segura: alternación con longitud fija, anchored |
| `/^[a-z0-9_-]+$/` | Múltiples validators (contextId, keys) | Segura: clase de caracteres simple con `+`, anchored |
| `/^[a-zA-Z0-9:_-]+$/` | `rfidValidator.js` (sensorId) | Segura: ídem |
| `/[A-Z]/`, `/[a-z]/`, `/[0-9]/` | `userValidator.js` (password) | Segura: clase simple, sin cuantificadores |
| `/[.*+?^${}()\|[\]\\]/g` | `escapeRegex.js` | Segura: solo clase de caracteres |

Ningún patrón presenta repetición anidada ni backtracking catastrófico. No se requieren cambios.

#### Confirmación de persistencia Redis (Zombie Cookies)

Se verificó que la configuración de Redis en `docker-compose.yml` y `docker-compose.prod.yml` incluye:
```
--appendonly yes --appendfsync everysec
```

Esto activa AOF (Append Only File), asegurando que la blacklist de tokens revocados sobrevive reinicios de Redis. La vulnerabilidad K (Zombie Cookies) documentada en `advanced_vulnerabilities.md` está mitigada por esta configuración.

#### Decisión: `payloadSecurity.js` vs `express-mongo-sanitize`

Se evaluó añadir `express-mongo-sanitize` como capa adicional. Resultado: **no necesario**.

La implementación custom `payloadSecurity.js` es más completa:
- Inspecciona recursivamente `body`, `query` y `params` (el paquete externo solo hace `body` y `query` por defecto).
- Bloquea `__proto__`, `prototype`, `constructor` (prototype pollution) además de claves con prefijo `$` (NoSQL injection).
- Se aplica también en payloads WebSocket via `findDangerousPayloadPath()`.
- Loguea eventos de seguridad con contexto completo (`securityLogger`).

Añadir el paquete externo sería redundante y aumentaría la superficie de dependencias sin beneficio.

### Vulnerabilidades y Mitigaciones (continuación)

### 12) HTTP Parameter Pollution (HPP)
**Riesgo:** Express convierte query params duplicados en arrays. Código que accede a `req.query` antes de validación Zod podría recibir tipos inesperados, habilitando bypass de lógica.
**Mitigacion:**
- Middleware `hpp` normaliza params duplicados (mantiene último valor).
- Zod `.strict()` rechaza tipos incorrectos como segunda línea de defensa.

### 13) Sort Injection en MongoDB
**Riesgo:** `sortBy` no validado como enum en el schema base permitía inyectar operadores MongoDB en la opción `sort` de las queries.
**Mitigacion:**
- `sortBy` en `paginationSchema` restringido a `z.enum(['createdAt', 'updatedAt'])`.
- Todos los endpoints de dominio sobreescriben con sus propios enums específicos.

### 14) Restricción de APIs del navegador
**Riesgo:** Sin `Permissions-Policy`, scripts maliciosos (vía XSS) podrían acceder a cámara, micrófono o geolocalización del dispositivo.
**Mitigacion:**
- Header `Permissions-Policy` deniega todas las APIs excepto `usb=(self)` (necesario para Web Serial/RFID).

### 15) Rate limiting colectivo detrás de NAT
**Riesgo:** En entornos escolares con NAT compartido, un solo usuario podría agotar el rate limit IP para toda la clase.
**Mitigacion:**
- Rate limiters post-autenticación usan `userId` como clave primaria, con fallback a IP.

### 16) Exposición de herramientas de debug sin autenticación
**Riesgo:** Mongo Express sin BasicAuth expone la base de datos completa a cualquiera que acceda al puerto 8082, si el perfil debug se activa accidentalmente.
**Mitigacion:**
- BasicAuth habilitado con credenciales configurables por variables de entorno.
- Las credenciales por defecto son solo para desarrollo local; en otros entornos deben configurarse explícitamente.

### 17) Archivos estáticos sin headers de seguridad
**Riesgo:** Nginx sirve la SPA directamente sin los headers de seguridad que Helmet aplica en el backend. Esto dejaba los archivos estáticos sin CSP, HSTS ni restricción de APIs del navegador.
**Mitigacion:**
- CSP, HSTS, Permissions-Policy, X-Frame-Options DENY y server_tokens off configurados en `nginx.conf`.

## Pendientes Recomendados (Mejora Futura)

- **MFA (TOTP)** para `teacher` y `super_admin`.
- **Alertas proactivas** ante multiples intentos fallidos o reutilizacion de refresh tokens.
- **Device binding avanzado** para sensores RFID (firma o token por sensor).

## Decisiones SonarCloud (Marzo 2026)

### `jssecurity:S5147` en repositorios de acceso a datos

Se revisaron los 23 hallazgos `BLOCKER` de la regla `jssecurity:S5147` detectados en:
- `backend/src/repositories/cardDeckRepository.js`
- `backend/src/repositories/cardRepository.js`
- `backend/src/repositories/gameContextRepository.js`
- `backend/src/repositories/gameMechanicRepository.js`
- `backend/src/repositories/gamePlayRepository.js`
- `backend/src/repositories/gameSessionRepository.js`
- `backend/src/repositories/userRepository.js`

Resultado de la evaluacion: **false positive** en todos los casos.

Razon tecnica (trazable):
- Los filtros/sorts dinamicos se construyen en controladores, pero las entradas llegan previamente validadas por `validateQuery(...)`.
- Los `sortBy` permitidos se restringen con `z.enum(...)` por endpoint.
- IDs sensibles (`sessionId`, `playerId`, etc.) pasan por `objectIdSchema`.
- Campos de busqueda usan `escapeRegex(...)` antes de generar `$regex`.
- En casos con `$in`, los valores se derivan de resultados de BD autorizados por ownership, no de input crudo del cliente.

Implicacion:
- No existe ruta de inyeccion NoSQL directa desde datos controlados por usuario hacia el repositorio en estos hallazgos.
- Se marco cada issue afectado como `falsepositive` en Sonar para reducir ruido y mantener foco en vulnerabilidades reales.

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
- HPP middleware: [backend/src/server.js](backend/src/server.js) (middleware `hpp`)
- Permissions-Policy: [backend/src/server.js](backend/src/server.js) (middleware custom post-Helmet)
- Body parsing limits: [backend/src/server.js](backend/src/server.js) (`express.json({ limit })`)
- sortBy enum validation: [backend/src/validators/commonValidator.js](backend/src/validators/commonValidator.js) (`paginationSchema.sortBy`)
- Rate limiter key compuesta: [backend/src/config/security.js](backend/src/config/security.js) (`keyGenerator`)
- Log injection sanitizer: [backend/src/utils/logger.js](backend/src/utils/logger.js) (serializer `userInput`)
- Payload security (NoSQL + Prototype Pollution): [backend/src/middlewares/securityPayloadGuard.js](backend/src/middlewares/securityPayloadGuard.js), [backend/src/utils/payloadSecurity.js](backend/src/utils/payloadSecurity.js)
- Nginx security headers (CSP, HSTS, Permissions-Policy): [frontend/nginx.conf](frontend/nginx.conf)
- Mongo Express BasicAuth: [docker-compose.yml](docker-compose.yml) (servicio `mongo-express`)
