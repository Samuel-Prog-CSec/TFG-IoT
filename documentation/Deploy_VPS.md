# Deploy_VPS.md — Aprovisionamiento VPS Contabo (autoalojado)

> **Audiencia.** Persona responsable de operar el despliegue autoalojado (en TFG: el autor;
> en un traspaso futuro: quien administre la VPS).
>
> Sustituye a `Deploy_Koyeb.md`. Todo este documento lo ejecuta un humano por SSH en la
> VPS — Claude no tiene ni pide credenciales de acceso, y no puede verificar nada de lo
> descrito aquí contra la máquina real.
>
> **Estado de este documento.** Las secciones 1 a 5 describen pasos que **ya se ejecutaron**
> en la VPS real y están verificados funcionando hoy — se documentan como referencia
> operativa, para recuperación ante desastre y para poder reproducirlos íntegros en una VPS
> de reemplazo. La sección 6 en adelante describe lo que **queda pendiente**.

---

## 0. Datos de la VPS

- Proveedor: Contabo (cedida por el tutor del TFG).
- IP pública: `194.163.130.46` (actualizar este documento si cambia).
- SO: Ubuntu 24.04.4 LTS. 6 vCPU (AMD EPYC), 11 GB RAM, 191 GB disco libre.
- Dominios: `eduplay-tfg.duckdns.org` (producción), `eduplay-tfg-staging.duckdns.org`
  (staging) — ver §4 para el porqué de DuckDNS y cómo migrar a un dominio de pago.

---

## 1. Hardening inicial (ya ejecutado, como root)

> **Nota importante sobre el acceso SSH.** Esta VPS la cede el tutor del TFG — el root y su
> contraseña **no son nuestros**. Por eso el hardening aplicado aquí es **estrictamente
> aditivo**: se añade un usuario de bajo privilegio para desplegar, pero **no se toca en
> absoluto** el acceso root/contraseña existente (nada de `PermitRootLogin no` ni
> `PasswordAuthentication no` en `sshd_config`). Deshabilitar el acceso del propio dueño de
> la máquina sin su consentimiento explícito no es aceptable, y no se hizo. Si en el futuro
> el tutor decide restringir su propio acceso, es una decisión suya, no de este proyecto.

Usuario de despliegue (sudo + docker, sin tocar root):

```bash
adduser --disabled-password --gecos '' deploy
usermod -aG sudo deploy
usermod -aG docker deploy
# Copiar la clave pública SSH de quien vaya a operar a /home/deploy/.ssh/authorized_keys
```

Firewall (`ufw`) — solo abre lo necesario, todo lo demás deniega por defecto:

