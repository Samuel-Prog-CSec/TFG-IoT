--[[
  renewLease.lua — Renovación atómica de lease (play key + card keys).

  Semántica:
    - Renueva el TTL de la play key (KEYS[1]) si existe.
    - Para cada card key restante (KEYS[2..N]), verifica que el valor coincida
      con el playId esperado antes de renovar su TTL.
    - Cards cuyo valor no coincide se saltan sin error.

  Consolida N×3 round-trips (GET + compare + EXPIRE por card) en 1 sola
  ejecución atómica. Con 20 tarjetas, pasa de ~61 round-trips a 1.

  INPUT:
    KEYS    = [playKey, cardKey1, cardKey2, ...]
    ARGV[1] = playId esperado para verificación de ownership en card keys
    ARGV[2] = TTL en segundos

  OUTPUT:
    JSON string: {
      "playRenewed": true/false,
      "cardsRenewed": number,
      "cardsSkipped": number
    }

  @author Samuel Blanchart Pérez
  @version 1.0.0
]]

local expectedPlayId = ARGV[1]
local ttl = tonumber(ARGV[2]) or 90

local playRenewed = false
local cardsRenewed = 0
local cardsSkipped = 0

-- Renovar la play key (KEYS[1])
if #KEYS >= 1 then
  local exists = redis.call('EXISTS', KEYS[1])
  if exists == 1 then
    redis.call('EXPIRE', KEYS[1], ttl)
    playRenewed = true
  end
end

-- Renovar card keys (KEYS[2..N]) — solo si el valor coincide con el playId
for i = 2, #KEYS do
  local currentValue = redis.call('GET', KEYS[i])
  if currentValue == expectedPlayId then
    redis.call('EXPIRE', KEYS[i], ttl)
    cardsRenewed = cardsRenewed + 1
  else
    cardsSkipped = cardsSkipped + 1
  end
end

return cjson.encode({
  playRenewed = playRenewed,
  cardsRenewed = cardsRenewed,
  cardsSkipped = cardsSkipped
})
