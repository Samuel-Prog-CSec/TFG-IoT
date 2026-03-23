--[[
  reserveCards.lua — Reserva atómica all-or-nothing de UIDs de tarjetas RFID.

  Semántica:
    - Verifica que NINGUNA de las keys proporcionadas exista.
    - Si alguna ya existe, retorna conflictos SIN escribir nada (all-or-nothing).
    - Si todas están libres, escribe SET + EXPIRE para cada una en una sola ejecución.

  Esto elimina la race window que existía en la implementación secuencial:
  dos instancias no pueden adquirir parcialmente tarjetas solapadas porque
  EVAL ejecuta de forma atómica (single-threaded) en el servidor Redis.

  INPUT:
    KEYS  = card keys a reservar (e.g. "card:32B8FA05", "card:A1B2C3D4")
    ARGV[1] = playId (valor a asignar a cada key)
    ARGV[2] = TTL en segundos (0 = sin TTL)

  OUTPUT:
    JSON string: { "ok": true/false, "conflicts": [...uids conflictivos] }

  @author Samuel Blanchart Pérez
  @version 1.0.0
]]

local playId = ARGV[1]
local ttl = tonumber(ARGV[2]) or 0
local conflicts = {}

-- Fase 1: Verificar que todas las keys estén libres
for i = 1, #KEYS do
  local existing = redis.call('GET', KEYS[i])
  if existing then
    conflicts[#conflicts + 1] = KEYS[i]
  end
end

-- Si hay conflictos, no escribir nada (all-or-nothing)
if #conflicts > 0 then
  return cjson.encode({ ok = false, conflicts = conflicts })
end

-- Fase 2: Todas libres → reservar atómicamente
for i = 1, #KEYS do
  if ttl > 0 then
    redis.call('SET', KEYS[i], playId, 'EX', ttl)
  else
    redis.call('SET', KEYS[i], playId)
  end
end

return cjson.encode({ ok = true, conflicts = {} })
