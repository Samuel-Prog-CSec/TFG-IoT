# Secrets_Rotation.md — Política de rotación de secretos

> **Audiencia.** Persona responsable de mantener el despliegue en cloud (en TFG: el autor; en producción real: el operador del centro).
>
> **Objetivo.** Reducir la superficie de ataque ante una fuga: si un secreto se filtra, la ventana de explotación está acotada al periodo de validez.

---

## Inventario de secretos

> Desde la migración a la VPS Contabo, los secretos de runtime **no viven en un dashboard cloud** (Koyeb, Atlas, Upstash) sino en el filesystem de la propia VPS: `/opt/eduplay/secrets/staging.env` y `/opt/eduplay/secrets/prod.env` (`chmod 600`, propiedad de `deploy`). Rotar cualquiera de ellos es editar el fichero correspondiente y relanzar `docker compose ... up -d` para que el contenedor arranque con el valor nuevo — ver §"Procedimiento general" más abajo.

| Clase | Ubicación canónica | Servicios que lo consumen | Periodicidad recomendada |
|---|---|---|---|
| `JWT_SECRET` | `/opt/eduplay/secrets/{staging,prod}.env` | Firma de access tokens | **6 meses** |
| `JWT_REFRESH_SECRET` | `/opt/eduplay/secrets/{staging,prod}.env` | Firma de refresh tokens | **6 meses** |
| `MONGO_INITDB_ROOT_PASSWORD` | `/opt/eduplay/secrets/{staging,prod}.env` (Mongo self-hosted, mismo host Docker) | Conexión a la base de datos (`MONGO_URI` deriva de esta variable) | **3 meses** |
| `REDIS_PASSWORD` | `/opt/eduplay/secrets/{staging,prod}.env` (Redis self-hosted, mismo host Docker) | Cache + queues (`REDIS_URL` deriva de esta variable) | **6 meses** |
| `SUPABASE_SERVICE_KEY` | Supabase + `/opt/eduplay/secrets/{staging,prod}.env` | Storage de assets (sin cambios con esta migración) | **12 meses** (o ante incidente) |
| `SENTRY_DSN` | Sentry + `/opt/eduplay/secrets/{staging,prod}.env` | Reporte de errores | No requiere rotación (público en SDK frontend) |
| `SUPER_ADMIN_PASSWORD` | Seed + `/opt/eduplay/secrets/{staging,prod}.env` | Bootstrap del primer super admin | Cambiar tras primer login |
| `JWT_MFA_SECRET` (T-905 B7) | `/opt/eduplay/secrets/{staging,prod}.env` | Firma de MFA tokens cortos (5min) | **6 meses** (mismo ciclo que JWT_SECRET) |
| `MFA_ENCRYPTION_KEY` (T-905 B7) | `/opt/eduplay/secrets/{staging,prod}.env` | Cifra/descifra TOTP secrets en BD AES-256-GCM | **12 meses** o ante incidente. ⚠️ Rotar invalida `mfa.secret` cifrados — super_admins deben re-setup MFA |
| `RFID_HMAC_SECRET` (T-905 B8) | `/opt/eduplay/secrets/{staging,prod}.env` + PlatformIO build env | Firma HMAC del UID en firmware y validación backend | **On-firmware-update** (re-flashear sensores) |
| `PSEUDONYMIZE_SECRET` | `/opt/eduplay/secrets/{staging,prod}.env` | Clave HMAC para seudonimizar IDs de menores en logs/DTOs/exports (RGPD Art. 4.5; evita re-identificación). Requerido en producción | **12 meses** o ante incidente. Rotar cambia los pseudoIds futuros — cosmético: el dedup de alertas es por `studentId`, no por pseudoId |
| `TURNSTILE_SECRET` (T-905 B6) | Cloudflare + `/opt/eduplay/secrets/{staging,prod}.env` | CAPTCHA siteverify backend (Cloudflare Turnstile es un producto standalone, independiente del hosting) | **12 meses** o ante incidente |
| `VITE_TURNSTILE_SITEKEY` (T-905 B6) | Cloudflare + frontend build env (build arg del `docker compose build`) | Render del widget Turnstile | Junto al secret (no rota independiente) |
| `CSP_REPORT_ONLY` (T-905 B5) | `/opt/eduplay/secrets/{staging,prod}.env` | Feature flag para CSP gradual rollout | No es secret, control operativo |
| `ACCOUNT_LOCKOUT_*` (T-905 B1) | `/opt/eduplay/secrets/{staging,prod}.env` | Config thresholds lockout per-user | No es secret, ajuste fino |

> `KOYEB_API_TOKEN` y `CLOUDFLARE_API_TOKEN` (build hook de Cloudflare Pages) se retiraron junto con Koyeb/Cloudflare Pages — ya no existen ni como secret de GitHub ni como credencial a rotar.

