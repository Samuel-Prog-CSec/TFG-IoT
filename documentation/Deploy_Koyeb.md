# Deploy_Koyeb.md — Aprovisionamiento cloud paso a paso

> **Audiencia.** Cualquier persona que tenga que levantar el stack desde cero (TFG, traspaso del proyecto, recuperación tras desastre). Asume cero experiencia previa en cloud.
>
> **Stack objetivo.** Todo en free tier:
>
> - **Backend**: Koyeb (Frankfurt `fra`) — 4 servicios: `api-staging`, `worker-staging`, `api-prod`, `worker-prod`.
> - **Base de datos**: MongoDB Atlas M0 (Frankfurt `eu-central-1`).
> - **Cache + queue**: Upstash Redis (Ámsterdam `eu-west-1`) — 2 DBs.
> - **Frontend**: Cloudflare Pages (CDN global).
> - **Storage de assets**: Supabase (ya existente).
> - **Observabilidad**: Sentry + Pino structured logs.
>
> **Sub-dominios resultantes.**
>
> - `https://api-staging-<org>.koyeb.app` · `https://api-<org>.koyeb.app`
> - `https://eduplay-frontend.pages.dev` (producción) · `https://maintenance.eduplay-frontend.pages.dev` (staging)

---

## 0. Preparación local — antes de tocar dashboards

```bash
git checkout main          # estable
git pull
git checkout -b release/v1.0.0   # opcional, según flujo
```

Verifica que tienes a mano:

1. **Cuenta GitHub** con el repo `TFG-IoT` accesible.
2. **Email** para registrarte en los proveedores (mejor uno alias `+koyeb@`, `+atlas@` para identificar las notificaciones).
3. **Gestor de contraseñas** o `pass`/`Bitwarden` — vas a generar varios secretos largos.
4. `node` ≥24 instalado en local para generar los JWT secrets seguros.

> ⚠️ **No commitees nunca un `.env` con valores reales.** El `.gitignore` ya cubre `.env`, pero confirma con `git check-ignore .env` que devuelve `.env`.

---

## 1. MongoDB Atlas — base de datos

### 1.1 Registro y creación del cluster

1. Entra en https://cloud.mongodb.com y créate cuenta con email.
2. Crea **Organization** `tfg-eduplay` (o reutiliza si ya existe).
3. Crea **Project** `eduplay-prod` dentro de la organización.
4. **Build a Database** → elige *Shared* → *M0 Sandbox* (Free Forever).
5. **Provider**: AWS · **Region**: `eu-central-1` (Frankfurt) · **Cluster Name**: `eduplay-cluster`.
6. *Create Cluster* — tarda 3-5 minutos.

### 1.2 Usuario de aplicación

1. *Database Access* → *Add New Database User*.
2. **Authentication Method**: Password · **Username**: `eduplay-api`.
3. Genera password aleatoria (botón "Autogenerate Secure Password") — **guárdala en el gestor de contraseñas**.
4. **Built-in Role**: `readWrite` to *Any Database*.
5. *Add User*.

### 1.3 Network Access

1. *Network Access* → *Add IP Address* → *Allow access from anywhere* (`0.0.0.0/0`).
2. En el comentario: `"Koyeb dynamic IPs — mitigado por TLS + SCRAM-SHA-256"`.

> **Justificación.** El free tier de Koyeb no garantiza IPs estáticas; whitelist por IP es inviable. El riesgo se mitiga porque:
>
> - Toda la conexión va por TLS 1.3 (driver Mongoose 9 lo exige).
> - Autenticación SCRAM-SHA-256 con password de 32+ caracteres aleatorios.
> - El `MONGO_URI` vive sólo en Koyeb Secrets, no en código.
>
> Esto está formalizado en **ADR-139** y **ADR-140** del registro de decisiones.

### 1.4 Connection strings