```bash
apt update && apt install -y ufw fail2ban
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

`fail2ban` para SSH, con jail explícito (ya ha bloqueado intentos de fuerza bruta reales en
producción):

```bash
# /etc/fail2ban/jail.d/sshd.local
[sshd]
enabled = true
port = ssh
backend = systemd
maxretry = 5
bantime = 3600
```

```bash
systemctl enable --now fail2ban
```

Swap de 2 GB (red de seguridad barata; hay 191 GB libres):

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Mongo y Redis **nunca** se publican a nivel de host (ver §3 y `docker-compose.prod.yml`), así
que no necesitan regla de `ufw` propia.

---

## 2. Docker Engine + Compose plugin (ya instalado)

Instalado con el script de conveniencia oficial de Docker (como `deploy`, con sudo):

```bash
curl -fsSL https://get.docker.com | sudo sh
```

Versiones en la VPS: **Docker Engine 29.6.1** + **Compose plugin v5.3.0** — confirmado con:

```bash
docker --version
docker compose version
```

`deploy` ya pertenece al grupo `docker` (añadido en §1), así que no necesita `sudo` para los
comandos `docker compose` del día a día.

---

## 3. Estructura de secretos persistentes (ya creada)

```bash
sudo mkdir -p /opt/eduplay/secrets /opt/eduplay/backups
sudo chown deploy:deploy /opt/eduplay/secrets /opt/eduplay/backups
chmod 700 /opt/eduplay/secrets
```

> `/opt/eduplay/` vive **fuera** del checkout de git que usa el runner (§5/§6) — es
> intencional: nada en `/opt/eduplay/secrets` puede perderse ni exponerse por un
> `git clean`, un `git checkout` o un rebuild del stack. Solo contiene secretos (`secrets/`)
> y dumps de backup (`backups/`), nunca código.

Existen ya `/opt/eduplay/secrets/staging.env` y `/opt/eduplay/secrets/prod.env`
(`chmod 600`, propiedad de `deploy`), con secretos reales generados para cada entorno:

| Categoría | Variables | Origen del valor |
|---|---|---|
| JWT | `JWT_SECRET`, `JWT_REFRESH_SECRET` | Generados **de nuevo por entorno** con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| Mongo / Redis | `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `REDIS_PASSWORD` | Generados de nuevo por entorno |
| Super admin | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Definidos de nuevo por entorno |
| Dominio / red | `CORS_WHITELIST`, `WSS_DOMAIN` | Apuntan al subdominio DuckDNS real de cada entorno (ver §4) |
| Aislamiento de stacks | `FRONTEND_PORT_BINDING` (`127.0.0.1:8080:80` staging / `127.0.0.1:8090:80` prod), `MONGO_VOLUME_NAME`, `REDIS_VOLUME_NAME`, `MONGO_KEYFILE_VOLUME_NAME`, `NETWORK_NAME` | Sufijados de forma distinta por entorno para que ambos stacks convivan en el mismo host Docker sin colisionar (ver `docker-compose.yml` y `docker-compose.prod.yml`) |
| Storage (sin cambios) | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET` | **Reutilizados** del `.env` local — el servicio Supabase no cambia con esta migración |
| RFID (sin cambios) | `RFID_HMAC_SECRET`, `RFID_HMAC_ENABLED`, `RFID_SOURCE` | **Reutilizados** del `.env` local. ⚠️ **Nunca regenerar** `RFID_HMAC_SECRET`: debe coincidir exactamente con el valor flasheado en el firmware físico del sensor |
| Rate limit / lockout | `RATE_LIMIT_*`, `ACCOUNT_LOCKOUT_*` | Reutilizados del `.env` local (política sin cambios) |
| Observabilidad | `SENTRY_ENABLED=false` | ⚠️ **Gap pendiente**, ver nota abajo |

> ⚠️ **TODO pendiente — Sentry.** Ambos ficheros tienen `SENTRY_ENABLED=false` porque el
> `SENTRY_DSN` real solo vivía en la configuración de entorno de Koyeb (que se está
> retirando) y no se copió a tiempo. Un humano debe generar/recuperar el DSN real, añadir
> `SENTRY_DSN=...` y poner `SENTRY_ENABLED=true` en `staging.env` y `prod.env`, y redesplegar
> ambos stacks. Hasta entonces, el proyecto corre en producción **sin captura de errores en
> Sentry** (los logs Pino en stdout/journalctl del contenedor siguen funcionando igual).

---

## 4. DNS (DuckDNS) + Nginx + Certbot (TLS) — ya configurado

### 4.1 DNS — DuckDNS (dominio gratuito)

No se compró un dominio de pago: se usan subdominios gratuitos de
[DuckDNS](https://www.duckdns.org). El alta es manual e intransferible a un agente —
DuckDNS solo permite login vía OAuth (GitHub/Google/Reddit/Twitter), así que un humano tiene
que entrar al dashboard, crear el subdominio y copiar el token de su cuenta. Una vez se tiene
el token, apuntar (o actualizar) el registro `A` sí es no interactivo:

```bash
curl "https://www.duckdns.org/update?domains=eduplay-tfg,eduplay-tfg-staging&token=<TOKEN>&ip=194.163.130.46"
```

Ambos subdominios (`eduplay-tfg.duckdns.org` y `eduplay-tfg-staging.duckdns.org`) ya están
creados y apuntando a `194.163.130.46`. Si la IP de la VPS cambia, vuelve a ejecutar el mismo
`curl` con la IP nueva.

> **Migrar a un dominio de pago en el futuro.** El resto de esta sección (Nginx + Certbot)
> no depende de que el dominio sea gratuito — con un dominio de pago apuntando por `A`/`AAAA`
> a la misma IP, los pasos de Nginx y Certbot de abajo son **idénticos**, solo cambia el
> nombre del dominio en `server_name` y en el comando de `certbot`. No hay que rediseñar nada.

### 4.2 Nginx del host (reverse proxy)

```bash
sudo apt install -y nginx python3-certbot-nginx
```

Dos server blocks, uno por entorno, en `/etc/nginx/sites-available/`:

- `eduplay-prod` — `server_name eduplay-tfg.duckdns.org;` → `proxy_pass http://127.0.0.1:8090;`
- `eduplay-staging` — `server_name eduplay-tfg-staging.duckdns.org;` → `proxy_pass http://127.0.0.1:8080;`

