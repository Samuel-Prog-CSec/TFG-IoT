# Diseño: migración de despliegue a VPS autoalojada (Contabo) — v1.0.0

**Fecha:** 2026-07-06
**Alcance:** Full-stack (backend + frontend) + Infraestructura/DevOps
**Estado:** Aprobado por Samuel

## Problema

Koyeb elimina su free tier justo antes de la release v1.0.0, rompiendo el plan de despliegue
documentado en `documentation/Deploy_Koyeb.md` (Koyeb backend+worker + Cloudflare Pages
frontend + Atlas + Upstash). El tutor del TFG cede una VPS Contabo (Ubuntu 24.04.4 LTS, 6 vCPU
AMD EPYC, 11 GB RAM, 191 GB disco libre, acceso root por SSH, firewall inactivo, sin nada
instalado) para sustituir el hosting cloud. El objetivo es simplificar: desplegar frontend y
backend juntos (mismo origen, sin CORS) mediante un runner de GitHub Actions, evitando repetir
la dependencia de free-tiers de terceros que acaba de fallar con Koyeb.

## Decisión

Migración completa a self-hosted: MongoDB, Redis, backend, worker y frontend corren en Docker
Compose en la VPS (no solo el backend). Se mantienen dos entornos independientes — staging
(rama `Maintenance`) y producción (rama `main`, tags `v*`) — como dos stacks Compose aislados
en la misma máquina, reproduciendo el flujo de QA actual. El despliegue lo ejecuta un runner de
GitHub Actions self-hosted instalado en la propia VPS. TLS vía Let's Encrypt directo (sin
Cloudflare por delante), a petición explícita de Samuel.

### Topología

```
Internet
   │
   ▼ :80 / :443
┌─────────────────────────────────────────────────────────┐
│  Nginx (host, fuera de Docker) + Certbot                 │
│  - server_name app.<dominio>      → 127.0.0.1:8090       │
│  - server_name staging.<dominio>  → 127.0.0.1:8080       │
│  - TLS terminado aquí (1 cert multi-SAN, Let's Encrypt)  │
└─────────────────────────────────────────────────────────┘
         │                                  │
         ▼ proyecto Compose "eduplay-prod"  ▼ proyecto Compose "eduplay-staging"
   frontend (Nginx app) :80→127.0.0.1:8090   frontend (Nginx app) :80→127.0.0.1:8080
     SPA + proxy /api, /socket.io → backend    (idéntico, stack aislado)
   backend, worker, mongo, redis              backend, worker, mongo, redis
   (sin puertos publicados al host)           (sin puertos publicados al host)
```

Front y back comparten origen (patrón ya existente en `frontend/nginx.conf`, hoy solo usado en
dev local) — sin CORS. Cada stack tiene su propio Mongo/Redis: aislamiento total de datos entre
staging y producción.

### Hardening inicial de la VPS

- Usuario `deploy` (grupo `docker`, sudo solo si es imprescindible) con clave SSH propia;
  deshabilitar login root y autenticación por contraseña en `sshd_config` una vez migrada la
  clave.
- `ufw`: permitir solo 22/80/443, denegar el resto por defecto. Mongo/Redis nunca se publican a
  nivel de host, así que no necesitan regla de firewall.
- `fail2ban` para SSH.
- Swap file de 2 GB (red de seguridad barata; hay 191 GB libres).
- `unattended-upgrades` para parches de seguridad de Ubuntu 24.04 LTS.

### Docker Compose — fixes necesarios para 2 stacks simultáneos

Bloqueos reales encontrados al revisar `docker-compose.yml` de cara a correr dos proyectos
Compose (`eduplay-staging` / `eduplay-prod`) en el mismo host Docker:

1. **`container_name` fijo** en los 5 servicios (`rfid-games-mongo`, `rfid-games-backend`,
   etc.) — Docker exige nombres de contenedor únicos en todo el host; un segundo proyecto
   colisiona al arrancar. Se eliminan (Compose autogenera nombre por proyecto+servicio).
2. **`name:` fijo en los volúmenes** (`rfid-games-mongo-data`, `rfid-games-redis-data`) — mismo
   problema pero más grave: sin corregirlo, staging y producción **comparten la misma base de
   datos física**. Se elimina el `name:` explícito de ambos volúmenes.
3. `frontend/nginx.conf` usa `proxy_pass http://rfid-games-backend:5000/...` (el
   `container_name` como hostname). Se cambia a `backend:5000` — nombre de servicio, siempre
   resoluble vía DNS interno de Compose e independiente del nombre de proyecto. Mismo cambio
   para el location `/socket.io/`.
4. `docker/README.md` y los comandos de backup que usan `docker cp rfid-games-mongo:...` pasan
   a `docker compose -p <proyecto> cp mongo:...` (ya no dependen de `container_name`).
5. **Autenticación en MongoDB** (`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` + `authSource=admin`
   en `MONGO_URI`): hoy no hace falta porque Atlas la impone gratis; al autoalojar es defensa en
   profundidad razonable dado que se manejan datos de menores (RGPD Art. 8), aunque el puerto no
   se publique al host.

`docker/archive/docker-compose.prod.yml` se promueve a `docker-compose.prod.yml` en la raíz
(deja de ser "solo validación local antes de un tag") y pasa a ser el overlay real de
staging/producción, con el puerto de `frontend` mapeado a `127.0.0.1:8090` (prod) /
`127.0.0.1:8080` (staging) en vez de `80:80`, y sin exponer nunca mongo/redis.

### Reverse proxy + TLS

Nginx a nivel de sistema operativo (no en contenedor) + Certbot con su plugin de Nginx
(paquete `python3-certbot-nginx`): un único certificado con SAN para `app.<dominio>` y
`staging.<dominio>`. El paquete `certbot` de Ubuntu instala su propio `certbot.timer`
(systemd) — renovación automática dos veces al día, sin cron manual.

