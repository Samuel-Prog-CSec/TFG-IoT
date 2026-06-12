# Notas de Rendimiento - WebSockets (T-046)

## Contexto

Con la autenticación obligatoria en el handshake de Socket.IO, el servidor realiza una consulta a la base de datos para validar el estado de la cuenta y el single-session antes de aceptar la conexión. Esto mejora la seguridad pero añade coste por conexión.

## Riesgo

- Aumento de latencia en el handshake cuando hay picos de conexiones simultáneas.
- Carga adicional en MongoDB si se abren muchas conexiones en poco tiempo.

## Posibles mejoras futuras

1. **Cache breve en memoria/Redis**
   - Cachear `status`, `accountStatus`, `currentSessionId` por `userId` con TTL corto (ej. 30-60s).
   - Reduce lecturas repetidas durante reconexiones rápidas.

2. **Claims adicionales en el token**
   - Incluir `accountStatus` y `status` en el access token.
   - Validar primero el token y luego aplicar una comprobación periódica desde Redis o una revisión en segundo plano para invalidaciones.

3. **Revalidación periódica de sockets**
   - Middleware o job que revalide sockets activos en intervalos (ej. cada 5-10 min).
   - Desconectar sockets si la cuenta cambia de estado o sesión inválida.

4. **Protección ante reconnect storms**
   - Rate limit específico de handshake (por IP o userId) para evitar tormentas de reconexión.

## Decisión actual

- Se prioriza seguridad y consistencia de sesión sobre latencia mínima en el handshake.
- La optimización se pospone hasta medir métricas reales de conexiones en producción.

## Avance Sprint 4 (T-055)

En la iteración del 16-02-2026 se incorporaron mejoras operativas en `gameEngine`:

1. **Métricas nuevas de ejecución**
   - `ignoredCardScans`
   - `blockedManualNextRound`
   - `totalTimeouts`
   - `averageRoundResponseTimeMs`

2. **Control de flujo manual de rondas**
   - `next_round` se bloquea cuando la ronda actual está esperando respuesta (`awaitingResponse`) para reducir race conditions entre timeout/scan/override manual.

3. **Idempotencia de arranque**
   - Guard en `start_play` para evitar doble inicialización en memoria de una misma partida activa.

4. **Consistencia de estado de sesión**
   - Recalculo y persistencia automática de `GameSession.status` en base al estado real de `GamePlay` durante ciclo de vida del motor.

5. **Serialización por partida (race hardening)**
   - Se incorporó exclusión mutua en memoria por `playId` para operaciones críticas de runtime:
     - escaneo de tarjeta
     - timeout
     - pausa/reanudación
     - avance manual de ronda
   - Se añadió contador `lockContention` para observabilidad de contención.

6. **Caché de revalidación auth en WebSocket**
   - Se incorporó caché TTL para revalidación de eventos sensibles en Socket.IO.
   - TTL configurable por `AUTH_REVALIDATION_CACHE_TTL_MS` (default 30s).
   - Métricas expuestas: `websocket.events.authCacheHits` y `websocket.events.authCacheMisses`.

7. **Procesamiento por lotes en cleanup/recovery**
   - Se reemplazaron recorridos totalmente secuenciales por ejecución en lotes para:
     - limpieza de partidas abandonadas por timeout global
     - recuperación de partidas huérfanas desde Redis
   - Tamaño configurable por `GAME_ENGINE_BATCH_SIZE` (default 20).

## Avance Sprint 4 (T-064)

En la iteración del 16-02-2026 se aplicaron optimizaciones de lectura/consultas:

1. **Lectura de sesión sin mutación**
   - `GET /api/sessions/:id` dejó de sincronizar y persistir (`save`) durante la lectura.
   - El endpoint queda sin side-effects de escritura (read-only real).

2. **Recalculo de estado de sesión en una sola consulta agregada**
   - `sessionStatusService` pasó de dos `countDocuments` a una agregación con conteo total + conteo condicional de plays activas/pausadas.
   - Reduce roundtrips Mongo por recálculo de estado.

3. **Optimización de ownership en comandos socket**
   - Se añadió ruta ligera de consulta para ownership en comandos `join/leave/pause/resume/next`.
   - Se añadió caché TTL por `userId + playId` (`PLAY_OWNERSHIP_CACHE_TTL_MS`, default 5s).
   - `start_play` mantiene ruta completa con sesión/mecánica para preservar funcionalidad de arranque.

4. **Lecturas `lean` en endpoints de sesión**
   - `GET /api/sessions` y `GET /api/sessions/:id` operan con consultas `lean` para reducir overhead de hidratación Mongoose en rutas read-heavy.
   - Se mantiene contrato read-only sin side-effects de escritura.

## Avance Sprint 4 (T-065)

En la iteración del 16-02-2026 se aplicó reducción de escrituras por ronda en `GamePlay`:

1. **Persistencia atómica de eventos**
   - Se añadió `addEventAtomic` en el modelo `GamePlay`.
   - Cada evento persiste con un único update usando `$push` (con `$slice`) y `$inc` para score/métricas.

2. **Evento + avance de ronda en una sola escritura**
   - En `gameEngine`, los eventos de resultado (`correct/error/timeout`) incrementan `currentRound` en la misma operación atómica.
   - Se elimina la necesidad de una escritura separada para persistir avance de ronda.

3. **Política de checkpoints por defecto**
   - Se desactiva por defecto la persistencia de `round_start` para evitar doble escritura por ronda.
   - Puede habilitarse explícitamente con `PERSIST_ROUND_START_EVENTS=true`.

4. **Consistencia de métricas de intentos**
   - `metrics.totalAttempts` ahora contabiliza solo eventos de respuesta (`correct`, `error`, `timeout`), no eventos de control.

## Avance Sprint 4 (T-058) - iteración 17-02-2026

1. **Métrica explícita de descarte por carrera**
   - Se añadió `scanRaceDiscarded` en `gameEngine` para distinguir descartes por carrera (`scan`/`timeout`) de descartes generales (`ignoredCardScans`).

2. **Higiene de cachés TTL de Socket.IO**
   - Se incorporó barrido de expirados para cachés en memoria de auth/ownership con umbral configurable (`SOCKET_CACHE_SWEEP_THRESHOLD`, default 2000).
   - Objetivo: evitar crecimiento sostenido de entradas expiradas en escenarios de alta rotación de sockets/tokens.

3. **Caché de ownership por socket**
   - Se añadió caché local por socket para ownership (`userId+playId`) complementaria a la caché global TTL.
   - Reduce accesos repetidos al mapa global y consultas en comandos consecutivos del mismo socket.

## Estado de medición cuantitativa

- Se verificó no regresión funcional en suites críticas (`socketAuth`, `runtimeMetrics`, `metricsEndpoints`, `gameFlow`, `playPauseResume`, `nextRoundCommand`).

### Benchmark reproducible de lectura de sesiones (17-02-2026)

- Script: `npm run bench:sessions`.
- Implementación: `backend/scripts/benchmark-session-reads.js`.
- Entorno de ejecución: `NODE_ENV=test` y `MONGO_URI=mongodb://localhost:27017/rfid-games-test`.
- Metodología:
   - **Baseline sin `lean`**: `SESSION_READ_LEAN_ENABLED=false`.
   - **Optimizado con `lean`**: `SESSION_READ_LEAN_ENABLED=true`.
   - 20 iteraciones warmup + 120 iteraciones medidas.

Resultados (JSON capturado en ejecución):

- `GET /api/sessions` (listado):
   - baseline `avg=6.90ms`, `p95=8.32ms`
   - optimizado `avg=6.29ms`, `p95=7.21ms`
   - mejora `avg=8.84%`, `p95=13.34%`
- `GET /api/sessions/:id` (detalle):
   - baseline `avg=3.92ms`, `p95=4.41ms`
   - optimizado `avg=3.82ms`, `p95=4.16ms`
   - mejora `avg=2.55%`, `p95=5.67%`

Conclusión de cierre T-064:

- Se confirma mejora de latencia en endpoints de listado y detalle respecto al baseline definido sin `lean`.
- La ganancia principal se concentra en listado; en detalle la mejora es moderada por tratarse de una ruta de micro-latencia con menor margen.

## Avance Sprint 4 (T-066)

En la iteración del 16-02-2026 se fortaleció la coordinación distribuida del runtime:

1. **Locks de tarjetas con lease TTL**
   - Las reservas de UIDs en Redis usan claim atómico (`SET NX`) con TTL (`GAME_ENGINE_LOCK_TTL_SECONDS`, default 90s).

2. **Heartbeat de renovación de leases**
   - El engine renueva periódicamente claves activas de `PLAY` y `CARD` (`GAME_ENGINE_LOCK_HEARTBEAT_MS`, default 30000ms).
   - Métricas nuevas: `distributedLockLeaseRenewed` y `distributedLockLeaseFailed`.