```bash
sudo ln -s /etc/nginx/sites-available/eduplay-prod /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/eduplay-staging /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Cada bloque proxea **todo** (`/`, incluido `/socket.io/`) al frontend Nginx-en-contenedor del
stack correspondiente (`127.0.0.1:8090` prod / `127.0.0.1:8080` staging), que a su vez ya
resuelve internamente `/api` y `/socket.io/` contra el servicio `backend` — front y back
comparten origen público, sin CORS entre ellos.

### 4.3 Certbot (Let's Encrypt)

```bash
sudo certbot --nginx --non-interactive --agree-tos -m <email> \
  -d eduplay-tfg.duckdns.org -d eduplay-tfg-staging.duckdns.org --redirect
```

El plugin `--nginx` de Certbot editó **en el sitio** los dos server blocks de `sites-available`
para añadir el `listen 443 ssl` y el redirect HTTP→HTTPS — no hace falta tocarlos a mano.
Certificado real ya emitido y activo, expira **2026-10-04**. La renovación automática corre
por el `systemd timer` que instala el propio paquete `certbot` de Ubuntu (confirmado activo
con `systemctl list-timers | grep certbot`) — no hay cron manual que mantener.

---

## 5. Runner self-hosted de GitHub Actions (ya registrado, online)

Registrado a nivel de repo (`Samuel-Prog-CSec/TFG-IoT`), con label `contabo-vps` y nombre
`contabo-vps-runner`. Instalado bajo `/home/deploy/actions-runner`:

```bash
mkdir -p /home/deploy/actions-runner && cd /home/deploy/actions-runner
# Descargar y extraer el paquete que muestra GitHub → repo → Settings → Actions → Runners
./config.sh --url https://github.com/Samuel-Prog-CSec/TFG-IoT --token <TOKEN_TEMPORAL> \
  --labels contabo-vps --name contabo-vps-runner
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

`./svc.sh install` se ejecuta con `sudo` porque crear el servicio systemd requiere privilegios
de root, pero el servicio queda **configurado para correr como el usuario `deploy`**, nunca
como root — verificable con `systemctl show actions.runner.*.service -p User`. El runner está
**online ahora mismo** (GitHub → repo → Settings → Actions → Runners).

**Regla de seguridad no negociable:** el label `self-hosted`/`contabo-vps` solo puede usarse
en workflows disparados por `push`/`tags`/`workflow_run`/`workflow_dispatch`. **Nunca** en un
workflow con trigger `pull_request` — el repo es público y un fork podría colar un workflow
que ejecute código arbitrario en esta VPS. `deploy-staging.yml` (`workflow_run` sobre CI en
`Maintenance`) y `deploy-production.yml` (`tags: ["v*"]` + `workflow_dispatch`, con approval
gate del environment `production`) ya cumplen este patrón. Ver
`documentation/SECURITY.md#runner-self-hosted`.

---

## 6. Primer arranque de cada stack (pendiente)

Todo lo anterior está listo, pero **todavía no se ha ejecutado en la VPS real** el primer
`docker compose ... up -d --build` de ninguno de los dos stacks — falta que el código de esta
migración (este mismo plan de 12 tareas) aterrice en `Maintenance`/`main`.

### 6.1 Prerrequisito — variables de repositorio en GitHub

Antes del primer despliegue automático, crea en GitHub → repo → *Settings* → *Secrets and
variables* → *Actions* → *Variables*:

- `STAGING_URL` = `https://eduplay-tfg-staging.duckdns.org`
- `PROD_URL` = `https://eduplay-tfg.duckdns.org`

Ambas ya se referencian desde `deploy-production.yml` (campo `environment.url`) y
`zap-scan.yml`, pero todavía no existen en la configuración del repositorio.

### 6.2 Camino recomendado — vía el pipeline ya reescrito

1. Fusiona esta migración en `Maintenance`. Al pasar `build.yml` (CI, en `ubuntu-latest`) con
   éxito sobre `Maintenance`, `deploy-staging.yml` se dispara solo (`workflow_run`) en el
   runner `contabo-vps` y ejecuta el primer `docker compose -f docker-compose.yml -f
   docker-compose.prod.yml -p eduplay-staging up -d --build` real (el `.env` persistente se
   copia primero al workspace, sin flag `--env-file`: ver nota más abajo), seguido de un smoke
   test contra `http://127.0.0.1:8080/api/health/ready`.
