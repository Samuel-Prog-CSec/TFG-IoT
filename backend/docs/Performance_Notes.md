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
