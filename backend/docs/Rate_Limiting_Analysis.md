# Analisis de Rate Limiting - Investigacion completa

## Contexto

El proyecto tiene una implementacion de rate limiting dual:
- **HTTP**: `express-rate-limit` v8.3 + `rate-limit-redis` v4.3 (7 limiters, Redis store).
- **WebSocket**: Clase custom `SocketRateLimiter` con **path Redis distribuido**
  (Lua atómico + ZSET) + fallback in-memory transparente (ADR-075, 2026-04-23).

Despliegue previsto: MongoDB Atlas, backend en Heroku/fly.io, frontend en Vercel/fly.io.

> **Estado 2026-04-23:** los dos gaps históricos (HTTP distribuido en ADR-068 y
> WebSocket distribuido en ADR-075) están resueltos. El proyecto puede ejecutarse
> en N instancias con rate limit consistente.

---

## 1. Estado actual - Evaluacion detallada

### HTTP Rate Limiters (security.js)

| Limiter | Ventana | Max (prod) | Max (dev) | Key | Redis prefix |
|---------|---------|-----------|-----------|-----|-------------|
| Global | 15min | 100 | 2000 | IP | `rl:global:` |
| Auth | 15min | 5 (skip exito) | 400 | IP | `rl:auth:` |
| Register | 1h | 3 | 50 | IP | `rl:register:` |
| CreateResource | 1min | 10 | 200 | userId/IP | `rl:create:` |
| Event | 1min | 120 | 120 | userId/IP | `rl:event:` |
| Analytics | 1min | 30 | 200 | userId/IP | `rl:analytics:` |
| Upload | 1h | 20 | 20 | userId/IP | `rl:upload:` |

Todos configurables via env vars. Redis store via `rate-limit-redis` con fallback a memoria.
Tests deshabilitados (`isTestEnv()` → middleware passthrough).

### WebSocket Rate Limiter (socketRateLimiter.js)

| Evento | Ventana | Max | Algoritmo |
|--------|---------|-----|-----------|
| `start_play` | 1s | 1 | Sliding window |
| `rfid_scan_from_client` | 3s | 2 | Sliding window + dedupe |
| `pause_play` / `resume_play` | 1s | 2 | Sliding window |
| `join_play` / `leave_play` | 1s | 3 | Sliding window |
| `next_round` | 1s | 5 | Sliding window |
| `play_state_sync` | 1s | 2 | Sliding window |
| Default (otros) | 1s | 10 | Sliding window |

Extras:
- Payload validation: 16KB global, 8KB para RFID
- RFID dedupe: 1200ms cooldown por sensor+uid
- Bloqueo progresivo: 3 violaciones consecutivas → 60s block
- Cleanup: cada ~2.5min, TTL 5min para entradas stale
- Max conexiones por usuario: 5

### Lo que funciona bien

1. **7 limiters HTTP granulares** - Mejor que un solo limiter global
2. **Redis store HTTP** - Preparado para multi-instancia
3. **Key compuesta userId/IP** - Resuelve NAT en escuelas
4. **`skipSuccessfulRequests` en auth** - Solo penaliza intentos fallidos
5. **WS sliding window** - Mas preciso que fixed window para ventanas cortas
6. **WS bloqueo progresivo** - Escala la penalizacion por abuso
7. **RFID dedupe** - Especifico del dominio, previene scans duplicados

### Debilidades identificadas

1. **WebSocket solo en memoria** - No distribuido entre instancias cloud
2. **Fixed window en HTTP** - Boundary burst teorico (doble de requests en frontera de ventana)
3. **Sin capa de infraestructura** - Todo el rate limiting en Node.js

---

## 2. Opciones analizadas

### Opcion C: Nginx rate limiting → DESCARTADA

Solo aplica en fly.io (en Heroku el router esta por delante). No tiene contexto de usuario/sesion.

### Opcion D: @upstash/ratelimit → DESCARTADA

Solo funciona con `@upstash/redis` (HTTP client), no con `ioredis` (TCP) que ya usa el proyecto.
Obligaria a mantener dos clientes Redis distintos.

---

## 3. Opcion A: Mantener express-rate-limit + Redis en SocketRateLimiter

### Que cambia

Solo `socketRateLimiter.js` + tests. Los 7 HTTP limiters no se tocan.

### Cambios tecnicos

El `SocketRateLimiter` actual usa `this.rateState = new Map()` con arrays de timestamps:

