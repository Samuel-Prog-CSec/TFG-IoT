# Índice
1. [Introducción](#introducción)
2. [¿Por Qué Redis?](#por-qué-redis)
3. [Arquitectura del Sistema](#arquitectura-del-sistema)
4. [Casos de Uso en el Proyecto](#casos-de-uso-en-el-proyecto)
	- [Token Blacklist](#1-token-blacklist)
	- [Refresh Tokens y Rotación](#2-refresh-tokens-y-rotación)
	- [Detección de Robo de Tokens](#3-detección-de-robo-de-tokens)
	- [Security Flags](#4-security-flags)
	- [Estado de Partidas Activas](#5-estado-de-partidas-activas)
5. [Estructura de Keys y Namespaces](#estructura-de-keys-y-namespaces)
6. [Servicio de Abstracción (redisService)](#servicio-de-abstracción-redisservice)
7. [Operaciones Atómicas y Pipelines (T-066)](#operaciones-atómicas-y-pipelines-t-066)
8. [Desarrollo Local con Docker](#desarrollo-local-con-docker)
9. [Producción con Upstash](#producción-con-upstash)
10. [Monitoreo y Debug](#monitoreo-y-debug)
11. [Decisiones de Diseño](#decisiones-de-diseño)
12. [Socket.IO Redis Adapter](#socketio-redis-adapter)

---

# Introducción

> **Nota de coste free-tier (ADR-224, 01-07-2026).** Bajo el invariante `scale=1`
> (ADR-223) sobre Upstash free-tier (10k comandos/día), se recortaron consumidores
> de comandos sin cambiar el comportamiento funcional: (1) el **pub/sub** entre
> instancias (`rfid-mode-changes` en `persistRfidModeToRedis` y `cache:invalidate`
> en `invalidateUserCache`) y sus subscribers ahora **se auto-gatean** tras
> `SOCKET_ADAPTER_ENABLED` (`config/scaling.js` → `isMultiInstanceEnabled()`), igual
> que el adapter Socket.IO — en single-instance el propio proceso descartaba sus
> mensajes (`from===self`) = coste puro; el `notificationEmitSubscriber` (puente
> worker→HTTP) NO se gatea. (2) La **L1 en memoria** `mechanicCache`/`contextCache`
> (`utils/inMemoryCache.js`), antes código muerto, se cableó en `cacheGet` como capa
> previa a Redis (TTL 60s + limpieza en toda invalidación). (3) El `ZREMRANGEBYRANK`
> no-op de los leaderboards pasa a muestreo ~2% por partida.

Redis es una base de datos **en memoria** (in-memory) de tipo **clave-valor** que utilizamos como complemento a MongoDB. Mientras MongoDB almacena datos persistentes y estructurados (usuarios, sesiones de juego, historial), Redis almacena datos **efímeros** y de **alta velocidad** que requieren:
- **Baja latencia** (<1ms típicamente)
- **Expiración automática** (TTL nativo)
- **Operaciones atómicas** (sin race conditions)
- **Alta frecuencia de lectura/escritura**

## ¿Qué Almacenamos en Redis?

| Tipo de Dato            | ¿Por qué Redis y no MongoDB?                                         |
| ----------------------- | -------------------------------------------------------------------- |
| Tokens revocados        | Necesitan expiración automática y consulta O(1) en cada request      |
| Refresh tokens activos  | Alta rotación, necesitan TTL y acceso rápido                         |
| Estado de partidas      | Datos temporales que se consultan 10+ veces/segundo durante el juego |
| Mapeo tarjeta → partida | Búsqueda O(1) crítica cuando se escanea una tarjeta RFID             |
| Security flags          | Invalidación temporal de sesiones, con auto-limpieza                 |

---

# ¿Por Qué Redis?
## Problema: Sistema Anterior (In-Memory con Node.js)
Antes de integrar Redis, usábamos estructuras JavaScript en memoria:
```javascript
// ❌ ANTES: Maps en memoria del proceso Node.js

const tokenBlacklist = new Map();  // Se pierde al reiniciar
const activePlays = new Map();     // Se pierde al reiniciar
const cardToPlay = new Map();      // Se pierde al reiniciar
```

**Problemas de este enfoque:**
1. **Pérdida de datos al reiniciar**: Un deploy, crash o reinicio del servidor borraba toda la información
2. **Sin escalabilidad horizontal**: Si tuviéramos múltiples instancias del backend, cada una tendría su propia copia
3. **Limpieza manual de TTL**: Necesitábamos timers periódicos para limpiar tokens expirados
4. **Race conditions**: Operaciones no atómicas podían causar inconsistencias

## Solución: Redis

| Característica      | In-Memory (Node.js)      | Redis                         |
| ------------------- | ------------------------ | ----------------------------- |
| **Persistencia**    | ❌ Se pierde al reiniciar | ✅ Persiste con AOF/RDB        |
| **Escalabilidad**   | ❌ Un solo proceso        | ✅ Compartido entre instancias |
| **TTL automático**  | ❌ Timer manual cada 60s  | ✅ Nativo, al milisegundo      |
| **Atomicidad**      | ❌ Race conditions        | ✅ Operaciones atómicas        |
| **Latencia**        | ✅ <0.1ms                 | ✅ ~1-2ms (excelente)          |
| **Memoria proceso** | ❌ Consume RAM de Node    | ✅ Proceso separado            |

## Decisión de Diseño: Redis como Caché, No como Fuente de Verdad
Redis **NO** reemplaza a MongoDB. La fuente de verdad siempre es MongoDB:
```
┌──────────────────────────────────────────────────────────────────┐
│                     Flujo de Datos                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Usuario hace login → MongoDB valida credenciales             │
│  2. Se genera token → Redis almacena refresh token               │
│  3. Usuario juega partida → Redis almacena estado temporal       │
│  4. Partida termina → MongoDB guarda resultado final             │
│                                                                  │
│  MongoDB = Datos permanentes (historial, usuarios, puntuaciones) │
│  Redis   = Datos efímeros (sesiones, tokens, estado en vivo)     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

# Arquitectura del Sistema
```
                    ┌─────────────────────────────────────────────┐
                    │               CLIENTE (React)               │
                    │  • Almacena Access Token en memoria         │
                    │  • Almacena Refresh Token en localStorage   │
                    └─────────────────────────────────────────────┘
                                         │
                                         ▼
                    ┌─────────────────────────────────────────────┐
                    │            BACKEND (Node.js + Express)      │
                    │                                             │
                    │  ┌───────────────────────────────────────┐  │
                    │  │           Middleware auth.js          │  │
                    │  │  • Verifica JWT signature             │  │
                    │  │  • Consulta blacklist en Redis        │  │
                    │  │  • Verifica security flags            │  │
                    │  └───────────────────────────────────────┘  │
                    │                                             │
                    │  ┌───────────────────────────────────────┐  │
                    │  │           gameEngine.js               │  │
                    │  │  • Sincroniza estado con Redis        │  │
                    │  │  • Mapea tarjetas RFID → partidas     │  │
                    │  │  • Recupera partidas tras reinicio    │  │
                    │  └───────────────────────────────────────┘  │
                    │                                             │
                    │  ┌───────────────────────────────────────┐  │
                    │  │         redisService.js               │  │
                    │  │  • Abstracción sobre ioredis          │  │
                    │  │  • Namespaces y prefijos              │  │
                    │  │  • Fallback graceful si Redis caído   │  │
                    │  └───────────────────────────────────────┘  │
                    └─────────────────────────────────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
            ┌─────────────────────────┐     ┌─────────────────────────┐
            │        MongoDB          │     │          Redis          │
            │                         │     │                         │
            │  • Users                │     │  • Token blacklist      │
            │  • GameSessions         │     │  • Refresh tokens       │
            │  • GamePlays            │     │  • Active plays         │
            │  • Cards                │     │  • Card → Play map      │
            │  • GameMechanics        │     │  • Security flags       │
            │  • GameContexts         │     │                         │
            └─────────────────────────┘     └─────────────────────────┘
              Datos permanentes               Datos efímeros
              (fuente de verdad)             (caché + sesiones)
```

---

# Casos de Uso en el Proyecto
## 1. Token Blacklist
**¿Qué problema resuelve?**
Los JWT son **stateless**: una vez emitidos, son válidos hasta su expiración. Si un usuario hace logout, ¿cómo invalidamos su token?

**Solución: Blacklist con TTL**
```javascript
// Cuando el usuario hace logout:
await revokeToken(jti, expiresAt);

// Internamente:
await redis.setex(`blacklist:${jti}`, ttlSeconds, '1');
//                 ↑ key              ↑ TTL        ↑ valor mínimo
```

**¿Por qué esta estructura?**
1. **TTL = tiempo restante del token**: No almacenamos tokens expirados (inútil)
2. **Valor mínimo ('1')**: Solo nos importa si la key existe, no su contenido
3. **Búsqueda O(1)**: `EXISTS blacklist:{jti}` es instantáneo

**Verificación en cada request:**
```javascript
// middleware/auth.js - verifyAccessToken()

const revoked = await isTokenRevoked(decoded.jti);

if (revoked) {
  throw new UnauthorizedError('Token revocado');
}
```

## 2. Refresh Tokens y Rotación
**¿Qué problema resuelve?**
Los refresh tokens son de larga duración (7 días). Si no los gestionamos, un atacante con un refresh token robado tiene acceso prolongado.

**Solución: Rotación obligatoria**
Cada vez que se usa un refresh token:
1. Se emite un **nuevo** refresh token
2. El antiguo se **invalida** inmediatamente
3. Ambos pertenecen a la misma **familia**

**Estructura en Redis:**
```javascript
// Almacenar refresh token activo

await redis.hset(`refresh:${jti}`, {
  userId: 'user-123',
  familyId: 'family-abc',  // Identifica el "linaje" del login original
  createdAt: Date.now()
});

await redis.expire(`refresh:${jti}`, 604800); // 7 días
```

**¿Por qué usamos familyId?**
El `familyId` es un UUID generado en el **login inicial**. Todos los refresh tokens que derivan de ese login comparten el mismo familyId:
```
Login inicial → familyId: "abc123" generado
    │
    ├── Refresh token 1 (familyId: abc123) → usado, rotado
    │       │
    │       └── Refresh token 2 (familyId: abc123) → usado, rotado
    │               │
    │               └── Refresh token 3 (familyId: abc123) → activo
    │
    └── Si alguien intenta usar token 1 de nuevo → ROBO DETECTADO
        Se invalidan TODOS los tokens de familia "abc123"
```

## 3. Detección de Robo de Tokens
**¿Qué problema resuelve?**
Si un atacante roba un refresh token y lo usa antes que la víctima, obtiene tokens nuevos. ¿Cómo lo detectamos?

**Solución: Marcar tokens usados**
```javascript
// Al rotar un refresh token:
await markRefreshTokenAsUsed(oldJti, familyId);

// Internamente:
await redis.setex(`used:${jti}`, ttl, JSON.stringify({ familyId, usedAt: Date.now() }));
```

**Detección:**
```javascript
// Cuando alguien intenta usar un refresh token:
const usedCheck = await isRefreshTokenUsed(jti);

if (usedCheck.used) {
  // ¡ALERTA! Este token ya fue rotado
  const withinGracePeriod = (Date.now() - usedCheck.usedAt) < 10000; // 10 segundos

  if (!withinGracePeriod) {
    // Robo confirmado - revocar TODA la familia
    await revokeAllUserTokens(userId, 'token_theft');
  }
}
```

**¿Por qué un grace period de 10 segundos?**
Evita falsos positivos por **race conditions** legítimas:
```
Tab A                      Tab B                      Servidor
  │                          │                           │
  │── Refresh request ───────│──────────────────────────▶│
  │                          │                           │ Token rotado
  │                          │── Refresh (mismo token) ──▶│
  │                          │                           │
  │                          │   Si <10s: Race condition │
  │                          │   Si >10s: Token theft!   │
```

## 4. Security Flags
**¿Qué problema resuelve?**
En casos de emergencia (robo detectado, cambio de contraseña), necesitamos invalidar **TODOS** los tokens de un usuario, no solo uno.

**Solución: Flag temporal con timestamp**
```javascript
// Revocar todos los tokens de un usuario:
await revokeAllUserTokens(userId, 'password_change');

// Internamente:
await redis.setex(`security:${userId}`, 3600, Date.now().toString());
//                                       ↑ 1 hora de duración
```

**Verificación:**
```javascript
const checkSecurityFlag = async (userId, tokenIssuedAt) => {
  const flagTimestamp = await redis.get(`security:${userId}`);

  if (flagTimestamp) {
    const flagTime = parseInt(flagTimestamp);
    const tokenTimeMs = tokenIssuedAt * 1000; // iat está en segundos

    // Si el token fue emitido ANTES del flag → inválido
    if (tokenTimeMs < flagTime) {
      return { revoked: true, reason: 'SESSION_REVOKED_SECURITY' };
    }
  }
  
  return { revoked: false };

};
```

**¿Por qué TTL de 1 hora?**
- Los access tokens duran máximo 1 hora
- Después de 1 hora, cualquier token antiguo ya habrá expirado naturalmente
- No necesitamos mantener el flag eternamente

## 5. Estado de Partidas Activas
**¿Qué problema resuelve?**
Durante una partida, el estado cambia constantemente (ronda actual, puntuación, challenge activo). Si el servidor se reinicia, ¿qué pasa con las partidas en curso?

**Solución: Sincronización bidireccional con Redis**
```javascript
// Cada vez que el estado de una partida cambia:
await syncPlayToRedis(playId, playState);
```

**¿Qué se almacena en Redis?**
```javascript
// gameEngine.js - syncPlayToRedis()
const redisState = {
  playDocId: '507f1f77bcf86cd799439011',    // Referencia a MongoDB
  sessionDocId: '507f1f77bcf86cd799439012', // Referencia a la sesión
  currentRound: 3,                           // Ronda actual
  score: 25,                                 // Puntuación acumulada
  status: 'in-progress',                     // Estado actual
  paused: false,                             // ¿Está pausada?
  pausedAt: null,                            // Timestamp de pausa
  remainingTimeMs: 12500,                    // Tiempo restante si pausada
  awaitingResponse: true,                    // ¿Esperando escaneo RFID?
  currentChallenge: { ... },                 // Challenge activo (si hay)
  createdAt: '2024-01-15T10:30:00Z'          // Cuando se inició
};

await redis.hset(`play:${playId}`, redisState);
```

**¿Qué NO se almacena?**
- **Timers/Timeouts**: No son serializables, se recrean al recuperar
- **Funciones/Callbacks**: No son serializables
- **Datos completos de sesión**: Solo el ID, el documento completo está en MongoDB

**¿Por qué un Hash y no un String con JSON?**
```javascript
// ❌ String con JSON - hay que deserializar todo
await redis.set('play:123', JSON.stringify(state));
const state = JSON.parse(await redis.get('play:123'));

// ✅ Hash - acceso granular a campos
await redis.hset('play:123', state);
const score = await redis.hget('play:123', 'score'); // Solo un campo
await redis.hincrby('play:123', 'score', 10);        // Incremento atómico
```

## Mapeo Tarjeta → Partida (Índice Invertido)
**¿Qué problema resuelve?**
Cuando llega un evento RFID con un UID de tarjeta, necesitamos saber **instantáneamente** a qué partida pertenece.

**Solución: Índice invertido en Redis**
```javascript

// Al iniciar una partida, por cada tarjeta asignada:

for (const mapping of session.cardMappings) {

  await redis.set(`card:${mapping.uid}`, playId);

  //              ↑ "card:32B8FA05"      ↑ "play-123"

}

```

**Uso en tiempo real:**
```javascript
// Cuando llega un escaneo RFID:
handleCardScan(uid) {

  // Búsqueda O(1) - crítico para baja latencia
  const playId = await redis.get(`card:${uid}`);
  if (!playId) {
    // Tarjeta no asignada a ninguna partida activa
    return;
  }

  // Procesar respuesta para esa partida
  await processAnswer(playId, uid);
}
```

  

**¿Por qué en Redis y no en memoria (Map)?**

| Aspecto       | Map en memoria           | Redis        |
| ------------- | ------------------------ | ------------ |
| Persistencia  | ❌ Se pierde al reiniciar | ✅ Persiste   |
| Escalabilidad | ❌ Solo esta instancia    | ✅ Compartido |
| Velocidad     | ✅ O(1)                   | ✅ O(1)       |
| Consistencia  | ⚠️ Race conditions       | ✅ Atómico    |

## Recuperación tras Reinicio del Servidor
**¿Qué problema resuelve?**
Si el servidor se cae durante partidas activas, los jugadores quedan en un estado inconsistente.

**Solución: Recuperación automática al arrancar**
```javascript
// gameEngine.js - recoverActivePlays() - llamado al iniciar el servidor
async recoverActivePlays() {
  // 1. Buscar todas las partidas en Redis
  const playKeys = await redis.scan('play:*');

  if (playKeys.length === 0) {
    logger.info('No hay partidas activas en Redis para recuperar');
    return 0;
  }

  logger.info(`Recuperando ${playKeys.length} partidas de Redis...`);

  for (const key of playKeys) {
    const playId = key.replace('play:', '');
    const redisState = await redis.hgetall(key);

    // 2. Verificar que existe en MongoDB
    const playDoc = await GamePlay.findById(redisState.playDocId);

    if (!playDoc) {
      // Partida huérfana en Redis, limpiar
      logger.warn(`Partida ${playId} en Redis pero no en MongoDB, limpiando...`);
      await redis.del(key);
      continue;
    }

    // 3. Marcar como abandonada (no podemos continuar sin el timer)
    if (playDoc.status === 'in-progress' || playDoc.status === 'paused') {
      playDoc.status = 'abandoned';
      playDoc.completedAt = new Date();
      playDoc.events.push({
        timestamp: new Date(),
        eventType: 'server_restart',
        roundNumber: playDoc.currentRound,
        pointsAwarded: 0
      });

      await playDoc.save();

      logger.info(`Partida ${playId} marcada como abandonada (reinicio del servidor)`);

      // 4. Notificar a clientes conectados (si los hay)
      if (this.io) {
        this.io.to(`play_${playId}`).emit('play_interrupted', {
          playId,
          reason: 'server_restart',
          message: 'La partida fue interrumpida por un reinicio del servidor.',
          finalScore: playDoc.score
        });
      }
    }
    
    // 5. Limpiar Redis
    await redis.del(key);

    for (const mapping of session.cardMappings) {
      await redis.del(`card:${mapping.uid}`);
    }
  }
  return recoveredCount;
}
```

**¿Por qué marcar como "abandonada" en lugar de continuar?**
1. **Timers perdidos**: Los timeouts de ronda no son serializables
2. **Estado de cliente desconocido**: No sabemos si el cliente sigue conectado
3. **Mejor UX**: Mensaje claro de "servidor reiniciado" es mejor que comportamiento errático
4. **Puntuación preservada**: El score hasta ese momento se guarda en MongoDB

---

# Estructura de Keys y Namespaces
## Formato de Keys
```
{prefix}:{namespace}:{id}
```

**Ejemplo real:**
```
rfid-games:blacklist:abc123def456
↑           ↑         ↑
prefijo     tipo      identificador
```

## Namespaces Disponibles

| Namespace     | Propósito                    | Tipo Redis         | TTL                                    | Ejemplo de Key           |
| ------------- | ---------------------------- | ------------------ | -------------------------------------- | ------------------------ |
| `blacklist`   | Access tokens revocados      | String             | Tiempo restante del token              | `blacklist:jti-abc123`   |
| `refresh`     | Refresh tokens activos       | Hash               | 7 días                                 | `refresh:jti-xyz789`     |
| `used`        | Refresh tokens ya rotados    | String (JSON)      | 7 días                                 | `used:jti-abc123`        |
| `security`    | Flags de invalidación masiva | String (timestamp) | 1 hora                                 | `security:user-id-123`   |
| `play`        | Estado de partidas activas   | Hash               | 90s (renovado por heartbeat cada 30s)  | `play:play-id-456`       |
| `card`        | Mapeo UID tarjeta → playId   | String             | 90s (renovado por heartbeat cada 30s)  | `card:32B8FA05`          |
| `tokenfamily` | Familias de tokens           | Set                | 7 días                                 | `tokenfamily:family-abc` |
| `cache:mechanic` | Mecánica de juego cacheada | String (JSON)      | 1 hora                                 | `cache:mechanic:byId:{mechanicId_or_name}` |
| `cache:context`  | Contexto temático cacheado | String (JSON)      | 30 minutos                             | `cache:context:byId:{contextId_or_mongoId}` |
| `cache:analytics` | KPIs y agregaciones de analytics (11 handlers) | String (JSON) | 2-10 minutos según granularidad    | `cache:analytics:summary:{teacherId}`, `cache:analytics:trends:{teacherId}:{timeRange}`, `cache:analytics:student:summary:{studentId}:{timeRange}`... |
| `auth:user`      | Slim-user cacheado para middleware de autenticación | String (JSON POJO) | 60 segundos | `auth:user:{userId}` |
| `play:init`      | Lock distribuido de idempotencia de `startPlay`     | String       | 60 segundos                  | `play:init:{playId}` |
| `cache:context` (list) | Listados cacheados de `getContexts` por query params (ADR-074, PROP-12) | String (JSON) | 30 minutos | `cache:context:list:p1:l20:scr:od:q:a` |
| `rl:ws:*`        | Rate limit WebSocket distribuido (ADR-075, PROP-59) | ZSET / String| Ventana × 2 (ZSET), block PX | `rl:ws:join_room:user:abc123`, `rl:ws:block:user:abc123`, `rl:ws:violations:user:abc123` |
| `rfid:mode:*`    | Estado RFID por usuario, distribuido vía pub/sub (ADR-076, PROP-64) | String (JSON) | 1 hora                       | `rfid:mode:{userId}` |
| `rfid:sensor:*`  | Mapeo sensor → userId                               | String       | 1 hora                       | `rfid:sensor:{sensorId}` |
| `bull:*`         | Queues BullMQ (data-retention, gdpr-exports, notifications). ADR-077, PROP-62 | varios (jobs, stats) | gestionado por BullMQ | `bull:data-retention:{jobId}` |

> **Nota sobre TTL de play/card (T-066):** Aunque antes este documento indicaba "Sin TTL*", el código
> real aplica un TTL de 90s (`DISTRIBUTED_LOCK_TTL_SECONDS`) con un heartbeat de 30s
> (`LOCK_HEARTBEAT_INTERVAL_MS`) que lo renueva periódicamente. Si el servidor se cae, las keys expiran
> automáticamente en ≤90s, garantizando liberación de recursos sin intervención manual.

## Política de evicción (`maxmemory-policy: noeviction`)

Redis se configura con `maxmemory 256mb` (dev) / `512mb` (prod) y `maxmemory-policy noeviction`
(ver `docker-compose.yml` y, para el modo de testing local pre-deploy, `docker/archive/docker-compose.prod.yml`).
Esto significa que cuando la memoria llega
al límite, las **escrituras nuevas fallan con error** (`OOM command not allowed when used memory > 'maxmemory'`)
en lugar de expulsar claves existentes.

### Por qué no `allkeys-lru`

Una política de evicción tipo `allkeys-lru` (que expulsa la clave usada hace más tiempo bajo
presión) es la elección habitual cuando Redis se usa como caché puro. Aquí **no** lo es: la
mayoría de los namespaces almacenan datos cuya pérdida silenciosa rompe garantías del sistema.

| Namespace                     | ¿Tolera evicción LRU? | Consecuencia de expulsión silenciosa                                                            |
| ----------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| `cache:analytics`             | Sí                    | Se regenera con la próxima petición. TTL 2-10 min.                                              |
| `cache:context`, `cache:mechanic` | Sí                | Se rehidrata desde Mongo. TTL 30-60 min.                                                        |
| `auth:user`                   | Sí                    | Se rehidrata en el siguiente `authenticate`. TTL 60s.                                           |
| **`bull:*` (BullMQ)**         | **No**                | Job perdido = cron de retención RGPD podría no ejecutarse. BullMQ avisa explícitamente al arrancar si la policy no es `noeviction`. |
| **`blacklist:*`**             | **No**                | Token revocado expulsado = el JWT vuelve a ser válido hasta su `exp` natural. Agujero de seguridad. |
| **`refresh:*`, `used:*`**     | **No**                | Rotación rota: refresh tokens legítimos rechazados o reutilizables fuera de su ventana.         |
| **`play:init:*`**             | **No**                | Idempotencia de `startPlay` rota: doble-click del profesor crea dos `GamePlay` distintos en BD. |
| **`play:*`, `card:*`**        | **No**                | Locks distribuidos perdidos = race conditions silenciosas en el motor de juego.                 |
| `rfid:mode:*`, `rfid:sensor:*` | Tolerable             | Pérdida puntual fuerza al cliente a rearmarse. No crítico.                                      |
| `rl:ws:*`                     | Tolerable             | Contador de rate-limit reiniciado antes de tiempo. No crítico.                                  |

La conclusión es que el "lado caché" de Redis y el "lado almacén persistente con TTL"
**conviven en la misma instancia**. Como no podemos dar política distinta a cada namespace,
elegimos la única que respeta a los críticos: `noeviction`.

### Por qué es seguro

`noeviction` parece más arriesgado a primera vista (las escrituras pueden fallar), pero los
caches descartables ya tienen **TTL explícito** que los renueva sin necesidad de evicción
forzada. Mientras los TTLs estén bien dimensionados, Redis no debería llegar a llenarse
en operación normal.

Es preferible:

- **Fallo visible** (`OOM command not allowed` en logs → alerta) frente a
- **Fallo silencioso** (clave de idempotencia o de blacklist desaparecida sin trace, produciendo
  duplicados o accesos indebidos que se manifiestan días después).

### Mitigación monitorizada

`/api/admin/metrics` expone el bloque `redis` con `usedMemory` y `maxMemory`. Conviene alertar
cuando `usedMemory / maxMemory > 0.8` para escalar capacidad antes de tocar el límite. Si se
llega a OOM, las escrituras de los caches descartables fallarán pero los caches existentes
siguen sirviendo lectura — degradación parcial, no caída total.

## ¿Por qué Tipos de Datos Diferentes?

| Tipo       | Cuándo Usarlo               | Ejemplo                                  |
| ---------- | --------------------------- | ---------------------------------------- |
| **String** | Valor único simple          | Blacklist: solo necesito saber si existe |
| **Hash**   | Objeto con múltiples campos | Estado de partida: score, round, status  |
| **Set**    | Colección sin duplicados    | Familia de tokens: lista de JTIs         |

---
# Servicio de Abstracción (redisService)
## ¿Por Qué una Abstracción?
En lugar de usar `ioredis` directamente en todo el código, creamos `redisService.js`:
```javascript
// ❌ SIN abstracción (acoplado a ioredis, repetición de prefijos)
const redis = new Redis(process.env.REDIS_URL);
await redis.setex(`rfid-games:blacklist:${jti}`, ttl, '1');

// ✅ CON abstracción (desacoplado, DRY)
await redisService.setWithTTL(NAMESPACES.BLACKLIST, jti, '1', ttl);
```

**Beneficios:**
1. **Prefijos automáticos**: No repetir `rfid-games:` en cada llamada
2. **Logging automático**: Cada operación se registra en debug
3. **Fallback graceful**: Si Redis está caído, el sistema sigue funcionando (degradado)
4. **Testeable**: Fácil de mockear en tests con `jest.mock()`
5. **Cambio de proveedor**: Podríamos cambiar a Memcached, KeyDB, etc.

## API Completa del Servicio
```javascript
const redisService = require('./services/redisService');

const { NAMESPACES } = redisService;

// ===== STRINGS (valores simples) =====
// Guardar con TTL (expiración automática)
await redisService.setWithTTL(NAMESPACES.BLACKLIST, 'token-jti', 'revoked', 3600);

// Guardar sin TTL (permanente hasta borrado manual)
await redisService.set(NAMESPACES.CARD, '32B8FA05', 'play-123');

// Obtener (retorna null si no existe o Redis caído)
const value = await redisService.get(NAMESPACES.BLACKLIST, 'token-jti');

// Verificar existencia (retorna false si no existe o Redis caído)
const exists = await redisService.exists(NAMESPACES.BLACKLIST, 'token-jti');

// Eliminar
await redisService.del(NAMESPACES.BLACKLIST, 'token-jti');

// Obtener TTL restante (-1 si no tiene, -2 si no existe)
const ttl = await redisService.ttl(NAMESPACES.REFRESH, 'token-jti');

// ===== HASHES (objetos con múltiples campos) =====
// Guardar objeto completo (con TTL opcional)
await redisService.hset(NAMESPACES.PLAY, 'play-123', {
  score: 50,
  currentRound: 3,
  status: 'in-progress'
}, 3600); // TTL opcional

// Obtener objeto completo (con auto-parse de JSON en campos)
const playState = await redisService.hgetall(NAMESPACES.PLAY, 'play-123');

// → { score: 50, currentRound: 3, status: 'in-progress' }

// Obtener un campo específico
const score = await redisService.hget(NAMESPACES.PLAY, 'play-123', 'score');

// Eliminar un campo
await redisService.hdel(NAMESPACES.PLAY, 'play-123', 'temporaryField');

// ===== SETS (colecciones sin duplicados) =====
// Añadir elemento
await redisService.sadd(NAMESPACES.TOKEN_FAMILY, 'family-abc', 'token-1');

// Obtener todos los elementos
const tokens = await redisService.smembers(NAMESPACES.TOKEN_FAMILY, 'family-abc');

// Verificar pertenencia
const isMember = await redisService.sismember(NAMESPACES.TOKEN_FAMILY, 'family-abc', 'token-1');

// Eliminar elemento
await redisService.srem(NAMESPACES.TOKEN_FAMILY, 'family-abc', 'token-1');

// ===== UTILIDADES =====
// Escanear todas las keys de un namespace (no bloqueante)
const allBlacklisted = await redisService.scanByNamespace(NAMESPACES.BLACKLIST);

// → ['blacklist:abc', 'blacklist:xyz', ...]

// Limpiar un namespace completo (¡CUIDADO!)
await redisService.flushNamespace(NAMESPACES.PLAY);

// Estadísticas de uso
const stats = await redisService.getStats();

// → { connected: true, namespaces: { blacklist: 5, play: 2, refresh: 10, ... } }
```

## Fallback Graceful (Degradación Controlada)
Si Redis no está disponible, el servicio **no lanza errores**:
```javascript
const checkRedisAvailable = () => {
  if (!isRedisConnected()) {
    logger.warn('Redis: Operación ignorada - Redis no está conectado');
    return false;
  }
  return true;
};

// Ejemplo: get() retorna null si Redis caído
const get = async (namespace, id) => {
  if (!checkRedisAvailable()) return null;  // ← Fallback silencioso

  try {
    const redis = getRedis();
    return await redis.get(buildKey(namespace, id));
  } catch (error) {
    logger.error('Redis get error:', { error: error.message });
    return null;  // ← Fallback en error
  }
};
```

**Implicaciones por funcionalidad:**

| Funcionalidad   | Comportamiento si Redis caído                                           |
| --------------- | ----------------------------------------------------------------------- |
| Token blacklist | ⚠️ Tokens revocados podrían seguir funcionando (riesgo menor, temporal) |
| Refresh tokens  | ❌ Refresh fallará (sin almacenamiento)                                  |
| Partidas        | ❌ No se pueden iniciar (pero las en memoria continúan)                  |
| Health check    | ✅ Reportará `redis: unhealthy`                                          |

---

# Operaciones Atómicas y Pipelines (T-066)

## Contexto del problema
Las operaciones originales de card locks usaban patrones secuenciales que presentaban
race conditions en escenarios multi-instancia y generaban overhead de red excesivo:

| Operación | Patrón anterior | Round-trips (20 cards) | Problema |
|-----------|----------------|----------------------|----------|
| Reserva | SET NX secuencial + rollback | N+rollback | Race window entre adquisiciones parciales |
| Liberación | GET+compare+DEL por card | 3N = 60 | Keys huérfanas si crash entre GET y DEL |
| Heartbeat | EXPIRE play + (GET+compare+EXPIRE)×N | 1+3N ≈ 61 | Latencia y carga excesiva cada 30s |
| Recovery | HGETALL individual por play | N | N+1 al verificar estado de plays huérfanas |

## Solución: Lua scripts + ioredis pipelines

### Lua scripts (atomicidad)
Tres scripts Lua en `backend/src/scripts/lua/`:

1. **`reserveCards.lua`**: Verifica que TODAS las cards estén libres; si alguna está ocupada,
   no escribe nada (all-or-nothing). Elimina la race window de adquisición parcial.

2. **`releaseCards.lua`**: Para cada card, verifica que el playId coincida antes de borrar
   (owner-aware). Elimina la ventana entre GET y DEL.

3. **`renewLease.lua`**: Renueva play key + todas las card keys en una sola ejecución.
   Con 20 cards, reduce de ~61 round-trips a 1.

### ioredis pipelines (batch reads)
Dos funciones pipeline en `redisService.js`:

1. **`existsMany(namespace, ids)`**: Verifica existencia de N keys en 1 pipeline.
2. **`hgetallMany(namespace, ids)`**: Lee N hashes en 1 pipeline.

Usadas en `recoverOrphanedPlaysFromDB()` para eliminar el patrón N+1.

## Wrappers en redisService.js
Las funciones Lua se exponen como wrappers con **fallback automático** al patrón secuencial:

```javascript
// En producción: EVALSHA (1 round-trip atómico)
// En tests (ioredis-mock): fallback a setManyIfNotExists secuencial
const result = await redisService.reserveCardsAtomic(NAMESPACES.CARD, entries, 90);
// → { ok: true/false, conflicts: [...] }

const result = await redisService.releaseCardsAtomic(NAMESPACES.CARD, entries);
// → { ok: true, deletedCount: N }

const result = await redisService.renewLeaseAtomic(
  NAMESPACES.PLAY, playId, NAMESPACES.CARD, cardUids, 90
);
// → { ok: true, playRenewed: true, cardsRenewed: N, cardsSkipped: 0 }
```

## Métricas de monitoreo (gameEngine.metrics)
Nuevas métricas para observabilidad de las operaciones atómicas:

| Métrica | Descripción |
|---------|-------------|
| `luaReserveCardExecutions` | Reservas atómicas ejecutadas con éxito |
| `luaReserveCardConflicts` | Reservas rechazadas por conflicto |
| `luaReleaseCardExecutions` | Liberaciones atómicas ejecutadas |
| `luaRenewLeaseExecutions` | Renovaciones de lease ejecutadas |
| `luaRenewLeasePartialFailures` | Renovaciones parciales (cards con owner distinto) |
| `pipelineRecoveryBatchSize` | Tamaño del batch en recovery pipeline |

## Benchmark
El script `backend/scripts/benchmark-redis-ops.js` mide la mejora real:
```bash
node scripts/benchmark-redis-ops.js --cards=20 --iterations=100
```

---

# Desarrollo Local con Docker
## Requisitos
- Docker Desktop instalado
- Puerto 6379 disponible

## Iniciar Redis
```bash
# Desde la raíz del proyecto
docker compose up -d redis

# Verificar estado
docker compose ps
```

## Con Redis Commander (UI visual de debug)
```bash
docker compose --profile debug up -d
# Acceder a la UI en el navegador
# http://localhost:8081
```

## Detener
```bash
# Detener sin eliminar datos (persisten en volumen)
docker compose down

# Detener Y eliminar datos
docker compose down -v
```

## Configuración docker-compose.yml
```yaml
services:
  redis:
    image: redis:7.2-alpine
    container_name: tfg-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes  # Persistencia AOF
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: tfg-redis-commander
    profiles: ["debug"]  # Solo con --profile debug
    environment:
      - REDIS_HOSTS=local:redis:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis
    
volumes:
  redis-data:  # Volumen persistente
```

## Variables de Entorno (.env)
```env
# Desarrollo local
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=rfid-games:
```

---

# Producción con Upstash
[Upstash](https://upstash.com/) ofrece Redis serverless con tier gratuito generoso.

## Configuración
1. Crear cuenta en [upstash.com](https://upstash.com/)
2. Crear base de datos Redis (elegir región cercana a tu servidor)
3. Copiar URL de conexión (incluye autenticación)
4. Configurar en variables de entorno de producción:
```env
REDIS_URL=rediss://:password@region.upstash.io:6379
REDIS_KEY_PREFIX=rfid-games-prod:
```
> **Nota**: `rediss://` (doble s) indica conexión TLS

## Comparativa de Tiers

| Aspecto | Tier Gratuito | Tier Pro |
|---------|---------------|----------|
| Comandos/día | 10,000 | Ilimitados |
| Almacenamiento | 256MB | Configurable |
| Conexiones | 1,000 | Configurable |
| Persistencia | ✅ Automática | ✅ Automática |
| Latencia típica | ~10-50ms | ~10-50ms |
| Regiones | Limitadas | Global |

---

# Monitoreo y Debug
## Health Check Endpoint
El endpoint `/api/health` incluye estado de Redis:
```json
{
  "status": "healthy",
  
  "services": {
    "database": { "status": "connected" },
    "redis": {
      "status": "connected",
      "latency": "2ms"
    },
    "rfid": { "status": "disconnected" }
  }
}
```

## Redis CLI (Docker)
```bash
# Conectar al CLI de Redis
docker exec -it tfg-redis redis-cli

# Comandos útiles:

# Ver todas las keys
KEYS *

# Ver keys de un namespace específico
KEYS rfid-games:blacklist:*
KEYS rfid-games:play:*

# Ver valor de una key
GET rfid-games:blacklist:abc123

# Ver TTL restante
TTL rfid-games:blacklist:abc123

# Ver todos los campos de un hash (estado de partida)
HGETALL rfid-games:play:507f1f77bcf86cd799439011

# Ver un campo específico de un hash
HGET rfid-games:play:507f1f77bcf86cd799439011 score

# Estadísticas del servidor
INFO

# Número total de keys
DBSIZE

# Monitorear comandos en tiempo real
MONITOR
```

## Redis Commander (UI Visual)
```bash
docker compose --profile debug up -d
```

Accede a `http://localhost:8081` para:
- 📁 Ver todas las keys organizadas visualmente
- 🔍 Inspeccionar valores con formato
- ⌨️ Ejecutar comandos manualmente
- 📊 Ver estadísticas en tiempo real
- ⏱️ Ver TTLs restantes

---

# Decisiones de Diseño
## 1. ¿Por qué ioredis y no redis (node-redis)?

| Característica | ioredis | node-redis |
|----------------|---------|------------|
| Cluster support | ✅ Nativo | ✅ Nativo |
| Sentinel support | ✅ Nativo | ✅ Nativo |
| TypeScript | ✅ Excelente | ⚠️ Básico |
| Auto-reconnect | ✅ Configurable | ✅ Configurable |
| **API Pipeline** | ✅ Excelente | ⚠️ Más verboso |
| **Popularidad** | 14k★ GitHub | 15k★ GitHub |

**Decisión:** Elegimos `ioredis` por su API más limpia para pipelines y mejor integración con TypeScript (preparando migración futura).

## 2. ¿Por qué TTL nativo en lugar de limpieza periódica?
```javascript
// ❌ ANTES: Limpieza con setInterval
setInterval(() => {
  for (const [jti, expiresAt] of blacklist) {
    if (Date.now() > expiresAt) blacklist.delete(jti);
  }
}, 60000); // Cada 60 segundos

// ✅ AHORA: TTL nativo de Redis
await redis.setex(key, ttlSeconds, value);

// Redis borra automáticamente al expirar
```

**Ventajas del TTL nativo:**
- **Precisión**: Al milisegundo, no cada 60 segundos
- **Sin carga en Node.js**: Redis maneja la expiración
- **Sin memory leaks**: Imposible olvidar limpiar
- **Atómico**: Sin race conditions durante limpieza

## 3. ¿Por qué Hash para estado de partidas?

| Operación | String + JSON | Hash |
|-----------|---------------|------|
| Leer todo | `JSON.parse(GET)` | `HGETALL` |
| Leer un campo | `JSON.parse(GET).field` | `HGET field` |
| Actualizar un campo | `GET + parse + modify + SET` | `HSET field value` |
| Incrementar | `GET + parse + increment + SET` | `HINCRBY field 1` |

**Decisión:** Hash es más eficiente para actualizaciones parciales frecuentes (cada ronda de juego).

## 4. TTL con heartbeat en partidas activas (actualizado T-066)
Las partidas **SÍ** tienen TTL (90 segundos), renovado periódicamente por un heartbeat cada 30 segundos. Este diseño resuelve el problema de keys huérfanas si el servidor se cae:

**Mecanismo:**
1. Al iniciar una partida, las keys `play:{id}` y `card:{uid}` se crean con TTL de 90s
2. Un heartbeat cada 30s renueva el TTL atómicamente (via Lua script `renewLease`)
3. Si el servidor se cae, las keys expiran automáticamente en ≤90s
4. Al finalizar, las keys se eliminan explícitamente (no esperamos expiración)

```javascript
// Constantes configurables por entorno:
DISTRIBUTED_LOCK_TTL_SECONDS = 90   // TTL de cada key
LOCK_HEARTBEAT_INTERVAL_MS = 30000  // Renovación cada 30s
```

**¿Por qué 90s y no menos?**
- Margen de seguridad: 3× el intervalo de heartbeat
- Tolera picos de latencia sin falsos abandonos
- Suficientemente corto para liberar recursos rápidamente tras crash

## 5. Operaciones atómicas Lua (T-066)
Para garantizar consistencia en escenarios multi-instancia, las operaciones críticas
sobre card locks se ejecutan como **Lua scripts** en el servidor Redis:

| Script | Propósito | Round-trips |
|--------|-----------|-------------|
| `reserveCards.lua` | Reserva all-or-nothing de UIDs | 1 (antes: N+rollback) |
| `releaseCards.lua` | Liberación owner-aware de UIDs | 1 (antes: 3N) |
| `renewLease.lua` | Renovación de play + cards en heartbeat | 1 (antes: 1+3N) |

**¿Por qué Lua y no pipelines para estas operaciones?**
- Las pipelines ejecutan comandos en lote pero **no son atómicas**: otro cliente puede intercalar comandos entre ellos
- Lua scripts se ejecutan de forma **indivisible** en el servidor Redis (single-threaded)
- Para la reserva, necesitamos semántica all-or-nothing: si una card ya está tomada, no escribir nada
- Para la liberación, necesitamos verificar el owner antes de borrar, sin ventana de carrera

**Carga de scripts:**
Los scripts se cargan en Redis al conectar via `SCRIPT LOAD` y se invocan por SHA (`EVALSHA`)
para minimizar overhead de red. Si el SHA se pierde (ej. `SCRIPT FLUSH`), se cae
automáticamente a `EVAL` con el source completo.

## 6. ¿Por qué prefijos en las keys?
```
rfid-games:blacklist:abc123
↑
prefijo configurable
```

**Razones:**
1. **Multitenancy**: Múltiples apps pueden compartir Redis
2. **Separación de entornos**: `rfid-games-dev:` vs `rfid-games-prod:`
3. **Limpieza selectiva**: `KEYS rfid-games:*` solo nuestras keys
4. **Evitar colisiones**: Otros proyectos no pisarán nuestras keys

## 7. ¿Por qué "abandonar" partidas al reiniciar en lugar de continuarlas?
Al recuperar partidas tras un reinicio, las marcamos como **abandonadas** en lugar de intentar continuarlas:
1. **Timers no serializables**: Los `setTimeout` de rondas se pierden
2. **Estado de cliente desconocido**: No sabemos si el jugador sigue ahí
3. **Consistencia garantizada**: Mejor estado conocido que comportamiento errático
4. **Transparencia**: Mensaje claro de "servidor reiniciado" para el usuario

**Trade-off aceptado:** Perdemos partidas en curso, pero ganamos consistencia y claridad.

---

# Socket.IO Redis Adapter

## Contexto

Socket.IO gestiona rooms y broadcasts de forma local dentro de cada proceso Node.js. En un despliegue con una sola instancia esto funciona correctamente, pero si se escala horizontalmente (múltiples instancias detrás de un load balancer), los sockets conectados a instancias diferentes no comparten rooms: un `io.to('play_123').emit(...)` solo alcanza a los sockets del proceso local.

Para resolver esto sin modificar la lógica aplicativa se utiliza `@socket.io/redis-adapter`, que coordina rooms y broadcasts entre instancias a través de **pub/sub de Redis**.

## Funcionamiento

El adapter utiliza dos conexiones Redis dedicadas:

- **pubClient**: publica eventos cuando una instancia emite a una room.
- **subClient**: recibe publicaciones de otras instancias y reenvía los eventos a los sockets locales.

```
┌──────────────────────────────────────────────────────────────────┐
│                        Load Balancer                             │
└────────────┬─────────────────────────────────┬───────────────────┘
             │                                 │
   ┌─────────▼──────────┐           ┌──────────▼─────────┐
   │  Instancia A       │           │  Instancia B       │
   │  io.to('play_123') │           │  sockets en        │
   │  .emit('new_round')│           │  room 'play_123'   │
   └─────────┬──────────┘           └──────────▲─────────┘
             │ PUBLISH                         │ mensaje recibido
             │                                 │ → emit local
             │     ┌─────────────────────┐     │
             └────►│   Redis (pub/sub)   ├─────┘
                   │   canal: socket.io  │
                   └─────────────────────┘
```

El proceso es transparente para el código aplicativo: los commands, handlers del `gameEngine`, y toda la lógica de negocio siguen usando `io.to().emit()` exactamente igual.

## Configuración

La activación del adapter es **condicional** y se realiza en `server.js`:

```javascript
// server.js — tras la inicialización de Socket.IO
if (isRedisConnected()) {
  const { createAdapter } = require('@socket.io/redis-adapter');
  const pubClient = getRedis().duplicate();
  const subClient = getRedis().duplicate();
  io.adapter(createAdapter(pubClient, subClient));
}
```

- Si Redis está conectado: se configura el adapter para escalabilidad horizontal.
- Si Redis no está disponible (desarrollo local, tests): se mantiene el adapter in-memory por defecto.
- Si la inicialización falla: se captura el error y se continúa con adapter in-memory, registrando un warning en logs.

## Diferencia con el uso de Redis en el gameEngine

Es fundamental distinguir los dos usos independientes de Redis en la plataforma:

| Aspecto | Redis para datos (redisService / gameEngine) | Redis adapter (Socket.IO) |
|---|---|---|
| **Propósito** | Persistir estado de partidas, locks de UIDs, tokens, security flags | Coordinar rooms y broadcasts entre instancias |
| **Patrón de uso** | `GET`, `SET`, `HSET`, `EVALSHA` (data store) | `PUBLISH`, `SUBSCRIBE` (mensajería efímera) |
| **Conexiones** | 1 conexión principal (gestionada por `redisService.js`) | 2 conexiones adicionales (`pubClient` + `subClient`) |
| **Datos almacenados** | Sí (con TTL o persistentes) | No (mensajes efímeros, no se almacenan) |
| **Namespaces/Keys** | `rfid-games:play:*`, `rfid-games:card:*`, etc. | Canales internos de `@socket.io/redis-adapter` |
| **Fallback sin Redis** | Degradación controlada (ver sección anterior) | Adapter in-memory (solo funciona single-instance) |

Los canales pub/sub del adapter **no** interfieren con las keys de datos del gameEngine, la blacklist de tokens ni los locks distribuidos. Son mecanismos completamente ortogonales que comparten la misma instancia Redis pero operan en espacios separados.

## Impacto en recursos

- **2 conexiones Redis adicionales por instancia**: cada instancia del backend mantiene 2 conexiones extra. Con Upstash (tier gratuito: 1000 conexiones), esto es asumible.
- **Tráfico pub/sub**: proporcional al volumen de eventos emitidos a rooms. En partidas típicas (~1-2 eventos/segundo por partida), el overhead es mínimo.
- **Latencia**: los eventos pasan por Redis antes de llegar al socket destino, añadiendo ~1-2ms. Imperceptible para la experiencia de usuario.

## Limitaciones actuales

El adapter resuelve la coordinación de **rooms y broadcasts** pero no la coordinación del **estado en memoria del gameEngine** (`activePlays`, timers, locks). Para un escalamiento horizontal completo del motor de juego se necesitaría:

- **Sticky sessions** (afinidad de cliente a instancia) para que todas las interacciones de una partida lleguen a la misma instancia, o
- **Migración completa del gameEngine a Redis** (fuera del scope actual).

Los locks distribuidos de UIDs (ADR-004) ya proporcionan coordinación de datos entre instancias. El adapter complementa con coordinación de comunicación en tiempo real.

Para más contexto sobre la decisión y alternativas, ver **ADR-011** en `Architecture_Decisions.md`.

---

## Diagrama actualizado de Redis en la arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                   CLIENTE (React)                            │
│  • Socket.IO client (reconexión automática, 15 intentos)    │
│  • Web Serial API → escaneo RFID                            │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND (Node.js + Express + Socket.IO)        │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   redisService.js                      │  │
│  │  • Abstracción sobre ioredis                          │  │
│  │  • Namespaces: blacklist, refresh, play, card, ...    │  │
│  │  • Lua scripts: reserve, release, renewLease          │  │
│  │  • Fallback graceful si Redis caído                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Socket.IO Redis Adapter                    │  │
│  │  • pub/sub para rooms/broadcasts entre instancias     │  │
│  │  • Activación condicional (fallback a in-memory)      │  │
│  │  • 2 conexiones dedicadas (pub + sub)                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  gameEngine.js                         │  │
│  │  • Sincroniza estado con Redis (play/card hashes)     │  │
│  │  • Locks distribuidos con lease TTL + heartbeat        │  │
│  │  • Checkpoints periódicos a MongoDB (ADR-010)         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
  ┌─────────────────────────┐     ┌─────────────────────────────┐
  │        MongoDB          │     │            Redis            │
  │                         │     │                             │
  │  • Users                │     │  Datos (redisService):      │
  │  • GameSessions         │     │    • Token blacklist        │
  │  • GamePlays            │     │    • Refresh tokens         │
  │  • Cards                │     │    • Active plays (hash)    │
  │  • GameMechanics        │     │    • Card → Play (string)   │
  │  • GameContexts         │     │    • Security flags         │
  │                         │     │                             │
  │  Fuente de verdad       │     │  Comunicación (adapter):    │
  │  (datos permanentes)    │     │    • Pub/sub Socket.IO      │
  │                         │     │    • Rooms entre instancias │
  └─────────────────────────┘     └─────────────────────────────┘
```

---

# Política de Invalidación de Cache

El sistema utiliza dos estrategias de invalidación según el tipo de dato cacheado:

## Invalidación explícita por mutación

Para **mecánicas** y **contextos**, las operaciones de escritura (create, update, delete) invocan `cacheInvalidate` para eliminar la entrada correspondiente de Redis inmediatamente después de la mutación en MongoDB. Esto garantiza que la siguiente lectura obtenga datos frescos directamente de la base de datos y los re-cachee.

## Expiración por TTL

Para **analytics**, no se realiza invalidación explícita. Los datos expiran automáticamente tras 5 minutos (TTL). Esta estrategia es adecuada porque los datos de analytics cambian con cada partida completada — invalidar explícitamente tras cada play generaría demasiadas invalidaciones con beneficio marginal.

## Fallback transparente ante fallo de Redis

Si Redis no está disponible (circuit breaker abierto, timeout, error de conexión), `cacheGet` ejecuta directamente la función de fetch contra MongoDB sin lanzar error. El sistema opera en modo degradado (sin cache) de forma transparente para el consumidor. Cuando Redis vuelve a estar disponible, las siguientes lecturas re-poblan el cache automáticamente.

Para más detalles sobre la decisión, ver **ADR-020** en `Architecture_Decisions.md`.

## Cache de autenticación (`auth:user`)

Desde el mantenimiento 2026-04-20, el middleware `authenticate` (HTTP) y el handshake Socket.IO comparten un cache Redis `auth:user:<userId>` con TTL 60s. Cachea un POJO "slim" del usuario con los campos que el middleware necesita (`role`, `status`, `accountStatus`, `currentSessionId`, `name`, `consent`). El helper `fetchUserForAuth` en `middlewares/auth.js` encapsula el flujo cache-aside; `invalidateUserCache(userId)` fuerza re-fetch.

**Invalidación explícita** en estos puntos:
- `authController.login` (rota `currentSessionId`)
- `authController.changePassword` (rota `currentSessionId` + password)
- `authController.updateProfile` (cambia `name`/`profile`)
- `authController.refreshAccessToken` cuando asigna `currentSessionId` legacy
- `userController.updateUser` y `userController.deleteUser`
- `userService.updateUser`
- `middleware/auth.logout` (tras rotar el sessionId vía `updateById`)

**Ventana de staleness máxima**: 60s entre un cambio de estado y su efecto en el middleware. El `security flag` de `revokeAllUserTokens` sigue siendo inmediato porque consulta un namespace distinto (`security:<userId>`) sin pasar por este cache.

Para más detalles, ver **ADR-065** en `Architecture_Decisions.md`.

## Idempotencia distribuida de `startPlay` (`play:init`)

En despliegues multi-instancia (con Socket.IO Redis adapter activo), dos réplicas podrían recibir concurrentemente un mismo `start_play`. Desde el mantenimiento 2026-04-20, `GameEngine.startPlay` adquiere un lock `SET NX` en `play:init:<playId>` con TTL 60s **antes** de cualquier otro registro en memoria o emisión de `new_round`. Si el lock ya existe (otra réplica lo tomó), `startPlay` retorna temprano.

El lock NO se libera manualmente — el TTL lo purga. 60s cubre el peor caso de `startPlay` (<2s) con margen para GC stops y reintentos legítimos. Si Redis cae, `setIfNotExists` retorna `true` por fallback y degradamos al guard in-memory previo (aceptable porque sin Redis tampoco hay multi-instancia real).

Para más detalles, ver **ADR-066** en `Architecture_Decisions.md`.

---

# Telemetría de comandos por categoría (T-907 / ADR-158)

Desde el 2026-05-17, `redisService` registra cada comando ejecutado contra Upstash en un contador in-process agrupado por **categoría funcional**. Sirve para:

- Anticipar si el ritmo actual rompería el budget de 10K cmds/día del free tier antes de tocarlo.
- Identificar qué namespace consume más en un endpoint problemático.
- Verificar el impacto de optimizaciones (LRU memoria, pipelines, caches Redis).

## Categorías mapeadas

| Categoría        | Namespaces / origen                          | Comentarios |
|------------------|----------------------------------------------|-------------|
| `auth`           | `auth:user`, `auth:fail`, `auth:lock`        | Slim user, lockout, failed attempts |
| `blacklist`      | `blacklist`                                  | Tokens revocados |
| `refresh`        | `refresh`, `used`, `tokenfamily`             | Rotación de refresh tokens |
| `security`       | `security`                                   | Logout forzado (revokeAll) |
| `cache-mechanic` | `cache:mechanic`                             | Mecánicas de juego cacheadas |
| `cache-context`  | `cache:context`                              | Contextos temáticos cacheados |
| `cache-analytics`| `cache:analytics`                            | KPIs y agregaciones analytics |
| `play`           | `play`, `play:init`                          | Estado de partida activa, idempotencia |
| `card`           | `card`                                       | Mapeo card→play (lock distribuido) |
| `ratelimit`      | `rl:*`                                       | rate-limit-redis distribuido |
| `ws`             | `rl:ws:*`, `rfid:mode`, `rfid:sensor`        | Rate-limit WebSocket + estado RFID |
| `bullmq`         | `bull:*`                                     | Colas BullMQ |
| `lua`            | `reserveCards`, `releaseCards`, `renewLease` | EVAL/EVALSHA |
| `pipeline`       | `runPipeline()` explícito                    | Lecturas heterogéneas agrupadas |
| `other`          | resto / desconocido                          |  |

## Salida en `/api/metrics`

```json
{
  "redis": {
    "commandsTotal": 1234,
    "commandsByCategory": {
      "auth": 567,
      "blacklist": 123,
      "ratelimit": 234,
      "cache-analytics": 45,
      "lua": 12
    },
    "commandsEstimatedDaily": 17856,
    "inMemoryCache": { "authUser": {...}, "mechanic": {...}, "context": {...} }
  }
}
```

`commandsEstimatedDaily` es una extrapolación lineal desde `uptimeSeconds`. Cuando esté >8K, alertar (margen 2K para reaccionar antes de tocar 10K).

## Reset y overhead

- `redisCommandTracker.reset()` reinicia contadores (usado en tests). En producción no se resetea automáticamente — el snapshot extrapola desde uptime.
- Overhead despreciable: 1 acceso a Map + `Number.isFinite` + try/catch silencioso por comando.

# LRU memoria complementaria al cache Redis (T-907 / ADR-158)

Antes el cache `auth:user` Redis (TTL 60s) ahorraba queries Mongo pero seguía consumiendo 1 GET Upstash por request autenticada. Tras T-907 se añade una capa LRU en memoria del proceso encima del cache Redis para absorber microbursts (varios requests del mismo usuario en pocos segundos).

## Instancias singleton

`backend/src/utils/inMemoryCache.js` expone tres instancias preconfiguradas:

| Instancia       | Namespace cubierto | TTL    | Max entries |
|-----------------|--------------------|--------|-------------|
| `authUserCache` | `auth:user:<id>`   | 30s    | 500         |
| `mechanicCache` | `cache:mechanic:*` | 60s    | 50          |
| `contextCache`  | `cache:context:*`  | 60s    | 100         |

TTLs y tamaños override via env (`IN_MEMORY_AUTH_USER_TTL_MS`, `IN_MEMORY_AUTH_USER_MAX`, etc.).

## Lookup order

`fetchUserForAuth` ejemplifica el patrón estándar:

```
1. authUserCache.get(userId)
   └─ HIT  → return inmediato (0 cmds Redis)
   └─ MISS → continuar

2. redisService.get('auth:user', userId)
   └─ HIT  → set en authUserCache + return (1 cmd Redis)
   └─ MISS → continuar

3. userRepository.findById(userId)
   └─ set en authUserCache (sync)
   └─ setWithTTL 'auth:user' en Redis (fire-and-forget, 1 cmd Redis)
   └─ return (1 query Mongo + 1 cmd Redis)
```

## Invalidación

`invalidateUserCache(userId)` limpia primero el LRU local y luego invalida la entrada Redis. Cross-instance la consistencia depende del TTL local (30s en `authUser`). Si en el futuro se escala a 2+ instancias del backend, se documenta como deuda añadir pub/sub `cache:invalidate` para propagar la invalidación.

## Métricas

`inMemoryCache.getAllStats()` se expone en `/api/metrics → redis.inMemoryCache` con `hits`, `misses`, `evictions`, `hitRatePercent`, `size`, `max`, `ttlMs` por instancia. Hit rate >70% indica que la capa local está absorbiendo microbursts y bajando el budget Redis.

# Pipeline helper para lecturas heterogéneas (T-907)

`redisService.runPipeline(buildFn, namespace = 'pipeline')` permite a callers agrupar lecturas heterogéneas en 1 round-trip Upstash. Caso típico (no aplicado todavía, queda como follow-up): el middleware `authenticate` podría combinar `EXISTS blacklist:<jti> + GET security:<userId> + GET auth:user:<userId>` en un solo viaje.

```js
const results = await redisService.runPipeline((p) => {
  p.exists(`blacklist:${jti}`);
  p.get(`security:${userId}`);
  p.get(`auth:user:${userId}`);
}, 'auth');
// results = [[null, 0|1], [null, value|null], [null, value|null]]
```

Cada operación añadida al pipeline contabiliza como 1 comando en la categoría indicada (default `pipeline`). Si Redis no está disponible devuelve `null` y el caller decide fallback.

---

# Recursos Adicionales
- [Documentación oficial de Redis](https://redis.io/docs/)
- [Documentación de ioredis](https://github.com/redis/ioredis)
- [Upstash Docs](https://docs.upstash.com/redis)
- [Redis Data Types Tutorial](https://redis.io/docs/data-types/tutorial/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)

---

# T-907 INT5 — Canal pub/sub `cache:invalidate` (cross-instance LRU)

Tras introducir el LRU memoria por proceso (T-907 D / ADR-158) surgió la necesidad de invalidar **caches en memoria de las otras instancias del backend** cuando una de ellas cambia un slim-user (role, status, currentSessionId, consent), una mecánica o un contexto. Sin esto, la ventana de inconsistencia es el TTL local (30-60 s).

## Canal

- **Nombre:** `cache:invalidate`.
- **Mensaje:** JSON `{ namespace, key, from: instanceId, ts }`.
- **Namespaces aceptados:** `auth:user`, `cache:mechanic`, `cache:context`. Otros se ignoran silenciosamente.
- **Identificador de instancia (`from`):** `HOSTNAME` o `INSTANCE_NAME` o `pid-<pid>`. Los subscribers ignoran sus propios mensajes (la instancia origen ya limpió su LRU localmente).

## Publisher

`backend/src/middlewares/auth.js → invalidateUserCache(userId)`:

1. Limpia `authUserCache` local (síncrono).
2. Publica `{ namespace: 'auth:user', key: userId, from: instanceId }` en `cache:invalidate` (fire-and-forget).
3. Invalida Redis (`cacheInvalidate('auth:user', userId)`).

El publisher para invalidaciones de `cache:mechanic` y `cache:context` queda preparado pero no se conecta hoy (esos caches se invalidan vía mutaciones admin en `mechanicController` y `contextController`, no por flujos de usuario). Cuando se conecten, basta con `require('../realtime/cacheInvalidateSubscriber').publishInvalidate('cache:mechanic', mechanicId)`.

## Subscriber

`backend/src/realtime/cacheInvalidateSubscriber.js` se arranca desde `server.js` después de `connectRedis()` (junto al `rfidModeSubscriber`) y se cierra en `gracefulShutdown`. Si Redis no está disponible, queda en no-op y el TTL local (30-60 s) sigue actuando como fallback.

## Comportamiento por entorno

| Entorno | Comportamiento |
|---------|----------------|
| Single-instance (caso típico Koyeb free tier) | Publish al canal sin oyentes (coste despreciable). El LRU local se sigue limpiando síncronamente. |
| Multi-instance (paid tier o autoscaling futuro) | Cada instancia recibe los mensajes de las otras y limpia su LRU. Latencia de propagación <100 ms (round-trip Redis pub/sub). |

## Diferencia con `RFID_MODE_PUBSUB_CHANNEL`

Ambos canales siguen el mismo patrón (cliente Redis dedicado en modo SUBSCRIBE, ignora mensajes propios via instance ID). La diferencia es de dominio:

- `rfid-mode-changes` (ADR-077): sincroniza estado RFID transitorio entre instancias.
- `cache:invalidate` (T-907 INT5): invalida caches en memoria tras mutaciones de datos persistentes.

No interfieren entre sí. La instancia mantiene dos clientes subscriber adicionales (3 conexiones Redis totales por instancia: principal + rfidMode-sub + cacheInvalidate-sub).

---

# T-907 INT1 — Pipeline auth (3 GETs Redis → 1 round-trip)

`backend/src/middlewares/auth.js → fetchUserForAuthWithChecks(decoded, req)` agrupa en una sola pipeline:

- `EXISTS blacklist:<jti>` (revocación de token)
- `GET security:<userId>` (logout forzado / revokeAllUserTokens)
- `GET auth:user:<userId>` (slim-user cache; solo si el LRU local hizo miss)

`verifyAccessToken(token, req, { skipRedisChecks: true })` permite a `authenticate`/`optionalAuth` saltarse los checks Redis internos del verify y hacerlos agrupados en pipeline. El resto de consumers (handshake Socket.IO, `revalidateSocketAuth`) siguen pasando `skipRedisChecks: false` y mantienen el flujo secuencial.

**Efecto neto:** mismo número de comandos Upstash pero agrupados en 1 round-trip en lugar de 3. La latencia auth percibida en miss caliente baja ~50%. El budget commands/día no cambia significativamente.

---

# T-907 OP2 — Validación multi-instancia ejecutada (2026-05-17)

El test `npm run test:multi-instance` validó empíricamente que `@socket.io/redis-adapter` cumple su contrato: una emisión `gameNsp.to(room).emit(...)` desde la instancia A llega a un cliente conectado a la instancia B (y viceversa). Ver `WebSockets-ExtendedUsage.md` sección "Validación ejecutada" para el log completo.

---

# T-941 / ADR-161 — Cache `cache:alerts` y queue `alert-detection`

T-941 introduce dos elementos Redis nuevos:

## Namespace `cache:alerts`

Sirve respuestas del endpoint `GET /api/analytics/alerts` y derivados (`/summary`, `/effectiveness`). Estructura:

```
cache:alerts:teacher:<teacherId>:status:<status>:sev:<severity>:type:<type>:student:<sid>:lim:<n>:cursor:<id>
cache:alerts:teacher:<teacherId>:summary
cache:alerts:teacher:<teacherId>:effectiveness:<days>
```

TTL por defecto **60 segundos** (env `ALERT_CACHE_TTL_SEC`). Invalidación granular por docente tras cualquier acción lifecycle (dismiss/resolve/snooze/pin/unpin) y tras cada corrida del worker:

```js
cacheInvalidatePattern('cache:alerts', `teacher:${teacherId}:*`);
```

La utilidad `cacheInvalidatePattern` se añadió a `utils/cacheHelper.js` y reutiliza `redisService.scanByNamespace` + `delMany` para hacer SCAN incremental + DEL en batch (evita SCAN + GETs uno a uno).

## Queue `alert-detection` (BullMQ)

Cuarta queue registrada en `queues/index.js` junto a `data-retention`, `gdpr-exports` y `notifications`. Mismo prefijo `${KEY_PREFIX}bull`. Cron `*/15 * * * *` programado por `scheduleAlertDetectionCron` (env `ALERT_DETECTION_CRON`) con `jobId: 'alert-detection-cron'` para garantizar idempotencia ante reinicios. El worker `alertDetectionWorker.js` se arranca en el proceso `worker.js` separado.

Esto confirma que las 3 conexiones Redis por instancia (principal de datos + pub/sub adapter Socket.IO + subscribers `rfidMode` y `cacheInvalidate`) coexisten sin interferencias en una misma instancia Upstash.

## TTLs en materialización analytics (2026-06-05, ADR-196)

Cierre de dos keys que crecían sin cota (riesgo en Upstash free-tier 256 MB):
- **`student:metrics:<id>` (Hash, T-931)**: las escrituras `HINCRBY`/`HSET` de cada `endPlay` no fijaban EXPIRE → una key viva indefinidamente por cada alumno que jugara alguna vez. Se añade `EXPIRE` 90 d (`STUDENT_METRICS_TTL_SECONDS`) en la escritura en vivo y el mismo TTL en el `HSET` del reconciliador nocturno, que así renueva la ventana de los alumnos activos; los inactivos caen solos (Mongo es la fuente de verdad y el Hash es caché reconstruible).
- **`system:meta:lastRetentionRun`**: el worker de retención usaba `set` sin TTL → `setWithTTL` 30 d. Se refresca a diario; solo expira si el job deja de correr, que es justo lo que el detector `data_retention_lag` debe señalar (lee null → lag).

## Conexión Upstash: TLS, reconexión y adapter (2026-06-30, ADR-223)

Endurecimiento de la conexión Redis de cara al despliegue en **Upstash** (Redis serverless, TLS obligatorio en el puerto 6379):

- **TLS para `rediss://`.** `getRedisConfig()` (y `buildBullConnection()` de BullMQ) construían un objeto de opciones a partir de la URL parseada, perdiendo el esquema → ioredis **no** activaba TLS (solo lo hace si se le pasa la *cadena* `rediss://`, no un objeto). Contra Upstash el handshake fallaría o el tráfico viajaría en claro. Fix: si `url.protocol === 'rediss:'`, propagar `tls: { servername: url.hostname }`.
- **Reconexión resiliente.** `retryStrategy` abandonaba la conexión para siempre tras ~11s (`return null`); ante un blip/idle-timeout/failover de Upstash el backend quedaba sin Redis hasta reiniciar y, como los rate-limiters de login son *fail-closed*, **bloqueaba todos los logins**. Ahora reintenta indefinidamente con backoff cap (3s) + `reconnectOnError` (READONLY/ECONNRESET de failover).
- **Socket.IO Redis adapter tras flag `SOCKET_ADAPTER_ENABLED` (off por defecto).** En single-instance (invariante `scale=1`) el adapter publicaba en Redis cada broadcast de sala sin consumidor = coste puro de comandos. Activar solo con `scale>1`.