> ⚠️ Estas periodicidades aplican en condiciones normales. **Ante cualquier incidente (commit con credenciales, fuga sospechada, leak de logs)**, rota inmediatamente sin esperar a la fecha programada.

---

## Variables (no secretos, no rotación)

Algunos valores que históricamente se trataban como `secrets.*` en GitHub Actions no son confidenciales y se han migrado a **GitHub Variables** (`vars.*`). La política operativa es:

- **Tokens, passwords, claves de API** → `secrets.*`. Enmascarados en logs.
- **URLs de servicio, IDs de organización, feature flags** → `vars.*`. Visibles en logs y en la UI de Environments.

| Variable | Tipo en GitHub | Uso |
|---|---|---|
| `PROD_URL` | `vars.*` | URL pública de producción (`https://eduplay-tfg.duckdns.org`), consumida por `deploy-production.yml` (`environment.url`) y `zap-scan.yml`. |
| `STAGING_URL` | `vars.*` | URL pública de staging (`https://eduplay-tfg-staging.duckdns.org`), consumida por `zap-scan.yml`. |
| `SENTRY_RELEASE_ENABLED` | `vars.*` | Feature flag para `sentry-release.yml`. |
| `FAIL_ON_WARNINGS` | `vars.*` | Política operativa de `zap-scan.yml`. |

> `KOYEB_PROD_URL`/`KOYEB_STAGING_URL` se renombraron a `PROD_URL`/`STAGING_URL` al migrar de Koyeb a la VPS (mismo tipo de dato, otro proveedor). `PREVIEW_DEPLOYS_ENABLED` se retiró junto con `preview-deploy.yml`.

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
2. Si el secreto vive en un proveedor externo (Supabase, Sentry, Cloudflare Turnstile),
   cargarlo ahí primero.
3. Editar /opt/eduplay/secrets/staging.env con el valor nuevo y relanzar
   `cp /opt/eduplay/secrets/staging.env .env && docker compose -f docker-compose.yml -f
   docker-compose.prod.yml -p eduplay-staging up -d` (sin `--env-file`: `env_file: - .env` en
   `docker-compose.yml` exige un fichero llamado literalmente `.env`, no lo que reciba
   `--env-file`) — verificar con smoke test antes de tocar prod.
4. Repetir el paso 3 en /opt/eduplay/secrets/prod.env sobre el stack eduplay-prod.
5. Cuando el nuevo secreto está activo y verificado, eliminar/revocar el antiguo en el
   proveedor externo si aplica (paso 2).
6. Anotar la fecha y el operador en este documento (sección "Historial" al final).
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

2. Editar `/opt/eduplay/secrets/staging.env` con los valores nuevos de `JWT_SECRET` y `JWT_REFRESH_SECRET`.

3. Relanzar el stack de staging para que backend y worker arranquen con los valores nuevos:

   ```bash
   cp /opt/eduplay/secrets/staging.env .env
   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     -p eduplay-staging up -d
   ```

4. Smoke test en staging:

   - Hacer login con usuario de seed.
   - Hacer una llamada autenticada (`GET /api/users/me`).
   - Verificar que el token funciona.

5. Repetir 2-4 en `/opt/eduplay/secrets/prod.env` con `-p eduplay-prod`.

6. Comunicar a usuarios reales (si los hay) la necesidad de re-login.

**Caveat:** si quieres rotación zero-downtime, el código tendría que soportar verificar tokens con DOS secretos durante una ventana de gracia. **No es el caso actual** — para el TFG no compensa la complejidad. Aceptamos que la rotación fuerza re-login.

---

### MONGO_INITDB_ROOT_PASSWORD (password del usuario root de Mongo)

**Frecuencia recomendada:** 3 meses.

**⚠️ Importante — Mongo self-hosted no rota solo con el `.env`.** El entrypoint oficial de la
imagen `mongo:7` únicamente aplica `MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` cuando el volumen de
datos está vacío (primer arranque). En un stack ya inicializado (staging y prod lo están),
cambiar solo la variable en el `.env` y relanzar el contenedor **no actualiza la contraseña
real** dentro de Mongo — hay que cambiarla explícitamente vía `db.changeUserPassword()` con la
contraseña **antigua** antes de tocar el `.env`.

**Procedimiento:**

1. Generar la password nueva.
2. Cambiarla dentro del propio Mongo del stack afectado, autenticando con la password **actual**:

   ```bash
   docker compose -p eduplay-staging exec mongo mongosh \
     -u eduplay -p '<password-actual>' --authenticationDatabase admin --eval '
       db.getSiblingDB("admin").changeUserPassword("eduplay", "<password-nueva>")
     '
   ```

3. Editar `MONGO_INITDB_ROOT_PASSWORD` en `/opt/eduplay/secrets/staging.env` con la password
   nueva (si `MONGO_URI` está definida explícita en vez de derivada, actualízala también a mano).
4. Relanzar `cp /opt/eduplay/secrets/staging.env .env && docker compose -f docker-compose.yml -f
   docker-compose.prod.yml -p eduplay-staging up -d` para que backend/worker reconecten con la
   password nueva.