```js
// Sliding window actual (lineas 258-261 de socketRateLimiter.js)
const eventTimestamps = state.events.get(eventName) || [];
const windowStart = now - limit.windowMs;
const filtered = eventTimestamps.filter(ts => ts > windowStart);
```

Para Redis manteniendo sliding window, se usarian **Redis Sorted Sets**:
- `ZADD key timestamp timestamp` - anadir evento
- `ZREMRANGEBYSCORE key -inf windowStart` - limpiar expirados
- `ZCARD key` - contar eventos en ventana
- Envuelto en un **Lua script** para atomicidad

| Componente | Antes (memoria) | Despues (Redis) |
|------------|-----------------|-----------------|
| Sliding window | `Map<string, number[]>` | Redis Sorted Set (ZADD/ZCARD) |
| Bloqueo temporal | `state.blockedUntil` | Redis key con TTL (SET EX) |
| RFID dedupe | `Map<string, {uid, ts}>` | Redis key con TTL (SET NX EX) |
| Cleanup timer | `setInterval` cada 2.5min | **Ya no necesario** (Redis TTL) |
| Payload validation | In-memory (sin estado) | **No cambia** |

### Pros

- **Resuelve el gap principal** (WS distribuido)
- **Mantiene sliding window** (mas preciso para ventanas de 1-3s)
- **Mantiene bloqueo progresivo** (consecutiveViolations)
- **Cambio localizado** (~2 archivos)
- **Riesgo bajo** (no toca HTTP)
- **Sin dependencias nuevas** (ya usa ioredis)

### Contras

- **Lua script custom** que mantener y testear
- **Failover Redis→memoria** hay que implementarlo manualmente
- **Dos sistemas separados** (express-rate-limit HTTP + custom WS)
- HTTP sigue con fixed window (sin cambio)

---

## 4. Opcion B: Migrar a rate-limiter-flexible

### Sobre la libreria

| Metrica | Valor |
|---------|-------|
| Version | v10.0.1 |
| Descargas/semana | ~2M (vs 41.6M de express-rate-limit) |
| GitHub stars | ~3,510 |
| Dependencias | 0 |
| Stores soportados | 12+ (Redis, MongoDB, Memory, Postgres, MySQL, DynamoDB, etc.) |
| Algoritmo | Fixed window (NO sliding window nativo) |
| Socket.IO | Si, nativo |
| Redis atomicidad | Lua scripts (EVAL/EVALSHA) |
| TypeScript | Built-in |

### Que cambia

~10 archivos: `security.js`, `socketRateLimiter.js`, 7 route files + tests.

### Ejemplo: Global limiter HTTP

```js
// ANTES (express-rate-limit) - plug-and-play
const globalRateLimiter = createRateLimiter({
  prefix: 'global', windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: '...' },
  standardHeaders: true, legacyHeaders: false
});
// Uso: app.use('/api/', globalRateLimiter)

// DESPUES (rate-limiter-flexible) - manual
const globalLimiter = new RateLimiterRedis({
  storeClient: redisClient, keyPrefix: 'rl:global',
  points: 100, duration: 900,
  insuranceLimiter: new RateLimiterMemory({ points: 100, duration: 900 })
});

const globalRateLimiter = async (req, res, next) => {
  try {
    const result = await globalLimiter.consume(req.ip);
    res.set('RateLimit-Limit', 100);
    res.set('RateLimit-Remaining', result.remainingPoints);
    res.set('RateLimit-Reset', Math.ceil(result.msBeforeNext / 1000));
    next();
  } catch (rejRes) {
    if (rejRes instanceof Error) return next(rejRes);
    res.set('Retry-After', Math.ceil(rejRes.msBeforeNext / 1000));
    res.status(429).json({ success: false, message: '...' });
  }
};
```

### Ejemplo: Auth limiter con skipSuccessfulRequests

```js
// ANTES: skipSuccessfulRequests: true (nativo)
// DESPUES: hay que llamar reward() manualmente tras login exitoso
const authLimiter = new RateLimiterRedis({
  storeClient: redisClient, keyPrefix: 'rl:auth',
  points: 5, duration: 900, blockDuration: 900
});

// En el controller de login, DESPUES de exito:
// await authLimiter.reward(req.ip, 1);
```

### Ejemplo: WebSocket con rate-limiter-flexible

