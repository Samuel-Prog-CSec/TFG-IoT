--[[
  releaseCards.lua — Liberación condicional atómica de UIDs de tarjetas RFID.

  Semántica:
    - Para cada key, verifica que su valor coincida con el playId esperado.
    - Solo elimina las keys cuyo valor coincide (owner-aware).
    - Las keys con valor distinto o inexistentes se saltan sin error.

  Elimina la race window de GET + compare + DEL secuenciales:
  entre la lectura y el borrado, otra instancia podría haber reclamado la key.
  Con Lua, la verificación y borrado son una sola operación atómica.

  INPUT:
    KEYS  = card keys a liberar (e.g. "card:32B8FA05", "card:A1B2C3D4")
    ARGV[1] = playId esperado (solo se borran keys cuyo valor coincida)

  OUTPUT:
    Número de keys efectivamente eliminadas (integer)

  @author Samuel Blanchart Pérez
  @version 1.0.0
]]

local expectedPlayId = ARGV[1]
local released = 0

for i = 1, #KEYS do
  local currentValue = redis.call('GET', KEYS[i])
  if currentValue == expectedPlayId then
    redis.call('DEL', KEYS[i])
    released = released + 1
  end
end

return released
