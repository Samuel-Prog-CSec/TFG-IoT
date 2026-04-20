# Changelog

Todas las notas notables de cambios en este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Añadido

- **Cache-aside total en analytics (ADR-064):** Los 9 handlers de `analyticsController.js` que seguían sin cache ahora pasan por `cacheGet('cache:analytics', ...)` con TTLs escalonados (120-600s) según granularidad. `GameEngine.endPlay` invalida el namespace fire-and-forget tras cada partida.
- **Cache slim-user en middleware auth (ADR-065):** Nuevo namespace `auth:user:<userId>` con TTL 60s que reduce queries Mongo por cada request HTTP autenticado y handshake WebSocket. Helpers `fetchUserForAuth` e `invalidateUserCache` exportados desde `middlewares/auth.js`. Métricas `redis.authUserCacheHits/Misses` expuestas en `/api/metrics`.
- **Idempotencia distribuida de `startPlay` (ADR-066):** Nuevo lock `play:init:<playId>` con SET NX + TTL 60s. Previene duplicación de `new_round` emit en despliegues multi-instancia con Socket.IO adapter activo.
- **Observabilidad del fallback del rate limiter (ADR-067):** Cuando Redis no está disponible al boot, los limiters HTTP caen a `MemoryStore`. Ahora el fallback se reporta con log `error` + `alert: true` a Sentry en producción y se contabiliza en `runtimeMetrics.redis.rateLimitStoreFallbackCount`.
- **`REDIS_FLUSH_LUA_ON_BOOT` env var:** Flag opt-in que ejecuta `SCRIPT FLUSH` antes de recargar los Lua scripts en `loadLuaScripts`. Necesaria en deploys con cambios en `.lua` si Redis mantiene el script cache entre reinicios del backend. Logs con SHA completo de cada script al cargar.
- **Tests nuevos:** `analyticsCacheCoverage.test.js`, `authCache.test.js`, `endPlayInvalidatesAnalyticsCache.test.js`, `gameEngineStartPlayIdempotency.test.js`. Extensión de `runtimeMetrics.test.js` con casos para `redis.*`.

### Cambiado

- **`req.user` es un POJO**, no un documento Mongoose. Los flujos que hacían `req.user.save()` (un único punto en `middlewares/auth.logout`) se migraron a `userRepository.updateById` + `invalidateUserCache`.
- **Invalidación explícita del cache auth** en `authController.login/logout/changePassword/updateProfile/refreshAccessToken`, `userController.updateUser/deleteUser` y `userService.updateUser`.

### Documentación

- Nuevos ADRs 064-067 en `documentation/Architecture_Decisions.md`.
- Actualizados `backend/docs/Arquitectura_Redis.md`, `Redis_Optimization_Analysis.md`, `Rate_Limiting_Analysis.md`, `Performance_Notes.md` y `Seguridad_tokens_JWT.md`.
- Nuevas propuestas PROP-59 a PROP-64 en `documentation/propuestas-mejora.md` (Sprint 6): WebSocket rate-limit distribuido, leaderboards ZSET, feature flags, BullMQ, materialización studentMetrics, RFID mode distribuido.

## [0.4.0] - 2026-03-22

### Añadido

