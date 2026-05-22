# SECURITY.md — Política y arquitectura de seguridad

> Documento maestro consolidado tras T-905 (Sprint 6 + extensiones). Absorbe
> contenido previo de `Security_Maintenance.md`, `advanced_vulnerabilities.md`,
> `backend/docs/Seguridad_tokens_JWT.md` y `backend/docs/Security_Logging.md`.
>
> Cualquier nueva documentación de seguridad debe añadirse como sección numerada
> aquí, no como archivo nuevo separado (ver memoria `feedback-security-md-consolidated`).

---

## 1. Política de divulgación responsable

Si has detectado una vulnerabilidad en EduPlay RFID, **no la publiques** y avísanos primero:

- **Contacto:** samuel.blaper@gmail.com
- **Plazo de respuesta:** primer acuse < 72h; análisis + plan de mitigación < 30 días.
- **Período embargo:** 90 días desde el aviso hasta divulgación pública (negociable).
- **Scope cubierto:** backend, frontend, IoT firmware, infra Docker + workflows GitHub.
- **Fuera de scope:** vulnerabilidades en dependencias upstream (Mongoose, Express, helmet…) — esos hay que reportarlos al maintainer correspondiente. Aquí solo aceptamos issues sobre cómo las usamos.
- **Versiones soportadas:** `v0.5.x` (release actual) y posteriores. Versiones < 0.5 son CTF académico, no producción real.

| Versión | Soporte security |
|---------|------------------|
| ≥ 1.0.x | ✅ Activo |
| 0.5.x | ✅ Hasta GA de 1.0 |
| < 0.5.x | ❌ No soportado |

---

## 2. Modelo de amenazas (resumen)

### 2.1 Actores
- **Alumno (rol student):** sin login, juega vía sensor RFID. No puede usar la API REST directamente.
- **Docente (rol teacher):** login con email+password. Gestiona sus mazos, sesiones, contextos asignados.
- **Super admin (rol super_admin):** login + MFA TOTP (B7). Aprueba docentes, gestiona alumnos, ejecuta purgas RGPD.
- **Atacante externo:** internet público; objetivo típico = credenciales, datos de menores, escalada de rol.

### 2.2 Activos críticos
1. **Datos de menores** (nombre, classroom, age, scores). RGPD Art. 8 + LOPDGDD Art. 7.
2. **JWT access/refresh tokens.** Vector principal de session hijacking.
3. **MFA TOTP secrets** del super_admin.
4. **Supabase service_role key** (gestión de assets).
5. **Archivos subidos** (imágenes contextos, audios pronunciación).

### 2.3 Vectores conocidos y mitigaciones (ver sección 14)
| Vector | Mitigación |
|---|---|
| Algorithm confusion JWT | `algorithms: ['HS256']` whitelist (§4) |
| Credential stuffing distribuido | Account lockout per-email (§4.7) |
| NoSQL injection | `securityPayloadGuard` middleware (§9) |
| Prototype pollution | Rechazo `__proto__/constructor/prototype` (§9) |
| Open redirect | Whitelist `isSafeRedirectPath` (§7) |
| Cross-site scripting | CSP strict + cero `dangerouslySetInnerHTML` (§6) |
| CSRF | Double-submit cookie + Referer check (§7) |
| Replay del UID RFID | HMAC + counter monotónico EEPROM (§13) |
| File upload spoofing | Magic bytes middleware (§9.4) |
| Brute-force login | Rate limit IP + lockout email + CAPTCHA tras 3 fallos (§8) |
| Data leak por cache | `Cache-Control: no-store` global `/api/*` (§10.3) |

---

## 3. Arquitectura de seguridad — capas

```
Internet
   │
   ▼ TLS termination + DDoS edge
[Cloudflare] (futuro: WAF + rate limit edge)
   │
   ▼
[Nginx] (limit_req zone, security headers, CSP)
   │
   ▼
[Express backend Koyeb]
   ├── trust proxy = 1
   ├── helmet (CSP strict, HSTS preload, frame-ancestors none)
   ├── CORS whitelist dinámico
   ├── CSRF double-submit cookie (skip: login/register/refresh/csp-report)
   ├── noStoreSensitive — Cache-Control anti-leak
   ├── securityPayloadGuard — bloquea $/__proto__
   ├── rate limiters (global + auth strict/loose + create + upload + event)
   ├── authenticate (JWT + fingerprint + single-session)
   ├── requireRole + requireOwnership + requireMfa
   ├── validateBody/Query/Params (Zod)
   └── controllers → services → repositories
       │
       ├── MongoDB Atlas (TLS, queries parametrizadas Mongoose)
       ├── Redis Upstash (TLS, blacklist + lockout + cache + counters)
       └── Supabase Storage (service_role server-side, path determinista)
```

Frontend SPA (React + Vite) corre detrás de Cloudflare → Nginx (en frontend container). El backend Koyeb es directo (sin Nginx propio en backend container).

---

## 4. Autenticación y JWT (T-905 B1)

### 4.1 Tokens
- **Access token JWT HS256**, 15min TTL, firmado con `JWT_SECRET` (≥64 chars hex, entropía Shannon ≥3.5).
- **Refresh token JWT HS256**, 7 días TTL, firmado con `JWT_REFRESH_SECRET` (distinto del access).
- **MFA token JWT HS256**, 5 min TTL, firmado con `JWT_MFA_SECRET`. Solo emitido tras challenge TOTP exitoso (§4.8).

### 4.2 Algorithms whitelist
`jwt.verify` se invoca con `algorithms: ['HS256']` explícito. Bloquea:
- `alg: none` (forjado trivial).
- Algorithm confusion HS↔RS (si añadiéramos RS256 en futuro, un atacante con la pubkey podría firmar tokens HS256 que `jwt.verify` aceptaría — `algorithms: ['HS256']` exclusivo lo previene).

### 4.3 Strict claims
Cada `verifyAccessToken`/`verifyRefreshToken`:
- Valida `algorithms: ['HS256']`.
- Valida `issuer: 'rfid-games-platform'` + `audience: 'rfid-games-client'`.
- Rechaza tokens sin `jti` (necesario para blacklist Redis).
- Rechaza tokens sin `iat` o con `iat` en el futuro (>5s tolerance).
- `clockTolerance: 0` — sin clock skew.

### 4.4 Validación de secrets en boot
`envValidator.validateJWTSecrets()` exige:
- Longitud ≥ 64 chars.
- Entropía Shannon ≥ 3.5 bits/char (rechaza `aaaaaa…`).
- JWT_SECRET ≠ JWT_REFRESH_SECRET (fail-fast strict).
- No coincide con defaults inseguros conocidos.

### 4.5 Token rotation + theft detection
- Cada refresh rota access+refresh. El refresh anterior queda marcado `USED` con TTL = grace period (10s).
- Si el token marcado `USED` se intenta reusar **fuera del grace period** → `revokeAllUserTokens(userId)`. Pone flag `SECURITY:<userId>` en Redis con timestamp; cualquier token con `iat * 1000 + 1000 < flagTime` es revocado.
- Familia (`familyId`) compartida entre rotaciones consecutivas para trazabilidad.

### 4.6 Single session + fingerprint
- `currentSessionId` por usuario en Mongo. Login nuevo regenera el sid → tokens antiguos quedan inválidos al verificar mismatch.
- `device fingerprint` SHA256(UA + Accept-Language + Accept-Encoding). Embebido en JWT (`fp` claim). Si cambia, token rechazado.
- Limitación documentada: si el navegador actualiza UA → fingerprint cambia → re-login forzado. Aceptable.

