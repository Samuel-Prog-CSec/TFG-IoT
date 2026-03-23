# Análisis de Optimización Redis — T-066

> **Autor:** Samuel Blanchart Pérez
> **Fecha:** Enero 2026
> **Sprint:** 4 — Tarea T-066 "Recuperación Redis y locks distribuidos de tarjetas"
> **Estado:** Implementado

---

## Índice
1. [Resumen ejecutivo](#resumen-ejecutivo)
2. [Problemas identificados](#problemas-identificados)
3. [Soluciones implementadas](#soluciones-implementadas)
4. [Análisis de decisiones](#análisis-de-decisiones)
5. [Impacto en rendimiento](#impacto-en-rendimiento)
6. [Impacto en consistencia y seguridad](#impacto-en-consistencia-y-seguridad)
7. [Compatibilidad y fallbacks](#compatibilidad-y-fallbacks)
8. [Archivos modificados](#archivos-modificados)
9. [Verificación y testing](#verificación-y-testing)
10. [Limitaciones conocidas](#limitaciones-conocidas)
11. [Trabajo futuro](#trabajo-futuro)

---

## Resumen ejecutivo

Esta tarea aborda las deficiencias en atomicidad, rendimiento y observabilidad de las
operaciones Redis del motor de juego (`gameEngine.js`). Los cambios principales son:

1. **3 Lua scripts** para operaciones atómicas de card locks (reserva, liberación, heartbeat)
2. **2 funciones pipeline** para lecturas batch (existsMany, hgetallMany)
3. **6 nuevas métricas** de monitoreo en el motor de juego
4. **Corrección documental** de información incorrecta sobre TTL de play/card
5. **Script de benchmark** comparativo para cuantificar la mejora

El resultado neto es: operaciones que antes requerían hasta 61 round-trips a Redis por tick
de heartbeat ahora se ejecutan en 1 solo round-trip atómico, eliminando race conditions
que podían causar keys huérfanas o reservas duplicadas en escenarios multi-instancia.

---

## Problemas identificados

### P1 — Reserva de tarjetas NO atómica (CRÍTICO)

**Ubicación:** `redisService.setManyIfNotExists()` → usado por `gameEngine.reserveDistributedCardMappings()`

**Descripción:**
La reserva de tarjetas iteraba secuencialmente por cada entry, ejecutando `SET NX` individual.
Si una tarjeta ya estaba reservada, se hacía rollback de las ya adquiridas con `DEL`.

**Race condition demostrada:**
```
Instancia A                    Redis                    Instancia B
    │                           │                           │
    │── SET NX card:001 ───────▶│                           │
    │◀── OK ───────────────────│                           │
    │                           │                           │
    │── SET NX card:002 ───────▶│                           │
    │◀── OK ───────────────────│                           │
    │                           │◀── SET NX card:002 ──────│
    │                           │──── FAIL (NX) ──────────▶│
    │── SET NX card:003 ────────▶│                          │
    │                           │◀── SET NX card:003 ──────│
    │                           │──── OK ─────────────────▶│  ← ¡Inconsistencia!
    │◀── OK ────────────────────│                          │
```

En el escenario anterior, card:003 queda asignada a ambas instancias durante la ventana
de carrera. Aunque el rollback de la Instancia B eliminaría card:003, hay un breve
periodo donde el estado es inconsistente.

**Impacto:** Medio-alto. En un sistema con una sola instancia el riesgo es bajo pero real
(p.ej. dos plays iniciándose simultáneamente con tarjetas compartidas). En multi-instancia
es un defecto de diseño bloqueante.

**Severidad:** CRÍTICO para escalabilidad horizontal.

---

### P2 — Liberación de tarjetas con 3 round-trips por key (MEDIO)

**Ubicación:** `redisService.delManyIfValueMatches()` → usado por `gameEngine.releaseDistributedCardMappings()`

**Descripción:**
Para cada tarjeta: `GET` → comparar en Node.js → `DEL`. Tres round-trips por key.
Con 20 tarjetas = 60 round-trips.

**Race condition:**
```
Instancia A                    Redis                    Instancia B
    │                           │                           │
    │── GET card:001 ──────────▶│                           │
    │◀── "play-A" ─────────────│                           │
    │   (valor coincide) ↓      │                           │
    │                           │◀── SET card:001 "play-B" │  ← Reasignación
    │── DEL card:001 ──────────▶│                           │
    │    ¡Borró la key de B!    │                           │
```

Entre el GET y el DEL, otra instancia puede haber reasignado la tarjeta.

**Impacto:** Keys huérfanas o eliminación de reservas ajenas.

---

### P3 — Heartbeat de lease costoso: O(N×3) round-trips (MEDIO)

**Ubicación:** `gameEngine.refreshPlayLease()` → usa `expire()` + `expireManyIfValueMatches()`

**Descripción:**
Cada tick de heartbeat (cada 30 segundos) ejecuta:
- 1 `EXPIRE` para la play key
- Para cada card: `GET` + comparar + `EXPIRE` = 3 round-trips

Con 10 plays activas × 20 tarjetas cada una = ~610 round-trips cada 30 segundos.

**Impacto:** Latencia acumulada, carga innecesaria en Redis, mayor ventana para
inconsistencias temporales.

---

### P4 — N+1 en recuperación de partidas huérfanas (BAJO)

**Ubicación:** `gameEngine.recoverOrphanedPlaysFromDB()`

**Descripción:**
Para cada partida `in-progress`/`paused` en MongoDB, ejecutaba `HGETALL` individual
contra Redis. Si hay 50 partidas huérfanas = 50 round-trips secuenciales.

**Impacto:** Latencia en el arranque del servidor proporcional al número de partidas
huérfanas. No afecta a runtime, pero ralentiza cold starts.

---

### P5 — Documentación incorrecta sobre TTL (DOCUMENTACIÓN)

**Ubicación:** `backend/docs/Arquitectura_Redis.md`, sección "Namespaces Disponibles"

**Descripción:**
La tabla indicaba `Sin TTL*` para los namespaces `play` y `card`, con nota "Se limpian
manualmente al finalizar/abandonar la partida".

**Realidad en el código:**
- `DISTRIBUTED_LOCK_TTL_SECONDS = 90` — todas las keys de play y card se crean con TTL de 90s
- `LOCK_HEARTBEAT_INTERVAL_MS = 30000` — un heartbeat cada 30s renueva los TTLs
- Si el servidor se cae, las keys expiran automáticamente en ≤90s

La sección "Decisiones de Diseño §4" también era incorrecta al afirmar que las partidas
no tenían TTL.

**Impacto:** Documentación engañosa que podría llevar a decisiones de diseño incorrectas.

---

## Soluciones implementadas

### S1 — Lua script `reserveCards.lua` (resuelve P1)

**Semántica: all-or-nothing atómico.**

El script ejecuta dos fases en una sola invocación EVAL:
1. **Fase de verificación:** Lee todas las keys con GET. Si alguna existe, recopila conflictos.
2. **Fase de escritura:** Si no hay conflictos, escribe todas con SET + EXPIRE.

Al ejecutarse como un único comando Lua en Redis (single-threaded), no hay posibilidad
de intercalación entre la verificación y la escritura.

```lua
-- Entrada: KEYS = card keys, ARGV[1] = playId, ARGV[2] = TTL
-- Salida: JSON { "ok": true/false, "conflicts": [...] }

-- Fase 1: Verificar
for i = 1, #KEYS do
  if redis.call('GET', KEYS[i]) then
    conflicts[#conflicts + 1] = KEYS[i]
  end
end
if #conflicts > 0 then return cjson.encode({ok=false, conflicts=conflicts}) end

-- Fase 2: Escribir (solo si todas libres)
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], playId, 'EX', ttl)
end
return cjson.encode({ok=true, conflicts={}})
```

### S2 — Lua script `releaseCards.lua` (resuelve P2)

**Semántica: owner-aware conditional delete.**

Para cada key, verifica valor y elimina en la misma ejecución atómica:

```lua
for i = 1, #KEYS do
  if redis.call('GET', KEYS[i]) == expectedPlayId then
    redis.call('DEL', KEYS[i])
    released = released + 1
  end
end
return released
```

### S3 — Lua script `renewLease.lua` (resuelve P3)

**Semántica: batch renewal con owner verification.**

Renueva la play key (KEYS[1]) incondicional + cada card key (KEYS[2..N]) solo
si el valor coincide con el playId esperado. 1 round-trip total.

### S4 — Pipeline `hgetallMany()` (resuelve P4)

Ejecuta N `HGETALL` en un pipeline ioredis (1 flush de red) y retorna un Map:

```javascript
const result = await redisService.hgetallMany(NAMESPACES.PLAY, playIds);
// → Map<string, Object|null>
```

### S5 — Corrección documental (resuelve P5)

- Tabla de namespaces actualizada con TTL real (90s + heartbeat)
- Decisión de diseño §4 reescrita explicando el mecanismo de TTL + heartbeat
- Nueva sección §5 documentando Lua scripts
- Nueva sección completa sobre operaciones atómicas y pipelines

---

## Análisis de decisiones

### ¿Por qué Lua scripts y no pipelines para las mutaciones?

**Descartado: ioredis pipelines**
- Las pipelines envían N comandos en 1 flush de red (reducen round-trips)
- Pero **no son atómicas**: otro cliente puede intercalar comandos entre los del pipeline
- Para reserva all-or-nothing, necesitamos que la verificación y escritura sean indivisibles

**Descartado: MULTI/EXEC (transacciones Redis)**
- MULTI/EXEC no permite leer valores y condicionar la escritura basándose en ellos
- WATCH+MULTI requiere retry loops complejos (optimistic locking)
- Peor rendimiento que Lua en escenarios con contención

**Elegido: Lua scripts (EVAL/EVALSHA)**
- Ejecución atómica en el servidor Redis (single-threaded, no interruptible)
- Permite lógica condicional (IF/ELSE) basada en lecturas previas
- `EVALSHA` minimiza overhead de red (envía SHA de 40 bytes vs script completo)
- ioredis tiene soporte nativo excelente para EVAL/EVALSHA

### ¿Por qué pipelines para las lecturas batch?

Las lecturas (EXISTS, HGETALL) no necesitan atomicidad: no hay escrituras condicionales.
Un pipeline es suficiente y más sencillo que un Lua script para operaciones read-only.

### ¿Por qué fallback secuencial?

En entornos de test, usamos `ioredis-mock` que no soporta `EVAL`/`EVALSHA`.
Los wrappers en `redisService.js` capturan el error y caen al patrón secuencial
original, garantizando que los tests funcionen sin cambios en la infraestructura de test.

En producción, si Redis pierde el SHA cacheado (ej. tras `SCRIPT FLUSH` o restart de Redis),
el wrapper intenta `EVALSHA` → recibe `NOSCRIPT` → reintenta con `EVAL` (source completo).

### ¿Por qué cargar scripts al conectar?

`SCRIPT LOAD` pre-carga los scripts en la caché de Redis y devuelve el SHA1.
Usar `EVALSHA` con ese SHA en vez de `EVAL` con el source completo ahorra:
- ~500-2000 bytes por invocación (tamaño del script)
- Tiempo de parsing del script en el servidor (ya compilado en caché)

Si Redis se reinicia, los SHAs se invalidan. El fallback a `EVAL` evita que esto
cause un error permanente — la siguiente invocación simplemente envía el source completo.

---

## Impacto en rendimiento

### Reducción de round-trips

| Operación | Antes | Después | Mejora |
|-----------|-------|---------|--------|
| Reserva (20 cards) | 20 SET NX + rollback | 1 EVALSHA | **20×** |
| Liberación (20 cards) | 60 (3×20) | 1 EVALSHA | **60×** |
| Heartbeat (1 play, 20 cards) | 61 (1 + 3×20) | 1 EVALSHA | **61×** |
| Heartbeat (10 plays, 20 cards) | 610 | 10 EVALSHA | **61×** |
| Recovery (50 plays) | 50 HGETALL | 1 pipeline | **50×** |

### Reducción de latencia teórica

Asumiendo ~1ms de latencia por round-trip a Redis local:

| Operación | Antes | Después |
|-----------|-------|---------|
| Reserva (20 cards) | ~20ms | ~1ms |
| Heartbeat (10 plays × 20 cards, cada 30s) | ~610ms | ~10ms |
| Recovery (50 plays huérfanas) | ~50ms | ~1ms |

### Script de benchmark

Para medición real, ejecutar:
```bash
cd backend
node scripts/benchmark-redis-ops.js --cards=20 --iterations=100
```

Produce p50/p95/p99/avg para cada operación, con speedup calculado.

---

## Impacto en consistencia y seguridad

### Eliminación de race conditions

| Scenario | Antes | Después |
|----------|-------|---------|
| Dos plays reservando cards solapadas simultáneamente | Posible asignación parcial duplicada | All-or-nothing: exactamente una gana |
| Liberación durante reasignación | Posible borrado de key ajena | Owner-verificado atómicamente |
| Heartbeat durante cleanup | Posible renovación de key ya liberada | Owner-verificado antes de EXPIRE |

### Sin impacto en seguridad existente

Los cambios son internos al flujo de game engine. No afectan:
- Autenticación JWT / refresh token
- CSRF / CORS / Rate limiting
- Middlewares de seguridad
- Endpoints HTTP / Socket.IO

---

## Compatibilidad y fallbacks

### ioredis-mock (entorno de tests)

`ioredis-mock` no soporta `EVAL`/`EVALSHA`. Los wrappers detectan el error y caen
automáticamente al patrón secuencial:

```javascript
try {
  return await evalLuaScript('reserveCards', keys.length, ...keys, playId, ttl);
} catch (error) {
  // Fallback secuencial (funcional en ioredis-mock)
  return await setManyIfNotExists(namespace, entries, ttlSeconds);
}
```

La carga de scripts (`loadLuaScripts`) se omite en `NODE_ENV=test`.

### Redis restart

Si Redis se reinicia en producción:
1. Los SHAs cacheados se invalidan
2. La primera invocación de `EVALSHA` falla con `NOSCRIPT`
3. El wrapper reintenta con `EVAL` (source completo desde disco)
4. El `EVAL` también re-cachea el script en Redis

No se requiere reinicio del servidor Node.js.

---

## Archivos modificados

### Nuevos
| Archivo | Propósito |
|---------|-----------|
| `backend/src/scripts/lua/reserveCards.lua` | Reserva atómica all-or-nothing |
| `backend/src/scripts/lua/releaseCards.lua` | Liberación condicional atómica |
| `backend/src/scripts/lua/renewLease.lua` | Renovación atómica de lease |
| `backend/tests/redisCardLocks.test.js` | Tests de operaciones atómicas |
| `backend/scripts/benchmark-redis-ops.js` | Benchmark comparativo |
| `backend/docs/Redis_Optimization_Analysis.md` | Este documento |

### Modificados
| Archivo | Cambios |
|---------|---------|
| `backend/src/config/redis.js` | Carga de Lua scripts al conectar, exports de SHA/source |
| `backend/src/services/redisService.js` | Wrappers Lua + pipeline functions |
| `backend/src/services/gameEngine.js` | Usa operaciones atómicas + nuevas métricas |
| `backend/tests/redisStateRecovery.test.js` | Tests de recovery con pipeline |
| `backend/docs/Arquitectura_Redis.md` | TTL corregido, secciones nuevas |

---

## Verificación y testing

### Tests unitarios/integración
- `redisCardLocks.test.js`: Verifica API semántica de reserve/release/renew/existsMany/hgetallMany
- `redisStateRecovery.test.js`: Verifica recovery con hgetallMany pipeline

### Verificación manual recomendada
1. Iniciar Redis local + servidor
2. Iniciar una partida con 2+ tarjetas
3. Verificar en Redis CLI: `KEYS rfid-games:card:*` — deben tener TTL (~90s)
4. Esperar 30s — verificar que TTL se renovó
5. Matar proceso Node.js (SIGKILL, no SIGTERM)
6. Esperar 90s — verificar que keys expiraron automáticamente
7. Reiniciar servidor — partidas marcadas como "abandoned"

### Benchmark
```bash
node scripts/benchmark-redis-ops.js --cards=20 --iterations=100
```

---

## Limitaciones conocidas

1. **ioredis-mock no soporta Lua**: Los tests ejercitan el fallback secuencial,
   no la ejecución atómica real. Para test E2E con Lua real, usar Redis en Docker.

2. **Sin cluster-safe**: Los Lua scripts asumen que todas las keys están en el mismo
   nodo Redis (single-node). En Redis Cluster, las keys deben estar en el mismo
   hash slot. Esto se cumple actualmente porque usamos un solo nodo y keyPrefix.

3. **Sin retry automático para NOSCRIPT**: El fallback a EVAL funciona, pero no
   re-carga el SHA en la caché de `luaScriptSHAs` del backend. La siguiente invocación
   volverá a intentar EVALSHA → NOSCRIPT → EVAL. Esto se auto-resuelve al reconectar.

---

## Trabajo futuro

- **T-067:** Considerar `ioredis` defineCommand para registrar scripts como comandos
  custom, eliminando la necesidad del wrapper manual EVALSHA/EVAL.
- **Cluster-safe:** Si se migra a Redis Cluster, usar hash tags `{session:123}` para
  colocar play + cards en el mismo slot.
- **Observabilidad:** Exponer métricas Lua via endpoint HTTP para dashboards de monitoreo.
- **Test E2E con Redis real:** GitHub Actions con service container de Redis para
  verificar atomicidad de Lua scripts en CI.
