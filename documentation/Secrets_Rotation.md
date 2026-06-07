# Secrets_Rotation.md — Política de rotación de secretos

> **Audiencia.** Persona responsable de mantener el despliegue en cloud (en TFG: el autor; en producción real: el operador del centro).
>
> **Objetivo.** Reducir la superficie de ataque ante una fuga: si un secreto se filtra, la ventana de explotación está acotada al periodo de validez.

---

## Inventario de secretos

| Clase | Ubicación canónica | Servicios que lo consumen | Periodicidad recomendada |
|---|---|---|---|
| `JWT_SECRET` | Koyeb Secrets (`api-*`, `worker-*`) | Firma de access tokens | **6 meses** |
| `JWT_REFRESH_SECRET` | Koyeb Secrets (`api-*`, `worker-*`) | Firma de refresh tokens | **6 meses** |
| `MONGO_URI` (password) | Atlas + Koyeb Secrets | Conexión a la base de datos | **3 meses** |
| `REDIS_URL` (password) | Upstash + Koyeb Secrets | Cache + queues | **6 meses** |
| `SUPABASE_SERVICE_KEY` | Supabase + Koyeb Secrets | Storage de assets | **12 meses** (o ante incidente) |
| `SENTRY_DSN` | Sentry + Koyeb/Pages | Reporte de errores | No requiere rotación (público en SDK frontend) |
| `KOYEB_API_TOKEN` | Koyeb + GitHub Secrets | CD deploy desde Actions | **6 meses** |
| `CLOUDFLARE_API_TOKEN` (si se usa) | Cloudflare + GitHub Secrets | Build hook manual | **12 meses** |
| `SUPER_ADMIN_PASSWORD` | Seed + Koyeb env | Bootstrap del primer super admin | Cambiar tras primer login |
| `JWT_MFA_SECRET` (T-905 B7) | Koyeb Secrets (`api-*`) | Firma de MFA tokens cortos (5min) | **6 meses** (mismo ciclo que JWT_SECRET) |
| `MFA_ENCRYPTION_KEY` (T-905 B7) | Koyeb Secrets (`api-*`) | Cifra/descifra TOTP secrets en BD AES-256-GCM | **12 meses** o ante incidente. ⚠️ Rotar invalida `mfa.secret` cifrados — super_admins deben re-setup MFA |
| `RFID_HMAC_SECRET` (T-905 B8) | Koyeb Secrets + PlatformIO build env | Firma HMAC del UID en firmware y validación backend | **On-firmware-update** (re-flashear sensores) |
| `PSEUDONYMIZE_SECRET` | Koyeb Secrets (`api-*`) | Clave HMAC para seudonimizar IDs de menores en logs/DTOs/exports (RGPD Art. 4.5; evita re-identificación). Requerido en producción | **12 meses** o ante incidente. Rotar cambia los pseudoIds futuros — cosmético: el dedup de alertas es por `studentId`, no por pseudoId |
| `TURNSTILE_SECRET` (T-905 B6) | Cloudflare + Koyeb Secrets | CAPTCHA siteverify backend | **12 meses** o ante incidente |
| `VITE_TURNSTILE_SITEKEY` (T-905 B6) | Cloudflare + frontend build env | Render del widget Turnstile | Junto al secret (no rota independiente) |
| `CSP_REPORT_ONLY` (T-905 B5) | Koyeb env | Feature flag para CSP gradual rollout | No es secret, control operativo |
| `ACCOUNT_LOCKOUT_*` (T-905 B1) | Koyeb env | Config thresholds lockout per-user | No es secret, ajuste fino |

> ⚠️ Estas periodicidades aplican en condiciones normales. **Ante cualquier incidente (commit con credenciales, fuga sospechada, leak de logs)**, rota inmediatamente sin esperar a la fecha programada.

---

## Variables (no secretos, no rotación)

Algunos valores que históricamente se trataban como `secrets.*` en GitHub Actions no son confidenciales y se han migrado a **GitHub Variables** (`vars.*`). La política operativa es:

- **Tokens, passwords, claves de API** → `secrets.*`. Enmascarados en logs.
- **URLs de servicio, IDs de organización, feature flags** → `vars.*`. Visibles en logs y en la UI de Environments.

