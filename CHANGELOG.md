# Changelog

Todas las notas notables de cambios en este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Sin cambios pendientes. Próxima ventana: Sprint 6 (camino a v1.0.0)._

## [0.5.0] - 2026-04-24

Cierre del Sprint 5 y última versión previa a la 1.0.0. Cinco ejes principales: backend robustecido (errores unificados, repositorios completos, rate limiting Redis), suite completa de analytics (backend + frontend), protección de datos de menores (RGPD/LOPDGDD), refactor de tarjetas RFID a tokens fungibles (ADR-012) y motion signature "Tactile RFID + Paper" pan-app. 28 tareas cerradas de 31 (T-616 onboarding, T-535 plan modular y otras menores diferidas a Sprint 6).

### Añadido

#### Analytics y dashboards

- **Backend de analytics expandido (T-601 + T-625, #277):** 19 nuevos endpoints (`students`, `distribution`, `trends`, `heatmap`, `rankings`, `student summary`…) con framework KPI y umbrales RAG (Risk 0-49 / Average 50-69 / Good 70-89 / Excellent 90-100). Comparativa periodo actual vs anterior con deltas. 288 tests nuevos en la suite de analytics.
- **Suite completa de analytics frontend:** 4 páginas y 11 componentes nuevos (Dashboard ampliado, Perfil Individual de Estudiante, Vista Comparativa, Insights & Reports) consumiendo los nuevos endpoints, con framework RAG aplicado a tarjetas, gráficos y alertas.
- **Vista comparativa de estudiantes (T-606):** Tabla ordenable con filtros, exportación CSV y navegación cruzada al perfil individual.
- **Perfil individual de estudiante (T-603):** Métricas detalladas con overlay de comparativa de clase, trayectoria de aprendizaje y desglose por mecánica/contexto.
- **Dashboard con KPIs expandidos (T-604):** 8 KPIs reales del profesor autenticado, filtros interactivos, alertas inteligentes accionables y heatmap día/hora con leyenda y tooltips mejorados.
- **Componentes UI reutilizables (T-611):** `Breadcrumb`, `PageHeader` y `ErrorState` aplicados a todas las páginas nuevas.
- **Skeletons especializados** para gráficos y grids de cards.

#### Tarjetas RFID como tokens fungibles (ADR-012, T-801→T-807, #259)

- Eliminación completa del modelo `Card`: las tarjetas RFID pasan a ser tokens fungibles asignados directamente por el profesor mediante escaneo en vivo, sin registro previo por administrador.
- Esquemas Mongoose, validadores Zod, DTOs y lógica de negocio refactorizados para operar sólo con `uid`.
- Modo RFID `CARD_REGISTRATION` eliminado; `CARD_ASSIGNMENT` mantenido. Gameplay inalterado (matching por `uid` en memoria).
- Frontend: capa `cardsAPI` retirada, páginas admin de cartas eliminadas, wizard de mazos rediseñado para escaneo en vivo.

#### Backend — fundamentos y observabilidad

- **Flujo de errores unificado (T-516):** Validación Zod, `notFoundHandler` y nuevo `asyncHandler` pasan por `errorHandler` centralizado y logging estructurado de Pino. Eliminados ~72 try/catch manuales.
- **Patrón Repository completo (T-520, ADR-015):** `baseRepository` con write ops (`updateById`, `updateOne`, `deleteById`, `deleteMany`, `insertMany`, `bulkWrite`), soporte de sesiones para transacciones MongoDB y nuevo helper `utils/withTransaction.js`. 6 repositorios actualizados.
- **Utilidades reutilizables (T-519, ADR-014):** `utils/responseHelper.js` (`sendSuccess`/`sendCreated`/`sendPaginated`/`sendNoContent`) y `utils/filterBuilder.js` con 6 tipos declarativos. Migración total de controllers en commits dedicados.
- **Rate limiting con Redis store (T-521, ADR-016):** Los 8 limiters HTTP (`global`, `auth`, `register`, `create`, `event`, `analytics`, `upload`, `export`) usan `rate-limit-redis` en producción con fallback a `MemoryStore`. Nuevos limiters en `pause`/`resume` de partidas.
- **Cache-aside total en analytics (ADR-064):** Los 9 handlers de `analyticsController.js` pasan por `cacheGet('cache:analytics', ...)` con TTLs escalonados (120-600s). `GameEngine.endPlay` invalida el namespace fire-and-forget tras cada partida.
- **Cache slim-user en middleware auth (ADR-065):** Namespace `auth:user:<userId>` con TTL 60s que reduce queries Mongo por cada request HTTP autenticado y handshake WebSocket. Métricas `redis.authUserCacheHits/Misses` expuestas en `/api/metrics`.
- **Idempotencia distribuida de `startPlay` (ADR-066):** Lock `play:init:<playId>` con SET NX + TTL 60s. Previene duplicación de `new_round` emit en despliegues multi-instancia.
- **Observabilidad del fallback del rate limiter (ADR-067):** Reportado a Sentry como `error` + `alert: true` y contabilizado en `runtimeMetrics.redis.rateLimitStoreFallbackCount`.
- **Sistema distribuido de feature flags (PROP-61, ADRs 073/074):** Persistencia en Redis Hash con panel de administración en frontend.
- **Worker dedicado de BullMQ (PROP-62, ADR-077):** Contenedor separado con la cola `data-retention` activa y orquestada vía Docker Compose.
- **WebSocket rate limit distribuido (PROP-59, ADR-076):** Implementación basada en script Lua + ZSET con eviction probabilística.
- **RFID mode distribuido vía pub/sub (PROP-64, ADR-078):** El cambio de modo se propaga entre instancias del backend.
- **Cache Redis para mecánicas, contextos y analytics** + bloqueo distribuido de tarjetas (scripts Lua atómicos `reserveCards`, `releaseCards`, `renewLease`, `existsMany`, `hgetallMany`).
- **`REDIS_FLUSH_LUA_ON_BOOT` env var:** Flag opt-in que ejecuta `SCRIPT FLUSH` antes de recargar los scripts Lua. Necesaria en deploys con cambios en `.lua`.

#### UI/UX y motion

- **Sistema motion signature "Tactile RFID + Paper" (ADR-070):** `ScanlineOverlay` CSS-controlled, `EmptyAlertsIllustration`, float en wrapper de empty states, exit "paper flying" en `SessionCard`/`ContextCard`, `ConfirmationModal` danger con flip 3D + blip radial, micro-flash al resumir partida, logo pulse-glow en Login/Register.
- **Empty states ilustrados, variantes de modal y a11y keyboard-first (ADR-069):** `role=alert` en `InputPremium`, hook `useFormFocusFirstError`, `ActivityHeatmap` keyboard, iconos colorblind en `AlertsHub`, target size en `FallbackTouchPanel`, ilustraciones SVG inline en empty states, sidebar con badge `DOCENTE`/`DIRECCIÓN` y banner super_admin.
- **Confetti** en pantalla de fin de partida y celebración de récords con delta sobre best score previo.
- **Tema visual por contexto (ADR-061):** `DeckCard` con tint y stack effect "baraja física", widget RFID con ondas radar, accesos rápidos coloreados.
- **Sistema de assets multimedia mejorado:** Audio vinculado a tarjetas, LQIP (Low Quality Image Placeholder) y auditoría UX completa.
- **Página de Privacidad para profesores** y banner de consentimiento parental visible en alta de estudiantes (T-710).

#### Tests, infraestructura y CI

- **Cobertura de tests:** **1003 tests backend** (71 suites) + **257 tests frontend** verdes en CI. Nuevos: `analyticsCacheCoverage.test.js`, `authCache.test.js`, `endPlayInvalidatesAnalyticsCache.test.js`, `gameEngineStartPlayIdempotency.test.js`, `endPlayReleasesInitLock.test.js`, suites de repositorios refactorizadas y +232 tests unitarios añadidos en una sola pasada.
- **CI endurecido:** ESLint alineado con SonarCloud (plugins de seguridad, regex, secrets y promises), 226 → **0 warnings** en backend y frontend, fix del hang infinito de tests frontend en CI, exclusiones SonarCloud justificadas.
- **Docker:** Límites de memoria, filesystem read-only en compose base, autenticación por contraseña en Redis, worker BullMQ como servicio separado, version labels sincronizados con `package.json`.

### Cambiado

- **`req.user` ahora es un POJO** (no un documento Mongoose). Los flujos que hacían `req.user.save()` se migraron a `userRepository.updateById` + `invalidateUserCache`.
- **Invalidación explícita del cache auth** en `authController.login/logout/changePassword/updateProfile/refreshAccessToken`, `userController.updateUser/deleteUser` y `userService.updateUser`.
- **GameEngine modularizado:** Reducción del monolítico `gameEngine.js` (1915 líneas) a módulos especializados con mejor estabilidad y observabilidad.
- **Datos reales en dashboards (T-602):** Eliminados todos los mocks de `StudentsList`, `DistributionChart` y trends de `StatCard`. Todos los KPIs reflejan al profesor autenticado.
- **Lecturas optimizadas:** `lean()` automático en queries de listado, índices compuestos añadidos, eliminación de side-effects de escritura en handlers `GET`.
- **Migración de tokens OKLCH (T-503/507/512/608):** ~197 colores Tailwind crudos migrados a tokens semánticos en `WizardStepper`, `SessionsPage`, `GameSession`, `Login`, `Register`, `ContextsPage` y batch global.
- **Conflictos cross-deck atómicos** en operaciones Redis con scripts Lua (`reserveCards`, `releaseCards`, `renewLease`).
- **Pipeline RFID endurecido:** Watchdog, heartbeat, ventana temporal configurable y validación strict de `sensorId` y `source`.
- **Flujo de memoria con `board_ready`:** El cliente no muestra el board hasta confirmación del backend, evitando estados intermedios.
- **Onboarding contextual** parcialmente implementado (T-616 Sprint 6).

### Arreglado

- **Críticos pre-release v0.5.0 (ADRs 081-087):** `Mongoose score min:0` bloqueaba guardar partidas con score negativo (fix en `pre('validate')` + clamp), hook `useDeckWizardDraft` con contrato roto que rompía la creación de mazos vía `ErrorBoundary` (BUG-A14), `AdminContexts` pasando componente a `EmptyState` causando crash al filtrar a 0 resultados (BUG-A19), KPIs de Informes a 0 por mismatch de forma de datos (BUG-A6), eje Y de Curvas de Aprendizaje desbordado (clamp con `allowDataOverflow`).
- **Rate limiters HTTP realmente distribuidos (BUG-QA-1, ADR-068):** Los 8 limiters caían a `MemoryStore` al boot porque `require('./config/security')` se ejecutaba antes de `await connectRedis()`. Factory deferida + `initRateLimiters()` tras conectar Redis. Las keys `rl:*` aparecen en Redis desde el primer request y `rateLimitStoreFallbackCount == 0` en boot normal.
- **Backend sobrevive blips de Redis (BUG-QA-3):** `unhandledRejection` ya no ejecuta `gracefulShutdown` (sólo loguea y reporta a Sentry). Evita ciclos de reinicio del contenedor.
- **DTO `toSystemMetricsDTOV1` expone el bloque `redis` (BUG-QA-2):** `/api/metrics` muestra `redis.{rateLimitStoreFallbackCount, authUserCacheHits, authUserCacheMisses}`.
- **Normalización IPv6 en rate limiters (BUG-QA-4):** Nuevo helper `utils/ipHelper.js::userOrIpKeyGenerator` reemplaza 5 `keyGenerator` duplicados, agrupando al /64 con `ipKeyGenerator` de `express-rate-limit`.
- **Liberación explícita del lock `play:init` en `endPlay` (OBS-QA-1):** Evita "abort silencioso" si el cliente reintenta iniciar la misma partida en los 60s de TTL post-endPlay.
- **`passOnStoreError: true`** en todos los limiters (fail-open ante blip de Redis).
- **Permisos admin en mecánicas** y URLs de assets de la mecánica de Números.
- **Memory leak en tests** y hang infinito de tests frontend en CI.
- **Tildes y validación de pares** en sesiones de memoria (3 pasadas masivas de tildes en QA).
- **Polish de QA pre-release** (B-2/3/6/8, UI-D2, UI-P1/W1/G10): TOTAL=0 en Mis Mazos pese a 6 mazos activos, previews de contextos ilegibles, slider de penalización invertido, emojis en gameplay reemplazados por iconos Lucide, alertas con nombres duplicados, copy y hints depurados.

### Seguridad

- **Protección de datos de menores (RGPD Art. 8 + LOPDGDD Art. 7, T-701→T-717, #279):**
  - Auditoría completa de PII, Registro de Actividades de Tratamiento (RAT) y EIPD/DPIA documentada.
  - Minimización de datos: campo `birthdate` eliminado del modelo de estudiante.
  - Consentimiento parental obligatorio al crear estudiante, gestionado y reflejado en UI.
  - Seudonimización en analytics y separación de PII; logs Pino sin PII de menores.
  - Borrado efectivo (hard delete) y política de retención con plazos concretos.
  - Endpoints de portabilidad (Art. 20), rectificación con audit trail (Art. 16) y derecho de oposición a analytics comportamentales (Art. 21).
  - Audit trail de acceso a datos y página de privacidad para profesores.
  - Evaluación de riesgo de re-identificación en aulas pequeñas (k-anonimidad).
  - Protocolo documentado de notificación de brechas (Art. 33-34).
  - Sentry documentado como procesador internacional; Atlas CSFLE planificado para producción.
  - Centralización de operaciones RGPD en el rol `super_admin`.
- **Hardening de infraestructura:** Autenticación por contraseña en Redis (Docker Compose), filesystem read-only y límites de memoria en contenedores.
- **Vulnerabilidades resueltas:** `lodash` 4.18.1, `brace-expansion`, `axios` 1.14.0 (SSRF browser-safe excluida del security gate), `vite` 8.0.0-8.0.4. Dependencias actualizadas vía Dependabot (#270, #271, #272).

### Documentación

- **24 nuevos ADRs (064-087)** en `documentation/Architecture_Decisions.md` cubriendo cache analytics, cache auth, idempotencia `startPlay`, observabilidad rate-limit, factory deferida, motion signature, accesibilidad keyboard-first, feature flags distribuidos, BullMQ, WS rate limit, RFID pub/sub, sistema motion "Tactile + Paper" y fixes críticos de QA.
- **ADR-012** documentado: tokens RFID fungibles y eliminación del modelo Card.
- **`documentation/Proteccion_Datos_Menores.md`:** Documento unificado RGPD (EIPD, RAT, brechas, k-anonimidad).
- **`documentation/sprints/Sprint5_Tareas.md`:** Sprint 5 cerrado con 28/31 tareas completadas; tareas diferidas marcadas para Sprint 6.
- **`documentation/propuestas-mejora.md`:** Nuevas propuestas PROP-60 a PROP-93 catalogando hallazgos de QA y mejoras planificadas para Sprint 6.
- Actualizados `backend/docs/Arquitectura_Redis.md`, `Redis_Optimization_Analysis.md`, `Rate_Limiting_Analysis.md`, `Performance_Notes.md`, `Seguridad_tokens_JWT.md`, `Logging_Strategy.md`, `Analytics_Design_Rationale.md` y guías de frontend.
- Memoria académica del TFG (LaTeX) en redacción paralela en `memoria/`.

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