1. Cluster → *Connect* → *Drivers* → Node.js 6.7+.
2. Copia la URI base — algo como `mongodb+srv://eduplay-api:<password>@eduplay-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=eduplay-cluster`.
3. Cambia `<password>` por la real y especifica una base de datos antes del `?`. Genera DOS URIs:

   ```text
   # staging
   mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxxxx.mongodb.net/rfid_games_staging?retryWrites=true&w=majority

   # production
   mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxxxx.mongodb.net/rfid_games_production?retryWrites=true&w=majority
   ```

4. Guarda ambas en el gestor de contraseñas — los entrarás como `MONGO_URI` en Koyeb (ver §5).

---

## 2. Upstash Redis — cache, queues y rate limit

### 2.1 Registro

1. https://upstash.com → *Sign Up* con GitHub.
2. Acepta la región del proyecto cuando lo pida.

### 2.2 Creación de las dos DBs

Repite estos pasos **dos veces** — una con nombre `eduplay-staging` y otra `eduplay-prod`:

1. *Create Database* → **Type**: Regional · **Region**: `eu-west-1` (Frankfurt o Ireland, lo más cercano al backend Koyeb `fra`).
2. **Eviction**: `noeviction` (crítico — el proyecto usa Redis para BullMQ, blacklist JWT e idempotencia; el eviction LRU rompe estas tres).
3. **TLS**: Enabled (Upstash lo activa por defecto en regional).
4. *Create*.

### 2.3 Connection string

1. Abre la DB recién creada → tab *Details*.
2. Copia el endpoint *Redis Connect URL* (algo como `rediss://default:<password>@<host>.upstash.io:6379`).
3. Importante: el protocolo es `rediss://` (con doble `s`) — significa TLS. Si la tuya empieza por `redis://`, regenera.
4. Guarda ambos endpoints en el gestor de contraseñas — los entrarás como `REDIS_URL` en Koyeb (ver §5).

### 2.4 (opcional) Inventario de keys esperadas

El backend escribe estos prefijos (con `REDIS_KEY_PREFIX` aplicado encima):

| Prefijo | Uso |
|---|---|
| `rl:*` | Rate limit stores |
| `session:*` | Sesiones activas / cookies |
| `play:init:*` | Idempotencia de startPlay |
| `auth:user:*` | Cache de identidades para JWT |
| `cache:analytics:*` | Cache de queries pesadas |
| `bull:*` | BullMQ (queues + jobs) |

Documentado para que tras 24h puedas correr `MONITOR` en la consola de Upstash y verificar que el tráfico es razonable.

---

## 3. Cloudflare Pages — frontend

### 3.1 Cuenta + conexión a GitHub

1. https://dash.cloudflare.com → *Sign Up* (no requiere tarjeta para Pages).
2. En el dashboard → *Workers & Pages* → *Create Application* → tab *Pages* → *Connect to Git*.
3. Autoriza la GitHub App de Cloudflare en el repo `TFG-IoT`.

### 3.2 Configuración del proyecto

1. **Project name**: `eduplay-frontend`.
2. **Production branch**: `main`.
3. **Build settings**:

   | Campo | Valor |
   |---|---|
   | Framework preset | Vite |
   | Build command | `npm ci && npm run build` |
   | Build output directory | `dist` |
   | Root directory | `frontend` |
   | Node version | 24 |

4. **Environment variables** (Production):

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://api-<org>.koyeb.app/api` |
   | `VITE_SOCKET_URL` | `https://api-<org>.koyeb.app` |
   | `VITE_SENTRY_ENABLED` | `true` |
   | `VITE_SENTRY_DSN` | (el del proyecto frontend en Sentry) |
   | `VITE_ENABLED_SESSION_MECHANICS` | `memory,association,sequence` |

5. **Preview deployments** → activar también para `Maintenance` (será nuestro staging).
6. Para previews, replica las variables apuntando a `api-staging-<org>.koyeb.app`.
7. *Save and Deploy*.