| Variable | Tipo en GitHub | Uso |
|---|---|---|
| `KOYEB_PROD_URL` | `vars.*` | URL pública de api-prod (consumida por `deploy-production.yml`). |
| `KOYEB_STAGING_URL` | `vars.*` | URL pública de api-staging (consumida por `deploy-staging.yml`). |
| `PREVIEW_DEPLOYS_ENABLED` | `vars.*` | Feature flag para `preview-deploy.yml`. |
| `SENTRY_RELEASE_ENABLED` | `vars.*` | Feature flag para `sentry-release.yml`. |
| `FAIL_ON_WARNINGS` | `vars.*` | Política operativa de `zap-scan.yml`. |

Las URLs operativas no requieren rotación. Si la URL cambia (rebrand, dominio nuevo), basta con actualizar la Variable correspondiente.

> **Tras migrar de `secrets.*` a `vars.*`:** crear la Variable con el mismo valor, validar con un workflow_dispatch del deploy y entonces borrar el Secret antiguo para evitar shadow config. Ver [ADR-167](Architecture_Decisions.md).

---

## Pin de @sentry/cli (no es secret, pero rota como una dep)

`@sentry/cli` está pinneado en `.github/workflows/sentry-release.yml` (variable `SENTRY_CLI_VERSION`, valor actual: `2.58.5`). El upgrade se hace coordinadamente:

1. Smoke test local: `npx @sentry/cli@<nueva-versión> --version` y `releases list`.
2. Editar `SENTRY_CLI_VERSION` en el workflow.
3. Disparar `sentry-release.yml` manualmente contra un tag staging.
4. Confirmar que sourcemaps se suben.

Cuando salga `@sentry/cli@3.x`, validar antes de migrar — la sintaxis de `releases set-commits --auto` puede cambiar.

---

## Procedimiento general

Cada rotación sigue este patrón (los detalles por secreto están más abajo):

```
1. Generar el nuevo secreto.
2. Cargar el nuevo secreto en el proveedor (Atlas / Upstash / Supabase).
3. Actualizar la variable correspondiente en Koyeb (api-staging + worker-staging primero,
   verificar con smoke test, luego api-prod + worker-prod).
4. Cuando el nuevo secreto está activo y verificado, eliminar el antiguo del proveedor.
5. Anotar la fecha y el operador en este documento (sección "Historial" al final).
```

> **Regla de oro: nunca rotar prod sin haber rotado primero staging y verificado un smoke test.**

---

## Rotaciones específicas

### JWT_SECRET / JWT_REFRESH_SECRET

**Frecuencia recomendada:** 6 meses.

**Impacto en usuarios:** tras rotar, todos los access tokens y refresh tokens emitidos antes de la rotación quedan invalidados. Los usuarios verán un 401 y serán redirigidos a `/login`. **No hay corte de datos**, solo re-login.

**Procedimiento:**

1. Generar dos secretos nuevos:

   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # nuevo JWT_SECRET
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # nuevo JWT_REFRESH_SECRET
   ```

2. En Koyeb → `api-staging` → *Environment* → editar `JWT_SECRET` y `JWT_REFRESH_SECRET` con los valores nuevos. Idem `worker-staging`.

3. Redeploy paralelo de `api-staging` + `worker-staging`.

4. Smoke test en staging:

   - Hacer login con usuario de seed.
   - Hacer una llamada autenticada (`GET /api/users/me`).
   - Verificar que el token funciona.

5. Repetir 2-4 en `api-prod` + `worker-prod`.

6. Comunicar a usuarios reales (si los hay) la necesidad de re-login.

**Caveat:** si quieres rotación zero-downtime, el código tendría que soportar verificar tokens con DOS secretos durante una ventana de gracia. **No es el caso actual** — para el TFG no compensa la complejidad. Aceptamos que la rotación fuerza re-login.

---

### MONGO_URI (password de `eduplay-api`)

**Frecuencia recomendada:** 3 meses.

**Procedimiento:**

1. Atlas → *Database Access* → editar usuario `eduplay-api` → *Edit Password* → generar nueva.
2. **No guardar todavía** — al guardar, el usuario antiguo deja de funcionar. Tenlo abierto.
3. Construye las URIs nuevas (igual que en *Deploy_Koyeb.md* §1.4) con la nueva password.
4. En Koyeb → `api-staging` → editar `MONGO_URI` con la URI nueva. Idem `worker-staging`.
5. Guarda la password en Atlas (paso 2) — **a partir de aquí la URI vieja deja de funcionar**.
6. Redeploy `api-staging` + `worker-staging`. Smoke test.
7. Cuando staging esté OK, repite en `api-prod` + `worker-prod`.

**Caveat:** si el redeploy tarda más que el TTL del pool, durante 1-2 minutos las queries fallarán con `MongoServerError: bad auth`. Es esperado. La app retorna 503 desde `/health/ready` y los clientes verán "servicio no disponible" hasta que el pool se recicle.

---

### REDIS_URL (password de Upstash)

**Frecuencia recomendada:** 6 meses.

**Impacto:** Sesiones activas se pueden ver afectadas (rate limit cae a MemoryStore durante la transición, blacklist de tokens también, BullMQ queues se interrumpen).

**Procedimiento:**

1. Upstash → DB `eduplay-staging` → *Reset Password* (no rota el endpoint, sólo la password).
2. Copia el nuevo `rediss://...` (Upstash regenera la URL con la nueva password embebida).
3. Koyeb → `api-staging` → editar `REDIS_URL`. Idem `worker-staging`. Redeploy.
4. Verifica logs: deberías ver `Redis: Conexión verificada exitosamente`.
5. Smoke test: login + crear partida + cerrar sesión. Si el rate limit responde y la blacklist funciona, OK.
6. Repite en `eduplay-prod` + `api-prod` + `worker-prod`.

