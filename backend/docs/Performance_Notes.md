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