### 4.7 Account lockout per-user (B1)
- `accountLockoutService` keya por email (lowercase). INCR contador con TTL window 15min. Si ≥5 fallos → SET lockout key TTL 15min.
- Mensaje genérico "Credenciales inválidas" — NO diferenciar bloqueado vs invalid (anti-enumeración).
- Fail-open: si Redis cae, los logins fluyen normalmente.
- Endpoint super_admin: `POST /api/admin/lockouts/unlock` con `requireMfa`.

### 4.8 MFA TOTP super_admin (B7)
- Algoritmo: RFC 6238 SHA1, 6 dígitos, period 30s, window ±1 step.
- Implementación: `backend/src/utils/totp.js` (sin deps externas, evita ESM issues).
- Secret base32 cifrado AES-256-GCM (`encryptField`, AAD `'mfa'`) con `MFA_ENCRYPTION_KEY`.
- 8 backup codes formato `XXXX-XXXX-XXXX-XXXX` hex, single-use, hash bcrypt.
- Aplicado en `requireMfa` middleware sobre endpoints destructivos: hard delete users, GDPR purge, admin lockouts.
- Frontend: `pages/admin/MfaSetup.jsx` (wizard QR + verify + backup codes) + `components/auth/MfaChallengeModal.jsx`.
- Emergency: env `MFA_EMERGENCY_DISABLE_USER_ID` + redeploy si super_admin pierde phone + backup codes.

### 4.9 Decisión HS256 vs RS256
- **HS256 actual** es adecuado: 1 servicio firma + verifica, secret no se distribuye.
- **RS256 sería preferible** si: múltiples servicios verifican (no aplica), pubkey en cliente (no aplica), key rotation continuo (real pero gestionable con HS256+despliegues).
- **Decisión:** mantener HS256 hasta v1.0. Evaluar RS256 + JWKS endpoint en v2 si aparece segundo servicio.

---

## 5. Autorización y RBAC

### 5.1 Roles
`teacher | student | super_admin`. Definidos en `constants/enums.js`. Validados en cada `requireRole(...)`.

### 5.2 Ownership helpers (centralizados)
`utils/ownershipHelpers.js`:
- `ensureResourceOwnership(entity, userId, name)`: solo creador.
- `ensureResourceOwnershipOrAdmin(entity, user, name)`: creador O super_admin.
- `ensureStudentBelongsToTeacher(studentId, user, userRepo)`: cross-teacher students.

### 5.3 IDOR prevention pattern
Toda query a recursos teacher-scoped incluye `baseFilter: { createdBy: req.user._id }` automático vía `filterBuilder`.

---

## 6. Headers de seguridad y CSP (T-905 B5)

### 6.1 Helmet split dev/prod (`buildHelmetOptions(env)` en `backend/src/config/security.js`)

**Producción** (CSP strict):
- `scriptSrc 'self' https://*.sentry.io https://challenges.cloudflare.com`
- `styleSrc 'self' 'unsafe-inline' https://fonts.googleapis.com` (compromiso Tailwind v4 + Framer Motion documentado)
- `connectSrc 'self' https://*.sentry.io https://challenges.cloudflare.com wss://${WSS_DOMAIN}`
- `imgSrc 'self' data: https://*.supabase.co`
- `mediaSrc 'self' https://*.supabase.co`
- `frameAncestors 'none'`, `formAction 'self'`, `baseUri 'self'`, `scriptSrcAttr 'none'`
- `upgradeInsecureRequests []`
- `reportUri /api/csp-report`
- HSTS: `maxAge: 63072000, includeSubDomains, preload` (apto para hstspreload.org tras 2 sem en staging)

**Desarrollo** (relajado):
- `connectSrc` incluye `ws:/wss:` para Vite HMR.
- HSTS más corto (1 año) — no compromete preload futuro.
- Sin `upgradeInsecureRequests` (servidor en HTTP local).

### 6.2 CSP_REPORT_ONLY (deploy gradual)
Env `CSP_REPORT_ONLY=true` activa modo Report-Only. Política: deploy primero a staging en Report-Only durante 1 semana, recoger violaciones, ajustar, cambiar a enforce.

### 6.3 Endpoint /api/csp-report
- Recibe POST `application/csp-report` o `application/reports+json`.
- Skip paths CSRF + auth (browser envía sin cookies).
- Loguea Pino `warn` + Sentry `csp_violation` tag.
- Rate limit dedicado.

### 6.4 Nginx headers (frontend container)
Sincronizados con backend CSP. Incluyen `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy: camera=() microphone=() geolocation=() payment=() usb=(self)`, HSTS preload.

---

## 7. CORS y CSRF

### 7.1 CORS
Whitelist dinámico desde `CORS_WHITELIST` env (split por coma). En prod FALLA-FAST si solo `localhost`. Validación adicional del header `Referer/Origin` contra whitelist en `csrfProtection`. Métodos: GET/POST/PUT/DELETE/PATCH. Headers: Content-Type, Authorization, X-CSRF-Token, X-MFA-Token (B7).

### 7.2 CSRF double-submit cookie
- Cookie `csrfToken` (UUID v4, `httpOnly: false`, `sameSite: strict` en prod, `secure: prod`).
- Header `X-CSRF-Token` debe coincidir.
- Aplicado a POST/PUT/PATCH/DELETE. Skip paths: `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/csp-report` (B5).
- En tests (`NODE_ENV=test`) desactivado para no romper supertest.

### 7.3 Open redirect prevention (B6)
`frontend/src/constants/routes.js` exporta `isSafeRedirectPath(path)`:
- Rechaza schemes peligrosos (`javascript:`, `data:`, `file:`, `vbscript:`, `about:`).
- Rechaza URLs protocol-relative (`//evil.com`, `\\evil`).
- Whitelist positiva de prefijos: `/dashboard`, `/sessions`, `/decks`, `/admin`, etc.
- Usado en `AuthContext.redirectByRole` para sanitizar `?from=…`.

---

## 8. Rate limiting y abuse prevention

### 8.1 Capas
1. **Cloudflare (futuro):** WAF + rate limit edge planificado en T-907.
2. **Nginx (frontend container, T-905 B4):** `limit_req_zone api_limit 20r/s burst=40` para `/api/*`; `ws_limit 10r/s burst=20` para `/socket.io/*`.
3. **Express express-rate-limit:** 8 limiters distintos (T-905 B4 recalibrados).
4. **Socket.IO Lua+ZSET distribuido:** ADR-072.
5. **Account lockout per-user (B1):** §4.7.
6. **CAPTCHA Turnstile tras 3 fallos (B6):** §8.3.

### 8.2 Valores HTTP rate limiters (prod / dev)
| Limiter | Window | Max prod | Max dev | Skip success | Key |
|---|---|---|---|---|---|
| global | 15min | 1000 | 2000 | no | IP |
| auth (login/register) | 15min | 5 | 400 | sí | IP |
| authLoose (refresh/me) | 15min | 20 | 2000 | no | userOrIp |
| register | 1h | 3 | 50 | no | IP |
| create | 1h | 50 | 500 | no | userOrIp |
| event (game) | 1min | 120 | 120 | no | IP |
| analytics | 1min | 30 | 200 | no | IP |
| upload | 1h | 20 | 20 | no | IP |
| export (GDPR) | 1min | 1 | 1 | no | userOrIp |
| **admin_approval (ADR-164)** | **1h** | **100** | **1000** | **no** | **userOrIp** |

**admin_approval** (Sprint 0 pre-v1.0.0, M7): aplicado a `POST /api/admin/users/:id/approve` y `/reject`. Defense-in-depth ante un super_admin comprometido que automatice aprobaciones en lote o un bug de UI que dispare bucles. 100 acciones/hora cubre cualquier caso real. Variable env `RATE_LIMIT_ADMIN_APPROVAL_MAX` lo permite tunear.

