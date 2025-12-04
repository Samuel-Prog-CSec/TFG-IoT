# Requisitos No Funcionales - Seguridad

## RNF-SEG: Seguridad del Sistema

---

## Autenticación (RNF-SEG-001 a RNF-SEG-006)

### RNF-SEG-001: Autenticación JWT ✅

**Descripción:** El sistema debe implementar autenticación basada en JWT con access y refresh tokens.

**Especificaciones:**

- Access token: Corta duración (15 minutos por defecto)
- Refresh token: Larga duración (30 días por defecto)
- Algoritmo: HS256
- Issuer: `rfid-games-platform`
- Audience: `rfid-games-client`

**Variables de Entorno:**

```env
JWT_SECRET=<secret-super-seguro>
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<refresh-secret-super-seguro>
JWT_REFRESH_EXPIRES_IN=30d
```

---

### RNF-SEG-002: Rotación de Tokens ✅

**Descripción:** Al refrescar un token, el refresh token anterior debe ser revocado.

**Criterios de Aceptación:**

- Cada refresh genera nuevo par de tokens
- Refresh token anterior añadido a blacklist
- Previene reutilización de tokens robados

---

### RNF-SEG-003: Device Fingerprinting ✅

**Descripción:** Los tokens deben estar vinculados al dispositivo/navegador.

**Criterios de Aceptación:**

- Fingerprint generado con: User-Agent, Accept-Language, Accept-Encoding
- Hash SHA256 del fingerprint embebido en el token
- Validación de fingerprint en cada request autenticada
- Rechazo si fingerprint no coincide

---

### RNF-SEG-004: Blacklist de Tokens ✅

**Descripción:** El sistema debe mantener una blacklist de tokens revocados.

**Criterios de Aceptación:**

- Almacenamiento en memoria (Map)
- Limpieza automática de tokens expirados (cada hora)
- Verificación en cada request autenticada
- TODO: Migrar a Redis para escalabilidad

---

### RNF-SEG-005: Encriptación de Contraseñas ✅

**Descripción:** Las contraseñas deben almacenarse encriptadas.

**Especificaciones:**

- Algoritmo: bcrypt
- Salt rounds: 10
- Nunca almacenar contraseñas en texto plano
- Comparación segura con `bcrypt.compare()`

---

### RNF-SEG-006: Bypass de Autenticación (Desarrollo) ✅

**Descripción:** Modo de desarrollo que permite bypass de autenticación para pruebas.

**Criterios de Aceptación:**

- Solo activo cuando `NODE_ENV=development` Y `AUTH_BYPASS_FOR_DEV=true`
- Warning en logs cuando está activo
- Usa mock user (primer profesor disponible)
- NUNCA debe activarse en producción

---

## Autorización (RNF-SEG-007 a RNF-SEG-009)

### RNF-SEG-007: Control de Acceso por Rol ✅

**Descripción:** El sistema debe implementar control de acceso basado en roles.

**Roles:**

- `teacher`: Acceso completo a la aplicación
- `student`: Solo puede jugar partidas asignadas (sin login)

**Middleware:** `requireRole(...allowedRoles)`

---

### RNF-SEG-008: Verificación de Propiedad ✅

**Descripción:** Los usuarios solo deben acceder a sus propios recursos.

**Criterios de Aceptación:**

- Profesores tienen acceso a todos los recursos
- Alumnos solo acceden a sus propias partidas
- Middleware `requireOwnership(resourceIdField)` para validación

---

### RNF-SEG-009: Autenticación Opcional ✅

**Descripción:** Algunas rutas deben permitir acceso público con comportamiento diferenciado si hay usuario.

**Criterios de Aceptación:**

- Middleware `optionalAuth` no falla si no hay token
- Si hay token válido, adjunta usuario a request
- Útil para endpoints públicos con features extra para usuarios autenticados

---

## Headers de Seguridad (RNF-SEG-010 a RNF-SEG-013)

### RNF-SEG-010: Helmet Security Headers ✅

**Descripción:** El servidor debe incluir headers de seguridad HTTP.

**Headers Configurados:**

- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS): 1 año
- X-Content-Type-Options: nosniff
- X-XSS-Protection: activado
- Referrer-Policy: strict-origin-when-cross-origin
- X-Frame-Options: DENY (via frameAncestors)

---

### RNF-SEG-011: Content Security Policy ✅

**Descripción:** CSP restrictivo para prevenir XSS y otras inyecciones.

**Directivas:**

```javascript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "https:", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "https:"],
  mediaSrc: ["'self'", "https:"],
  connectSrc: ["'self'", "https://api.sentry.io", SUPABASE_URL],
  frameAncestors: ["'none'"]
}
```

---

### RNF-SEG-012: CORS ✅

**Descripción:** El servidor debe implementar CORS con whitelist de orígenes.

**Criterios de Aceptación:**

- Whitelist dinámica configurable via CORS_WHITELIST
- Credentials habilitados para autenticación
- Métodos permitidos: GET, POST, PUT, DELETE, PATCH
- En producción: origin obligatorio
- En desarrollo: permitir requests sin origin (Postman, curl)

---

### RNF-SEG-013: Protección CSRF ✅

**Descripción:** Protección contra Cross-Site Request Forgery.

**Criterios de Aceptación:**

- Validación de header Referer/Origin
- Solo aplicado a métodos que modifican datos (POST, PUT, DELETE, PATCH)
- En producción: Referer obligatorio
- Verificación contra whitelist de CORS

---

## Rate Limiting (RNF-SEG-014 a RNF-SEG-018)

### RNF-SEG-014: Rate Limit Global ✅

**Descripción:** Límite global de requests para prevenir DoS.

**Configuración:**

- Window: 15 minutos
- Max requests: 100 por IP
- Aplicado a todas las rutas `/api/*`

---

### RNF-SEG-015: Rate Limit de Autenticación ✅

**Descripción:** Límite estricto en endpoints de autenticación.

**Configuración:**

- Window: 15 minutos
- Max intentos: 5
- Skip successful requests
- Previene ataques de fuerza bruta

---

### RNF-SEG-016: Rate Limit de Creación ✅

**Descripción:** Límite en operaciones de creación de recursos.

**Configuración:**

- Window: 1 minuto
- Max operaciones: 10
- Previene spam de sesiones/contextos

---

### RNF-SEG-017: Rate Limit de Eventos de Juego ✅

**Descripción:** Límite permisivo para eventos durante partidas.

**Configuración:**

- Window: 1 minuto
- Max eventos: 30
- Más permisivo para gameplay en tiempo real

---

### RNF-SEG-018: Rate Limit de Uploads ✅

**Descripción:** Límite estricto en subida de archivos.

**Configuración:**

- Window: 1 hora
- Max uploads: 20
- Previene abuso de almacenamiento