3. **Release owner-aware**
   - La liberación de tarjetas valida ownership (`value === playId`) para evitar borrado accidental de locks de otra instancia.

4. **Cobertura de regresión**
   - Tests añadidos para colisión de UIDs, presencia de TTL y renovación de lease.

## Avance Sprint 5 - Resiliencia y gestión de memoria

En la iteración del 12-03-2026 se aplicaron mejoras de resiliencia ante crashes, gestión de memoria y optimización del ciclo de vida de recursos.

### 1. Checkpoints periódicos de partida en MongoDB

**Motivación**: entre `startPlay()` y `endPlay()`, el estado completo de la partida (score, métricas, eventos) vivía exclusivamente en memoria. Redis almacenaba un snapshot parcial (ronda, score, status) pero no el historial de eventos ni las métricas detalladas. Un crash del servidor significaba pérdida total de progreso.

**Implementación**: se añade `checkpointPlayIfNeeded()` en `gameEngine.js`, invocado automáticamente tras cada `addEventAtomic()`. Persiste el documento `GamePlay` completo en MongoDB cuando se cumple cualquier umbral:

- **Temporal**: `CHECKPOINT_INTERVAL_MS` (default `120000` = 2 minutos)
- **Por eventos**: `CHECKPOINT_EVENT_THRESHOLD` (default `5` eventos de respuesta)

Cada checkpoint también ejecuta `syncPlayToRedis()` para mantener coherencia.

**Campos de tracking en playState**:
- `lastCheckpointAt` — timestamp del último checkpoint
- `lastCheckpointEventCount` — valor de `metrics.totalAttempts` en ese momento

**Impacto en write amplification**: ~1 escritura adicional cada 2 minutos por partida activa. Con 20 partidas simultáneas: ~10 writes/min extra, negligible para MongoDB.

**Ventana de pérdida máxima**: 2 minutos o 5 eventos (lo que ocurra primero), frente a "toda la partida" previamente.

Para más contexto sobre la decisión, ver **ADR-010** en `Architecture_Decisions.md`.

### 2. Tracking y limpieza de timers transitorios

**Motivación**: el modo memory usaba `setTimeout` anónimos para delays de ocultación de cartas. Si `endPlay()` o `pausePlay()` se ejecutaba mientras un timer estaba pendiente, el callback se disparaba sobre estado ya eliminado.

**Implementación**:
- Nuevo campo `transientTimers: new Set()` en `playState`.
- Helper `scheduleTransientTimer(playState, callback, delayMs)` que registra el timer en el Set y lo auto-elimina al dispararse.
- `clearPlayTimers()` ahora también itera y limpia `transientTimers`.

**Impacto**: elimina una categoría de errores silenciosos por callbacks sobre estado stale en partidas de memoria.

### 3. Shutdown paralelo de partidas activas

**Motivación**: durante el graceful shutdown, `finalizeAllPlays()` iteraba secuencialmente con un `for` loop sobre todas las partidas activas, invocando `endPlay()` para cada una. Con muchas partidas activas, esto podía alargar el shutdown significativamente.

**Implementación**: se reemplaza el loop secuencial por `processInBatches()`, que ejecuta los `endPlay()` en paralelo con control de concurrencia por lotes (`GAME_ENGINE_BATCH_SIZE`, default 20).

**Impacto**: el tiempo de shutdown se reduce proporcionalmente al número de partidas activas, de O(n) secuencial a O(n/batchSize) paralelo.

### 4. Exposición de métricas de memoria del proceso

**Motivación**: la observabilidad de uso de memoria del proceso Node.js era limitada a logs puntuales. Para detectar fugas de memoria o presión de heap en producción, se necesita exposición continua.

**Implementación**: el endpoint `GET /api/metrics` (ya existente) ahora incluye `process.memoryUsage()` en la respuesta a través de la función `getMemoryUsage()` en `healthCheck.js`.

**Campos expuestos**:
- `rss` — Resident Set Size (memoria total asignada al proceso)
- `heapTotal` — Heap total reservado por V8
- `heapUsed` — Heap efectivamente en uso
- `external` — Memoria de objetos C++ enlazados
- `heapUsedPercentage` — Porcentaje de uso del heap

Estos datos se devuelven en formato legible (MB) a través de `toSystemMetricsDTOV1`.

### 5. Limpieza periódica de caches Socket.IO

**Motivación**: las caches en memoria de `authRevalidationCache` y `playOwnershipCache` (Maps con TTL) solo se limpiaban al superar el umbral `SOCKET_CACHE_SWEEP_THRESHOLD` (default 2000 entradas). En despliegues de larga ejecución con rotación constante de sockets/tokens, las entradas expiradas podían acumularse significativamente por debajo del umbral sin limpiarse nunca.

**Implementación**: se añade un `setInterval` de 5 minutos (`CACHE_CLEANUP_INTERVAL_MS`) que invoca `sweepAllExpiredEntries()` sobre ambas caches, independientemente del tamaño.

**Características**:
- Se configura `.unref()` para no impedir el cierre del proceso.
- Se detiene explícitamente durante el graceful shutdown via `stopCacheCleanup()`.
- Coexiste con el barrido por umbral existente (que actúa como protección para picos súbitos).
- Métricas de limpieza se registran en logs a nivel `debug`.

**Impacto**: previene crecimiento sostenido de memoria en despliegues de larga ejecución sin afectar la latencia de los event handlers.

### 6. Mejoras de reconexión WebSocket

**Motivación**: la configuración de reconexión por defecto (5 intentos, max 5s delay) era demasiado agresiva para redes inestables comunes en entornos educativos (WiFi de aula, conexiones móviles).

**Cambios en `frontend/src/services/socket.js`**:

| Parámetro | Antes | Después | Motivo |
|---|---|---|---|
| `reconnectionAttempts` | 5 | 15 | Tolerar desconexiones más prolongadas |
| `reconnectionDelayMax` | 5000ms | 15000ms | Evitar saturación con reintentos rápidos |

**Nuevo flujo de recuperación**:
1. Al reconectar, el socket service emite `CustomEvent('socket_reconnected')` en `window`.
2. `GameSession.jsx` escucha este evento e invoca `requestPlayStateSync(playId)`.
3. El servidor responde con el snapshot completo via `play_state` (ver ADR-010).
4. El componente rehidrata su estado con `handlePlayState()`.

**Impacto**: reconexión más robusta y recuperación automática del estado de juego sin intervención del usuario. Para más detalles sobre el comando `play_state_sync`, ver `WebSockets-ExtendedUsage.md`.

## Mantenimiento Sprint 5 — Optimización de Queries Mongoose

### 1. Aplicación automática de `.lean()` en queries de listado

Mongoose devuelve por defecto documentos completos con getters, setters, virtuals y métodos de instancia (`.save()`, `.validate()`, etc.). Estos documentos hidratados consumen aproximadamente 5 veces más memoria que un objeto JavaScript plano (POJO) equivalente. Para endpoints de listado que transforman resultados a DTOs antes de enviarlos, esta hidratación es overhead innecesario.

**Implementación**: se modificó `baseRepository.applyQueryOptions()` para aplicar `.lean()` automáticamente cuando la query incluye opciones de paginación/ordenamiento (`sort`, `limit` o `skip`). Estas queries siempre corresponden a listados cuyo resultado se pasa directamente a funciones DTO — nunca se invoca `.save()` sobre ellos.

**Por qué no se aplicó globalmente**: los métodos `findById` y `findOne` no aplican lean por defecto porque existen aproximadamente 30 flujos en controllers y services que siguen el patrón `find → modify → .save()`. Forzar lean en estas rutas rompería todas esas llamadas a `.save()` (que no existe en POJOs), requiriendo una refactorización masiva a patrón `updateById`. El lean en `findById`/`findOne` permanece disponible como opción explícita para casos de solo lectura.

**Resultado**: las queries de listado devuelven POJOs con ~5x menos consumo de memoria por documento, sin cambios en la interfaz pública del repository ni en los DTOs consumidores.

### 2. Índices compuestos para queries de analytics

Se añadieron 3 índices compuestos en los modelos para optimizar las consultas más frecuentes de los endpoints de analytics:

| Índice | Modelo | Campos | Caso de uso |
|--------|--------|--------|-------------|
| `playerId_completedAt` | GamePlay | `{ playerId: 1, completedAt: -1 }` | Historial de partidas de un estudiante, ordenado por fecha. Usado en `GET /api/analytics/student/:id/summary` y listados de plays por jugador. |
| `status_completedAt` | GamePlay | `{ status: 1, completedAt: -1 }` | Agregaciones de analytics que filtran por estado (completed, abandoned) y ordenan por fecha. Usado en `GET /api/analytics/distribution`, `trends`, `rankings`. |
| `createdBy_role` | User | `{ createdBy: 1, role: 1 }` | Listado de estudiantes de un profesor. Usado en `GET /api/analytics/classroom/students` y filtros de usuario por rol dentro de un aula. |