```js
class SocketRateLimiter {
  constructor(options = {}) {
    this.limiters = {};
    for (const [event, config] of Object.entries(socketRateLimits)) {
      this.limiters[event] = new RateLimiterRedis({
        storeClient: options.redisClient,
        keyPrefix: `rl:ws:${event}`,
        points: config.max,
        duration: config.windowMs / 1000,
        blockDuration: socketBlockConfig.blockDurationMs / 1000
      });
    }
    // RFID dedupe y payload validation siguen custom
  }

  async checkRateLimit(rateKey, eventName) {
    const limiter = this.limiters[eventName] || this.defaultLimiter;
    try {
      await limiter.consume(rateKey);
      return { allowed: true, retryAfterMs: 0, blocked: false };
    } catch (rejRes) {
      if (rejRes instanceof Error) throw rejRes;
      return {
        allowed: false,
        retryAfterMs: rejRes.msBeforeNext,
        blocked: rejRes.consumedPoints >= limiter._points + 1
      };
    }
  }
}
```

### BurstyRateLimiter: analisis profundo

Encadena **dos fixed window limiters** en cascada:

```
consume(key)
  ├── Primary (e.g., 3 req/1s) → OK? pasa
  └── Agotado → Burst (e.g., 5 req/10s) → OK? pasa con overflow
                                          └── Agotado → rechaza
```

**NO resuelve el boundary burst, solo lo mitiga:**
- Ambos limiters internos son fixed window
- Cada uno tiene sus propios boundaries
- El autor reconoce que token bucket es mas preciso para spikes
- Para ventanas de 1-3 segundos (como las WS del proyecto), la diferencia es mas notable

**Limitaciones de BurstyRateLimiter:**
- No expone `block()`, `penalty()`, ni `reward()`
- Doble round-trip a Redis cuando primary se agota
- Estado del burst opaco (no se puede saber cuantos puntos burst quedan)
- `blockDuration` es todo-o-nada (menos flexible que consecutiveViolations actual)

### Pros de Opcion B

- **Unifica HTTP + WS** bajo una sola libreria
- **Redis atomico via Lua scripts** (sin Lua custom)
- **`insuranceLimiter`** nativo (failover a memoria automatico)
- **`blockDuration`** nativo (simplifica bloqueo)
- **12+ stores** (futuro-proof si cambian de Redis)
- **0 dependencias** de la libreria

### Contras de Opcion B

- **Pierde sliding window** en WS (fixed window en ambos lados)
- **Pierde bloqueo progresivo** (consecutiveViolations → blockDuration todo-o-nada)
- **Pierde `skipSuccessfulRequests` nativo** (manual con reward)
- **Pierde headers automaticos** (hay que generarlos manualmente)
- **~10 archivos a modificar** vs ~2 en Opcion A
- **Riesgo medio-alto** de regresion (toca HTTP + WS + routes)
- **Mas setup manual** que express-rate-limit (no es plug-and-play)

---

## 5. Comparativa final

| Criterio | Opcion A (mejorar WS) | Opcion B (rate-limiter-flexible) |
|----------|:---------------------:|:-------------------------------:|
| Archivos a modificar | ~2 | ~10 |
| Dependencias nuevas | 0 | 1 (+ eliminar 2) |
| Conserva sliding window WS | **Si** | No |
| Conserva bloqueo progresivo | **Si** | Parcial |
| Conserva skipSuccessfulRequests | **Si** | Manual (reward) |
| Conserva headers automaticos | **Si** | No |
| Redis distribuido WS | Si (Lua custom) | Si (Lua libreria) |
| Redis distribuido HTTP | **Ya lo tiene** | Si |
| Failover Redis→Memory | Manual | **Nativo** |
| Unificacion HTTP+WS | No | **Si** |
| Riesgo regresion | **Bajo** | Medio-alto |

### Opcion hibrida (no explorada aun)

Usar `rate-limiter-flexible` SOLO para WebSocket (ganando Redis + failover nativo) y mantener `express-rate-limit` para HTTP. Combina ventajas de ambas pero introduce dos librerias de rate limiting distintas.

---

## 6. Redis en cloud (free tier)

| Servicio | Storage | Limite | Conexiones TCP | Veredicto |
|----------|---------|--------|---------------|-----------|
| **Upstash** | 256 MB | 500K cmds/mes | 20 | **Mejor opcion free** |
| Redis Cloud | 30 MB | 100 ops/sec | 30 | Solo dev/testing |
| fly.io + Upstash | 256 MB | 500K cmds/mes | 20 | Mismo Upstash, co-localizado |

500K commands/mes ÷ ~3 cmds por rate limit check = ~165K checks/mes.
Suficiente para una plataforma educativa con trafico moderado.