> ⚠️ El primer deploy va a fallar porque las URLs de la API (`VITE_API_URL`) todavía no existen. Es esperado — volveremos aquí en §6 cuando Koyeb esté listo.

---

## 4. Sentry — observabilidad

1. https://sentry.io → *Sign Up* (free tier 5K eventos/mes).
2. *Create Project* dos veces:
   - **Project 1** — Platform: Node.js · Name: `eduplay-backend`.
   - **Project 2** — Platform: React · Name: `eduplay-frontend`.
3. Para cada proyecto, copia el **DSN** desde *Settings* → *Client Keys (DSN)*.
4. Guarda en el gestor: `SENTRY_DSN` (backend) y `VITE_SENTRY_DSN` (frontend).

---

## 5. Koyeb — backend + worker

### 5.1 Cuenta

1. https://koyeb.com → *Sign Up with GitHub* (autoriza acceso al repo `TFG-IoT`).
2. Verifica el email.
3. Free tier: 1 servicio Web + 1 servicio Worker gratuitos por defecto. Para nuestro setup (4 servicios) necesitas activar la opción "Eco Instance" en cada servicio — siguen siendo gratuitos pero con cold start.

### 5.2 Antes de crear servicios: generar secretos

Genera JWT secrets aleatorios (uno por entorno — staging y prod):

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_REFRESH_SECRET
```

Repite para staging y para prod (4 secretos en total). Guárdalos en el gestor.

### 5.3 Crear `api-staging`

1. *Create Service* → *GitHub* → repo `TFG-IoT` → branch `Maintenance`.
2. **Builder**: Buildpack (Koyeb autodetecta Node 24 con Nixpacks).
3. **Work directory**: `backend`.
4. **Build command**: deja vacío (Nixpacks ejecuta `npm ci`).
5. **Run command**: `npm run start:prod`.
6. **Service name**: `api-staging`.
7. **Type**: Web Service · **Region**: `fra` · **Instance**: `Eco` (free) · **Scale**: 1.
8. **Exposed port**: `5000` · **Path**: `/`.
9. **Health checks** → HTTP · **Path**: `/health` (en T-902 lo migraremos a `/health/live`).
10. **Environment variables** (todas):

    | Variable | Valor | Secret |
    |---|---|---|
    | `NODE_ENV` | `production` | No |
    | `APP_ENV` | `staging` | No |
    | `PORT` | `5000` | No |
    | `SEED_ON_BOOT` | `true` | No |
    | `MONGO_URI` | `mongodb+srv://...rfid_games_staging?...` | **Sí** |
    | `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | **Sí** |
    | `REDIS_KEY_PREFIX` | `eduplay:staging:` | No |
    | `REDIS_FLUSH_LUA_ON_BOOT` | `true` | No |
    | `JWT_SECRET` | (64 hex) | **Sí** |
    | `JWT_REFRESH_SECRET` | (64 hex) | **Sí** |
    | `JWT_EXPIRES_IN` | `15m` | No |
    | `JWT_REFRESH_EXPIRES_IN` | `7d` | No |
    | `CORS_WHITELIST` | `https://maintenance.eduplay-frontend.pages.dev` | No |
    | `SENTRY_ENABLED` | `true` | No |
    | `SENTRY_DSN` | (el DSN del backend Sentry) | **Sí** |
    | `SUPABASE_URL` | `https://<id>.supabase.co` | No |
    | `SUPABASE_SERVICE_KEY` | (service role key) | **Sí** |
    | `SUPABASE_BUCKET` | `game-assets` | No |
    | `RFID_SOURCE` | `client` | No |
    | `SUPER_ADMIN_EMAIL` | (el que quieras como super admin) | No |
    | `SUPER_ADMIN_PASSWORD` | (password fuerte) | **Sí** |

11. *Deploy*.

### 5.4 Crear `worker-staging`

Misma configuración que api-staging con **estas diferencias**:

- **Service name**: `worker-staging`.
- **Type**: **Worker** (sin puerto expuesto).
- **Run command**: `npm run worker`.
- **Environment variables**: **idénticas** salvo:
  - `PORT` → no aplica (Worker no expone puerto).
  - `SEED_ON_BOOT=false` (el seed lo dispara el api-service, no el worker).

### 5.5 Crear `api-prod`

Misma plantilla que `api-staging` pero con:

- **Branch**: `main` (no `Maintenance`).
- **Service name**: `api-prod`.
- **APP_ENV**: `production`.
- **SEED_ON_BOOT**: `false` (jamás auto-seed en prod).
- **MONGO_URI**: la URI de `rfid_games_production`.
- **REDIS_URL**: la URI de `eduplay-prod`.
- **REDIS_KEY_PREFIX**: `eduplay:prod:`.
- **JWT secrets**: los de prod (distintos a staging).
- **CORS_WHITELIST**: `https://eduplay-frontend.pages.dev`.
- **SENTRY_DSN**: puede ser el mismo o uno dedicado a prod (ver §4).

### 5.6 Crear `worker-prod`

Misma plantilla que `worker-staging` pero apuntando a las URIs y secretos de prod, **Type: Worker**, branch `main`.

### 5.7 Comprobar las 4 apps

En el dashboard de Koyeb deberías tener:

```text
api-staging      [Web] [fra] [Maintenance]  → https://api-staging-<org>.koyeb.app
worker-staging   [Worker] [fra] [Maintenance]
api-prod         [Web] [fra] [main]         → https://api-<org>.koyeb.app
worker-prod      [Worker] [fra] [main]
```

Las URLs reales aparecen en cada servicio en *Settings* → *Domains*.

### 5.8 Idle timeout (WebSocket)

Por defecto Koyeb cierra conexiones idle a los 60s. Para partidas en pausa o tabs en background necesitamos ≥120s:

1. Servicio → *Settings* → *Networking* → *Idle Timeout*.
2. Sube a `120s` (o `600s` si tu plan lo permite).
3. Repite para `api-staging` y `api-prod`.

---

## 6. Cerrar el ciclo — Cloudflare apunta a Koyeb

Vuelve a Cloudflare Pages (§3) y reemplaza las variables `VITE_API_URL` y `VITE_SOCKET_URL` con las URLs reales de Koyeb del paso anterior.

Re-trigger el último deploy y comprueba que ya no falla.

---

## 7. Smoke test end-to-end

Una vez todo esté arriba:

```bash
# Backend liveness (debe devolver 200)
curl -i https://api-staging-<org>.koyeb.app/health

# Backend con detalle (200 + mongo:ok + redis:ok)
curl https://api-staging-<org>.koyeb.app/api/health | jq

# Frontend (debe devolver el HTML del bundle)
curl -I https://maintenance.eduplay-frontend.pages.dev
```

Abre el frontend en el navegador, intenta login (con las credenciales del seed staging) y comprueba en la consola del navegador que la llamada `POST /api/auth/login` va a `api-staging-<org>.koyeb.app`. Si llega un 200 con cookies `accessToken` y `refreshToken`, el stack está operativo.

---

## 8. Errores comunes y cómo resolverlos

| Síntoma | Causa probable | Fix |
|---|---|---|
| Koyeb log: `Error: MONGO_URI tiene formato inválido` | URI sin protocolo `mongodb+srv://` | Re-copiar de Atlas → *Connect* y pegar limpio |
| Koyeb log: `Redis: Fallo al conectar` con `connect ECONNREFUSED` | Endpoint mal o región Upstash distinta | Verificar el endpoint en Upstash → *Details*. Si la región Upstash está en US, latencia >100ms vs `fra` |
| Frontend dice `CORS error` al hacer login | `CORS_WHITELIST` en Koyeb no incluye la URL `*.pages.dev` | Editar variable en Koyeb y *Redeploy* |
| Frontend muestra `Network Error` y consola dice `wss://`... falla | Cloudflare Pages no usa el `VITE_SOCKET_URL` correcto | Verificar variables en Pages → *Settings* → *Environment* |
| `seed:if-empty` no rellena la DB tras el primer deploy | `SEED_ON_BOOT` no es `true` en `api-staging` | Revisar variable y redeploy |
| Tras unas horas, `req.ip` siempre `127.0.0.1` y rate limit es por la IP del proxy | Falta `trust proxy` activo | Verificar que `NODE_ENV=production` o setear `TRUST_PROXY=true` |