Sin estos índices, las queries realizaban collection scans completos, lo cual degradaría progresivamente el rendimiento conforme crece el volumen de datos en GamePlay y User.

Para más contexto sobre la decisión, ver **ADR-019** en `Architecture_Decisions.md`.

### Cache Redis para Entidades Core

Se implementó el patrón **cache-aside** mediante `utils/cacheHelper.js` para reducir la carga de lecturas repetidas a MongoDB en entidades que cambian con poca frecuencia. Se definen tres niveles de cache con TTLs diferenciados según la volatilidad de los datos:

| Nivel | Entidad | TTL | Justificación |
|-------|---------|-----|---------------|
| **Tier 1** | Mecánicas de juego | 1 hora | ~3 mecánicas en el sistema, cambian solo por acción de administrador |
| **Tier 2** | Contextos temáticos | 30 minutos | ~15 contextos, cambian solo por acción de administrador |
| **Tier 3** | Analytics de clase | 5 minutos | Cambian con cada partida completada, TTL corto para balance frescura/rendimiento |

**Patrón cache-aside**: el servicio intenta leer de Redis primero. En caso de cache miss, consulta MongoDB, almacena el resultado en Redis con el TTL correspondiente, y lo devuelve al consumidor. Las lecturas posteriores dentro del TTL se sirven directamente desde Redis.

**Invalidación explícita en mutaciones**: las operaciones de create, update y delete en mecánicas y contextos invocan `cacheInvalidate` para eliminar la entrada de Redis inmediatamente. Esto garantiza que la siguiente lectura obtenga datos frescos. Analytics no requiere invalidación explícita — el TTL de 5 minutos proporciona un balance adecuado.

**Fallback transparente**: si Redis no está disponible (circuit breaker abierto o error de conexión), `cacheGet` ejecuta directamente la función de fetch contra MongoDB sin lanzar error. El sistema opera en modo degradado sin cache, y re-puebla automáticamente cuando Redis vuelve a estar disponible.

Solo se cachean endpoints `getById` (llamados frecuentemente con datos estables). Los endpoints de listado quedan sin cache porque las combinaciones variables de filtros, ordenamiento y paginación generarían demasiadas cache keys con baja tasa de acierto.

Para más contexto sobre la decisión, ver **ADR-020** en `Architecture_Decisions.md`.

---

## Mejoras de rendimiento y estabilidad (Mantenimiento 2026-04-12)

### maxTimeMS en aggregations (ADR-039)

Todas las aggregation pipelines ahora tienen un timeout por defecto de 15 segundos, centralizado en los repositories (`gamePlayRepository`, `gameSessionRepository`, `userRepository`). Esto evita que un pipeline lento bloquee el pool de conexiones de Mongoose indefinidamente. Configurable via `AGGREGATE_TIMEOUT_MS`.

### Hard cap en caches in-memory de Socket.IO

Los caches `authRevalidationCache` y `playOwnershipCache` en `socketHandlers.js` ahora tienen un hard cap basado en `CACHE_SWEEP_THRESHOLD` (default 2000). Si el cache supera el umbral tras un sweep completo, las nuevas entradas se descartan. Esto previene acumulación de memoria por ráfagas de conexiones.

### Fix: TTL fallback en cacheGet

El fallback de TTL en `cacheHelper.js` ahora resuelve correctamente el namespace (`cache:analytics` → `analytics` → 300s) en vez de buscar por key (que nunca matcheaba). Los callers que pasan TTL explícito no se ven afectados.

### Fix: cacheInvalidateNamespace implementado

La función `cacheInvalidateNamespace` en `cacheHelper.js` ahora delega a `redisService.flushNamespace()` (SCAN + DEL) en vez de ser un no-op. Se usa en `userController` para invalidar analytics tras un cambio de consentimiento RGPD.

### Lógica de aggregation extraída a services

Las aggregation pipelines que estaban en `gamePlayController` y `gameSessionController` se han movido a los services correspondientes (`gamePlayService.getPlayerStats`, `gamePlayService.getPlayStatsBySessionIds`), manteniendo los controllers como orquestadores delgados.

---

## Mantenimiento 2026-04-20 — Cobertura total cache analytics + cache auth + idempotencia

### Cobertura total de cache-aside en analytics (ADR-064)

Los 9 handlers de `analyticsController.js` que seguían consultando Mongo en cada request ahora pasan por `cacheGet('cache:analytics', ...)`. TTLs escalonados (120-600s) según granularidad. `GameEngine.endPlay` invalida el namespace en fire-and-forget tras cada partida para garantizar frescura en el dashboard del profesor.

Impacto esperado en p95 de endpoints cacheados: reducción de ~150-400ms (cold aggregate) a <10ms (warm cache hit).

### Cache slim-user en middleware auth (ADR-065)

Nuevo cache `auth:user:<userId>` con TTL 60s que evita el `userRepository.findById` de cada request autenticado (HTTP + WebSocket handshake). Invalidación explícita en login/logout/updateProfile/changePassword y en mutaciones de `userController`/`userService`. Métricas `runtimeMetrics.redis.authUserCacheHits/Misses` permiten observar la efectividad.

`req.user` pasa a ser POJO (no Mongoose doc); los flujos afectados se migraron a `userRepository.updateById` + `invalidateUserCache`.

### Idempotencia distribuida de startPlay (ADR-066)

SET NX en `play:init:<playId>` con TTL 60s al inicio de `GameEngine.startPlay`. Previene duplicación de `new_round` emit y `syncPlayToRedis` en despliegues multi-instancia con Socket.IO adapter activo. Complementa el `reserveCardsAtomic` (ADR-004) que ya protegía los card locks.

### Hardening fallback rate-limit + Lua flush opt-in

- `config/security.createRedisStore`: fallback a memoria reporta a Sentry con `alert: true` en producción, incrementa `runtimeMetrics.redis.rateLimitStoreFallbackCount`, y deja documentada la deuda técnica de re-creación lazy (ver ADR-067).
- `config/redis.loadLuaScripts`: nueva env var `REDIS_FLUSH_LUA_ON_BOOT=true` ejecuta `SCRIPT FLUSH` antes de recargar — necesaria en deploys con cambios en `.lua` si Redis mantiene el script cache entre reinicios. Log con SHA completo de cada script al cargar.

### Lazy promotion del rate limiter HTTP a Redis store (ADR-068)

Refactor posterior a ADR-067 que resuelve la causa raíz del fallback sistemático al boot: los 8 limiters se registran ahora lazy en un `rateLimitersRegistry` y se instancian con Redis store por `initRateLimiters()` invocado desde `server.js` tras `await connectRedis()`. Los exports (`globalRateLimiter`, etc.) son middleware shims que delegan al limiter real cuando existe.

Configuración adicional al crear los limiters: `passOnStoreError: true` — si Redis cae mid-request, `express-rate-limit` deja pasar el request (fail-open) en lugar de devolver 500. Criterio: preferible tolerar un pico de tráfico ante blip de Redis que tirar el servicio entero con errores. El blip queda visible vía `runtimeMetrics.redis` + Sentry (desde ADR-067). Helper compartido `utils/ipHelper.js::userOrIpKeyGenerator` usa `ipKeyGenerator` para normalizar IPv6 al /64, eliminando warnings de `express-rate-limit` y cerrando un potencial bypass por prefijos IPv6 del mismo rango.

Además, el handler `unhandledRejection` en `server.js` ya no ejecuta `gracefulShutdown` — solo loguea y reporta a Sentry. Esto evita el ciclo de reinicios del contenedor que se observaba durante blips de Redis cuando alguna promise Redis pendiente rechazaba. `uncaughtException` mantiene el shutdown (estado del proceso realmente incierto).

Impacto medido tras despliegue: `rateLimitStoreFallbackCount == 0` en boot normal (antes 8), keys `rl:*` presentes en Redis desde el primer request, `RestartCount` del contenedor permanece 0 tras `docker stop redis` + requests concurrentes.

### Tests nuevos (993 verde tras los cambios)

- `analyticsCacheCoverage.test.js`, `authCache.test.js`, `endPlayInvalidatesAnalyticsCache.test.js`, `gameEngineStartPlayIdempotency.test.js` (4 nuevos).
- `runtimeMetrics.test.js` extendido con 3 nuevos casos para `redis.*`.

## Pool Mongoose para Atlas M0 (ADR-140)

En producción (`NODE_ENV=production`) se aplican opciones explícitas a `mongoose.connect()` tuneadas para el free tier compartido de Atlas M0:

| Opción | Valor | Razón |
|---|---|---|
| `maxPoolSize` | 10 | 1 instancia api Eco free aforra ~200 RPS con 10 conexiones |
| `minPoolSize` | 2 | mantiene 2 conexiones calientes — evita TLS handshake tras idle 10min |
| `serverSelectionTimeoutMS` | 10s | tolera cold start de M0 sin tapar errores reales |
| `socketTimeoutMS` | 45s | corta queries colgadas sin matar la conexión |
| `heartbeatFrequencyMS` | 30s | detecta failover sin saturar Atlas con pings |
| `retryReads` / `retryWrites` | true | requiere replica set (Atlas siempre lo tiene) |
| `w` | `'majority'` | durabilidad fuerte — la escritura confirma cuando la mayoría del replica la tiene |

En `development` y `test` se omiten — `mongodb-memory-server` y MongoDB local single-node pueden no soportar `w: 'majority'`.

## Probes liveness vs readiness (ADR-141)

Tres rutas:

| Endpoint | Verifica | Status code | Audiencia |
|---|---|---|---|
| `GET /health/live` | Sólo que el proceso responde | 200 fijo | UptimeRobot, GCP/k8s liveness |
| `GET /health/ready` | Mongoose readyState + Redis circuit breaker + flag `isReady` | 200 / 503 | Koyeb routing, k8s readiness |
| `GET /health` (legacy) | Health detallado (Mongo + Redis + RFID + memoria + CPU) | 200 / 503 | Dashboards admin |

El handler `readinessCheck` lee `serverState.getIsReady()` (flag que el shutdown pone a `false` al iniciar) y verifica vivamente `mongoose.connection.readyState === 1` + `isRedisConnected()` + circuit breaker no abierto. No hace ping de red — leer estado en memoria es O(1) y evita generar tráfico cada 5-15s.

## Trust proxy detrás de Koyeb (ADR-140)

`app.set('trust proxy', 1)` se activa cuando `NODE_ENV=production` o `TRUST_PROXY=true`. Sin esto, `req.ip` es la del proxy de Koyeb y los rate limiters bloquean a todos los clientes con una única IP. En desarrollo se omite a propósito: confiar en `X-Forwarded-For` sin proxy real abre la puerta a bypass.

---

## T-907 — Performance + escalabilidad pre-v1.0.0 (Mantenimiento 2026-05-17)

T-907 del Sprint 6 consolida las cuatro propuestas de performance (PROP-120/121/122/123) y extiende el alcance a una auditoría integral de rendimiento full-stack. Esta sección documenta los cambios aplicados con foco backend; el equivalente frontend vive en `frontend/docs/Frontend_Chunking_Vite_Optimization.md` (Iteración E).

### Telemetría de comandos Upstash por categoría (ADR-158)

Hasta ahora `/api/metrics` solo exponía hit/miss del cache `auth:user` y fallbacks del rate-limit store. No había manera de saber cuántos comandos consumía cada namespace contra Upstash (10K/día en free tier). Si una demo al tribunal con 30-40 alumnos rompía el budget, no había información para diagnosticar qué namespace estaba descontrolado.

**Solución:**
- `backend/src/utils/redisCommandTracker.js`: contador in-process con `recordCommand(category, count=1)` + `getSnapshot()` que devuelve `total`, `byCategory` y `estimatedDaily` (extrapolación lineal desde uptime).
- 15 categorías reconocidas: `auth`, `blacklist`, `refresh`, `security`, `cache-mechanic`, `cache-context`, `cache-analytics`, `play`, `card`, `ratelimit`, `ws`, `bullmq`, `lua`, `pipeline`, `other`.
- `redisService.js` instrumentado: cada método operacional registra 1 comando tras `recordSuccess()`. Métodos batch (`setMany`, `delMany`, `existsMany`, `hgetallMany`) registran N. Lua wrappers registran 1 bajo categoría `lua`. `scanByNamespace` cuenta iteraciones de cursor.

El snapshot resultante en `/api/metrics`:
```json
{
  "redis": {
    "commandsTotal": 1234,
    "commandsByCategory": {
      "auth": 567,
      "blacklist": 123,
      "ratelimit": 234,
      "cache-analytics": 45,
      "lua": 12,
      "pipeline": 8
    },
    "commandsEstimatedDaily": 17856
  }
}
```

Si `commandsEstimatedDaily > 8000`, el operador tiene margen para reaccionar antes de tocar el techo del free tier.

### LRU memoria complementaria al cache Redis (ADR-158)

El cache `auth:user` Redis ahorra muchas queries Mongo, pero cada request autenticada seguía haciendo al menos 1 GET a Upstash. En microbursts del mismo usuario (polling rápido, varios tabs abiertos) se acumulan comandos innecesarios.

**Solución:**
- `backend/src/utils/inMemoryCache.js`: clase `InMemoryCache` LRU+TTL ligera, sin dependencias externas.
- Instancias singleton: `authUserCache` (TTL 30s, 500 entradas), `mechanicCache` (TTL 60s, 50), `contextCache` (TTL 60s, 100).
- `middlewares/auth.js → fetchUserForAuth`: lookup order `memoria → Redis → Mongo`. Hit en memoria ahorra 1 GET Upstash. Repoblación bidireccional (set en memoria tras hit Redis).
- `invalidateUserCache(userId)` limpia ambas capas + emite invalidación Redis. Cross-instance la consistencia depende del TTL local (30s) — aceptable single-instance; documentado como deuda menor para futuro pub/sub `cache:invalidate`.

Métricas expuestas en `/api/metrics → redis.inMemoryCache`:
```json
{
  "authUser":  { "size": 12, "max": 500, "ttlMs": 30000, "hits": 234, "misses": 56, "hitRatePercent": 80.7 },
  "mechanic":  { ... },
  "context":   { ... }
}
```

Hit rate elevado en `authUser` (>70%) indica que la capa local está absorbiendo microbursts y bajando el budget de comandos Upstash.

### Métricas hit/miss de caches socket en memoria

Las caches `authRevalidationCache` (TTL 30s) y `playOwnershipCache` (TTL 5s) en `socketHandlers.js` ya existían pero no exponían hit/miss. Ahora `runtimeMetrics` añade:

- `websocket.authRevalidationCacheHits / Misses`
- `websocket.playOwnershipCacheHits / Misses`

Hit ratio bajo en `playOwnershipCache` indica que muchos eventos socket están revalidando contra Mongo — pista de un caller mal cacheado.

### Pipeline helper expuesto

`redisService.runPipeline(buildFn, namespace='pipeline')` permite a callers futuros agrupar lecturas heterogéneas en 1 round-trip Upstash. Si un módulo necesita combinar `EXISTS blacklist:<jti> + GET security:<userId> + GET auth:user:<userId>` (caso típico del middleware `authenticate`), puede invocarlo con un solo viaje. Se contabiliza bajo la categoría `pipeline` por defecto.

No se aplicó el refactor del middleware `authenticate` para usar pipeline en este sprint porque rompería tests que mockean los métodos individualmente y los beneficios principales (reducción de comandos) ya los aporta el LRU memoria. Queda disponible para iteración futura.

### Hardening Mongo: `reportDataService` timeouts (ADR-158)

`reportDataService.getStudentReport` y `getClassroomReport` orquestaban `Promise.all` de sub-servicios sin timeout global. Si Atlas M0 degradaba (cluster compartido), una sola petición podía colgarse indefinidamente consumiendo un slot del pool Mongoose.

**Solución:** wrapper `withReportTimeout(promise, label)` con `Promise.race + setTimeout REPORT_TIMEOUT_MS` (default 8000ms, configurable). Si vence, lanza `ReportTimeoutError` (statusCode 504, isOperational true) y notifica a Sentry con tag `report:timeout`. El cliente recibe un error claro en lugar de un timeout HTTP de 30s+.

### Logger Pino en hook Mongoose `GamePlay.pre('validate')`

El hook `pre('validate')` que clampea `score > maxScore` usaba `console.warn` (con `eslint-disable-next-line no-console`) por considerarse "sin acceso al logger Pino". Falso supuesto: se importa `logger = require('../utils/logger').child({ component: 'GamePlayModel' })` al inicio del módulo y se usa `logger.warn({ playId, score, maxScore }, ...)`. Cumple CLAUDE.md (sin console en prod) y proporciona contexto estructurado para filtrado en agregadores.

### Sentry profile rate verificado

`config/sentry.js` ya tiene `profilesSampleRate: 0.1` en producción (10%). Sin cambios necesarios — está dentro del límite recomendado para no inflar el cuota de Sentry Performance.

### Validación Socket.IO multi-instancia (PROP-122, Fase C)

Scripts nuevos en `backend/package.json`:
- `dev:multi-1` → puerto 5000.
- `dev:multi-2` → puerto 5001.

Ambos comparten la misma instancia Redis (`REDIS_URL=redis://localhost:6379`) para que el Socket.IO Redis adapter (`@socket.io/redis-adapter`) propague eventos entre instancias.