**Nota**: El proyecto usa `ioredis` (TCP). Upstash soporta TCP pero limita a 20 conexiones en free tier. Para la app completa (rate limiting + token blacklist + RFID state + pub/sub) habria que verificar que 20 conexiones son suficientes.

---

## 7. Decision pendiente

Leer este documento con calma y decidir entre:
- **Opcion A**: Minimo esfuerzo, resuelve el gap principal, conserva sliding window
- **Opcion B**: Mas trabajo, arquitectura unificada, pierde sliding window
- **Hibrido**: rate-limiter-flexible solo para WS + express-rate-limit para HTTP

Fecha del analisis: 2026-04-03

---

## 8. Hardening del fallback in-memory (Mantenimiento 2026-04-20)

### Decisión aplicada

Tras la auditoría de la sesión de mantenimiento, se decidió:

1. **Aplazar la migración WS distribuido (Opcion A) al Sprint 6** por alcance. Se documenta como PROP-59 en `documentation/propuestas-mejora.md` con estructura Redis Sorted Set + Lua detallada.
2. **Endurecer la observabilidad del fallback in-memory de HTTP en esta iteración** (ADR-067).

### Cambios implementados

`config/security.js → createRedisStore`:

- Cuando retorna `undefined` en `NODE_ENV==='production'`, emite `logger.error({ alert: true, fallback: 'memory', prefix, reason })` para que llegue a Sentry con tag de alerta. En desarrollo, sigue siendo `warn`.
- Nuevo helper interno `reportFallback(reason, extra)` centraliza el reporte y el `recordRateLimitStoreFallback()` de `runtimeMetrics`.
- Comentario de deuda técnica: la re-creación lazy del store tras reconexión de Redis queda pendiente de decisión arquitectónica en Sprint 6. Por ahora, si Redis cae al boot, los limiters quedan anclados a memoria hasta reinicio del proceso.

`utils/runtimeMetrics.js`:

- Nuevo contador `redis.rateLimitStoreFallbackCount` expuesto en `/api/metrics` junto con `redis.authUserCacheHits/Misses` (del ADR-065).
- Función `recordRateLimitStoreFallback()` invocada por `createRedisStore` en cada fallback detectado.

### Impacto observacional

Un operador puede ahora:

- Ver en Sentry cada fallback con contexto (prefix, reason, timestamp).
- Consultar `/api/metrics` para el contador agregado desde boot.
- Detectar la fragmentación del límite en multi-instancia por el crecimiento del contador (si todas las réplicas reportan fallback, el problema es Redis; si solo una, es una anomalía local).

### Deuda técnica restante (Sprint 6)

La re-creación lazy del store cuando Redis vuelve requiere reset del estado interno del limiter de forma segura. Se acota a una decisión de arquitectura propia. Hasta entonces, el operador debe reiniciar el proceso tras una recuperación de Redis para restaurar el límite distribuido.

Ver también **ADR-067** en `documentation/Architecture_Decisions.md`.

---

## 9. Promoción lazy a Redis store — deuda técnica resuelta (Mantenimiento 2026-04-20 tarde)

### Contexto

La auditoría QA posterior al despliegue de ADR-067 confirmó empíricamente lo que el propio ADR anticipaba: los 8 rate limiters entraban en fallback a `MemoryStore` siempre al boot (`rateLimitStoreFallbackCount == 8`, keys `rl:*` ausentes en Redis incluso tras cientos de requests). La razón: `require('./config/security')` se ejecuta al top de `server.js`, antes de `await connectRedis()` dentro de `startServer()` (~270 ms antes). `createRedisStore()` recibía `getRedis() == null` y los limiters se anclaban a memoria para el resto de la vida del proceso.

El rate-limiting distribuido del ADR-016 (T-521) era, en la práctica, **letra muerta** en cualquier despliegue multi-instancia real.

### Decisión aplicada

Refactor a factory deferida con middleware shim en `config/security.js`:

1. `createRateLimiter(options)` ahora registra la config en `limiterConfigs` y devuelve un middleware **shim**. El shim delega al limiter real cuando éste exista en `rateLimitersRegistry`; antes de la inicialización hace `next()` (fail-open durante la ventana de boot < 2 s, siempre previa a `server.listen()`).
2. Nueva función `initRateLimiters()` (idempotente) instancia los 8 limiters reales con `rate-limit-redis` ya operativo. Invocada desde `server.js` justo tras `await connectRedis()` en el happy path, o tras el warning dev si Redis no está disponible.
3. `passOnStoreError: true`: si Redis cae mid-request, `express-rate-limit` deja pasar el request (fail-open) en vez de devolver 500. Evita tirar el servicio entero durante blips.
4. Helper compartido `utils/ipHelper.js::userOrIpKeyGenerator` reemplaza los 5 `keyGenerator` inline duplicados en security.js. Usa `ipKeyGenerator` de `express-rate-limit` para normalizar IPv6 al `/64` (elimina `ValidationError: Custom keyGenerator appears to use request IP...`).

