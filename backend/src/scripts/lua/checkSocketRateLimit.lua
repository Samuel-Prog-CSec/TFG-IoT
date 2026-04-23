-- ===========================================================================
-- checkSocketRateLimit.lua - Rate limiting WebSocket distribuido (ADR-072)
--
-- Sliding-window rate limiter atómico. Cubre tres operaciones en una sola
-- ejecución de Redis:
--   1. Verifica si la rateKey está bloqueada (blockKey existe).
--   2. Purga timestamps fuera de la ventana del ZSET y cuenta los restantes.
--   3. Si excede el límite: incrementa violations; si supera el threshold,
--      activa bloqueo temporal con TTL.
--   4. Si no excede: añade el timestamp actual al ZSET.
--
-- Devuelve un JSON serializado para evitar tener que mapear arrays multi-tipo.
--
-- KEYS:
--   1. zsetKey         - rl:ws:<event>:<rateKey>
--   2. blockKey        - rl:ws:block:<rateKey>
--   3. violationsKey   - rl:ws:violations:<rateKey>
--
-- ARGV:
--   1. now             - timestamp actual en ms
--   2. windowMs        - tamaño de la ventana en ms
--   3. max             - máximo de eventos permitidos en la ventana
--   4. blockDurationMs - duración del bloqueo si se rebasa el threshold
--   5. violationThreshold - violaciones consecutivas antes de bloquear
--
-- Devuelve un string JSON con:
--   { ok = 1|0, blocked = 1|0, retryAfterMs = number, violations = number }
-- ===========================================================================

local zsetKey = KEYS[1]
local blockKey = KEYS[2]
local violationsKey = KEYS[3]

local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxEvents = tonumber(ARGV[3])
local blockDurationMs = tonumber(ARGV[4])
local violationThreshold = tonumber(ARGV[5])

-- 1. Si está bloqueada, devolver tiempo restante sin tocar el ZSET.
local blockTtl = redis.call('PTTL', blockKey)
if blockTtl and blockTtl > 0 then
  local violations = tonumber(redis.call('GET', violationsKey)) or 0
  return cjson.encode({
    ok = 0,
    blocked = 1,
    retryAfterMs = blockTtl,
    violations = violations
  })
end

-- 2. Purgar entradas fuera de la ventana y contar las restantes.
local windowStart = now - windowMs
redis.call('ZREMRANGEBYSCORE', zsetKey, '-inf', '(' .. windowStart)
local count = redis.call('ZCARD', zsetKey)

if count >= maxEvents then
  -- 3a. Excedido. Incrementar contador de violaciones.
  local violations = tonumber(redis.call('INCR', violationsKey)) or 1
  -- TTL del contador alineado con la ventana: si el cliente se calma,
  -- el contador caduca y volvemos a 0.
  redis.call('PEXPIRE', violationsKey, math.max(windowMs * 2, 5000))

  if violations >= violationThreshold then
    -- 3b. Activar bloqueo temporal.
    redis.call('SET', blockKey, '1', 'PX', blockDurationMs)
    return cjson.encode({
      ok = 0,
      blocked = 1,
      retryAfterMs = blockDurationMs,
      violations = violations
    })
  end

  -- 3c. Soft-reject (sin bloqueo aún): devolver retry tras la ventana.
  -- ZRANGE para obtener el timestamp más antiguo y calcular el retry óptimo.
  local oldest = redis.call('ZRANGE', zsetKey, 0, 0, 'WITHSCORES')
  local retryAfterMs = windowMs
  if oldest and oldest[2] then
    local oldestScore = tonumber(oldest[2])
    if oldestScore then
      retryAfterMs = math.max(0, windowMs - (now - oldestScore))
    end
  end

  return cjson.encode({
    ok = 0,
    blocked = 0,
    retryAfterMs = retryAfterMs,
    violations = violations
  })
end

-- 4. Permitido: añadir timestamp y resetear violaciones consecutivas.
redis.call('ZADD', zsetKey, now, now)
-- TTL del ZSET = ventana × 2 para auto-purga sin riesgo de cortar entradas válidas.
redis.call('PEXPIRE', zsetKey, windowMs * 2)
redis.call('DEL', violationsKey)

return cjson.encode({
  ok = 1,
  blocked = 0,
  retryAfterMs = 0,
  violations = 0
})