Script `backend/scripts/test-socket-multiinstance.js`:
- Login contra ambos backends para obtener access tokens válidos.
- Conecta clientes a las dos instancias en el mismo room.
- Emite `test:ping` desde clientA al room y verifica que clientB (servido por backend distinto) lo recibe; luego inversa.
- Salida: "TEST PASADO" si ambos cruces funcionan, error claro si no.

Procedimiento operativo en `WebSockets-ExtendedUsage.md` sección "Validación multi-instancia".

### Pendientes documentados (no se hicieron en este sprint)

Mejoras backend identificadas en la auditoría pero diferidas como tareas independientes:

1. **Refactor pipeline en `authenticate`**: combinar 3 GETs en 1 round-trip Redis. Beneficio: latencia (~50% reducción) sin reducir comandos. Requiere refactor de `verifyAccessToken` y actualización de tests. Documentado en ADR-158.
2. **Cache `analyticsService.getStudentEngagement.abandonmentDetails`** con TTL 10 min: sub-pipeline con 2 `$lookup` anidados que puede tardar ~500ms en cluster cargado. Requiere identificar invalidación correcta.
3. **Audit populates + `.select(...)`**: 4-5 calls que devuelven campos no consumidos. Reducción de bytes Mongo → app.
4. **Sharding `data-retention` BullMQ**: si el job tarda >30 min en M0, partir por rango fecha. Env var `DATA_RETENTION_SHARDS=N`.
5. **Pub/sub `cache:invalidate`**: para invalidación cross-instance del LRU memoria. Solo aplica cuando se escale a 2+ instancias Koyeb.

### Comandos de verificación

```bash
# Telemetría de comandos Upstash
curl -s http://localhost:5000/api/metrics | jq '.redis'

# Test multi-instancia
docker compose up -d mongo redis
npm --prefix backend run dev:multi-1 &
npm --prefix backend run dev:multi-2 &
npm --prefix backend run test:multi-instance
```

---

## T-907 — Mejoras pendientes ejecutadas (Iteración 2026-05-17 noche)

Tras cerrar el cuerpo principal de T-907, se ejecutaron las 6 mejoras "follow-up" que el plan original había documentado como diferidas + la validación operativa multi-instancia. Esta sección recoge cada una con motivación, alcance y verificación.

### INT1 — Pipeline auth (3 GETs Redis → 1 round-trip)

**Antes:** `authenticate` ejecutaba secuencialmente `isTokenRevoked` (1 GET) → `checkSecurityFlag` (1 GET) → `fetchUserForAuth` (1 GET adicional cuando LRU memoria miss). Tres round-trips a Upstash en el peor caso por cada request HTTP autenticado.

**Después:** nuevo helper `fetchUserForAuthWithChecks(decoded, req)` en `middlewares/auth.js` agrupa los tres comandos en **una sola pipeline** vía `redisService.runPipeline`. El JWT se decodifica primero localmente (sin tocar Redis) gracias al nuevo parámetro `verifyAccessToken(token, req, { skipRedisChecks: true })`. Los consumers de Socket.IO (`socketHandlers.js`) siguen pasando `skipRedisChecks: false` y mantienen el flujo secuencial — el cambio no los afecta.

**Reglas preservadas:**
- Blacklist → `UnauthorizedError TOKEN_REVOKED` (idéntico).
- Security flag con tolerancia +1s para re-logins inmediatos post-`revokeAllUserTokens` (idéntico).
- LRU memoria sigue siendo la primera capa; si hit, ni siquiera se pide `auth:user` en el pipeline (se omite el comando, no es overhead).

**Impacto medible:**
- Round-trips Upstash por request autenticada: `3 → 1` en miss, `2 → 1` con auth:user en LRU pero blacklist/security obligatorios.
- Latencia auth percibida ~50% menor en miss caliente (cluster cargado): pasa de ~3·RTT a ~1·RTT.
- Comandos Upstash/día: no cambia significativamente (los 3 cmds siguen ejecutándose), pero **agrupados en 1 round-trip**.

### INT2 — LazyMotion Framer Motion (`m as motion` global)

**Migración aplicada:**
- Script Node ejecutado contra `frontend/src/`: 28 archivos cambiaron `import { motion } from 'framer-motion'` → `import { m as motion } from 'framer-motion'`. El JSX `motion.X` queda intacto porque el alias mantiene el identificador local.
- `App.jsx` envuelve el árbol con `<LazyMotion features={domAnimation}>`.
- Mock global de `framer-motion` en `frontend/src/test/setup.js` para que tests aislados (sin LazyMotion provider) no rompan. Tests con mock local (`Dashboard.analytics.test.jsx`, `SessionsPage.clone.test.jsx`) actualizados para exponer `m` y `LazyMotion`.

**Hallazgo de bundle:**
- Chunk `motion` antes: `141.33 KB` raw (`46.67 KB` gzip).
- Chunk `motion` después: `141.76 KB` raw (`46.80 KB` gzip).
- **Reducción real: marginal (+0.13 KB gzip, dentro del ruido).**

**Conclusión documentada:** con Rolldown (bundler vigente en `vite.config.js`), el tree-shaking de Framer Motion 12 ya es muy agresivo y el módulo es relativamente monolítico para split granular por feature. LazyMotion **no aporta el ~25 KB esperado en este stack**. La migración se mantiene por buena práctica (versión "light" recomendada por Vercel, prepara terreno si el bundler optimiza carga dinámica de features en versiones futuras), no por beneficio observable.

**Lo que sí persiste como beneficio:** mock global de framer-motion en `setup.js` cubre componentes nuevos sin requerir actualizar tests uno a uno.

### INT3 — Cache `getStudentEngagement` TTL 10 min

`services/analytics/engagementService.js`: la función `getStudentEngagement(studentId, { timeRange })` se envuelve con `cacheGet('cache:analytics', engagement:student:{studentId}:{timeRange}, fetch, 600)`. La lógica de aggregation pasa a `computeStudentEngagement` (sin cache; exportada para tests de igualdad). El cómputo de los 5 componentes ponderados se factoriza en el núcleo puro `computeEngagementComponents`, compartido con `computeStudentEngagementBatch` (ver más abajo "`engagementDrop` N+1 → batch"), garantizando que el score por alumno sea idéntico por ambos caminos.

El sub-pipeline más caro es `abandonmentDetails` (dos `$lookup` anidados sobre GameSession y GameContext) — ~300-800 ms en Atlas M0 con un alumno que acumula 50+ partidas. Con el cache:
- Cold (miss): mismo coste.
- Warm (hit): <10 ms (lectura Redis).

La invalidación llega automáticamente desde `GameEngine.endPlay → cacheInvalidateNamespace('cache:analytics')` (existente desde ADR-064), por lo que el dashboard del docente refresca tras cada partida con ≤200 ms de regeneración real.

### INT4 — Sharding BullMQ `data-retention`

`services/dataRetentionService.js` ahora acepta `windowStart` y `windowEnd` opcionales en `runDataRetention`, `anonymizeOldGamePlays` y `deleteInactiveStudents`. Si están definidos, el filtro temporal se acota al rango; si no, comportamiento original.

`queues/index.js` lee `DATA_RETENTION_SHARDS` env (default 1, retrocompatible). Si N > 1, encola N jobs `daily-retention-shard-{i}-cron` con ventanas temporales disjuntas desde `2024-01-01` hasta el cutoff. Cada job procesa un slice independiente.

`workers/dataRetentionWorker.js` lee `DATA_RETENTION_WORKER_CONCURRENCY` env (default 1) para subir la concurrencia del worker cuando hay sharding activo. Pasa `job.data.windowStart/windowEnd/shardIndex/shardCount` al service.

**Activación operativa:** `DATA_RETENTION_SHARDS=4` + `DATA_RETENTION_WORKER_CONCURRENCY=4` cuando el job único tarde >30 min. Por defecto (`=1`), el flujo es idéntico al anterior.

### INT5 — Pub/sub `cache:invalidate` cross-instance

Nuevo `realtime/cacheInvalidateSubscriber.js`: canal Redis `cache:invalidate` + función `publishInvalidate(namespace, key)` + subscriber que recibe mensajes de **otras** instancias (ignora los propios via `ownInstanceId` = `HOSTNAME` o `INSTANCE_NAME` o `pid-<pid>`) y limpia el LRU local correspondiente.

Mapea 3 namespaces a sus singletons LRU:
- `auth:user` → `authUserCache`.
- `cache:mechanic` → `mechanicCache`.
- `cache:context` → `contextCache`.

`invalidateUserCache` ahora publica al canal antes de invalidar Redis (lazy require para evitar ciclos). El subscriber se arranca/detiene junto con `rfidModeSubscriber` en `server.js` (orden alineado con la conexión Redis del lifecycle del backend).