El contrato público de los exports (`globalRateLimiter`, `authRateLimiter`, etc.) se preserva: las 11 rutas que los consumen no necesitan cambios.

### Verificación post-despliegue

- **Boot limpio**: logs muestran `Rate limiters HTTP inicializados { count: 8 }` inmediatamente después de `Redis conectado`. Sin `Rate limiter fallback a MemoryStore`.
- **Keys en Redis**: tras el primer request, `KEYS rfid-games:rl:*` devuelve entradas por prefix (`rl:global:172.18.0.1`, `rl:auth:172.18.0.1`, `rl:analytics:user:<id>`…).
- **Métricas**: `/api/metrics` ahora incluye `redis.rateLimitStoreFallbackCount == 0` en operación normal (antes 8 al boot). También `authUserCacheHits/Misses` visibles desde ese endpoint (resolviendo la promesa rota del commit a52e62e — ver ADR-068).
- **Resilience**: `docker stop rfid-games-redis` + requests concurrentes → backend sigue respondiendo (HTTP 200 en `/health`, `RestartCount` del contenedor queda en 0). Antes del fix, el handler de `unhandledRejection` disparaba `gracefulShutdown` y mataba el proceso; ahora solo loguea + Sentry.

### Referencias

- **ADR-068** en `documentation/Architecture_Decisions.md` — decisión y trade-offs completos
- `backend/src/config/security.js` — registry, `initRateLimiters`, `createLimiterShim`
- `backend/src/utils/ipHelper.js` — helper compartido IPv6-safe
- `backend/src/server.js` — invocación post-`connectRedis`
- `backend/tests/rateLimitRedisStore.test.js` — tests del shim e idempotencia

### Deuda técnica pendiente

PROP-59 (migración WebSocket a Redis Sorted Set distribuido) sigue en Sprint 6. El rate-limit HTTP queda cerrado como distribuido real.

---

## Dedupe RFID diferenciado por `source` (PROP-90 / ADR-090)

A partir del cierre de Sprint 5 el dedupe de eventos `rfid_scan_from_client` deja de aplicar un único cooldown global y pasa a discriminar según el campo `source` del payload.

### Tabla de cooldowns

| `source` del payload | Cooldown | Razón |
|---|---|---|
| `web_serial_hardware`, `web_serial` | **1200 ms** | Anti-chattering del lector RC522. Una misma tarjeta apoyada sobre el sensor puede generar dos lecturas casi consecutivas. |
| `touch_fallback` | **250 ms** | Taps en el panel táctil que sustituye al sensor cuando no está disponible (mecánica Asociación). |
| `touch_memory_flip` | **250 ms** | Taps sobre cartas en la mecánica Memoria — el alumno alterna entre cartas distintas y necesita poder encadenar. |
| Cualquier otro / ausente | `defaultCooldownMs = 1200 ms` | Fallback conservador para fuentes no declaradas. |

### Clave de dedupe

`{rateKey}:{sensorId || 'unknown'}:{source || 'default'}`

Incluir `source` en la clave evita que dos fuentes distintas se "ahoguen" mutuamente (un tap táctil no extiende el cooldown del sensor real ni viceversa).

### Configuración

`backend/src/config/socketRateLimits.js`:

```js
const rfidDedupeConfig = {
  defaultCooldownMs: 1200,
  cooldownMsBySource: {
    web_serial_hardware: 1200,
    web_serial: 1200,
    touch_fallback: 250,
    touch_memory_flip: 250
  }
};
```

### Cliente

El frontend (`useGameSocket.js`) aplica el mismo mapa **y envía explícitamente** `source: 'touch_fallback'` desde `emitFallbackScan` y `source: 'touch_memory_flip'` desde `emitMemoryCardTap`. La política backend se mantiene como capa defensiva final.

### Tests

`backend/tests/socketRateLimiter.test.js` cubre los 5 escenarios principales (cooldown corto que permite, cooldown corto que bloquea, hardware mantiene su cooldown largo, fuente ausente cae en default, sources distintos no se ahogan entre sí).