### 8.3 CAPTCHA Cloudflare Turnstile (B6 — completo)
- Activación opt-in: si `TURNSTILE_SECRET` está set Y `accountLockoutService.getFailureCount(email) >= 3` → backend exige `captchaToken` en body de login.
- Frontend: widget `react-turnstile` se renderiza cuando `rateLimitState.attempts >= 3 && VITE_TURNSTILE_SITEKEY` está set. El botón submit queda disabled hasta resolver el widget. Token one-shot — se resetea tras cada submit (éxito o fallo) o expiración Cloudflare. Manejo de `onVerify`/`onExpire`/`onError` para mantener consistencia.
- Verificación backend: POST a `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Fail-closed (network error → rechazo).
- Si `TURNSTILE_SECRET`/`VITE_TURNSTILE_SITEKEY` no están set (típico en dev) → ni backend ni frontend lo activan. No bloquea desarrollo.
- Tests: `backend/tests/security/turnstileGuard.test.js` cubre 6 escenarios (off, threshold, válido, inválido, fail-closed, fields missing).

### 8.4 WebSocket rate limits (B4)
- `socketRateLimits.rfid_scan_from_client: 60/min` (era 2/3s, restrictivo).
- `start_play 1/s`, `pause/resume 2/s`, `next_round 5/s`.
- Dedupe RFID: 1200ms `web_serial`, 250ms `touch_fallback/touch_memory_flip`.

---

## 9. Validación de entrada y NoSQL injection

### 9.1 Zod en frontera
11 validators en `backend/src/validators/`. Middlewares `validateBody/Query/Params` aplicados antes de controllers. Schemas compartidos consolidados en `commonValidator.js` (ADR-164, A6): `cardMappingSchema` se exporta desde aquí y `cardDeckValidator`/`gameSessionValidator` lo reusan. DRY estricto evita drift entre validadores que comparten estructura.

### 9.2 `securityPayloadGuard` middleware
`utils/payloadSecurity.findDangerousPayloadPath` rechaza payloads con:
- Keys empezando por `$` (operadores Mongo: `$ne`, `$gt`, `$where`…).
- Keys `__proto__`, `prototype`, `constructor` (prototype pollution).
- Aplicado globalmente a body/query/params via `app.use(securityPayloadGuard)`.

### 9.3 NoSQL queries
`filterBuilder.js` construye operadores Mongo (`$or`, `$gte`, `$lte`) desde config mapping, NO desde input usuario directo. Mongoose typing rechaza casts inválidos.

**Integridad referencial de cardMappings (ADR-164, A5):** `GameSession.cardMappings` ahora tiene path validator que rechaza UIDs duplicados (espejo del validator existente en `CardDeck`). Cubre el flanco residual donde un actor bypasa Zod (seed manual, migraciones directas) e intenta persistir un documento con la misma tarjeta asignada a dos valores distintos del contexto.

### 9.4 Sanitización Unicode + límites de longitud (ADR-164, A4)
Helper `sanitizedString({min,max,label,allowMultiline})` en `commonValidator.js`. Aplicado a campos user-facing renderizados en la UI:
- **Contextos / mazos**: `name`, `description`, `display`, `value` (asset), `assignedValue` (cardMappings).
- **Sesiones**: `name`, `sensorId`, `promptText` (associationChallengePlan), `assignedValue` (boardLayout / sequencePlan).
- **Usuarios**: `name` (teacher/student), `grantedBy` (consent), `newClassroom`, `reason` (transferStudent).
- **Anuncios super_admin**: `title`, `body`, `linkLabel`.

**Caracteres rechazados:**
- Zero-width: `U+200B` (ZWSP), `U+200C` (ZWNJ), `U+200D` (ZWJ), `U+FEFF` (BOM), `U+2060-2064` (WJ + invisible math).
- Direccionales (RTL/LTR override): `U+200E` (LRM), `U+200F` (RLM), `U+202A-202E` (LRE/RLE/PDF/LRO/**RLO**), `U+2066-2069` (LRI/RLI/FSI/PDI).
- Separadores invisibles: `U+2028` (LS), `U+2029` (PS).
- Caracteres de control ASCII `\x00-\x1F\x7F`; modo `allowMultiline=true` permite `\t \n \r`.

**Motivación:** ataques de homógrafo, falsificación visual de nombres en listados ("María<U+202E>evad" se renderiza como "MaríadaveU+202E"), rotura de layout por payload abusivo (10K caracteres en `displayName`). CSP+React mitigan XSS clásico pero no estos vectores semánticos. Implementación con `Set<number>` de codepoints + función `containsInvisibleUnicode(str)` — evita literales regex con caracteres invisibles que rompen el parser.

**Tests:** validan que valores con cada categoría son rechazados con error 400 + mensaje en español ("X contiene caracteres invisibles o direccionales no permitidos"). Verificado E2E enviando `POST /api/contexts {displayName: "test<U+202E>evil"}` → 400.

### 9.5 File upload validation (B3)
- Multer `limits.fileSize`: 8MB imágenes, 5MB audio.
- Multer `fileFilter` por MIME declarado.
- **B3 nuevo:** middleware `validateImageMagicBytes` + `validateAudioMagicBytes` (en `middlewares/fileValidation.js`) detecta magic bytes propios (PNG, JPEG, GIF, WebP, MP3 ID3+sync, OGG, WAV) sin libs externas (file-type@22 es ESM-only). Aplicado en routes `/contexts/:id/images`, `/contexts/:id/audio`, `/contexts/:id/assets/:assetKey/audio`.

---

## 10. Cifrado y protección de datos (T-905 B2)

### 10.1 `cryptoUtils.js` AES-256-GCM
- `encryptField(plaintext, aad?)` → envoltorio `iv:tag:ciphertext` hex.
- `decryptField(envelope, aad?)` con verificación auth tag.
- AAD para domain separation (ej. `'mfa'` para MFA secrets).
- IV aleatorio 96 bits + auth tag 128 bits.
- `cryptoShred(buffer)` sobreescribe in-place con random+zeros.
- Clave maestra: `MFA_ENCRYPTION_KEY` env (32 bytes hex). En dev/test deriva de `JWT_SECRET` automáticamente. En prod es OBLIGATORIA.

### 10.2 Uso actual
- MFA TOTP secret (B7).
- Reservado para futuro: campos adicionales sensibles si se identifican.

### 10.3 Cache-Control anti-leak (B2)
Middleware `noStoreSensitive` aplicado globalmente a `/api/*`:
```
Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
Surrogate-Control: no-store
```
Defensa contra Cloudflare edge cache y proxies intermedios cacheando respuestas con PII de menores.

### 10.4 DTO output sanitization audit (B2 + ADR-164)
Test sistemático `dtoOutputSanitization.test.js` verifica que DTOs NUNCA exponen:
- `password`, `passwordHash`, `__v`, `_internal`, `currentSessionId`
- `mfa.secret`, `mfa.backupCodes`
- `consent.ipAddress`, `consent.userAgent`, `consent.channel`

**ADR-164 amplía cobertura a:** `toGamePlayDTOV1`, `toGamePlayDetailDTOV1`, `toGameSessionDTOV1`, `toGameSessionDetailDTOV1`, `toGameSessionListDTOV1`, `toCardDeckDTOV1`, `toCardDeckDetailDTOV1`, `toGameContextDTOV1`, `toSystemMetricsDTOV1`. Cada uno valida que campos artificiales como `_internal`, `__v` o `password` (inyectados en el mock) NO aparecen en la salida del serializador. Red de seguridad ante regresiones al editar `utils/dtos.js`.

### 10.5 GDPR export
Endpoint `GET /api/users/:id/export` (rate limit 1/min) devuelve datos del propio usuario o de menores bajo su tutela. Verificado: no leak cross-user (test `gdprExportSanitization` cubierto via dtoOutputSanitization).

### 10.6 Crypto-shred policy
Hard delete usa `dataRetention.js` + `User.deleteOne`. En MongoDB el espacio queda físicamente hasta compactación (`db.runCommand({compact: 'users'})`). **Plan operativo:** job BullMQ mensual ejecuta compact en colecciones con muchos hard deletes — diferido a Sprint 7.

---

## 11. Logging y monitoreo

### 11.1 Pino redact (T-905 B2 reforzado)
`backend/src/utils/logger.js` redacta:
- Headers: `authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-mfa-token`.
- Body: `password`, `currentPassword`, `newPassword`, `token`, `accessToken`, `refreshToken`, `captchaToken`, `code`, `backupCode`, `mfa`.
- User: `password`, `email`, `mfa`, `mfa.secret`, `mfa.backupCodes`.
- Globales: `token`, `accessToken`, `refreshToken`, `authorization`, `mfaSecret`, `backupCodes`.

### 11.2 `securityLogger` eventos centralizados (`utils/securityLogger.js`)
Enum exhaustivo de eventos: `AUTH_LOGIN_SUCCESS/FAILED`, `AUTH_TOKEN_THEFT_DETECTED`, `AUTH_ACCOUNT_LOCKED` (B1), `AUTHZ_ACCESS_DENIED`, `DATA_HARD_DELETE`, `SECURITY_RFID_EVENT_INVALID`, `WS_AUTH_FAILED`, etc.

Cada evento tiene `level`, `message`, opcionalmente `sentry: { threshold, windowMs, level, immediate }` para escalado.

`sanitizeValue` recursivo redacta `studentName`, `playerName`, `classroom` (quasi-identificadores).

### 11.3 Sentry beforeSend hardening (B2)
`config/sentry.js` filtra antes de enviar:
- Cookies, body data con keys sensibles, headers auth/CSRF/MFA.
- Query strings con `token|code|secret`.
- Contexts/user/breadcrumbs/extras/tags con keys PII (studentName, mfa, etc.).
- `event.contexts.user.email` removido (RGPD Sentry como procesador internacional).

### 11.4 Health endpoints sanitization (B3)
`/api/health` en producción NO devuelve `host` ni `database` name de Mongo (revela infra). En dev/staging sí, útil para diagnóstico.

---

## 12. Protección de datos de menores (RGPD/LOPDGDD)

Resumen — detalle legal completo en [`Proteccion_Datos_Menores.md`](Proteccion_Datos_Menores.md).

- **Consentimiento parental obligatorio** (Art. 8 RGPD + LOPDGDD Art. 7): User.consent.granted=true mandatorio para crear estudiantes.
- **Minimización (Art. 5.1.c):** birthdate ELIMINADO del modelo Student. Solo se almacena `profile.age` (entero, sin DOB).
- **Retención + anonimización (Art. 5.1.e):** `dataRetention.js` ejecuta política via BullMQ job mensual. Gameplay > 12 meses → playerId+cardUid anulados. Estudiantes inactivos > 24 meses → hard delete.
- **k-anonimidad ≥5:** analytics no devuelven datos por grupo < 5 alumnos.
- **Derecho al olvido (Art. 17):** endpoint `DELETE /api/users/:id/data` con `requireMfa` (B7) + `hardDeleteSchema` exigiendo `confirmDeletion: true`.
- **Derecho de acceso (Art. 20):** export endpoint, rate limit 1/min.

---

## 13. RFID protocol + HMAC validation (T-905 B8)

### 13.1 Protocolo serial firmware → frontend
Firmware ESP8266 envía JSON line-delimited al puerto serie:
```
{"event":"card_detected","uid":"AABBCCDD","type":"MIFARE_1KB","size":4,"counter":N,"hmac":"..."}
{"event":"card_removed","uid":"AABBCCDD"}
{"event":"init","status":"success","version":"0x..","hmac":"enabled","counter":N}
{"event":"status","uptime":...,"cards_detected":...,"free_heap":...,"counter":N}
```

### 13.2 HMAC + counter monotónico (B8)
- Secret compartido: `RFID_HMAC_SECRET` (32 bytes hex). Firmware lo recibe en build-time via `-DRFID_HMAC_SECRET="..."`. Backend lo lee de env.
- HMAC-SHA256(secret, `uid:counter`) en hex. Implementado en firmware con BearSSL (incluido en framework Arduino ESP8266, sin libs extra).
- Counter monotónico EEPROM offset 0..3 (uint32 LE). Persistencia BATCHED cada 100 scans con counter "reservado" (mitiga wear-out 100k ciclos).
- Backend `utils/rfidHmacValidator.js`:
  - Si `RFID_HMAC_ENABLED=false` (default migración) → siempre `valid:true`, métrica observada.
  - Si `true` → recalcula HMAC con `crypto.timingSafeEqual`. Anti-replay: counter debe ser estrictamente mayor que `rfid:counter:<sensorId>` en Redis.
- Integrado en `socketHandlers.handleRfidScanFromClient` antes de procesar evento.

### 13.3 Migración gradual
- Estado actual: flag `RFID_HMAC_ENABLED=false`. Firmware nuevo manda HMAC, viejo no.
- Métrica `rfidHmacObserved` (peek/drain) cuenta `valid/invalid/absent/replay` para medir adopción.
- Activar `RFID_HMAC_ENABLED=true` tras 100% adopción confirmada.

### 13.4 Provisionado del secret
1. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → genera secret.
2. Backend Koyeb: añadir env var `RFID_HMAC_SECRET=<secret>`.
3. PlatformIO build: `RFID_HMAC_SECRET=<secret> pio run --target upload` (variable inyectada vía build_flags en `rfid_scanner/platformio.ini`).
4. Cuando todos los sensores estén actualizados: `RFID_HMAC_ENABLED=true` en backend + redeploy.

### 13.5 RFID mode mutex con timeout duro (ADR-164, C1)
`executeWithRfidLock(userId, operation)` en `realtime/socketHandlers.js` serializa operaciones RFID por usuario. **Antes:** una operación colgada (Mongo lento, Redis bloqueado, deadlock) dejaba `releaseLock` sin invocarse y la cola del usuario esperaba indefinidamente; el socket RFID moría en silencio.

**Ahora:** `Promise.race([operation(), timeoutPromise(RFID_OPERATION_TIMEOUT_MS=10s)])`. En timeout:
1. Libera lock para que la siguiente operación pueda arrancar.
2. Incrementa `runtimeMetrics.websocket.rfidLockTimeouts`.
3. Registra `SECURITY_EVENT('RFID_LOCK_TIMEOUT')` con threshold Sentry 3/min (configurado en `securityLogger.SECURITY_EVENTS`).
4. Emite `rfid_mode_error` al room `user_${userId}` con copy en español: "La operación RFID tardó demasiado y se ha cancelado. Vuelve a intentarlo."
5. El caller recibe `Error{code:'RFID_LOCK_TIMEOUT'}` y lo propaga al try/catch genérico del comando socket.

**Env var configurable:** `RFID_OPERATION_TIMEOUT_MS=10000`. En QA permite simular timeouts más cortos para validar el flujo.

**Mitigación:** una espiga en `rfidLockTimeouts` revela degradación de Mongo/Redis antes de que afecte UX masivamente. Combinado con el slow-query log de `gamePlayRepository.aggregate` (ADR-164, M1) y el circuit breaker Redis, da observabilidad fina del pipeline RFID.

---

## 14. Vulnerabilidades avanzadas y mitigaciones

Resumen tras T-905. El proyecto cubre actualmente:

| Vector | Estado | Referencia |
|---|---|---|
| Algorithm confusion / `alg:none` JWT | ✅ Whitelist HS256 | §4.2 |
| JWT secret entropy débil | ✅ Validación 64ch + Shannon ≥3.5 | §4.4 |
| Token theft (refresh reuse) | ✅ Family + flag SECURITY | §4.5 |
| Single session bypass | ✅ `currentSessionId` enforcement | §4.6 |
| Credential stuffing distribuido | ✅ Lockout per-email | §4.7 |
| Brute-force login | ✅ Rate limit IP + CAPTCHA | §8 |
| NoSQL injection | ✅ securityPayloadGuard + Zod | §9.2 |
| Prototype pollution | ✅ rechazo `__proto__/constructor/prototype` | §9.2 + test `nosqlInjection.test.js` |
| Open redirect | ✅ whitelist positiva | §7.3 |
| CSRF | ✅ double-submit cookie + Referer | §7.2 |
| XSS DOM (innerHTML/eval) | ✅ cero usos verificado | auditoría B0 |
| XSS reflected query params | ✅ CSP strict + JSON API | §6 |
| Clickjacking | ✅ `frameAncestors none` | §6 |
| File upload MIME spoofing | ✅ magic bytes middleware | §9.4 |
| Path traversal upload | ✅ Supabase + key sanitization | §9.4 |
| SSRF | ✅ no backend hace requests con URL user-controlled | review |
| CORS misconfig | ✅ whitelist dinámico + Referer check | §7.1 |
| Cache leak Cloudflare | ✅ Cache-Control no-store global /api | §10.3 |
| MFA bypass | ✅ requireMfa middleware + emergency disable | §4.8 |
| Unicode homograph + RTL spoofing | ✅ `sanitizedString` rechaza invisibles/direccionales (ADR-164) | §9.4 |
| RFID socket starvation por lock colgado | ✅ `Promise.race(timeout)` + `rfidLockTimeouts` (ADR-164) | §13.5 |
| Admin mass approval abuse | ✅ `adminApprovalRateLimiter` 100/h (ADR-164) | §8.2 |
| Inconsistent `cardMappings` (UID duplicate bypass Zod) | ✅ Mongoose path validator (ADR-164) | §9.3 |
| RFID replay | ✅ HMAC + counter EEPROM | §13.2 |
| Race conditions auth | ✅ mutex Redis card locks + grace period rotation | ADR-072 |
| GDPR data leak (Sentry) | ✅ beforeSend redact | §11.3 |
| Health endpoint info leak | ✅ host/db gateados en prod | §11.4 |
| Logs PII leak | ✅ Pino redact comprehensive | §11.1 |
| DTO sensitive fields leak | ✅ audit sistemático test | §10.4 |

Tests adversariales en `backend/tests/security/`: jwtHardening, accountLockout, cryptoUtils, dtoOutputSanitization, cachePolicy, fileValidationMiddleware, cspReport, securityHeaders, mfaController, requireMfa, turnstileGuard, rfidHmacValidator, nosqlInjection, csrfBypass, rateLimitConfigs.

---

## 15. Suite de tests de seguridad

### 15.1 Estructura
`backend/tests/security/*.test.js` — 14 archivos, ~140 tests cubriendo:
- Hardening JWT (alg whitelist, claims strict, entropy validation).
- Account lockout (sliding window, lockout, unlock admin).
- Cifrado AES-256-GCM (round-trip, AAD, IV uniqueness, tampering).
- DTO output sanitization (audit defensivo).
- Cache-Control aplicado a rutas correctas.
- File validation magic bytes (PNG, JPEG, GIF, WebP, MP3, OGG, WAV; rechazo PDF disfrazado).
- CSP report endpoint.
- Security headers buildHelmetOptions dev vs prod.
- MFA setup/verify/challenge/backup codes (single-use).
- requireMfa middleware (token required, expired, mismatch).
- Turnstile guard (off, threshold, valid, invalid, fail-closed).
- RFID HMAC validation (off, on, replay, missing fields).
- NoSQL injection prevention (operadores `$`, prototype pollution).
- CSRF skip paths.
- Rate limit configs verificados contra valores T-905.

### 15.2 Cómo correr
```bash
cd backend
npm test -- --testPathPatterns=security
```

### 15.3 Agregar tests nuevos
1. Crear `backend/tests/security/<area>.test.js`.
2. Importar `request` (supertest), `app` desde `../../src/server`, `connectRedis` si hace falta Redis-state.
3. Patrón `beforeAll/beforeEach`: limpiar Mongo + flushNamespace de Redis namespaces afectados.
4. Tests adversariales: simular el ataque, validar que el backend rechaza con status correcto.

---

## 16. Procedimientos operativos

### 16.1 Setup MFA super_admin (B7)
1. Login normal en `/login`.
2. Navegar a `/admin/mfa-setup`.
3. Botón "Empezar configuración" → backend genera secret pendiente (TTL 5min en Redis).
4. Escanear QR con Google Authenticator / Authy / Microsoft Authenticator. O introducir manualmente el secret base32.
5. Introducir código de 6 dígitos → backend persiste `mfa.enabled=true`, devuelve 8 backup codes.
6. Descargar backup codes como `.txt` (botón). Guardar en lugar seguro físico Y password manager.
7. Confirmar "He guardado los códigos" → sesión cerrada automáticamente.
8. Re-login → cualquier acción crítica abrirá modal MFA Challenge.

### 16.2 MFA recovery (perdió phone)
1. Usar uno de los 8 backup codes en el modal challenge (botón "Usar código de respaldo").
2. Cada código es single-use. Tras consumir varios, regenerar con `POST /api/auth/mfa/backup-codes/regenerate` (requiere MFA reciente).
3. Si perdió phone + todos los backup codes:
   - Configurar env `MFA_EMERGENCY_DISABLE_USER_ID=<userId>` en backend Koyeb.
   - Redesplegar — al arrancar el server resetea `mfa.enabled=false` para ese user.
   - Login normal, re-setup MFA, **quitar** la env var y redesplegar (cerrar la puerta).

### 16.3 OWASP ZAP scan
**Workflow CI:**
- `Actions` → `OWASP ZAP Baseline Scan` → `Run workflow` → introducir `target_url` (default staging).
- Espera 5-15min.
- Artifact `zap-scan-report-<run_id>` descargable con HTML/JSON/MD.

**Ejecución local con Docker:**
```bash
docker compose up -d
docker run --rm -v "$(pwd)/zap-report:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://host.docker.internal:80 -r report.html
```

**Triage:** revisar `report.html`. Falsos positivos esperados (silenciados en `.zap/rules.tsv`): cookie sin Secure (localhost HTTP), Permissions-Policy missing en dev, etc. Findings reales → crear issue + ticket Sprint.

### 16.4 Account lockout management
**Inspeccionar lockouts activos en Redis (Upstash / local):**
```
KEYS rfid-games:auth:lock:*
GET rfid-games:auth:lock:user@example.com
```

**Desbloquear:** `POST /api/admin/lockouts/unlock` (super_admin + MFA) con body `{ "email": "user@example.com" }`.

### 16.5 CSP violations triage
1. Sentry: filtrar por tag `type:csp_violation`.
2. O bien logs Pino: `cspViolation:true`.
3. Si el blocked-uri es legítimo (ej. nueva CDN aprobada) → añadir a `connectSrc`/`scriptSrc`/etc. en `buildHelmetOptions` prod.
4. Si es ataque → mantener bloqueo. Documentar pattern en sección 14.

### 16.6 Sentry incident response
- Eventos `AUTH_TOKEN_THEFT_DETECTED` → revisar usuario afectado. Forzar logout global con `revokeAllUserTokens(userId)` desde CLI Mongo si Sentry no lo hace automáticamente.
- Eventos `AUTH_ACCOUNT_LOCKED` con threshold 3 → potencial credential stuffing distribuido. Notificar al super_admin.
- Eventos `SECURITY_RFID_EVENT_INVALID` con `reason:COUNTER_REPLAY` → sensor potencialmente clonado o atacante. Investigar `sensorId`.

### 16.7 Mantenimiento periódico
| Frecuencia | Tarea | Responsable |
|---|---|---|
| Semanal | `npm run audit:prod` backend + frontend | dev |
| Mensual | Dependabot PRs review (rama `develop`) | dev |
| Mensual | OWASP ZAP scan via workflow | dev / sysadmin |
| Mensual | Drill restore backups MongoDB (futuro T-906) | sysadmin |
| 90 días | Rotación JWT_SECRET + JWT_REFRESH_SECRET | sysadmin |
| Anual | Rotación SUPABASE_SERVICE_KEY, MFA_ENCRYPTION_KEY, JWT_MFA_SECRET | sysadmin |
| On-incident | Rotación de secrets afectados + revoke all tokens | sysadmin |

### 16.8 QA E2E con sensor RFID simulado (T-905 B11)

**Contexto:** el sensor físico ESP8266+RC522 está fuera de servicio. La validación end-to-end del flow RFID se hace con:
- `window.__rfidSim` (frontend) — helper inyectado en `webSerialService.js` cuando `NODE_ENV !== 'production'`.
- `backend/scripts/simulate-rfid-hmac.js` (futuro, B11 deuda) — para probar HMAC enforcement.

**Procedimiento manual:**

1. Levantar stack: `docker compose up -d`.
2. Verificar: `curl http://localhost:5000/api/health/ready` debe devolver 200.
3. Abrir `http://localhost:5173` en navegador.
4. Login `maria@test.com / Test1234!`.
5. Crear sesión con timeLimit ≥ 120s (mascot/timing OK).
6. Entrar al GameLayout → DevTools console.
7. `window.__rfidSim.init()` → widget RFID muestra "Listo".
8. `window.__rfidSim.detect('AABBCCDD')` (UID válido del seed) por cada acción esperada.
9. Verificar:
   - Animación tap correcta (~1.5s tras detect en Asociación, ADR-113 grace para Secuencia).
   - Backend logs: `RFID_SCAN_PROCESSED` con userId.
   - Si `RFID_HMAC_ENABLED=true`: necesitarás generar HMAC client-side. Sin ese flag el flow legacy funciona.
10. Probar 3 mecánicas: Asociación, Memoria, Secuencia. Completar partida hasta GameOver.
11. Probar fallback táctil: sin `__rfidSim.init()`, debería aparecer `FallbackTouchPanel` → tap funciona igual.
12. Probar casos error: UID no en mazo (esperado: `wrong_answer` o equivalente). JSON malformado (Web Serial regex rechaza).

**Resultados documentados:** crear `documentation/QA_E2E_Sensor_Simulado_<fecha>.md` con tabla de casos ✅/❌ + capturas en `qa-capturas-t905/`.

**Ejecución completada 2026-05-17:** ver `documentation/QA_E2E_Sensor_Simulado_T905_2026_05_17.md`. Resultados resumidos:
- Asociación: ✅ 5/5 50pts (gameover capturado).
- Memoria: ✅ 6/6 parejas (gameover capturado).
- Secuencia: ⚠️ Sistema funciona, automation Playwright timing limitada en transiciones Memoriza→Reproduce. Validación con QA humano cubierta previamente (project_qa_2026_05_06.md).
- Sensor binding (B8) bloqueó correctamente scans cross-sensor — comportamiento esperado, workaround Mongo admin documentado.

### 16.9 Pipeline de seguridad en CI/CD

**Capas de defensa en el pipeline (`.github/workflows/`):**

| Workflow | Disparador | Bloqueo | Función |
|---|---|---|---|
| `build.yml` (Security Audit) | push + PR | Sí | `npm audit --omit=dev` con allowlist de GHSAs no alcanzables (`audit-with-exclusions.js`). |
| `dependency-review.yml` | PR | Sí | `actions/dependency-review-action@v4`, bloquea PRs con deps `>= moderate` o licencias prohibidas. |
| `codeql.yml` | push + PR + lunes 06:00 UTC | No (informativo, sube alerts a Security tab) | SAST oficial GitHub, queries `security-and-quality`. |
| `gitleaks.yml` | push + PR + domingo 05:00 UTC | Sí | Scan de tokens/credenciales en historial Git. Allowlist en `.gitleaks.toml`. |
| `zap-scan.yml` | manual + mensual día 1 | No (issue auto-creado) | DAST OWASP ZAP baseline contra staging. Allowlist `.zap/rules.tsv`. |

**Helper centralizado de exclusiones GHSA:**

`backend/scripts/audit-with-exclusions.js` reemplaza al helper inline shell+Node que rompía con cadenas mixtas de `via[]`. Recorre `vulnerabilities[*].via` recursivamente, considerando una vuln cubierta solo si todas las hojas resuelven a GHSA-ids excluidos. Tests unitarios en `backend/tests/auditWithExclusions.test.js` (17 casos, incluye regresión del bug original `ip-address` + `express-rate-limit`).

**Política operativa de exclusiones:**

- Cada GHSA excluido lleva en `build.yml` un comentario que explica: paquete que la introduce, motivo de no-alcanzabilidad, condición para retirar la exclusión.
- `dependency-review.yml` `allow-ghsas` se mantiene **sincronizado** con `BACKEND_EXCLUDED + FRONTEND_EXCLUDED` de `build.yml`. Una nueva exclusión debe añadirse en los dos sitios o los PRs nuevos fallarán.
- Mensualmente, tras los Dependabot PRs, revisar si alguna exclusión puede retirarse (paquete bumpeado upstream).

**Procedimiento ante nueva vuln detectada en CI:** ver [Playbook 19 del Runbook](Runbook_Operacional.md#19-diagnosticar-security-audit-rojo-en-ci).

---

## 17. Rotación de secrets

Detalle operativo: [`Secrets_Rotation.md`](Secrets_Rotation.md).

**Inventario de secrets sensibles:**

| Secret | Frecuencia rotación | Impacto |
|---|---|---|
| `JWT_SECRET` | 90 días | Logout global tras rotación |
| `JWT_REFRESH_SECRET` | 90 días | Logout global tras rotación |
| `JWT_MFA_SECRET` (B7) | 90 días | MFA tokens vigentes invalidados; re-challenge requerido |
| `MFA_ENCRYPTION_KEY` (B2/B7) | Anual / on-incident | Si se rota, MFA secrets cifrados quedan ilegibles → super_admins deben re-setup |
| `RFID_HMAC_SECRET` (B8) | On-firmware-update | Re-flashear todos los sensores |
| `SUPABASE_SERVICE_KEY` | Anual | Re-deploy backend con key nueva |
| `MONGO_URI` (password) | On-incident | Cambio en Atlas |
| `REDIS_URL` (password) | On-incident | Cambio en Upstash |
| `SENTRY_DSN` | On-incident | Cambio en Sentry project |
| `TURNSTILE_SECRET` (B6) | Anual | Cambio en Cloudflare |
| `ACCOUNT_LOCKOUT_*` (B1) | No rotable (config) | Cambio inmediato sin impacto |

**Procedimiento canónico (cualquier secret):**
1. Generar nuevo: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (ajustar bytes según secret).
2. Configurar en staging → validar.
3. Rolling deploy a prod (Koyeb env var → instance restart).
4. Revocar/eliminar el viejo.

---

## 18. Compatibilidad cloud (Koyeb / Cloudflare / Atlas / Upstash / Supabase)

### 18.1 Restricciones por componente

| Componente | Restricción | Mitigación nuestra |
|---|---|---|
| Koyeb backend | TLS terminator delante, FS efímero | `app.set('trust proxy', 1)`, logs stdout, secrets env |
| Koyeb healthcheck | < 5s respuesta a `/api/health/ready` | Endpoint optimizado, sin queries pesadas |
| Cloudflare frontend | TLS terminator, WAF, edge cache | `Cache-Control no-store /api/*`, CSP compatible |
| Atlas M0 Mongo | Sin backup automático fiable, conexiones máx ~500 | T-906 backup script pendiente; pool size limitado |
| Atlas TLS | `mongodb+srv://` obligatorio | `MONGO_URI` validator acepta ambos |
| Upstash Redis TLS | `rediss://` obligatorio | `REDIS_URL` validator acepta ambos |
| Upstash 10K cmds/día | Soft limit free tier | T-907 PROP-123 optimización pendiente; pipelines done |
| Upstash Lua scripts | Soportados en plan paid | WS rate limit Lua tiene fallback in-memory |
| Supabase Storage | URL pública del bucket en CSP | `imgSrc/mediaSrc` incluye `https://*.supabase.co` |
| Supabase service key | NUNCA en frontend | Solo backend env, redact en logs |
| Cross-domain cookies | `SameSite=None; Secure` si frontend ≠ backend domain | Configurable en `buildRefreshCookieOptions` |

### 18.2 Pre-deploy checklist

- [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` ≥ 64 chars distintos en Koyeb env.
- [ ] `MFA_ENCRYPTION_KEY` y `JWT_MFA_SECRET` configurados.
- [ ] `MFA_REQUIRED_FOR_SUPER_ADMIN=true` (default prod).
- [ ] `CSP_REPORT_ONLY=true` para primer deploy a staging (1 semana, recoger violaciones).
- [ ] `WSS_DOMAIN=wss://api-prod.koyeb.app` (o equivalente).
- [ ] `RFID_HMAC_ENABLED=false` inicialmente; activar tras 100% adopción firmware nuevo.
- [ ] `RFID_HMAC_SECRET` configurado en backend env Y inyectado en firmware en build.
- [ ] `TURNSTILE_SECRET` + `VITE_TURNSTILE_SITEKEY` configurados (opt-in).
- [ ] `ACCOUNT_LOCKOUT_MAX_ATTEMPTS=5` (default OK).
- [ ] Cloudflare Bot Fight Mode revisado contra CSP `scriptSrc` (no inyectar scripts inline).
- [ ] Sentry release upload con sourcemaps `hidden` (no expuestos en cliente).
- [ ] Healthcheck Koyeb apunta a `/api/health/ready`, NO `/api/health` (que tiene info más completa).
- [ ] `CORS_WHITELIST` incluye dominio frontend real (no `localhost`).
- [ ] Tests pasan: `cd backend && npm test` (1249/1249) + `cd frontend && npx vitest run`.

---

## 19. Hallazgos resueltos en T-905

### 19.1 PROP-113 — Security headers prod
✅ **DONE** (B5). Split helmet dev/prod, CSP strict, HSTS preload, report-uri. `documentation/Architecture_Decisions.md` ADR-149.

### 19.2 PROP-114 — Rate limits recalibrados
✅ **DONE** (B4). globalLimiter 100→1000, authLooseRateLimiter creado 20/15min, creationLimiter 10/min→50/h, rfid_scan 60/min, Nginx edge limit_req.

### 19.3 PROP-115 — OWASP ZAP
✅ **DONE** (B10). Workflow `.github/workflows/zap-scan.yml` con `workflow_dispatch` + `schedule` mensual. `.zap/rules.tsv` para falsos positivos.

### 19.4 PROP-116 — MFA super_admin
✅ **DONE** (B7). Backend completo (totp.js propio, mfaController, requireMfa, AES-256-GCM secret, 8 backup codes bcrypt). Frontend funcional (MfaSetup.jsx wizard + MfaChallengeModal global + interceptor 428).

### 19.5 Adicionales (no en plan original Sprint 6)
- ✅ **B1**: JWT algorithms whitelist + entropy + account lockout per-user.
- ✅ **B2**: cryptoUtils AES-256-GCM + Cache-Control + DTO sanitization + Pino redact + Sentry beforeSend hardening.
- ✅ **B3**: Magic bytes multer + health endpoint sanitization.
- ✅ **B6**: Open redirect whitelist + Turnstile CAPTCHA **completo (backend + frontend widget)**.
- ✅ **B8**: RFID firmware HMAC + counter EEPROM + anti-replay backend.
- ✅ **B9**: Suite tests adversariales (nosqlInjection, csrfBypass, rateLimitConfigs).

### 19.6 Deuda upstream (resuelta tras T-905)
- ✅ `DEP0169 url.parse()` warning en swagger-jsdoc → **resuelto via `overrides`** en `backend/package.json`:
  - `@apidevtools/json-schema-ref-parser` forzado a `^14.0.1` (era 9.1.2 transitivo).
  - `@apidevtools/swagger-parser` forzado a `^12.1.0` (era 10.0.3 transitivo).
  - Compatibilidad verificada: spec OpenAPI sigue generándose (paths populadas), `npm test` 1259/1259 verde, `npm audit:prod` sin vulns nuevas.
- ✅ Mongoose `new: true` deprecation → arreglada en `notificationService.js` (markRead) y `userController.js` (línea 776).
- ✅ MaxListenersExceededWarning en tests → `process.setMaxListeners(50)` en `tests/setup.js`.

### 19.7 Diferidos a sprints futuros (documentados, no implementados)
- **PROP-120 Cloudflare WAF + rate limit edge** → T-907 (sprint 6 cloud).
- **B11 QA E2E sensor simulado con script automatizado** → manual procedure documentado en §16.8; script de simulación HMAC backend pendiente.
- **DTO refactor con factories** → mejora cobertura idorCrossTeacher test (actualmente skipped).
- **OAuth2 / SSO** → fuera de scope hasta v2.
- **Argon2id** → bcrypt v6 actual es OK; evaluar Argon2id en v2.
- **RS256 + JWKS** → §4.9.

---

## 20. Referencias y ADRs

ADRs nuevos en T-905 (documentados en `Architecture_Decisions.md`):

| ADR | Tema | Bloque |
|---|---|---|
| 145 | JWT hardening profundo + Account lockout | B1 |
| 146 | Cifrado AES-256-GCM + DTO sanitization + Cache-Control | B2 |
| 147 | Magic bytes multer + Health endpoint PII sanitization | B3 |
| 148 | Rate limits recalibración + Nginx edge | B4 |
| 149 | Helmet split + CSP strict + report-uri | B5 |
| 150 | Open redirect whitelist + Turnstile + Política divulgación | B6 |
| 151 | MFA TOTP super_admin (totp.js propio + AES-256-GCM + 8 backup codes) | B7 |
| 152 | RFID HMAC-SHA256 + counter EEPROM | B8 |
| 153 | Suite tests seguridad adversariales | B9 |
| 154 | OWASP ZAP baseline workflow | B10 |

OWASP Top 10 (2021) mapping:

| OWASP | Cobertura |
|---|---|
| A01 Broken Access Control | §5 (RBAC + ownership) + §4.6 (single session) |
| A02 Cryptographic Failures | §4 (JWT) + §10 (AES-256-GCM) |
| A03 Injection | §9 (Zod + securityPayloadGuard) |
| A04 Insecure Design | §2 (modelo amenazas explícito) |
| A05 Security Misconfiguration | §6 (headers helmet split dev/prod) |
| A06 Vulnerable Components | CI dep-review + Dependabot |
| A07 Identification/Auth Failures | §4 (JWT + MFA + lockout) |
| A08 Software/Data Integrity Failures | §9.4 (magic bytes) + §13 (HMAC RFID) |
| A09 Security Logging | §11 (Pino redact + Sentry beforeSend) |
| A10 SSRF | No backend hace requests con URLs user-controlled |

OWASP API Security Top 10 (2023):

| OWASP API | Cobertura |
|---|---|
| API1 Broken Object Level Auth (BOLA/IDOR) | §5 ownership pattern |
| API2 Broken Authentication | §4 |
| API3 Broken Object Property Level Auth | §10.4 DTO sanitization |
| API4 Unrestricted Resource Consumption | §8 rate limits |
| API5 Broken Function Level Auth | requireRole + requireMfa |
| API6 Unrestricted Access Sensitive Business Flows | createResourceRateLimiter + lockout |
| API7 SSRF | N/A |
| API8 Security Misconfiguration | §6 |
| API9 Improper Inventory Management | OpenAPI spec en `/api/openapi.json` |
| API10 Unsafe Consumption APIs | Validación responses Supabase + Sentry siteverify Turnstile |

---

## 21. Sistema de alertas inteligentes (T-941 / ADR-161)

### 21.1 RGPD: filtrado de consentimiento

El servicio `alertDetectionService.loadActiveStudentsForTeacher` excluye estudiantes con `consent.withdrawnAt` antes de pasarlos a los detectores (RGPD Art. 7 — derecho a retirar el consentimiento). Filtro aplicado en código (no solo en query Mongo) para evitar ambigüedades de paths anidados nullable.

```js
const students = await userRepository.find({
  createdBy: toObjectId(teacherId),
  role: 'student',
  status: 'active'
}, { select: 'name studentMetrics profile.classroom consent', lean: true });
return students.filter(s => !s.consent?.withdrawnAt);
```

Defensa en profundidad: el orquestador `runForTeacher` también descarta findings cuyo `studentId` no esté en el conjunto cargado, por si un detector retorna findings de un alumno excluido (línea ~218 de `alertDetectionService.js`).

### 21.2 Pseudonimización (Art. 25 RGPD — protección por diseño)

Cada `SmartAlert` lleva un campo `studentPseudoId` calculado como `sha256(studentId|teacherId).slice(0, 8)` (utilidad `utils/pseudonymize.js`):

- Determinista — el mismo estudiante produce el mismo pseudo ID, permitiendo correlación entre logs sin exponer PII.
- Resoluble solo desde el sistema (no requiere salt externo).
- Logs Pino estructurados (`alertLifecycle.dismissed`, `alertDetection.runForTeacher.completed`) **NUNCA** incluyen `studentId` plano, solo `studentPseudoId` o conteos agregados por `teacherId`.

Verificación: `grep -E "logger\\.(info|warn|debug).*studentId" backend/src/services/analytics/alertDetectionService.js` debe devolver 0 resultados (solo `studentPseudoId`).

### 21.3 Autorización por ownership

Todos los endpoints `/api/analytics/alerts/*` aplican `requireRole('teacher','super_admin')` a nivel router, y dentro del servicio `getOwnedAlert` valida `alert.teacherId === req.user._id` (o `isSuperAdmin`). Tests de IDOR cubren el caso "teacher B intenta dismiss alerta del teacher A → 403/ForbiddenError" en `tests/services/analytics/alertDetectionService.test.js`.

### 21.4 Hard-delete RGPD-compliant

`dataRetentionService.deleteOldSmartAlerts` borra SmartAlerts en estado `resolved` o `dismissed` con `updatedAt < now - 365d` (env `SMART_ALERT_RETENTION_DAYS`). Integrado en la queue `data-retention` existente sin queue nueva. Cubre Art. 5.1.e RGPD (limitación de conservación).

### 21.5 Notificación realtime: contenido sin PII

El evento Socket.IO `notification:created` con `type='student_at_risk'` incluye `studentName` (necesario para que el docente identifique al alumno en su UI) y `alertId` en metadata, pero la transmisión va exclusivamente al `room user_${teacherId}` (autenticado en handshake). Ningún broadcast global. Verificado en `tests/security/idorCrossTeacher.test.js`.

---

## 22. Sistema de alertas operativas para super_admin (T-942 / ADR-162)

Complemento al § 21 con foco en **operación del sistema**: Redis, MongoDB, memoria, colas BullMQ, seguridad (lockouts, brute force, token theft), moderación (profesores pendientes envejecidos, contextos sin assets, profesores inactivos) y compliance (lag del job de retención RGPD, picos de retirada de consentimiento). Aislamiento total: el `super_admin` no ve `SmartAlert` por defecto y el `teacher` no tiene acceso a `SystemAlert` (los endpoints `/api/admin/system-alerts/*` requieren `requireRole('super_admin')`).

### 22.1 Runbooks

Los detectores incluyen un `runbookUrl` por defecto y el card UI muestra un link "Ver runbook" si está presente. Anclas relevantes documentadas como guía operativa:

- `#redis-latencia` — SLOWLOG, contadores `runtimeMetrics.redis.commandsByCategory`, circuit breaker, fallback memoryStore en runtime.
- `#mongo-disconnect` — revisar Atlas cluster, IP whitelist, credenciales, replica set, reinicio controlado.
- `#account-lockout` — credential stuffing: `auth:fail:*` y `auth:lock:*`, IPs en `securityLogger`, refuerzo CAPTCHA, unlock manual via `POST /api/admin/lockouts/unlock`.
- `#brute-force` — pico de fallos: logs `AUTH_LOGIN_FAILED`, bots, Cloudflare WAF.
- `#token-theft` — `AUTH_TOKEN_THEFT_DETECTED`: revocación global de tokens del usuario, cambio de contraseña forzado, audit de fingerprints.

### 22.2 Contadores sliding-window

`services/security/securityCountersService.js` mantiene contadores 1 h vía `ZADD/ZCOUNT` en Redis (`security:counter:<eventType>`). `securityLogger.logSecurityEvent` invoca `bumpSecurityCounter(eventCode, meta)` fire-and-forget en `AUTH_LOGIN_FAILED`, `AUTH_ACCOUNT_LOCKED`, `AUTH_TOKEN_THEFT_DETECTED`, `DATA_CONSENT_CHANGE` (withdrawn). Fail-open: si Redis cae, no rompe auth ni propaga errores; el detector cuenta 0 en esa corrida.

### 22.3 Notificación crítica a super_admins

Las SystemAlert críticas disparan `notificationService.notify({ type: 'system_alert_critical', ... })` para cada usuario con `role:'super_admin'`. Persistido en `Notification` y emitido via Socket.IO `notification:created` al room `user_<id>` de cada admin. Link a `/admin/system-alerts?alertId=<id>`.

### 22.4 Avisos a profesores (SystemAnnouncement)

La dirección publica avisos visibles como banner top en `AppLayout` para `role:'teacher'`. Audit completo en BD: `createdBy`, `archivedAt`, `archivedBy`. Sin email ni canal externo: la comunicación operativa permanece dentro del centro. Dismiss por usuario en `localStorage` (sin endpoint server-side; telemetría mínima).

### 22.5 Endpoint debug protegido

`POST /api/admin/system-alerts/_debug/run-now` dispara una corrida de detección inmediata. 403 si `NODE_ENV === 'production'`. Solo super_admin. Útil para QA y nuevos detectores.

---

**Última actualización:** T-942 cierre (2026-05-18).
