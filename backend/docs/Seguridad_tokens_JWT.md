# Seguridad de Tokens - Sistema de Autenticación con Redis

## Índice

1. [[#Visión General]]
2. [[#Arquitectura de Tokens]]
3. [[#Flujos de Autenticación]]
	- [[#Login Inicial]]
	- [[#Uso del Access Token]]
	- [[#Refresh Token (Rotación)]]
	- [[#Logout]]
4. [[#Funciones del Sistema]]
	- [[#Generación de Tokens]]
	- [[#Verificación de Access Token]]
	- [[#Verificación de Refresh Token]]
	- [[#Revocación de Tokens]]
5. [[#Detección de Robo de Tokens]]
6. [[#Security Flags]]
7. [[#Estructura en Redis]]
8. [[#Configuración]]
9. [[#Mejores Prácticas]]
10. [[#Troubleshooting]]

---

# Visión General
El sistema de autenticación implementa un esquema de **doble token con rotación**, diseñado para balancear seguridad y experiencia de usuario:
```
┌────────────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE AUTENTICACIÓN                            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Access Token          Refresh Token                                  │
│   ┌──────────────┐      ┌──────────────┐                               │
│   │ Corta vida   │      │ Larga vida   │                               │
│   │ 15-60 min    │      │ 7 días       │                               │
│   │              │      │              │                               │
│   │ Para cada    │      │ Para obtener │                               │
│   │ API request  │      │ nuevos tokens│                               │
│   └──────────────┘      └──────────────┘                               │
│          │                     │                                       │
│          ▼                     ▼                                       │
│   ┌──────────────────────────────────────┐                             │
│   │             Redis                    │                             │
│   │  • Blacklist (tokens revocados)      │                             │
│   │  • Refresh tokens activos            │                             │
│   │  • Tokens usados (detección robo)    │                             │
│   │  • Security flags (logout masivo)    │                             │
│   └──────────────────────────────────────┘                             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

## ¿Por Qué Este Diseño?

| Problema                                 | Solución                                  |
| ---------------------------------------- | ----------------------------------------- |
| JWT es stateless (no se puede invalidar) | Blacklist en Redis con TTL automático     |
| Access token robado = acceso prolongado  | Vida corta (15 min) + refresh token       |
| Refresh token robado = acceso de 7 días  | Rotación obligatoria + detección de reuso |
| Múltiples dispositivos = difícil logout  | Security flags por usuario                |
| Race conditions entre tabs               | Grace period de 10 segundos               |

---

# Arquitectura de Tokens
## Estructura del Access Token
```javascript
// Header
{
  "alg": "HS256",
  "typ": "JWT"
}

// Payload
{
  "id": "507f1f77bcf86cd799439011",  // userId (MongoDB ObjectId)
  "role": "teacher",                  // Rol del usuario
  "jti": "a1b2c3d4-e5f6-7890-abcd",  // ID único del token (UUID v4)
  "iat": 1704067200,                  // Issued At (timestamp)
  "exp": 1704068100                   // Expires (iat + 15 min)
}

// Signature
HMACSHA256(header + "." + payload, JWT_SECRET)
```

## Estructura del Refresh Token
```javascript
// Payload
{
  "id": "507f1f77bcf86cd799439011",   // userId
  "jti": "x1y2z3w4-a5b6-7890-cdef",   // ID único del refresh token
  "familyId": "f1a2m3i4-l5y6-7890",   // ID de la "familia" de tokens
  "iat": 1704067200,
  "exp": 1704672000                    // iat + 7 días
}
```

## ¿Qué es el familyId?
El `familyId` es un identificador que agrupa todos los refresh tokens que derivan de un mismo login:
```
Login (23 Dic)
    │
    └── familyId: "ABC123" generado
        │
        ├── Refresh Token 1 (jti: "RT1", familyId: "ABC123")
        │       │
        │       └── [Rotación 24 Dic]
        │               │
        │               └── Refresh Token 2 (jti: "RT2", familyId: "ABC123")
        │                       │
        │                       └── [Rotación 25 Dic]
        │                               │
        │                               └── Refresh Token 3 (jti: "RT3", familyId: "ABC123")
        │
        └── Si alguien intenta usar RT1 después de rotarlo:
            → ROBO DETECTADO
            → TODA la familia "ABC123" se invalida
            → Usuario debe hacer login de nuevo
```

## Campos Explicados

| Campo | Token | Propósito |
|-------|-------|-----------|
| `id` | Ambos | Identificar al usuario en la base de datos |
| `role` | Access | Autorización (¿puede acceder a este endpoint?) |
| `jti` | Ambos | Identificar este token específico para revocación |
| `familyId` | Refresh | Agrupar tokens del mismo login para detección de robo |
| `iat` | Ambos | Saber cuándo fue emitido (para security flags) |
| `exp` | Ambos | Expiración automática |

---

# Flujos de Autenticación
## Login Inicial
```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ Cliente │                    │ Backend │                    │  Redis  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ POST /auth/login             │                              │
     │ {email, password}            │                              │
     │─────────────────────────────>│                              │
     │                              │                              │
     │                              │ 1. Buscar usuario en MongoDB │
     │                              │    (email)                   │
     │                              │                              │
     │                              │ 2. Verificar password        │
     │                              │    (bcrypt.compare)          │
     │                              │                              │
     │                              │ 3. Generar familyId (UUID)   │
     │                              │                              │
     │                              │ 4. Generar tokens            │
     │                              │    - Access Token (15 min)   │
     │                              │    - Refresh Token (7 días)  │
     │                              │                              │
     │                              │ 5. Almacenar refresh token   │
     │                              │─────────────────────────────>│
     │                              │    HSET refresh:{jti}        │
     │                              │    {userId, familyId, ...}   │
     │                              │    EXPIRE 7 días             │
     │                              │                              │
     │ 200 OK                       │                              │
     │ {accessToken, refreshToken}  │                              │
     │<─────────────────────────────│                              │
     │                              │                              │
```

**Código relevante (`auth.js`):**
```javascript
const generateTokenPair = async (user, req) => {
  // Generar familyId único para este login
  const familyId = crypto.randomUUID();
  
  // Access Token - corta duración
  const accessToken = jwt.sign(
    { 
      id: user._id, 
      role: user.role, 
      jti: crypto.randomUUID() 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }  // 15 minutos
  );
  
  // Refresh Token - larga duración, incluye familyId
  const refreshPayload = {
    id: user._id,
    jti: crypto.randomUUID(),
    familyId: familyId  // ← Clave para detección de robo
  };
  
  const refreshToken = jwt.sign(
    refreshPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRATION }  // 7 días
  );
  
  // Almacenar en Redis para tracking
  await storeRefreshToken(refreshPayload.jti, user._id.toString(), familyId);
  
  return { accessToken, refreshToken };
};
```

## Uso del Access Token
```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ Cliente │                    │ Backend │                    │  Redis  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ GET /api/users               │                              │
     │ Authorization: Bearer {AT}   │                              │
     │─────────────────────────────>│                              │
     │                              │                              │
     │                              │ 1. Verificar firma JWT       │
     │                              │    jwt.verify(token, secret) │
     │                              │                              │
     │                              │ 2. ¿Token en blacklist?      │
     │                              │─────────────────────────────>│
     │                              │    EXISTS blacklist:{jti}    │
     │                              │<─────────────────────────────│
     │                              │    → 0 (no existe = OK)      │
     │                              │                              │
     │                              │ 3. ¿Security flag activo?    │
     │                              │─────────────────────────────>│
     │                              │    GET security:{userId}     │
     │                              │<─────────────────────────────│
     │                              │    → null (no hay = OK)      │
     │                              │                              │
     │                              │ 4. Token válido ✓            │
     │                              │    Continuar a controller    │
     │                              │                              │
     │ 200 OK                       │                              │
     │ {data...}                    │                              │
     │<─────────────────────────────│                              │
```

**Código relevante (`auth.js`):**
```javascript
const verifyAccessToken = async (token) => {
  // 1. Verificar firma y expiración
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // 2. Verificar blacklist
  const revoked = await isTokenRevoked(decoded.jti);
  if (revoked) {
    throw new UnauthorizedError('Token revocado');
  }
  
  // 3. Verificar security flag
  const securityCheck = await checkSecurityFlag(decoded.id, decoded.iat);
  if (securityCheck.revoked) {
    throw new UnauthorizedError(securityCheck.reason);
  }
  
  return decoded;
};

const isTokenRevoked = async (jti) => {
  // Retorna true si la key existe en Redis
  return await redisService.exists(redisService.NAMESPACES.BLACKLIST, jti);
};

const checkSecurityFlag = async (userId, tokenIssuedAt) => {
  const flagTimestamp = await redisService.get(redisService.NAMESPACES.SECURITY, userId);
  
  if (!flagTimestamp) {
    return { revoked: false, reason: null };
  }
  
  const flagTime = parseInt(flagTimestamp, 10);
  const tokenTimeMs = tokenIssuedAt * 1000;  // iat está en segundos
  
  // Si el token fue emitido ANTES del flag → inválido
  if (tokenTimeMs < flagTime) {
    return { revoked: true, reason: 'SESSION_REVOKED_SECURITY' };
  }
  
  return { revoked: false, reason: null };
};
```

## Refresh Token (Rotación)
```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ Cliente │                    │ Backend │                    │  Redis  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ POST /auth/refresh           │                              │
     │ {refreshToken}               │                              │
     │─────────────────────────────>│                              │
     │                              │                              │
     │                              │ 1. Verificar firma JWT       │
     │                              │                              │
     │                              │ 2. ¿Ya fue usado (rotado)?   │
     │                              │─────────────────────────────>│
     │                              │    GET used:{jti}            │
     │                              │<─────────────────────────────│
     │                              │                              │
     │                              │ Si fue usado:                │
     │                              │   → ¿Dentro de grace period? │
     │                              │     Sí: Permitir (race cond) │
     │                              │     No: ¡ROBO DETECTADO!     │
     │                              │         Invalidar familia    │
     │                              │                              │
     │                              │ 3. Obtener info del token    │
     │                              │─────────────────────────────>│
     │                              │    HGETALL refresh:{jti}     │
     │                              │<─────────────────────────────│
     │                              │                              │
     │                              │ 4. Marcar como usado         │
     │                              │─────────────────────────────>│
     │                              │    SETEX used:{jti} ttl {...}│
     │                              │                              │
     │                              │ 5. Eliminar token antiguo    │
     │                              │─────────────────────────────>│
     │                              │    DEL refresh:{jti}         │
     │                              │                              │
     │                              │ 6. Generar nuevos tokens     │
     │                              │    (MISMO familyId)          │
     │                              │                              │
     │                              │ 7. Almacenar nuevo refresh   │
     │                              │─────────────────────────────>│
     │                              │    HSET refresh:{newJti}     │
     │                              │                              │
     │ 200 OK                       │                              │
     │ {accessToken, refreshToken}  │ ← Ambos son NUEVOS           │
     │<─────────────────────────────│                              │
```

**Código relevante (`auth.js`):**
```javascript
const verifyRefreshToken = async (token) => {
  // 1. Verificar firma
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // 2. ¿Ya fue usado? (detección de robo)
  const usedCheck = await isRefreshTokenUsed(decoded.jti);
  
  if (usedCheck.used) {
    // Token ya fue rotado...
    const timeSinceUsed = Date.now() - usedCheck.usedAt;
    const withinGracePeriod = timeSinceUsed < ROTATION_GRACE_PERIOD_MS;
    
    if (!withinGracePeriod) {
      // ¡ROBO DETECTADO! Fuera del grace period
      logger.warn('Token theft detected', { 
        jti: decoded.jti, 
        familyId: usedCheck.familyId 
      });
      
      // Invalidar TODOS los tokens del usuario
      await revokeAllUserTokens(decoded.id, 'token_reuse_detected');
      
      throw new UnauthorizedError('Sesión invalidada por seguridad');
    }
    
    // Dentro del grace period = race condition legítima
    logger.info('Grace period refresh allowed', { jti: decoded.jti });
  }
  
  // 3. Obtener info del token
  const tokenInfo = await getRefreshTokenInfo(decoded.jti);
  if (!tokenInfo) {
    throw new UnauthorizedError('Token no válido');
  }
  
  return { decoded, familyId: tokenInfo.familyId };
};
```

## Logout
```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│ Cliente │                    │ Backend │                    │  Redis  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │ POST /auth/logout            │                              │
     │ Authorization: Bearer {AT}   │                              │
     │ {refreshToken}               │                              │
     │─────────────────────────────>│                              │
     │                              │                              │
     │                              │ 1. Revocar access token      │
     │                              │─────────────────────────────>│
     │                              │    SETEX blacklist:{jti}     │
     │                              │    TTL = tiempo restante     │
     │                              │                              │
     │                              │ 2. Revocar refresh token     │
     │                              │─────────────────────────────>│
     │                              │    DEL refresh:{jti}         │
     │                              │    SETEX blacklist:{jti}     │
     │                              │                              │
     │ 200 OK                       │                              │
     │ {message: "Logout exitoso"}  │                              │
     │<─────────────────────────────│                              │
     │                              │                              │
     │ Cliente elimina tokens       │                              │
     │ de localStorage/memoria      │                              │
```

**Código relevante (`auth.js`):**
```javascript
const revokeToken = async (jti, expiresAt) => {
  // Calcular TTL restante (no guardar tokens ya expirados)
  const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
  
  if (ttlSeconds <= 0) {
    logger.debug('Token ya expirado, no se añade a blacklist', { jti });
    return true;
  }
  
  // Añadir a blacklist con TTL = tiempo restante
  const success = await redisService.setWithTTL(
    redisService.NAMESPACES.BLACKLIST,
    jti,
    '1',  // Valor mínimo, solo importa que exista
    ttlSeconds
  );
  
  if (success) {
    logger.info('Token revocado', { jti, ttlSeconds });
  }
  
  return success;
};
```

---

# Funciones del Sistema
## Generación de Tokens

| Función | Propósito | Ubicación |
|---------|-----------|-----------|
| `generateTokenPair(user, req)` | Genera access + refresh tokens | `auth.js:350` |
| `generateAccessToken(payload)` | Solo access token (interno) | `auth.js:280` |

```javascript
// Uso típico en login/register
const { accessToken, refreshToken } = await generateTokenPair(user, req);

res.json({
  accessToken,
  refreshToken,
  expiresIn: 900  // 15 minutos en segundos
});
```

## Verificación de Access Token

| Función | Propósito | Retorna |
|---------|-----------|---------|
| `verifyAccessToken(token)` | Validación completa | `decoded` o throw |
| `isTokenRevoked(jti)` | Solo check blacklist | `boolean` |
| `checkSecurityFlag(userId, iat)` | Solo check security | `{revoked, reason}` |

```javascript
// En el middleware authenticateToken:
const token = req.headers.authorization?.split(' ')[1];
const decoded = await verifyAccessToken(token);

// decoded contiene: { id, role, jti, iat, exp }
req.userId = decoded.id;
req.userRole = decoded.role;
req.tokenJti = decoded.jti;
```

## Verificación de Refresh Token

| Función | Propósito | Retorna |
|---------|-----------|---------|
| `verifyRefreshToken(token)` | Validación con detección de robo | `{decoded, familyId}` |
| `isRefreshTokenUsed(jti)` | ¿Ya fue rotado? | `{used, familyId, usedAt}` |
| `getRefreshTokenInfo(jti)` | Obtener metadata | `{userId, familyId, createdAt}` |

```javascript
// En el endpoint /auth/refresh:
const { refreshToken } = req.body;
const { decoded, familyId } = await verifyRefreshToken(refreshToken);

// Marcar como usado
await markRefreshTokenAsUsed(decoded.jti, familyId);

// Eliminar el antiguo
await deleteRefreshToken(decoded.jti);

// Generar nuevos (heredando familyId)
const newTokens = await generateTokenPair(user, req, familyId);
```

## Revocación de Tokens

| Función | Propósito | Cuándo Usar |
|---------|-----------|-------------|
| `revokeToken(jti, exp)` | Revocar un token específico | Logout, refresh |
| `revokeAllUserTokens(userId, reason)` | Invalidar todas las sesiones | Robo detectado, cambio password |
| `deleteRefreshToken(jti)` | Eliminar refresh de Redis | Después de rotar |

```javascript
// Logout - revocar ambos tokens
await revokeToken(accessJti, accessExp);
await revokeToken(refreshJti, refreshExp);
await deleteRefreshToken(refreshJti);

// Cambio de contraseña - invalidar todo
await revokeAllUserTokens(userId, 'password_change');
// Todos los tokens emitidos antes de ahora serán rechazados
```

---

# Detección de Robo de Tokens
## ¿Cómo Funciona?
El sistema detecta robo cuando un refresh token **ya rotado** se intenta usar **fuera del grace period**:
```
                    TIEMPO
    ──────────────────────────────────────────────────────────────>
    
    │                    │                    │
    │   Token 1 usado    │   Grace period     │   Después del
    │   y rotado         │   (10 segundos)    │   grace period
    │                    │                    │
    ├────────────────────┼────────────────────┼───────────────────
    │                    │                    │
    │   Token 2 emitido  │   Si Token 1 se    │   Si Token 1 se
    │                    │   usa aquí:        │   usa aquí:
    │                    │   → Race condition │   → ¡ROBO!
    │                    │   → Permitido      │   → Invalidar todo
    │                    │                    │
```

## Escenario: Ataque Detectado
```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Atacante   │         │   Víctima    │         │   Backend    │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                        │                        │
       │ 1. Roba refresh token  │                        │
       │<───────────────────────│                        │
       │                        │                        │
       │ 2. Usa token robado    │                        │
       │────────────────────────│───────────────────────>│
       │                        │                        │ Token rotado
       │<───────────────────────│───────────────────────-│ Nuevos tokens
       │ (Atacante tiene        │                        │
       │  nuevos tokens)        │                        │
       │                        │                        │
       │                        │ 3. Víctima usa su      │
       │                        │    refresh token       │
       │                        │    (ya fue rotado!)    │
       │                        │───────────────────────>│
       │                        │                        │
       │                        │     ⚠️ ROBO DETECTADO  │
       │                        │     Fuera del grace    │
       │                        │     period (>10s)      │
       │                        │                        │
       │ 4. TODOS los tokens    │                        │
       │    de la familia       │                        │
       │    invalidados         │                        │
       │<───────────────────────│<───────────────────────│
       │                        │                        │
       │ Atacante: 401          │ Víctima: 401           │
       │ "Sesión inválida"      │ "Sesión inválida"      │
```

## ¿Por Qué Invalidamos TODO?
Cuando se detecta robo, no sabemos quién es el atacante y quién es la víctima:
- **Opción A**: El que usó primero es el atacante
- **Opción B**: El que usó primero es el legítimo

**Decisión conservadora**: Invalidar toda la familia de tokens. Ambos deben hacer login de nuevo.
```javascript
// Cuando se detecta robo:
await revokeAllUserTokens(decoded.id, 'token_reuse_detected');

// Esto crea un security flag:
// security:{userId} = Date.now()
// TTL = 1 hora

// Cualquier token emitido ANTES de este momento es rechazado
```

---

# Security Flags
## ¿Qué Son?
Los security flags son marcadores temporales que invalidan **todos** los tokens de un usuario emitidos antes de cierto momento.

## Casos de Uso
```javascript
// 1. Robo de token detectado (automático)
await revokeAllUserTokens(userId, 'token_theft');

// 2. Usuario cambia contraseña (manual desde controller)
await revokeAllUserTokens(userId, 'password_change');

// 3. Admin cierra todas las sesiones (manual)
await revokeAllUserTokens(userId, 'admin_action');

// 4. Usuario elimina su cuenta (manual)
await revokeAllUserTokens(userId, 'account_deleted');
```

## Estructura en Redis
```
Key:   security:{userId}
Value: 1704067200000   (timestamp en milisegundos)
TTL:   3600 segundos   (1 hora)
```

## Lógica de Validación
```javascript
const checkSecurityFlag = async (userId, tokenIssuedAt) => {
  const flagTimestamp = await redisService.get(NAMESPACES.SECURITY, userId);
  
  if (!flagTimestamp) {
    // No hay flag → token OK
    return { revoked: false, reason: null };
  }
  
  const flagTime = parseInt(flagTimestamp, 10);
  const tokenTimeMs = tokenIssuedAt * 1000;  // JWT usa segundos, Redis usa ms
  
  if (tokenTimeMs < flagTime) {
    // Token emitido ANTES del flag → INVÁLIDO
    return { revoked: true, reason: 'SESSION_REVOKED_SECURITY' };
  }
  
  // Token emitido DESPUÉS del flag → OK (es un token nuevo)
  return { revoked: false, reason: null };
};
```

## ¿Por Qué TTL de 1 Hora?
```
┌────────────────────────────────────────────────────────────────────┐
│                        LÍNEA DE TIEMPO                             │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   Tokens antiguos      Security Flag       Tokens nuevos           │
│   (max 1 hora vida)    creado aquí         (válidos)               │
│                             │                                      │
│   ──────────────────────────┼──────────────────────────────────>   │
│                             │                                      │
│   Token A (emitido -30min)  │  Token B (emitido +5min)             │
│   iat < flag → INVÁLIDO     │  iat > flag → VÁLIDO                 │
│                             │                                      │
│                             │  Después de 1 hora:                  │
│                             │  - Token A ya expiró naturalmente    │
│                             │  - Flag ya no es necesario           │
│                             │  - Redis lo elimina automáticamente  │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Razón**: Los access tokens duran máximo 1 hora. Después de ese tiempo, cualquier token antiguo ya habrá expirado por sí mismo.

---

# Estructura en Redis
## Resumen de Keys

| Namespace | Key Pattern | Tipo | TTL | Propósito |
|-----------|-------------|------|-----|-----------|
| `blacklist` | `blacklist:{jti}` | String | Tiempo restante token | Tokens revocados |
| `refresh` | `refresh:{jti}` | Hash | 7 días | Refresh tokens activos |
| `used` | `used:{jti}` | String (JSON) | 7 días | Tokens ya rotados |
| `security` | `security:{userId}` | String | 1 hora | Flags de invalidación |

## Ejemplos Reales
```bash
# Token revocado (en blacklist)
GET rfid-games:blacklist:a1b2c3d4-e5f6-7890-abcd
→ "1"
TTL rfid-games:blacklist:a1b2c3d4-e5f6-7890-abcd
→ 543  # segundos restantes

# Refresh token activo
HGETALL rfid-games:refresh:x1y2z3w4-a5b6-7890-cdef
→ {
    "userId": "507f1f77bcf86cd799439011",
    "familyId": "f1a2m3i4-l5y6-7890",
    "createdAt": "1704067200000"
  }

# Token ya rotado (usado)
GET rfid-games:used:x1y2z3w4-a5b6-7890-cdef
→ {"familyId":"f1a2m3i4-l5y6-7890","usedAt":1704067800000}

# Security flag activo
GET rfid-games:security:507f1f77bcf86cd799439011
→ "1704067200000"
```

---

# Configuración
## Variables de Entorno
```env
# Duración del Access Token
JWT_EXPIRES_IN=15m

# Secret para firmar tokens (DEBE ser seguro en producción)
# Mínimo 32 caracteres, idealmente 64+
JWT_SECRET=your-super-secret-key-minimum-32-characters-long

# TTL del Refresh Token (redundante, hardcodeado como fallback)
REFRESH_TOKEN_TTL_SECONDS=604800  # 7 días
```

## Constantes de Seguridad
```javascript
// middlewares/auth.js

// Período de gracia para rotación (evita falsos positivos por race conditions)
const ROTATION_GRACE_PERIOD_MS = 10000;  // 10 segundos

// TTL del refresh token en Redis
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;  // 7 días = 604800

// TTL del security flag
const SECURITY_FLAG_TTL_SECONDS = 60 * 60;  // 1 hora = 3600
```

## Configuración JWT
```javascript
// config/security.js
module.exports = {
  TOKEN_SECURITY: {
    REFRESH_TOKEN_TTL_SECONDS: 604800,
    SECURITY_FLAG_TTL_SECONDS: 3600,
    ROTATION_GRACE_PERIOD_MS: 10000
  }
};
```

---

# Mejores Prácticas
## Para el Frontend
```javascript
// ✅ BUENO: Access Token en memoria (no localStorage)
let accessToken = null;

const setAccessToken = (token) => {
  accessToken = token;  // Solo en memoria, se pierde al cerrar tab
};

// ✅ BUENO: Interceptor para refresh automático
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401 && error.response?.data?.code !== 'SESSION_REVOKED') {
      try {
        // Intentar refresh
        const { data } = await axios.post('/auth/refresh', { 
          refreshToken: localStorage.getItem('refreshToken') 
        });
        
        setAccessToken(data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        // Reintentar request original
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return axios(error.config);
      } catch (refreshError) {
        // Refresh falló → logout
        logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

// ✅ BUENO: Logout limpia todo
const logout = async () => {
  try {
    await axios.post('/auth/logout', { 
      refreshToken: localStorage.getItem('refreshToken') 
    });
  } catch (e) {
    // Ignorar errores (el token ya puede estar inválido)
  } finally {
    accessToken = null;
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }
};

// ❌ MALO: Access Token en localStorage
localStorage.setItem('accessToken', token);  // ¡Vulnerable a XSS!
```

## Para el Backend
```javascript
// ✅ BUENO: Validación completa siempre
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Token requerido');
    
    const decoded = await verifyAccessToken(token);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.tokenJti = decoded.jti;
    next();
  } catch (error) {
    next(error);
  }
};

// ✅ BUENO: Revocar al cambiar password
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  // ... validar y actualizar password ...
  
  // Invalidar TODAS las sesiones existentes
  await revokeAllUserTokens(req.userId, 'password_change');
  
  // El usuario deberá hacer login de nuevo
  res.json({ message: 'Contraseña cambiada. Por favor, inicie sesión de nuevo.' });
};

// ✅ BUENO: Logging de eventos de seguridad
logger.warn('Token theft detected', { userId, jti, familyId, ip: req.ip });
logger.info('User logged out', { userId, jti });
logger.info('All user tokens revoked', { userId, reason });
```

---

# Troubleshooting

### "Token revocado" pero el usuario no hizo logout

**Posibles causas:**

1. **Security flag activo**: Otro dispositivo detectó robo
2. **Cambio de contraseña**: Se invalidaron todas las sesiones
3. **Admin action**: Un administrador cerró las sesiones

**Diagnóstico:**

```bash
# Verificar blacklist
redis-cli GET rfid-games:blacklist:{jti}

# Verificar security flag
redis-cli GET rfid-games:security:{userId}
```

## Refresh token rechazado inmediatamente

**Posibles causas:**

1. **Token ya rotado**: Se usó en otro dispositivo/tab
2. **Token eliminado**: Se hizo logout en otro lugar
3. **Expiración**: Han pasado más de 7 días

**Diagnóstico:**

```bash
# Verificar si existe en refresh (activo)
redis-cli HGETALL rfid-games:refresh:{jti}

# Verificar si está en used (rotado)
redis-cli GET rfid-games:used:{jti}

# Verificar TTL
redis-cli TTL rfid-games:refresh:{jti}
```

## "SESSION_REVOKED_SECURITY" error

**Significado:** El token fue emitido antes de un security flag.

**Causa más común:** Robo de token detectado.

**Solución:** El usuario debe hacer login de nuevo.

```bash
# Ver cuándo se creó el flag
redis-cli GET rfid-games:security:{userId}
# Retorna timestamp en ms, ej: 1704067200000

# Comparar con el iat del token (está en segundos)
# Si tokenIat * 1000 < flagTimestamp → token inválido
```

## Race condition: "Tu sesión fue invalidada"

**Síntoma:** Múltiples tabs, al refrescar una, las otras fallan.

**Causa:** Las tabs comparten el mismo refresh token. Cuando una rota, las otras tienen un token "usado".

**Solución (frontend):**

```javascript
// Compartir el nuevo token entre tabs usando BroadcastChannel
const authChannel = new BroadcastChannel('auth');

// Cuando se obtienen nuevos tokens
authChannel.postMessage({ 
  type: 'tokens_refreshed', 
  accessToken, 
  refreshToken 
});

// En todas las tabs
authChannel.onmessage = (event) => {
  if (event.data.type === 'tokens_refreshed') {
    setAccessToken(event.data.accessToken);
    localStorage.setItem('refreshToken', event.data.refreshToken);
  }
};
```

---

# Resumen de Seguridad

| Amenaza                        | Mitigación                               |
| ------------------------------ | ---------------------------------------- |
| Token interceptado en tránsito | HTTPS obligatorio                        |
| Access token robado            | Corta duración (15 min)                  |
| Refresh token robado           | Rotación + detección de reuso            |
| XSS roba tokens                | Access token en memoria, no localStorage |
| Ataque de repetición           | JTI único + blacklist en Redis           |
| Sesiones zombie                | Security flags + TTL automático          |
| Race condition (tabs)          | Grace period de 10 segundos              |
| Logout incompleto              | Revocar ambos tokens + blacklist         |

---

# Referencias y Fuentes
## Estándares y RFCs

| Documento | Descripción | URL |
|-----------|-------------|-----|
| **RFC 7519** | JSON Web Token (JWT) - Especificación oficial | https://datatracker.ietf.org/doc/html/rfc7519 |
| **RFC 6749** | OAuth 2.0 Authorization Framework | https://datatracker.ietf.org/doc/html/rfc6749 |
| **RFC 6819** | OAuth 2.0 Threat Model and Security Considerations | https://datatracker.ietf.org/doc/html/rfc6819 |
| **RFC 7009** | OAuth 2.0 Token Revocation | https://datatracker.ietf.org/doc/html/rfc7009 |

## OWASP (Open Web Application Security Project)

| Recurso | Descripción | URL |
|---------|-------------|-----|
| **OWASP JWT Cheat Sheet** | Mejores prácticas para JWT | https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html |
| **OWASP Session Management** | Gestión segura de sesiones | https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html |
| **OWASP Authentication** | Mejores prácticas de autenticación | https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html |

## Auth0 (Proveedor de Identidad)

| Artículo | Descripción | URL |
|----------|-------------|-----|
| **Refresh Token Rotation** | Implementación de rotación de tokens | https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation |
| **Token Best Practices** | Mejores prácticas generales | https://auth0.com/docs/secure/tokens/token-best-practices |
| **Refresh Token Security** | Detección de robo y mitigaciones | https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/ |

## Artículos Técnicos

| Artículo | Autor/Fuente | URL |
|----------|--------------|-----|
| **The Ultimate Guide to JWT** | Cristian Bravo (SuperTokens) | https://supertokens.com/blog/what-is-jwt |
| **Why JWTs Are Bad for Sessions** | Randall Degges | https://developer.okta.com/blog/2017/08/17/why-jwts-suck-as-session-tokens |
| **Secure Token Storage** | OWASP | https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage |

## Documentación de Librerías

| Librería | Propósito | URL |
|----------|-----------|-----|
| **jsonwebtoken (npm)** | Implementación JWT para Node.js | https://github.com/auth0/node-jsonwebtoken |
| **ioredis** | Cliente Redis para Node.js | https://github.com/redis/ioredis |
| **bcrypt** | Hashing de contraseñas | https://github.com/kelektiv/node.bcrypt.js |

## Conceptos Específicos Implementados

| Concepto | Fuente Principal | Notas |
|----------|------------------|-------|
| **Token Blacklist con TTL** | Auth0 + Redis Best Practices | Patrón recomendado para invalidación de JWT stateless |
| **Refresh Token Rotation** | Auth0 Docs + RFC 6749 Section 10.4 | Estándar de la industria desde 2020 |
| **Token Family (familyId)** | Auth0 Refresh Token Rotation | Innovación de Auth0 para detección de robo |
| **Grace Period** | Auth0 Docs | Mitiga race conditions en aplicaciones multi-tab |
| **Security Flags** | OWASP Session Management | Patrón de "invalidación por timestamp" |
