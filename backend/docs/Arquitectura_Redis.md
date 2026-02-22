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
7. [Desarrollo Local con Docker](#desarrollo-local-con-docker)
8. [Producción con Upstash](#producción-con-upstash)
9. [Monitoreo y Debug](#monitoreo-y-debug)
10. [Decisiones de Diseño](#decisiones-de-diseño)

---

# Introducción
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

| Namespace     | Propósito                    | Tipo Redis         | TTL                       | Ejemplo de Key           |
| ------------- | ---------------------------- | ------------------ | ------------------------- | ------------------------ |
| `blacklist`   | Access tokens revocados      | String             | Tiempo restante del token | `blacklist:jti-abc123`   |
| `refresh`     | Refresh tokens activos       | Hash               | 7 días                    | `refresh:jti-xyz789`     |
| `used`        | Refresh tokens ya rotados    | String (JSON)      | 7 días                    | `used:jti-abc123`        |
| `security`    | Flags de invalidación masiva | String (timestamp) | 1 hora                    | `security:user-id-123`   |
| `play`        | Estado de partidas activas   | Hash               | Sin TTL*                  | `play:play-id-456`       |
| `card`        | Mapeo UID tarjeta → playId   | String             | Sin TTL*                  | `card:32B8FA05`          |
| `tokenfamily` | Familias de tokens           | Set                | 7 días                    | `tokenfamily:family-abc` |

*Se limpian manualmente al finalizar/abandonar la partida

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

## 4. ¿Por qué no TTL en partidas activas?
Las partidas **NO** tienen TTL porque:
1. **Duración variable**: Una partida puede durar 2 minutos o 30 minutos
2. **Pausa indefinida**: Un profesor puede pausar y continuar horas después
3. **Limpieza controlada**: Solo se limpia explícitamente al `completar`, `abandonar` o `recuperar`
```javascript
// Limpieza explícita, no por TTL:
async completePlay(playId) {
  await playDoc.save();  // MongoDB
  await redisService.del(NAMESPACES.PLAY, playId);
  
  for (const mapping of cardMappings) {
    await redisService.del(NAMESPACES.CARD, mapping.uid);
  }
}
```

## 5. ¿Por qué prefijos en las keys?
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

## 6. ¿Por qué "abandonar" partidas al reiniciar en lugar de continuarlas?
Al recuperar partidas tras un reinicio, las marcamos como **abandonadas** en lugar de intentar continuarlas:
1. **Timers no serializables**: Los `setTimeout` de rondas se pierden
2. **Estado de cliente desconocido**: No sabemos si el jugador sigue ahí
3. **Consistencia garantizada**: Mejor estado conocido que comportamiento errático
4. **Transparencia**: Mensaje claro de "servidor reiniciado" para el usuario

**Trade-off aceptado:** Perdemos partidas en curso, pero ganamos consistencia y claridad.

---

# Recursos Adicionales
- [Documentación oficial de Redis](https://redis.io/docs/)
- [Documentación de ioredis](https://github.com/redis/ioredis)
- [Upstash Docs](https://docs.upstash.com/redis)
- [Redis Data Types Tutorial](https://redis.io/docs/data-types/tutorial/)
- [Redis Best Practices](https://redis.io/docs/management/optimization/)