**Impacto:**
- Single-instance: no-op útil (publica al canal pero nadie escucha, coste despreciable). LRU local se limpia síncronamente como antes.
- Multi-instance: ventana de inconsistencia tras cambios sensibles (role, status, mecánica/contexto editado) baja de **30-60 s (TTL)** a **<100 ms (latencia pub/sub Redis)**.

Documentado también en `Arquitectura_Redis.md` (sección "T-907 INT5 — Canal pub/sub `cache:invalidate`").

### INT6 — Audit `populate` + `.select(...)` quirúrgico

Auditados los 8 sitios con `populate(` en producción. **5 ya tenían select explícito**. Los 3 restantes corregidos:

| Sitio | Antes | Después | Ganancia |
|---|---|---|---|
| `gamePlayController.js:135` (`getPlayById`) | outer `sessionId` sin select | `select: 'mechanicId contextId config difficulty'` (lo que el DTO consume) | ~30% bytes por respuesta del endpoint |
| `gamePlayController.js:196` (`pausePlay`) | `populate: 'sessionId'` (toda la sesión, ~10 KB con cardMappings) | `select: 'createdBy'` (1 campo) | ~99% bytes — solo se usa para ownership check |
| `gamePlayService.js:227` (`completePlay`) | `playerId` y `sessionId` completos | `playerId` solo `_id`, `sessionId` solo `config` (cubre `play.sessionId.config.{pointsPerCorrect,numberOfRounds}`) | RGPD: no se hidrata PII de User innecesariamente |

### OP2 — Validación multi-instancia ejecutada

Test `npm run test:multi-instance` ejecutado contra Docker Compose local (`mongo:7` + `redis:7-alpine`) y dos backends en puertos 5000 y 5001 compartiendo la misma instancia Redis. **Resultado: TEST PASADO**. El log completo está en `backend/docs/WebSockets-ExtendedUsage.md` (sección "Validación ejecutada 2026-05-17, T-907 OP2").

Para que el script funcione fuera de producción, `socketHandlers.js` registra dos handlers temporales en el namespace `/game` (`test:join` y `test:broadcast`) que **solo se montan si `NODE_ENV !== 'production'`**. En producción son rutas inertes.

---

## T-941 / ADR-161 — Coste del worker `alert-detection`

Cron `*/15 * * * *` (configurable por `ALERT_DETECTION_CRON`) ejecuta los 13 detectores por cada teacher activo (batch de 50). Carga estimada para un centro con 50 docentes × 200 alumnos:

| Operación | Coste por corrida | Mitigación |
|---|---|---|
| `loadActiveStudentsForTeacher` | 1 `find` por teacher | Index `{ createdBy: 1, role: 1 }` ya existente |
| Detectores que hacen aggregate (10 de los 13) | 10 pipelines × 50 teachers = **500 aggregates / 15 min** | Index `{ playerId: 1, completedAt: -1 }` cubre la mayoría. `engagementService` cachea 600 s |
| `smartAlertRepository.buildActiveAlertsMap` | 1 `find` por teacher | Index `{ teacherId: 1, status: 1, ... }` |
| Upserts | 1 `findOneAndUpdate` por finding (típicamente 0-3 por teacher) | Unique partial index `{ studentId, type, status='active' }` enforcear dedup |
| Invalidación cache | 1 SCAN + N DELs por teacher modificado | Cache pequeño (60s TTL) y solo si hubo cambios |

Total esperado: <3 s para 50 teachers, lejos del límite del free tier Atlas M0. Si crece, se puede subir `ALERT_DETECTION_CRON` a `*/30 * * * *` o shardear como `dataRetention` (T-907 INT4) modificando `runForAllTeachers`.

**Endpoint `GET /api/analytics/alerts`**: tras la primera corrida, latencia <50 ms (lectura `smartalerts` + cache `cache:alerts` 60 s) vs 200–500 ms del cálculo on-the-fly anterior. La carga MongoDB por refrescos del docente queda prácticamente eliminada (cache golpea ~95 %).

## Sprint 0 pre-v1.0.0 — Observabilidad de pipelines + perf frontend (ADR-164)

### M1 — Slow-query log en `gamePlayRepository.aggregate`
`backend/src/repositories/gamePlayRepository.js` ya tenía `DEFAULT_AGGREGATE_TIMEOUT_MS=15000` configurable vía env. Sprint 0 añade `SLOW_AGGREGATE_WARN_MS=5000` (también configurable):
- Si la aggregation termina pero tarda > `SLOW_AGGREGATE_WARN_MS` → `logger.warn(alert:true, {elapsedMs, maxTimeMS, firstStage})`. Indica candidato a materialización (BullMQ nightly → campos `studentMetrics`) o índice secundario faltante.
- Si MongoDB aborta por `MaxTimeMSExpired` → `logger.error(alert:true, ...)`. La query se considera "envenenada" y el caller recibe el error tal cual.

Permite detectar pipelines analytics que tienden a degradar **antes** de que afecten UX. Combinado con Sentry beforeSend redact, las alertas no fugan PII. Diferido a Sprint 3: extracción de los pipelines más caros (`getStudentDifficulties`, `getStudentSummary`) a vista materializada nightly.

### M3 — `CharacterMascot` pausa loops fuera de viewport
`frontend/src/components/game/CharacterMascot.jsx` añade `useInView(containerRef)` además de `useReducedMotion()`. Los 8 loops `repeat: Infinity` (float/bounce/jump/nod/tilt/sway/pointRight/wobble) y las decoraciones `celebrating` (Star/Sparkles con escalado infinito) solo se activan cuando la mascota está en pantalla. Tras un scroll fuera o tras navegar a GameOver, los rAF de Framer Motion se detienen automáticamente. DevTools Performance muestra reducción a ~0 frames/s gastados por la mascota fuera de viewport.

### M8 — Auto-cleanup de intervals en `useConfetti`
`frontend/src/hooks/useConfetti.js` mantiene `activeIntervalsRef = new Set()` y limpia todos los intervals en cleanup de `useEffect` al unmount del hook. Antes, `fireFireworks` retornaba `() => clearInterval(interval)` pero callers podían ignorar el return value, dejando intervals huérfanos si el componente se desmontaba mid-celebración. `canvas-confetti` gestiona su propio rAF interno y se autopara cuando las partículas mueren; el cleanup nuevo solo cancela nuestros intervals.

---

## Pre-v1.0.0 — Fase A (Mongo / Atlas)

Sesión de performance end-to-end pre-corte v1.0.0. Ver ADR-170 y ADR-176.

### A.1-A.4 — Patrón "proyección post-`$lookup`" + "`$match` early" en 6 funciones analytics

Aplicado en `backend/src/services/analyticsService.js`:
- `_getClassroomSummaryImpl`, `getClassroomComparison`, `getClassroomDifficulties`, `getClassroomHeatmap`, `getTopContextsAndMechanics`, `getClassroomTrends`.
- Helper cacheable `getTeacherSessionIds(teacherId, opts)` (TTL 300s con jitter, namespace `cache:analytics`).
- Constantes top-file `SESSION_LOOKUP_PROJECTION`, `CONTEXT_LOOKUP_PROJECTION_FIELDS`, `MECHANIC_LOOKUP_PROJECTION_FIELDS`.
- `_getStudentSummaryImpl`: 6 sub-pipelines con `SESSION_LOOKUP_PROJECTION` tras cada `$unwind '$session'`.

**Verificado en Mongo real** via `explain('executionStats')`:
- Stage `FETCH` (no `COLLSCAN`). Ratio `totalKeysExamined / nReturned ≈ 1.0` (IXSCAN puro).
- `executionTimeMillis: 0` en datasets seed.

**Reducción típica**: 80% bytes wire-level, 50× menos docs escaneados en `$match` early.

### A.5 — Cursor stream en `exportStudentData`

`backend/src/services/dataExportService.js`: reemplazado `gamePlayRepository.find(...)` por cursor `GamePlay.find(...).lean().cursor({ batchSize: 50 })` con `for await`. Reduce spike RAM al exportar alumnos con 500+ partidas (Art. 20 RGPD).

### A.6 — Cap defensivo `consentHistory[]`

`backend/src/services/userService.js`: `$push: { consentHistory: { $each: [...], $slice: -100 } }`. Previene runaway crecimiento documento User. RGPD Art. 7.1 sigue cubierto: 100 entradas ≈ 10+ años de uso normal.

### A.7 + A.10 — Pool MongoDB Atlas

`backend/src/config/database.js` `productionConnectOptions`:
- `compressors: ['snappy', 'zstd']` — 30-50% menos bytes wire-level en aggregations grandes.
- `maxIdleTimeMS: 60_000` — libera conexiones idle tras 60s. Importante para escala horizontal.
- Índices T-931 (`{sessionId:1, status:1, completedAt:-1}`) ya existían — auditados via `explain` en A.8.