**Caveat:** durante el redeploy, BullMQ pierde los jobs en flight. El cron de retención RGPD se replantea solo en el próximo boot (es idempotente por jobId). Si hay jobs críticos en cola, mejor hacer la rotación en una ventana sin uso.

---

### SUPABASE_SERVICE_KEY

**Frecuencia recomendada:** 12 meses (o ante sospecha de fuga).

**Procedimiento:**

1. Supabase → tu proyecto → *Settings* → *API* → *Service Role Key* → *Regenerate*.
2. Confirma — la clave vieja deja de funcionar **inmediatamente**.
3. Koyeb → todas las apps → editar `SUPABASE_SERVICE_KEY` con la nueva.
4. Redeploy.
5. Smoke test: subir un asset a un mazo desde el frontend (verifica que la firma del upload funciona).

**Caveat:** entre paso 2 y paso 4 (~30 segundos si vas rápido) los uploads fallan. Hazlo fuera de horario de uso.

---

### KOYEB_API_TOKEN (para CD)

**Frecuencia recomendada:** 6 meses.

**Procedimiento:**

1. Koyeb → *Account Settings* → *API Tokens* → *Create New*.
2. Copia el token nuevo.
3. GitHub repo → *Settings* → *Secrets and variables* → *Actions* → editar `KOYEB_API_TOKEN`.
4. Disparar manualmente el workflow de deploy a staging para verificar que el nuevo token funciona.
5. En Koyeb, *Revoke* el token viejo.

---

## Ante incidente — rotación de emergencia

Si sospechas que un secreto está comprometido (commit accidental, leak de logs, ex-empleado, terminal expuesto):

1. **Asume lo peor** — rota TODOS los secretos del entorno afectado (staging + prod si aplica) en orden:
   1. `JWT_SECRET` y `JWT_REFRESH_SECRET` (corta acceso de sesiones existentes).
   2. `MONGO_URI` password (corta acceso a datos).
   3. `REDIS_URL` password (corta acceso a estado/cola).
   4. `SUPABASE_SERVICE_KEY` (corta acceso a Storage).
2. **Auditar logs**: Sentry + Pino logs en Koyeb. Buscar accesos sospechosos en las 24-72h previas al incidente.
3. **Revocar tokens activos** vía la blacklist (ya hay un endpoint super_admin para esto).
4. **Notificar** a usuarios afectados si hubo acceso a datos personales (RGPD Art. 33-34, obligación 72h).
5. **Documentar** el incidente al final de este archivo en *Historial*.

---

## Historial de rotaciones

> Anotar cada rotación: fecha (YYYY-MM-DD), secreto, operador, entorno. Mantener el último año visible.

| Fecha | Secreto | Entorno | Operador | Notas |
|---|---|---|---|---|
| YYYY-MM-DD | JWT_SECRET | staging+prod | @nombre | Rotación programada / incidente |

---

## Referencias

- **ADR-139** Stack cloud Koyeb + Atlas + Upstash + Cloudflare Pages.
- **ADR-167** Saneamiento del pipeline CI/CD pre-cierre cloud foundation (incluye política `secrets` vs `vars`).
- **`Deploy_Koyeb.md`** — aprovisionamiento inicial.
- **`Runbook_Operacional.md`** — playbooks de rotación operativa.
- **OWASP Cheat Sheet — Secrets Management**: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- **RGPD Art. 33-34** — notificación de brechas.