### CI/CD — runner self-hosted

- Runner de GitHub Actions registrado a nivel de repo, ejecutado como servicio systemd bajo el
  usuario `deploy` (nunca root), con label propia (p. ej. `contabo-vps`).
- **Regla de seguridad no negociable:** el label `self-hosted` solo puede usarse en workflows
  disparados por `push`/`tags`/`workflow_run`/`workflow_dispatch` — **nunca** en un workflow con
  trigger `pull_request`. El repo es público (asumido por `Free_Tier_Budget.md` para las cuotas
  de Actions) y GitHub desaconseja explícitamente runners self-hosted en repos públicos por el
  riesgo de ejecución de código arbitrario desde un fork. `deploy-staging.yml`
  (`workflow_run`) y `deploy-production.yml` (`tags` + `workflow_dispatch` con approval gate del
  environment `production`) ya cumplen este patrón; se documenta como regla explícita y se
  verifica que `build.yml`/`codeql.yml`/`dependency-review.yml`/`gitleaks.yml`/`zap-scan.yml`
  sigan en `ubuntu-latest`.
- `deploy-staging.yml` / `deploy-production.yml` dejan de usar la CLI de Koyeb. En su lugar
  (corriendo ya en la VPS): copian el `.env` persistente correspondiente — guardado fuera del
  workspace de git, en `/opt/eduplay/secrets/{staging,prod}.env` — al checkout del runner, y
  ejecutan `docker compose -f docker-compose.yml -f docker-compose.prod.yml -p
  eduplay-{staging,prod} up -d --build`.
- Smoke test contra `127.0.0.1:{8080,8090}/health/ready` directamente (el runner vive en la
  propia VPS, sin salir a Internet).
- Rollback sin API de Koyeb: `git checkout <sha-anterior> && docker compose up -d --build`
  con el mismo criterio de fallos que hoy (≥5/8 intentos en prod, <3/8 en staging). Más lento
  que el revert instantáneo de Koyeb (~1-2 min de rebuild) pero sin infraestructura nueva.
- Los secretos (`JWT_SECRET`, `MONGO_URI`, credenciales Mongo, etc.) viven solo en los `.env` de
  la VPS. Se retiran de GitHub `KOYEB_API_TOKEN`, `KOYEB_API_PROD_NAME`,
  `KOYEB_WORKER_PROD_NAME`, `KOYEB_API_STAGING_NAME`, `KOYEB_WORKER_STAGING_NAME`, `KOYEB_ORG`,
  `KOYEB_PROD_URL`, `KOYEB_STAGING_URL`. `SONAR_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`
  no cambian (no dependen de Koyeb).

### Backups

La BD pasa a ser responsabilidad propia (antes la cubría Atlas):

- Cron/systemd timer diario en la VPS: `mongodump` dentro del contenedor de cada stack,
  comprimido, rotación local de 7-14 días.
- Copia semanal fuera de la VPS: subida del dump comprimido a un bucket privado nuevo dentro
  del mismo proyecto Supabase Storage ya usado para assets (footprint mínimo, dentro del free
  tier).
- Redis no se respalda — estado efímero/recuperable (rate-limit, blacklist JWT, locks), mismo
  criterio que el invariante `scale=1` de ADR-223.

### Documentación a actualizar

| Documento | Cambio |
|---|---|
| `documentation/Deploy_Koyeb.md` | Se sustituye por `Deploy_VPS.md`: bootstrap completo (hardening, Docker, runner, Nginx/Certbot, primer arranque) |
| `documentation/Free_Tier_Budget.md` | Se retiran filas de Koyeb/Atlas/Upstash/Cloudflare Pages; se añade sección de monitoreo de recursos VPS (RAM/disco/CPU) |
| `documentation/Runbook_Operacional.md` | Playbooks de deploy/rollback reescritos para el flujo self-hosted |
| `documentation/SECURITY.md` | CORS/CSP y modelo de amenazas actualizados a los nuevos orígenes/dominio; sección nueva sobre el runner self-hosted y su restricción a triggers no-PR |
| `documentation/Secrets_Rotation.md` | Procedimiento de rotación vía edición de `.env` en la VPS + redeploy |
| `documentation/Architecture_Decisions.md` | ADR nuevo (motivo del pivote, alcance self-hosted, runner y regla de seguridad, TLS sin Cloudflare) |
| `docker/README.md`, `docker/archive/README.md` | Dejan de decir "Docker es solo para dev/testing local"; documentan los dos stacks reales; comandos `docker cp` → `docker compose cp` |
| `.github/workflows/preview-deploy.yml` | Se retira (dependía de previews de Cloudflare Pages) |
| `.github/workflows/zap-scan.yml` | Apunta la URL de escaneo al nuevo dominio de staging |
| `.github/workflows/free-tier-monthly-review.yml` | Checklist actualizada (fuera Koyeb/Atlas/Upstash/Cloudflare; dentro revisión de disco/RAM VPS) |

## Fuera de alcance

- Comprar el dominio y apuntar los registros `A`/`AAAA` de `app.<dominio>` y
  `staging.<dominio>` a `194.163.130.46` — acción de Samuel, no de Claude.
- Bootstrap inicial de la VPS (crear usuario, instalar Docker/Nginx/Certbot, registrar el
  runner) — lo ejecuta Samuel por SSH siguiendo `Deploy_VPS.md`; Claude no pide ni recibe la
  contraseña de root.
- Alta disponibilidad / multi-instancia: se mantiene el invariante `scale=1` ya vigente
  (ADR-223) — no aplica a este cambio de hosting.