### A.8 — Auditoría índices

Verificado via mongosh `getIndexes()` que GamePlay tiene los compound necesarios:
- `sessionId_1` — para `$in` queries del A.3.
- `sessionId_1_playerId_1_status_1` — para queries por estudiante en sesión.
- `playerId_1_completedAt_-1` — para `getStudentSummary` lookups.
- `status_1_completedAt_-1` — para reconcile nocturno T-931 B.12.
- `sessionId_1_status_1_completedAt_-1` — patrón compound completo.

**Conclusión**: no se crearon índices nuevos, los existentes son óptimos para los nuevos patrones de query.

### A.9 — `anonymizeOldGamePlays` en batches

`backend/src/services/dataRetentionService.js`: refactor a cursor + batches `BATCH_SIZE=500` con `maxTimeMS=30_000`/batch. Idempotente. Previene timeout >2min sobre datasets grandes (100k+ docs) que dispararían SIGKILL Koyeb.

**Tests añadidos**: nuevas suites del Bloque B en `backend/tests/` (`cacheLayerTelemetry`, `leaderboardZset`, `studentMetricsMaterialized`, `pubsubQueueRetry`, `analyticsReconcile`).

---

## Auditoría de mantenimiento pre-v1.0.0 (2026-06-05) — ver ADR-196

### Migración completa del prefiltro `$match`-antes-de-`$lookup`
`contentEffectivenessService` (efectividad/dificultad/curvas) y `sessionAnalysisService.getCardAnalysis` hacían `$lookup` sobre **toda** `game_plays` y filtraban `session.createdBy` después. Migrados al patrón A.3 ya usado en `analyticsService`: prefiltro `sessionId ∈ getTeacherSessionIds(teacher)` (cacheado 300 s) + `$match` ANTES del `$lookup`. Coste O(plays_del_profesor) en vez de O(total), crítico por el `$unwind '$events'` posterior. `getTeacherSessionIds` se exporta para reutilización (lazy require, sin ciclo).

### Otras optimizaciones de query
- `GET /api/plays` reutiliza `getTeacherSessionIds` (cache 300 s) en vez de re-consultar `game_sessions` en cada petición.
- `getPlayById`: ownership resuelta con el documento ya poblado (`createdBy` en el `select`) → 1 round-trip menos.
- `resumePlay`: populate acotado a `createdBy config` (~10-30× menos bytes que la sesión completa con cardMappings/boardLayout).
- Índice `User { role:1, accountStatus:1 }` para el panel de aprobaciones (confirmado faltante vía MongoDB MCP).

### Recomendaciones de escala diferidas (riesgo/beneficio desfavorable en semana de release)
- **`getStudentSummary` `$facet`**: el `$lookup` de sesiones se repite por rama; reestructurar para hacerlo una vez antes del `$facet` (confianza media; validar `mechanicType` poblado).
- **Virtualización de la tabla `StudentsAnalytics`**: `useVirtualizedList` existe pero virtualizar una `<table>` semántica con cabeceras sortables es invasivo (a11y/layout); alternativa preferible: paginación server-side si N alumnos crece.
- **Subscribers pub/sub (`rfidMode`/`cacheInvalidate`) no se re-suscriben tras reconexión Redis**: nulo en single-instance; en multi-instancia registrar su re-arranque en el `onReconnect` global de `config/redis`.
- **TTL de leaderboard por rango**: los ZSET 24h/7d/30d comparten TTL 8 d; TTLs por rango evitarían servir miembros stale del 24h.

## Segundo pase de auditoría pre-v1.0.0 (2026-06-06) — ver ADR-197

### Índice aplicado
- **`GamePlay { playerId:1, status:1, completedAt:-1 }`** (orden ESR): la mayoría de analytics por alumno filtran `status:'completed'` y ordenan/acotan por `completedAt`; antes resolvían por `{playerId,completedAt}` (no cubre el filtro status) o `{playerId,status,startedAt}` (sort por startedAt → sort en memoria al pedir completedAt). `autoIndex` activo → se construye en todos los entornos. Tras añadirlo, valorar si `{playerId,completedAt}` queda redundante (es prefijo) cuando las queries siempre llevan status.

### Refactor de detectores APLICADO (fan-out) — con benchmark
6 detectores (`sequenceStagnation`, `sequenceOrderErrors`, `mechanicSpecificStruggle`, `consistentTimeout`, `plateauDetected`, `masteryMilestone`): cota temporal `completedAt: {$gte: getStartDate('90d')}` + sustitución del doble `$lookup` (`game_sessions`+`game_mechanics`) por un único `$lookup` con sub-pipeline que solo proyecta `mechanicType` (denormalizado ADR-193) + proyección que deja de arrastrar el doc de sesión completo al `$group`.
**Benchmark `explain()` en `sequenceStagnation` (3200 plays):** `totalDocsExamined` 3200→400 (−87%), `executionTimeMillis` 183→28 (−85%), 2 `$lookup`→1, IXSCAN por `{playerId,status,completedAt}`. Sin cambio de umbral/finding/mensaje. Verificado: detectores 47/47, alertDetection+analytics 337/337, eslint 0. (`highAbandonment`/`suddenScoreDrop` ya tenían cota; intactos.)

### `getStudentSummary` $facet — lookup único pre-`$facet` APLICADO (con benchmark)
El `$facet` repetía el enriquecimiento `$lookup game_sessions`→`$lookup game_contexts`/`game_mechanics` en ~6 ramas sobre el mismo set de partidas. Se movió a UNA sola vez ANTES del `$facet` + proyección que retiene lo que cualquier rama consume; las ramas solo agrupan/ordenan/proyectan. **Salida byte-idéntica verificada** (las 7 ramas). El `$unwind '$session'` (inner-join) no cambia resultados porque una partida completada nunca queda huérfana (`deleteSession` solo borra sesiones en estado `created`; no hay cascada).
**Benchmark (500 partidas / 1 alumno / 12 sesiones):** etapas `$lookup` 26→6, tiempo 96.4ms→30.9ms (~3.1×, −68%). Verificado: analytics+alertDetection+cache 337/337, eslint 0.

### Invalidación de `cache:analytics` por `endPlay` — analizada y MANTENIDA amplia (es la óptima)
**Corrección de una premisa previa errónea:** se había documentado la invalidación con `*<id>*` (doble comodín) como "deuda evitable", recomendando anclar por prefijo. **El benchmark lo refuta:** en Redis `SCAN ... MATCH` es un **filtro posterior, NO un seek por prefijo** — cada SCAN recorre el keyspace completo sea cual sea el patrón. Anclar (≈26 patrones, uno por familia de key) = 26 barridos = **~13× peor** (4275ms) que los 2 patrones amplios (348ms). La única alternativa más rápida sería un índice inverso (SMEMBERS+DEL ≈ 6 comandos, 4.3ms), pero exige tocar 26 call-sites de `cacheGet` con riesgo de reintroducir el stale de datos de menores (ADR-183) y el keyspace real es diminuto (18 keys en `cache:analytics`, ~4 iteraciones de cursor por endPlay). **Veredicto: el patrón amplio por id es el más barato Y el más seguro** (auto-cubre toda familia de key presente/futura; los ObjectId de 24 hex no colisionan como substring). Se mantiene; hay un comentario en `GameEngine.js` para evitar "optimizaciones" regresivas.

### `engagementDrop` N+1 → batch por ventana APLICADO (con benchmark)
El detector iteraba `students` y por cada alumno hacía `Promise.all([getStudentEngagement(sid,'30d'), getStudentEngagement(sid,'90d')])` (ADR-196 paralelizaba las dos ventanas, pero persistía el bucle **entre** alumnos). `getStudentEngagement→computeStudentEngagement` ejecuta un `$facet` con doble `$lookup` (`abandonmentDetails`); la ventana 90d **nunca** está caliente en caché → N agregaciones pesadas garantizadas por corrida (cache frío). Se añade `computeStudentEngagementBatch(studentIds, timeRange)` en `engagementService.js`: **una sola agregación agrupada por `$playerId`** que acumula los crudos mínimos (conteo por status, días activos distintos vía `$addToSet`, `sessionIds` para replays, `completedDates` para el intervalo) y computa los 5 componentes ponderados en JS. El detector llama al batch **2 veces** (30d + 90d) e itera en memoria. **No reutiliza `getClassroomEngagement`** (fórmula simplificada de 3 componentes → daría scores distintos).

**Score byte-idéntico garantizado por construcción:** la fórmula de los 5 componentes (`playFrequency`, `regularity`, `completionRate`, `avgTimeBetweenSessions`, `voluntaryReplays` con `ENGAGEMENT_WEIGHTS`) se extrajo a un núcleo puro `computeEngagementComponents` que usan **tanto** `computeStudentEngagement` (sin cambio de comportamiento) **como** el batch. El borde "alumno sin partidas" rinde el mismo score que el cómputo individual con `$facet` vacío (componente intervalo = 100×0.10 → **10**), por lo que la guarda `previousScore < 20` se comporta igual. El sub-pipeline caro `abandonmentDetails` se omite del batch (el detector solo consume `engagementScore`) — ahí está la mayor parte del ahorro.