- **Gameplay completo Asociación y Memoria (E2E):** Pantalla de partida real integrada con backend vía Socket.IO para ejecutar partidas completas de ambas mecánicas sin simulación local, con vistas diferenciadas por mecánica, métricas en vivo (HUD) y resumen final ampliado. (#135)
- **Wizard de sesión adaptativo:** El wizard de creación adapta fases y validaciones según la mecánica seleccionada; mecánicas no disponibles (ej. `sequence`) se muestran como "Próximamente" y quedan bloqueadas tanto en UI como en backend (`SESSION_ENABLED_MECHANICS`). (#140)
- **Clonación de sesiones:** Función "Volver a jugar" que clona sesiones existentes resincronizando `cardMappings` y `contextId` con el estado actual del mazo; reglas específicas por mecánica para `boardLayout` (Memory) y `associationChallengePlan` (Association). (#141)
- **Contrato RFID backend-authoritative:** Contrato unificado de control de modos RFID entre frontend y backend con política single-owner por usuario, validación estricta de sensor y eliminación de derivación por ruta en frontend. (#142)
- **Gestión de contextos educativos (Frontend):** Nuevas páginas de listado y detalle de contextos con soporte para subida de assets a Supabase Storage.
- **Bloqueo distribuido de tarjetas (Redis):** Scripts Lua atómicos (`reserveCards`, `releaseCards`, `renewLease`) con ejecución vía `EVALSHA` + fallback `EVAL`, lectura batch por pipeline (`existsMany`, `hgetallMany`) y métricas de ejecución. (#147)
- **Integración Sentry completa:** Monitorización de errores en frontend (ErrorBoundary, tracing de navegación, source maps vía `@sentry/vite-plugin`) y backend (scopes de identidad de usuario, captura de errores WebSocket). (#149)
- **Reconexión de juego:** Experiencia de juego mejorada con reconexión automática, recuperación de estado y manejo robusto de desconexiones y desincronización.
- **Feedback de partida:** Sistema de retroalimentación mejorado con mensajes contextuales para aciertos, fallos, combos y timeouts durante gameplay.
- **Accesibilidad `prefers-reduced-motion`:** Hook `useReducedMotion` transversal aplicado en wizard, gameplay, modales y componentes animados con degradación progresiva que mantiene usabilidad completa. (#151, #153)
- **Tests:** Nuevas suites para `GameSession` (frontend), clonación de sesiones, bloqueo Redis, mecánica Memory, persistencia atómica de eventos, disponibilidad de mecánicas y borrado de contextos con dependencias.
- **Benchmarks:** Scripts de benchmarking para operaciones Redis (`benchmark-redis-ops.js`) y lectura de sesiones (`benchmark-session-reads.js`).

### Cambiado

- **Refresh token cookie-only:** Migración completa a cookie `httpOnly` exclusiva; eliminados envío y recepción de refresh token en body y localStorage. CSRF double-submit obligatorio también en refresh. Backend rechaza payload legado con `refreshToken` en body (400). (#137)
- **Estado de GameSession centralizado:** Transiciones de estado (`created` → `active` → `completed`) centralizadas en `sessionStatusService` basadas en el estado real de partidas (`GamePlay`), integradas en flujos de inicio, pausa, reanudación, finalización y abandono. (#139)
- **Lecturas sin write-on-read:** Endpoints `GET` de sesiones ejecutan lectura `lean` sin side-effects de escritura; caché de ownership por socket para reducir consultas redundantes; contadores de juego optimizados por agregación. (#145)
- **Persistencia atómica de eventos:** `GamePlay` usa operadores `$push` + `$inc` + `$slice` para persistencia por ronda (`addEventAtomic`), reduciendo write amplification y desactivando por defecto la persistencia de `round_start`. (#146)
- **GameEngine robusto:** Serialización por `playId` para operaciones críticas, hooks por mecánica sin condicionales ad-hoc, caché TTL de auth en socket, procesamiento batch configurable en cleanup/recovery y métricas operativas ampliadas. (#136, #143)
- **UI/UX general:** Reorganización de imports y componentes, nuevos iconos, animaciones mejoradas en login/registro, unificación de estilos; clases Tailwind dinámicas reemplazadas por mapas estáticos de variantes. (#152)
- **Dependencias:** Actualizadas dependencias en backend y frontend; proceso de CI mejorado con Dependabot mensual.

### Seguridad

- **Payload guard global:** Middleware `securityPayloadGuard` para detección y bloqueo de payloads con `__proto__`, `constructor.prototype` y operadores NoSQL (`$`), aplicado en HTTP y WebSocket. (#144)
- **Validación Origin en WebSocket:** Validación explícita de `Origin` en handshake con whitelist de seguridad, como doble capa junto con CORS base. (#144)
- **RFID hardening:** Ventana temporal configurable (`RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS`), formato estricto de `sensorId` y validación de `source` en eventos RFID de cliente. (#144)
- **Integridad de dominio:** Restricción de modificación de `createdBy` en `PUT /api/users/:id`; transferencias solo por endpoint dedicado; guardas de borrado de contextos con dependencias activas. (#148)
- **Cookie httpOnly exclusiva:** Refresh token solo vía cookie segura; eliminada exposición en body de respuesta y fallback legado en logout. (#137)

### Corregido

- Incoherencias de validación entre Zod y Mongoose en campos de sesión (`penaltyPerError` rechazaba valor 0, `numberOfCards` con límites divergentes).
- Bugs visuales en múltiples páginas del frontend.
- Manejo de datos mejorado en `DeckEditPage` y `SessionsPage`.
- Pantalla de fin de partida (`GameOverScreen`) rediseñada con estadísticas de resumen detalladas.
- Soporte de `reduced-motion` añadido en animaciones que carecían de ello.

### Documentación

- Documentación técnica de seguridad de tokens JWT (`backend/docs/Seguridad_tokens_JWT.md`).
- Arquitectura Redis ampliada y corregida (`backend/docs/Arquitectura_Redis.md`).
- Análisis de optimización Redis con comparativa antes/después (`backend/docs/Redis_Optimization_Analysis.md`).
- Notas de rendimiento (`backend/docs/Performance_Notes.md`) y flujos RFID en runtime (`backend/docs/RFID_Runtime_Flows.md`).
- API actualizada a v0.4.0 (`backend/docs/API_v0.4.0.md`).
- Auditoría integral de gameplay Sprint 4 (`documentation/Sprint4_Gameplay_Mejoras_Mantenimiento.md`).

## [0.3.0] - 2026-02-13

### Añadido

- **RFID Web Serial (Frontend):** Migración del flujo de lectura RFID al cliente (navegador) con soporte para conexión/desconexión, estados y control por modo operativo.
- **Integración Frontend-Backend completa:** Conexión real de la UI con API REST y Socket.IO para auth, usuarios, sesiones, mazos y métricas.
- **Autenticación WebSocket obligatoria:** Handshake autenticado y control de acceso reforzado para eventos en tiempo real.
- **Rate limiting en Socket.IO:** Límites por tipo de evento para reducir riesgo de abuso/DoS en canales de juego.
- **Capa DTO de respuestas:** Estandarización de payloads para reducir exposición de datos y mejorar consistencia de API.
- **Multi-sensor RFID (base):** Soporte de identificación de sensor en eventos para escenarios con más de un lector.
- **Modos RFID de flujo:** Control explícito para procesar lecturas según contexto (juego, registro, asignación, idle).
- **Frontend de operación docente:**
  - Panel de aprobación de profesores.
  - Flujo de sesión única por usuario.
  - Gestión de mazos en UI.
  - Wizard de sesión mejorado.
  - Dashboard analytics ampliado.
- **Infraestructura Docker:** Dockerfiles y compose para entorno local/dev/prod con documentación asociada.

### Cambiado

- **Arquitectura RFID:** Se desprioriza la dependencia de lectura serie en backend para favorecer despliegue cloud con lectura Web Serial desde frontend.
- **Validación de API:** Hardening de esquemas y validadores con Zod en rutas críticas.
- **Flujos en tiempo real:** Endurecimiento del pipeline Socket para mejorar estabilidad y trazabilidad en sesiones activas.

### Seguridad

- **Hardening de WebSocket:** autenticación obligatoria + control de frecuencia por evento.
- **Security logging:** Mejoras de registro orientadas a auditoría y detección de eventos de riesgo.
- **Validación estricta de entrada:** Reforzada en endpoints y eventos críticos para reducir superficie OWASP (input tampering / payloads malformados).

### Corregido

- Ajustes de integración frontend/backend para eliminar inconsistencias de contrato en flujos de sesión y datos de UI.
- Mejoras de robustez en rutas y validaciones para reducir errores por datos incompletos o no normalizados.

### Documentación

- Actualización de documentación de arquitectura y uso extendido de WebSocket/Web Serial.
- Actualización de tareas y cierre de Sprint 3 con trazabilidad técnica.
- Consolidación de documentación operativa para despliegue con Docker.

## [0.2.0] - 2026-01-09

### Añadido

- **Super Admin:** Rol `super_admin` con capacidad de aprobar/rechazar nuevos profesores. Endpoint de aprobación de usuarios.
- **Sesiones:** Implementada sesión única por dispositivo (invalida sesiones anteriores automáticamente).
- **Redis:** Integración completa con Redis para:
  - Blacklist de tokens y rotación de refresh tokens (7 días).
  - Persistencia de estados de partida (GamePlay).
  - Rate limiting y caché distribuida.
- **Pausa/Reanudación:** Funcionalidad para pausar y reanudar partidas en tiempo real (congelando el timer).
- **Mazos de Cartas (CardDecks):** Sistema para que los profesores creen, guarden y reutilicen configuraciones de cartas.
- **Gestión de Assets:**
  - Nuevos servicios: `imageProcessingService` y `audioValidationService`.
  - Validación estricta por "magic bytes".
  - Conversión automática de imágenes a WebP y generación de thumbnails.
  - Soporte exclusivo para audio MP3/OGG.
- **Transferencias:** Endpoint para transferir alumnos entre profesores manteniendo sus métricas.
- **Infraestructura:**
  - Script `drop-db` para desarrollo.
  - Health checks (`/health`) y endpoint de métricas (`/api/metrics`).
  - Configuración robusta de puerto serie con detección automática.

### Cambiado

- **Seguridad:** SVG eliminado de formatos permitidos por riesgo XSS. Solo WebP para imágenes.
- **Límites:** Eliminado límite duro de partidas simultáneas (ahora es warning suave).
- **Modelos:** Actualizado modelo `User` con `accountStatus` y `currentSessionId`.
- **API:** Endpoints de assets separados en `/images` y `/audio` con validaciones específicas.

### Documentación

- **Protocolo RFID:** Documentación técnica completa con diagramas de secuencia y estados en `backend/docs/RFID_Protocol.md`.
- **Arquitectura:** Nuevos diagramas PlantUML para la arquitectura del sistema y flujos de datos.

## [0.1.0] - 2025-12-15

### Añadido

- **Autenticación:** Sistema completo JWT con Access/Refresh tokens y validación de roles.
- **Gestión de Usuarios:** CRUD para profesores y estudiantes.
- **Hardware RFID:** Integración con servicio `serialport` y simulación para desarrollo.
- **Motor de Juego:** `GameEngine` con soporte para WebSocket (Socket.IO) en tiempo real.
- **Mecánicas:** Base para mecánicas de juego, comenzando con asociación simple.
- **Tests:** Suite completa de tests e2e e integración (Auth, Flujo de Juego, Serial).
- **Documentación:** API REST documentada en `/docs/API_v0.3.0.md`.

### Corregido

- Solucionado problema de "Open Handles" en tests (timers de auth y RFID).
- Resuelto conflicto de nombres en `ValidationError` (error 500).
- Configuración de seguridad ajustada para entornos de test.