---

## 9. Próximos pasos

Una vez Koyeb + Atlas + Upstash + Pages están arriba:

- **T-902 Hardening**: separar `/health/live` (UptimeRobot) de `/health/ready` (Koyeb routing), graceful shutdown completo, WS timeouts.
- **T-903 CD pipeline**: workflows GitHub Actions para auto-deploy a staging y prod-via-tag con approval gate.
- **T-909 Docs v1.0.0**: README raíz + Runbook operacional + OpenAPI.

Cada uno tiene su propio doc; este `Deploy_Koyeb.md` es sólo el bootstrap inicial.

### 9.1 Configuración GitHub Actions (T-903)

Cuando los servicios de Koyeb estén creados y operativos, configurar en GitHub → Settings → Secrets and variables → Actions:

**Secrets (Settings → Secrets):**
- `KOYEB_API_TOKEN` — generado en Koyeb → Account Settings → API Tokens.
- `KOYEB_API_PROD_NAME` — nombre del servicio web de producción (ej. `api-prod`).
- `KOYEB_WORKER_PROD_NAME` — nombre del worker de producción (ej. `worker-prod`).
- `KOYEB_API_STAGING_NAME` — nombre del servicio web de staging.
- `KOYEB_WORKER_STAGING_NAME` — nombre del worker de staging.
- `KOYEB_ORG` — slug de la organización Koyeb (para previews).
- `SONAR_TOKEN` — SonarCloud, generado en https://sonarcloud.io → My Account → Security.
- `SENTRY_AUTH_TOKEN` — Sentry → Settings → Account → API → Auth Tokens (scope `project:releases`).
- `SENTRY_ORG_SLUG` — slug de organización Sentry.

**Variables (Settings → Variables):**
- `KOYEB_PROD_URL` — URL pública de producción (ej. `https://api-prod-<org>.koyeb.app`). **No es secret**: la URL aparece en el environment de GitHub como link clickable.
- `KOYEB_STAGING_URL` — URL pública de staging.
- `PREVIEW_DEPLOYS_ENABLED` — `true`/`false`. Activa `preview-deploy.yml`. Solo poner a `true` si el plan Koyeb soporta previews.
- `SENTRY_RELEASE_ENABLED` — `true`/`false`. Activa `sentry-release.yml`.
- `FAIL_ON_WARNINGS` — `true`/`false`. Política operativa de `zap-scan.yml`.

**Environment `production`:**
- Crear en Settings → Environments → New environment.
- *Required reviewers*: Samuel-Prog-CSec.
- *Deployment branches and tags*: Selected → añadir patrón `v*` (solo tags).
- Sin este environment, `deploy-production.yml` queda en *Waiting for approval* indefinidamente.

> Política `secrets` vs `vars`: tokens y nombres de servicio son secrets (revelan la organización Koyeb); las URLs operativas son vars (no son confidenciales, queremos verlas en logs y UI). Ver [ADR-167](Architecture_Decisions.md).

---

## Referencias

- **ADR-139**: Stack cloud Koyeb + Atlas + Upstash + Cloudflare Pages (justificación).
- **ADR-140**: Trust proxy + pool Mongoose tuning para Atlas M0.
- **`Secrets_Rotation.md`**: política de rotación de los secretos generados aquí.
- **Koyeb docs**: https://www.koyeb.com/docs
- **Atlas M0 limits**: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- **Upstash quotas**: https://upstash.com/pricing