**Benchmark (30 alumnos × ~40 partidas, `rfid-games-test`):** ANTES (N+1, cache frío) **60 agregaciones · 189.6 ms** → DESPUÉS (batch ×2) **2 agregaciones · 12.7 ms** = **30× menos agregaciones, ~15× más rápido**. En Atlas M0 el gap real es mayor: la del 90d acarrea el doble `$lookup` de `abandonmentDetails` (~300-800 ms) en cada alumno y nunca cachea. Test de igualdad (`computeStudentEngagementBatch` == `computeStudentEngagement` por alumno/ventana, vía `toBe`) + regresión del detector en `tests/services/analytics/detectors/engagementDrop.test.js`; benchmark opt-in (`RUN_ENGAGEMENT_BENCH=1`) en `engagementDrop.bench.test.js`. Verificado: engagement+analytics+alert+detector 346/346, eslint 0.

---

## Frontend — Core Web Vitals MEDIDOS (Chrome DevTools, 2026-06-06)
Medición empírica (carga en frío, sin throttling, sobre el build de producción servido por nginx):
- **Login** (entrada pública): LCP **571 ms**, CLS **0.03**, TTFB 1 ms, sin render-blocking.
- **Analytics/insights** (la página más pesada — charts Recharts ~420 KB lazy): LCP **606 ms**, CLS **0.00**.
- Lighthouse (página de charts, autenticada): **Accessibility 100, Best Practices 100**.
- Único insight: `ForcedReflow` 67 ms con **ahorro estimado = ninguno**, de Framer Motion (`measureScroll`) y Recharts (`ResponsiveContainer`) — inherente a las librerías, **no accionable**. Sin memory leak (heap estable en 20 navegaciones SPA y bajo carga sostenida de backend).

## Bomba de descompresión — contrato HTTP corregido (2026-06-06)
La prueba de carga disparó una bomba real (PNG 12000×12000, 144 Mpx, 446 KB). `limitInputPixels` neutraliza la memoria perfectamente (+1.9 MiB, sin OOM ni con 5 concurrentes), pero `sharp(...).metadata()` lanzaba un `Error` crudo → `errorHandler` respondía **500 + stack trace** (rutas del servidor en dev) en vez de 4xx. Fix en `imageProcessingService.getAndValidateMetadata`: `try/catch` que reconvierte cualquier fallo de lectura de metadatos (bomba o corrupto) en `ApiValidationError` (→400) con mensaje en español, sin filtrar el mensaje interno de sharp (OWASP A05/A09) + test de regresión. Ver ADR-199.

## Over-fetch de `events[]` y single-flight de caché (2026-06-08, ADR-202)

- **`getPlays` proyecta fuera `events[]`.** El listado de partidas (`gamePlayController.getPlays`) ejecutaba `gamePlayRepository.find(filter, {populate, sort, limit, skip})` **sin `select`**, materializando el documento completo incluido `events[]` (hasta 500 sub-docs `{cardUid, expectedValue, actualValue, timestamp}` por partida). El DTO de listado (`toGamePlayDTOV1`) NO usa `events` — sólo el DTO de detalle (`toGamePlayDetailDTOV1`) los incluye. Fix: `select: '-events'`. A escala (página de 20 partidas «maduras») evita arrastrar ~10.000 sub-documentos Mongo→Node descartados por request en el dashboard del docente y el panel de sesiones. `M1`/`M3` análogos (recovery de boot, `getStudentDifficulties` con `$lookup` sin proyección) quedan documentados pero no urgentes (boot-only / dataset pequeño).
- **`cacheHelper.cacheGet` con single-flight.** El jitter de TTL (`withTtlJitter`) desincroniza la expiración entre claves DISTINTAS, pero no protege una clave caliente individual: cuando un facet de analytics (`$lookup`+`$facet`) expira bajo carga, las N requests del mismo dashboard recomputaban la misma aggregation Mongo simultáneamente (cache stampede). Fix: `Map<flightKey, Promise>` que coalesce los misses concurrentes de la misma clave (la primera calcula, las demás esperan a su promesa; `finally`→`delete`). In-process: single-instance basta; en multi-instancia Koyeb cada réplica recalcula a lo sumo una vez, no N. ~15 líneas, sin dependencias. Es el único punto donde la carga concurrente real podía degradar Atlas free-tier.
- **No-acción verificada:** el «drift de índices» (índices de schema ausentes en BD) reportado en esta pasada es **falso** en el entorno actual — `db.gameplays.getIndexes()` y `explain()` confirman que `{playerId,status,completedAt}` y `{mechanicType}` existen y se usan; `productionConnectOptions` no desactiva `autoIndex`, así que mongoose los autocrea. No se añade `syncIndexes()` (innecesario y arriesgado: `syncIndexes` también DROPea índices fuera del schema).

---

## Pase de mantenimiento de rendimiento (2026-06-12, ADR-208)

React Doctor v2 + 5 agentes estáticos + verificación manual. La capa de datos ya estaba muy endurecida (auditorías previas); estos son los cambios de backend aplicados y los diferidos.

**Aplicado:**
- **`lean` en el hot path de creación de partida (`gamePlayService`).** `validateGameSession` → `findById(sessionId, { lean: true })` (POJO; SIN `select` porque `computeMaxScore` necesita los arrays de layout); `validatePlayer` → `findById(playerId, { lean: true, select: 'role consent' })` (el retorno se descarta; solo se leen `role`/`consent.granted`). Evita hidratar `User`/`GameSession` completos (PII, `studentMetrics`, `cardMappings[]`…) en cada partida. Cumple la regla operativa de `baseRepository.js:24-29`.
- **Barrido `lean` del patrón read-only en `gameSessionService`** (`validateMechanic`, `validateContext`, deck/context de `syncSessionFromDeck`). Colecciones pequeñas, pero `decks`/`contexts` arrastran `cardMappings[]`/`assets[]`; se ejecutan en cada `createSession`/`createSessionFromDeck`/`clone`.
- **Proyección post-`$lookup` en los 5 pipelines de `adminAnalyticsService`** (hot path AdminDashboard, tenancy-wide): `getActiveTeachersCount`, `getActivityAggregate.byMechanic`, `getTopTeachers`, `getTopMechanics`, `getTopContexts`. Cada uno hacía `$lookup game_sessions` + `$unwind` sin `$project` intermedio → arrastraba `cardMappings[]`/`boardLayout[]`/`sequencePlan[]` hasta el `$group`. Se inserta `{ $project: { … } }` tras cada `$unwind`, reteniendo solo los campos del `$group` (createdBy / mechanicId / contextId / playerId) **+ `score` + `maxScore`** (gotcha ADR-201: `SCORE_PERCENT_EXPR` = score/maxScore; dropear `maxScore` deja los `$avg` a 0). Verificado en vivo: el dashboard sigue dando los mismos números (avgScore no-cero).
- **`getClassroomFatigue` (`sessionAnalysisService`): `$filter` de events dentro de Mongo.** Antes traía `events[]` íntegro (≤500 sub-docs) de TODAS las partidas de la clase y filtraba a `['correct','error','timeout']` con `timeElapsed>0` en JS. Ahora el `$project` lo filtra en Mongo (mismo predicado; `$filter` preserva el orden requerido por el cálculo de mitades). Lista de alumnos → `lean`.
- **`getTopContextsAndMechanics` (`analyticsService`): `Promise.all`** para las dos lecturas Redis materializadas (eran `await` secuenciales independientes).

**Aplicado en el addendum (ver ADR-208 addendum):**
- **Dedupe `byMechanic`/`getTopMechanics`** en `getCenterOverview` (M2): eran casi el mismo pipeline (doble `$lookup` sobre `gameplays` ± `$limit: TOP_N`), escaneaban la colección dos veces por overview. `topMechanics` se deriva ahora de `activity.playsByMechanic.slice(0, TOP_N)` (mismo shape/sort/redondeo). `getTopMechanics` se conserva como utilidad standalone exportada.

**Diferido (documentado, no piloto parcial):**
- **`studentTrajectoryService.getStudentEvolution`**: doble `$lookup` sin `$project` intermedio. Scope per-student (set pequeño) → impacto bajo.

**Índices:** cobertura muy buena, alineada con las query shapes calientes. **No se recomienda crear ninguno** — los fixes son de proyección/`lean`, no de soporte de índice (la creación de índices es decisión humana).

Detalle completo en ADR-208; informes de los agentes en `development/perf-audit-2026-06-12/`.