5. Smoke test: `curl http://127.0.0.1:8080/api/health/ready` → `checks.mongo: "ok"`.
6. Repite 1-5 en `/opt/eduplay/secrets/prod.env` / stack `eduplay-prod` / puerto `8090`.

**Caveat:** entre el paso 2 (Mongo ya exige la password nueva) y el paso 4 (contenedores
todavía con la password vieja en memoria) las queries fallarán con `MongoServerError: bad auth`.
La app retorna 503 desde `/api/health/ready` hasta que backend/worker se recreen con el valor
correcto — hazlo en una ventana corta y sin usuarios activos si es posible.

---

### REDIS_PASSWORD (Redis self-hosted)

**Frecuencia recomendada:** 6 meses.

**Impacto:** Sesiones activas se pueden ver afectadas (rate limit cae a MemoryStore durante la transición, blacklist de tokens también, BullMQ queues se interrumpen).

**A diferencia de Mongo, Redis sí rota limpio solo con el `.env`**: `redis-server` recibe
`--requirepass ${REDIS_PASSWORD}` como argumento de arranque en cada `docker compose up`, así
que recrear el contenedor con el valor nuevo aplica la contraseña nueva directamente (no hace
falta ningún comando `ACL`/`CONFIG SET` previo).

**Procedimiento:**

1. Generar la password nueva.
2. Editar `REDIS_PASSWORD` en `/opt/eduplay/secrets/staging.env`.
3. Relanzar el stack — esto recrea **tanto** el contenedor `redis` (nueva password) **como**
   `backend`/`worker` (nueva `REDIS_URL` derivada):

   ```bash
   cp /opt/eduplay/secrets/staging.env .env
   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     -p eduplay-staging up -d
   ```

4. Verifica logs: deberías ver `Redis: Conexión verificada exitosamente`.
5. Smoke test: login + crear partida + cerrar sesión. Si el rate limit responde y la blacklist funciona, OK.
6. Repite 1-3 en `/opt/eduplay/secrets/prod.env` / stack `eduplay-prod`.

**Caveat:** durante el `up -d`, BullMQ pierde los jobs en flight. El cron de retención RGPD se replantea solo en el próximo boot (es idempotente por jobId). Si hay jobs críticos en cola, mejor hacer la rotación en una ventana sin uso.

---

### SUPABASE_SERVICE_KEY

**Frecuencia recomendada:** 12 meses (o ante sospecha de fuga).

**Procedimiento:**

1. Supabase → tu proyecto → *Settings* → *API* → *Service Role Key* → *Regenerate*.
2. Confirma — la clave vieja deja de funcionar **inmediatamente**.
3. Editar `SUPABASE_SERVICE_KEY` en `/opt/eduplay/secrets/staging.env` y `/opt/eduplay/secrets/prod.env` con la nueva.
4. Relanzar ambos stacks (`docker compose ... -p eduplay-staging up -d` y `-p eduplay-prod up -d`).
5. Smoke test: subir un asset a un mazo desde el frontend (verifica que la firma del upload funciona).

**Caveat:** entre paso 2 y paso 4 (~30 segundos si vas rápido) los uploads fallan. Hazlo fuera de horario de uso.

---

## Ante incidente — rotación de emergencia

Si sospechas que un secreto está comprometido (commit accidental, leak de logs, ex-empleado, terminal expuesto):

1. **Asume lo peor** — rota TODOS los secretos del entorno afectado (staging + prod si aplica) en orden:
   1. `JWT_SECRET` y `JWT_REFRESH_SECRET` (corta acceso de sesiones existentes).
   2. `MONGO_INITDB_ROOT_PASSWORD` (corta acceso a datos).
   3. `REDIS_PASSWORD` (corta acceso a estado/cola).
   4. `SUPABASE_SERVICE_KEY` (corta acceso a Storage).
2. **Auditar logs**: Sentry + logs Pino de los contenedores en la VPS (`docker compose -p eduplay-prod logs backend`, o journalctl del servicio si se centralizan). Buscar accesos sospechosos en las 24-72h previas al incidente.
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

- **ADR-139** Stack cloud Koyeb + Atlas + Upstash + Cloudflare Pages (histórico, retirado — ver ADR de la migración a VPS en `Architecture_Decisions.md`).
- **ADR-167** Saneamiento del pipeline CI/CD pre-cierre cloud foundation (incluye política `secrets` vs `vars`).
- **`Deploy_VPS.md`** — aprovisionamiento de la VPS, incluida la estructura de `/opt/eduplay/secrets/`.
- **`SECURITY.md#runner-self-hosted`** — modelo de seguridad del runner que ejecuta estos redeploys.
- **`Runbook_Operacional.md`** — playbooks de rotación operativa.
- **OWASP Cheat Sheet — Secrets Management**: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- **RGPD Art. 33-34** — notificación de brechas.
