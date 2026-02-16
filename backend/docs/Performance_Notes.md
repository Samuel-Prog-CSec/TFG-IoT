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
