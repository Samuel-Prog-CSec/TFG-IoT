# Analisis de Rate Limiting - Investigacion completa

## Contexto

El proyecto tiene una implementacion de rate limiting dual:
- **HTTP**: `express-rate-limit` v8.3 + `rate-limit-redis` v4.3 (7 limiters, Redis store)
- **WebSocket**: Clase custom `SocketRateLimiter` (sliding window en memoria, no Redis)

Despliegue previsto: MongoDB Atlas, backend en Heroku/fly.io, frontend en Vercel/fly.io.
Gap principal: WebSocket rate limiting no usa Redis (no distribuido).

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