2. Cuando staging esté verificado, fusiona `Maintenance` → `main` y crea un tag semver
   (`git tag v1.0.0 && git push origin v1.0.0`). `deploy-production.yml` pedirá la aprobación
   manual del environment `production` y entonces ejecutará el primer `up -d --build` de
   `eduplay-prod`, con smoke test contra `127.0.0.1:8090/api/health/ready`.
3. Verifica desde fuera de la VPS:

   ```bash
   curl -I https://eduplay-tfg-staging.duckdns.org/api/health/ready
   curl -I https://eduplay-tfg.duckdns.org/api/health/ready
   ```

   Ambas deben devolver `200`.

> Nota de arquitectura: el checkout de código que usan estos workflows lo gestiona
> `actions/checkout@v4` dentro del propio directorio de trabajo del runner (bajo
> `/home/deploy/actions-runner/_work/...`) — no hace falta (ni existe) un `git clone` manual
> a mano en `/opt/eduplay`. `/opt/eduplay` solo guarda los `.env` persistentes (§3) que cada
> job copia al workspace **como `.env`** (nunca `.env.staging`/`.env.prod`) antes de levantar
> el stack.
>
> **Por qué el fichero se llama siempre `.env`, sin flag `--env-file`.** Compose sólo lee
> `--env-file` para la interpolación `${VAR}` al parsear el YAML — la directiva
> `env_file: [.env]` de los servicios `backend`/`worker` (`docker-compose.yml`) busca
> siempre un fichero llamado literalmente `.env` en el directorio del proyecto,
> independientemente de `--env-file` (verificado con `docker compose ... --env-file
> .env.prod config`: falla con `env file ".../.env not found"`). Como un único runner
> self-hosted procesa un job a la vez y Compose relee `.env` en cada invocación, staging y
> producción pueden reutilizar el mismo nombre de fichero en el mismo workspace de checkout
> sin colisionar entre despliegues.

### 6.3 Verificación manual directa (opcional, para depurar antes de fiarlo todo al pipeline)

Si quieres validar los ficheros Compose y los secretos directamente por SSH antes de que el
pipeline exista/funcione, como `deploy`:

```bash
git clone https://github.com/Samuel-Prog-CSec/TFG-IoT.git ~/manual-check && cd ~/manual-check
cp /opt/eduplay/secrets/staging.env .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -p eduplay-staging up -d --build
curl http://127.0.0.1:8080/api/health/ready
```

Repite con `prod.env` (copiado también como `.env`)/`eduplay-prod`/`8090` para producción. Este
checkout manual es solo para depuración puntual — el flujo operativo real es el del pipeline
(§6.2).

---

## 7. Backups (recomendado, pendiente de instalar)

Punto de partida razonable — **todavía no instalado** en la VPS:

```
0 3 * * * docker compose -p eduplay-prod exec -T mongo mongodump --archive --gzip > /opt/eduplay/backups/prod-$(date +\%Y\%m\%d).gz
0 4 * * * find /opt/eduplay/backups -name "*.gz" -mtime +14 -delete
```

Copia semanal fuera de la VPS a un bucket privado de Supabase Storage (mismo proyecto que los
assets del juego): **pendiente de escribir el script** — no existe todavía. Hasta que exista,
los backups viven únicamente en `/opt/eduplay/backups` de la propia VPS (sin copia
fuera-de-sitio ante fallo total del disco/proveedor).

Redis no se respalda — estado efímero/recuperable (rate-limit, blacklist JWT, locks BullMQ),
mismo criterio que el invariante `scale=1` de ADR-223.

---

## Referencias

- `docs/plans/2026-07-06-migracion-despliegue-vps-contabo-design.md` — diseño completo de la
  migración (topología, decisiones, fuera de alcance).
- `documentation/SECURITY.md#runner-self-hosted` — regla de triggers permitidos para el runner.
- `documentation/Secrets_Rotation.md` — rotación de los secretos de `/opt/eduplay/secrets/`.
- `documentation/Runbook_Operacional.md` — playbooks de deploy/rollback/incidentes.
- Certbot docs: https://eff-certbot.readthedocs.io/
- DuckDNS API: https://www.duckdns.org/spec.jsp
