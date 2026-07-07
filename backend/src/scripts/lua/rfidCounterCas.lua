-- ===========================================================================
-- rfidCounterCas.lua - Anti-replay del counter RFID (compare-and-set atómico)
--
-- Compara-y-establece el counter monotónico por sensor en UNA sola ejecución
-- de Redis, cerrando la ventana TOCTOU del patrón get-then-setex previo: dos
-- scans del mismo sensorId que llegaban casi a la vez podían leer ambos el mismo
-- `previous`, pasar ambos la comprobación y reabrir la ventana de replay.
--
-- KEYS:
--   1. counterKey - rfid:counter:<sensorId>
--
-- ARGV:
--   1. counter    - counter entrante del firmware (entero)
--   2. ttlSeconds - TTL del key en segundos
--
-- Devuelve:
--   1 -> counter estrictamente mayor que el almacenado: aceptado y persistido.
--   0 -> counter <= almacenado (o counter inválido): replay, no se escribe nada.
-- ===========================================================================

local counterKey = KEYS[1]
local counter = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])

if counter == nil then
  return 0
end

local prevRaw = redis.call('GET', counterKey)
if prevRaw then
  local prev = tonumber(prevRaw)
  if prev ~= nil and counter <= prev then
    return 0
  end
end

redis.call('SET', counterKey, counter, 'EX', ttl)
return 1
