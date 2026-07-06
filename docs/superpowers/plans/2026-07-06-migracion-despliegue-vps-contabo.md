# Migración de despliegue a VPS Contabo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el despliegue Koyeb+Atlas+Upstash+Cloudflare Pages por un stack Docker Compose autoalojado (Mongo+Redis+backend+worker+frontend) en la VPS Contabo, desplegado vía runner self-hosted de GitHub Actions, sin romper ninguno de los flujos locales de desarrollo/QA existentes.

**Architecture:** Ver `docs/plans/2026-07-06-migracion-despliegue-vps-contabo-design.md`. Dos stacks Compose aislados (staging/producción) detrás de un Nginx de host con TLS Let's Encrypt; MongoDB pasa a réplica de un solo nodo (requerido por `withTransaction`) con autenticación opcional vía variables de entorno.

**Tech Stack:** Docker Compose v5 (`!override` merge tag), MongoDB 7 (replica set `rs0`), Redis 7, Express 5, Nginx, Certbot, GitHub Actions self-hosted runner.

## Global Constraints

- Identificadores de código en inglés; comentarios/logs/mensajes de usuario en español (CLAUDE.md).
- `console.log` prohibido en backend — usar `logger` de Pino.
- Sin TypeScript en el proyecto.
- Ningún cambio debe alterar el comportamiento de `docker compose up -d` para el flujo de desarrollo local ya documentado en `docker/README.md`, salvo los cambios explícitamente documentados en la Tarea 3 (nombres de contenedor cosméticos) — el volumen de datos local de Samuel (`rfid-games-mongo-data`) NO debe quedar huérfano.
- Todo texto de commit sigue Conventional Commits, sin `Co-Authored-By`, sin IDs de tarea (T-XXX/M-XXX), sin sección de métricas.
- Claude no ejecuta `git commit`/`git merge` (reservado a humanos) — cada paso de commit en este plan lo ejecuta Samuel; el ejecutor del plan debe pararse antes de cada commit y dejar que Samuel lo revise y lo lance.
- La VPS real (bootstrap, registro del runner, Nginx/Certbot) no es alcanzable desde esta sesión — las tareas de infraestructura producen documentación/artefactos que Samuel ejecuta manualmente por SSH; no se marcan "hechas" hasta que Samuel confirme la ejecución real.

---

### Task 1: Trust proxy — número de saltos configurable

**Files:**
- Create: `backend/src/utils/trustProxyConfig.js`
- Modify: `backend/src/server.js:89-96`
- Test: `backend/tests/trustProxyConfig.test.js`

**Interfaces:**
- Produces: `resolveTrustProxyHops(env: NodeJS.ProcessEnv): number` — usada por `server.js` al llamar `app.set('trust proxy', ...)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/tests/trustProxyConfig.test.js`:

```js
const { resolveTrustProxyHops } = require('../src/utils/trustProxyConfig');

describe('resolveTrustProxyHops', () => {
  it('devuelve 1 por defecto si no hay TRUST_PROXY_HOPS', () => {
    expect(resolveTrustProxyHops({})).toBe(1);
  });

  it('respeta TRUST_PROXY_HOPS cuando es un entero válido', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
  });

  it('ignora valores no numéricos y usa el default', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: 'abc' })).toBe(1);
  });

  it('ignora valores <= 0 y usa el default', () => {
    expect(resolveTrustProxyHops({ TRUST_PROXY_HOPS: '0' })).toBe(1);
  });
});
```

- [ ] **Step 2: Confirmar que falla**

Run: `cd backend && npx jest trustProxyConfig.test.js`
Expected: FAIL — `Cannot find module '../src/utils/trustProxyConfig'`

- [ ] **Step 3: Implementar**

Crear `backend/src/utils/trustProxyConfig.js`:

```js
/**
 * @fileoverview Resuelve cuántos saltos de reverse proxy debe confiar Express
 * antes de tomar `req.ip` como la IP real del cliente.
 *
 * Con un único proxy de borde (hop=1) basta cuando Express está directamente
 * tras un solo reverse proxy. Al autoalojar en la VPS con Nginx de host (TLS)
 * delante del Nginx del contenedor frontend (SPA + proxy /api,/socket.io),
 * hay DOS saltos entre el cliente real y Express. Con `trust proxy` mal
 * configurado, `req.ip` (usado por rate limiters y logs de auditoría) apunta
 * a un proxy interno en vez del cliente real.
 *
 * @module utils/trustProxyConfig
 */

const DEFAULT_HOPS = 1;

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {number} Número de saltos de proxy a confiar (Express `trust proxy`).
 */
const resolveTrustProxyHops = env => {
  const parsed = Number.parseInt(env.TRUST_PROXY_HOPS, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_HOPS;
};

module.exports = { resolveTrustProxyHops };
```

- [ ] **Step 4: Confirmar que pasa**

Run: `cd backend && npx jest trustProxyConfig.test.js`
Expected: PASS — 4 tests verdes.

- [ ] **Step 5: Conectar en `server.js`**

En `backend/src/server.js`, junto a los demás `require('./utils/...')` (línea 55, tras el require de `serverState`):

```js
const { setReady, setShuttingDown, getIsShuttingDown } = require('./utils/serverState');
const { resolveTrustProxyHops } = require('./utils/trustProxyConfig');
```

Sustituir el bloque de las líneas 89-96:

```js
// Trust proxy en producción (Koyeb antepone un reverse proxy a cada servicio).
// Sin esto, Express ve la IP del proxy en `req.ip` y los rate limiters basados
// en IP confunden a todos los clientes con un único "atacante". En desarrollo
// se omite a propósito: confiar en `X-Forwarded-For` sin proxy real abre la
// puerta a bypass de rate limit suplantando la cabecera desde el cliente.
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
```

por:

```js
// Trust proxy en producción: uno o más reverse proxies delante del backend
// (Nginx de host + Nginx del contenedor frontend en la VPS, o el proxy de
// borde que corresponda). Sin esto, Express ve la IP del último proxy en
// `req.ip` y los rate limiters basados en IP confunden a todos los clientes
// con un único "atacante". En desarrollo se omite a propósito: confiar en
// `X-Forwarded-For` sin proxy real abre la puerta a bypass de rate limit
// suplantando la cabecera desde el cliente. TRUST_PROXY_HOPS indica cuántos
// saltos de proxy confiar (por defecto 1; la VPS con doble Nginx usa 2 — ver
// utils/trustProxyConfig.js).
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', resolveTrustProxyHops(process.env));
}
```

- [ ] **Step 6: Ejecutar toda la suite de backend para descartar roturas**

Run: `cd backend && npm test`
Expected: PASS (mismo número de tests que antes de la tarea + 4 nuevos).

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/trustProxyConfig.js backend/tests/trustProxyConfig.test.js backend/src/server.js
git commit -m "feat: permitir configurar el número de saltos de trust proxy"
```

---

### Task 2: MongoDB — réplica de un solo nodo + autenticación opcional

**Files:**
- Modify: `docker-compose.yml` (servicio `mongo`, nuevo servicio `mongo-init`, `backend`/`worker`: `depends_on` y `MONGO_URI`)
- Modify: `backend/src/utils/withTransaction.js:5-7` (corregir comentario desactualizado)

**Interfaces:**
- Produces: servicio Compose `mongo-init` (perfil por defecto, `restart: "no"`) que backend/worker consumen vía `depends_on: mongo-init: condition: service_completed_successfully`.

**Contexto:** `withTransaction()` usa `session.startTransaction()`, que requiere un replica set de MongoDB. El Mongo actual (`image: mongo:7` sin `--replSet`) es standalone: `withTransaction` ya degrada con gracia a ejecución sin sesión (no rompe el arranque), pero pierde silenciosamente la atomicidad que el código de borrado en cascada, finalización de partidas, etc. da por hecha. El comentario en `withTransaction.js:6` afirma que "el docker-compose configura un replica set" — no es cierto en el fichero actual; se corrige junto con el fix real.

- [ ] **Step 1: Añadir `--replSet` al servicio `mongo` en `docker-compose.yml`**

Modificar el servicio `mongo` (añadir `command:` y `environment:` con auth opcional):

```yaml
  mongo:
    image: mongo:7
    container_name: rfid-games-mongo
    restart: unless-stopped
    command: >
      mongod --replSet rs0 --bind_ip_all
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_INITDB_ROOT_USERNAME:-}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ROOT_PASSWORD:-}
    deploy:
      resources:
        limits:
          memory: 1G
    ports:
      - "${MONGO_PORT:-27017}:27017"
    volumes:
      - mongo-data:/data/db
    networks:
      - rfid-games-network
    labels:
      - "com.rfid-games.service=database"
      - "com.rfid-games.description=MongoDB database (replica set de un solo nodo)"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 20s
```

(`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` vacíos por defecto — la imagen oficial de Mongo arranca sin auth si están vacíos. Local dev no define estas variables en `.env`, así que sigue sin auth exactamente como hoy.)

- [ ] **Step 2: Añadir el servicio `mongo-init`**

Justo debajo del servicio `mongo` en `docker-compose.yml`:

```yaml
  # ============================================
  # MONGO-INIT — inicializa el replica set de un solo nodo (una vez)
  # Requerido por withTransaction (session.startTransaction necesita replica
  # set). Idempotente: si rs.status() ya responde ok, no hace nada.
  # ============================================
  mongo-init:
    image: mongo:7
    container_name: rfid-games-mongo-init
    depends_on:
      mongo:
        condition: service_healthy
    environment:
      - MONGO_INITDB_ROOT_USERNAME=${MONGO_INITDB_ROOT_USERNAME:-}
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_INITDB_ROOT_PASSWORD:-}
    networks:
      - rfid-games-network
    restart: "no"
    entrypoint:
      - bash
      - -c
      - >
        AUTH_ARGS="";
        if [ -n "$$MONGO_INITDB_ROOT_USERNAME" ]; then
          AUTH_ARGS="-u $$MONGO_INITDB_ROOT_USERNAME -p $$MONGO_INITDB_ROOT_PASSWORD --authenticationDatabase admin";
        fi;
        mongosh --host mongo:27017 $$AUTH_ARGS --eval "
          try { rs.status(); print('replica set ya inicializado'); }
          catch (e) { rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'mongo:27017'}]}); print('replica set inicializado'); }
        "
    labels:
      - "com.rfid-games.service=init-job"
      - "com.rfid-games.description=Inicializa el replica set rs0 (idempotente)"
```

(`$$` escapa el `$` para que Compose no intente interpolarlo como variable propia — debe llegar literal al shell del contenedor.)

- [ ] **Step 3: Backend/worker esperan a `mongo-init` y usan `replicaSet=rs0`**

En el servicio `backend`, sustituir:

```yaml
    environment:
      - PORT=5000
      - NODE_ENV=${NODE_ENV:-development}
      - TRUST_PROXY=true
      - REDIS_URL=redis://:${REDIS_PASSWORD:-devRedis123!}@redis:6379
      - MONGO_URI=mongodb://mongo:27017/rfid_games_db
    env_file:
      - .env
    depends_on:
      redis:
        condition: service_healthy
      mongo:
        condition: service_healthy
```

por:

```yaml
    environment:
      - PORT=5000
      - NODE_ENV=${NODE_ENV:-development}
      - TRUST_PROXY=true
      - REDIS_URL=redis://:${REDIS_PASSWORD:-devRedis123!}@redis:6379
      - MONGO_URI=${MONGO_URI:-mongodb://mongo:27017/rfid_games_db?replicaSet=rs0}
    env_file:
      - .env
    depends_on:
      redis:
        condition: service_healthy
      mongo:
        condition: service_healthy
      mongo-init:
        condition: service_completed_successfully
```

Repetir el mismo cambio de `environment.MONGO_URI` y `depends_on` en el servicio `worker` (misma estructura, sustituyendo su bloque `depends_on` equivalente).

(`MONGO_URI` pasa a template `${MONGO_URI:-...}`: local dev sigue resolviendo al mismo valor sin auth de siempre + `replicaSet=rs0`; el `.env` de staging/producción en la VPS define `MONGO_URI` completo con credenciales — ver Tarea 5.)

- [ ] **Step 4: Corregir el comentario desactualizado en `withTransaction.js`**

En `backend/src/utils/withTransaction.js:5-7`, sustituir:

```js
 * REQUISITO: Las transacciones requieren un replica set de MongoDB.
 * En desarrollo local con Docker, el docker-compose configura un replica set.
 * En entornos standalone (algunos tests), las transacciones no están disponibles.
```

por:

```js
 * REQUISITO: Las transacciones requieren un replica set de MongoDB.
 * `docker-compose.yml` configura Mongo como replica set de un solo nodo
 * (`rs0`, inicializado por el servicio `mongo-init`) en desarrollo local Y en
 * despliegue. En entornos standalone (tests con mongodb-memory-server sin
 * replSet), las transacciones no están disponibles y este módulo degrada con
 * gracia a ejecución sin sesión (ver `isTransactionNotSupportedError`).
```

- [ ] **Step 5: Verificar en local que el replica set se inicializa**

Run:
```bash
docker compose down
docker compose up -d
docker compose logs mongo-init
```
Expected: en los logs de `mongo-init` aparece `replica set inicializado` (primera vez) y el contenedor termina con exit code 0 (`docker compose ps mongo-init` muestra `Exited (0)`).

- [ ] **Step 6: Verificar que `withTransaction` usa sesión real (no degradada)**

Run: `docker compose exec mongo mongosh rfid_games_db --eval "rs.status().ok"`
Expected: `1`

Run: `docker compose logs backend | grep -i "sin soporte de transacciones"`
Expected: sin salida (si aparece, el replica set no se inicializó a tiempo).

- [ ] **Step 7: Ejecutar los tests de backend (deben seguir pasando; no se ha tocado nada que dependa de mongodb-memory-server standalone)**

Run: `cd backend && npm test`
Expected: PASS, mismo resultado que antes de esta tarea.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml backend/src/utils/withTransaction.js
git commit -m "feat: convertir MongoDB en replica set de un solo nodo con auth opcional"
```

---

### Task 3: Docker Compose — nombres de volumen configurables, sin `container_name`, fix de `nginx.conf`

**Files:**
- Modify: `docker-compose.yml` (todos los servicios: quitar `container_name`; volúmenes: nombre configurable)
- Modify: `frontend/nginx.conf:82,102`
- Modify: `docker/README.md` (comandos de backup)

**Contexto:** Dos stacks Compose simultáneos (staging + producción en la misma VPS) exigen que ni los nombres de contenedor ni los de volumen colisionen. `container_name` fijo es puramente cosmético (nada más depende de él tras el fix de `nginx.conf`) — se elimina sin riesgo. Los volúmenes SÍ contienen datos reales: quitar su `name:` fijo sin cuidado dejaría huérfano el volumen `rfid-games-mongo-data` que Samuel ya tiene en su máquina de desarrollo. Se parametrizan con el valor actual como default, así que en local dev (sin la variable definida) resuelven exactamente al mismo nombre de siempre.

- [ ] **Step 1: Quitar `container_name` de los 5 servicios en `docker-compose.yml`**

Eliminar la línea `container_name: rfid-games-<servicio>` de `frontend`, `backend`, `worker`, `mongo`, `redis` (y de `mongo-init`, añadido en la Tarea 2 — dejarlo sin `container_name` desde el principio, no hace falta tocarlo aquí).

- [ ] **Step 2: Parametrizar el nombre de los volúmenes**

Sustituir el bloque `volumes:` final de `docker-compose.yml`:

```yaml
volumes:
  redis-data:
    driver: local
    name: rfid-games-redis-data
  mongo-data:
    driver: local
    name: rfid-games-mongo-data
```

por:

```yaml
volumes:
  redis-data:
    driver: local
    name: ${REDIS_VOLUME_NAME:-rfid-games-redis-data}
  mongo-data:
    driver: local
    name: ${MONGO_VOLUME_NAME:-rfid-games-mongo-data}
```

- [ ] **Step 3: Arreglar `frontend/nginx.conf` para usar el nombre de servicio, no el `container_name` eliminado**

En `frontend/nginx.conf:82` y `:102`, sustituir:

```
        proxy_pass http://rfid-games-backend:5000/api/;
```

por:

```
        proxy_pass http://backend:5000/api/;
```

y:

```
        proxy_pass http://rfid-games-backend:5000/socket.io/;
```

por:

```
        proxy_pass http://backend:5000/socket.io/;
```

(`backend` es el nombre del servicio en `docker-compose.yml`; Compose lo resuelve vía DNS interno independientemente del nombre de proyecto o de si `container_name` existe.)

- [ ] **Step 4: Reconstruir y levantar para comprobar que el proxy sigue funcionando**

Run:
```bash
docker compose down
docker compose up -d --build
docker compose ps
```
Expected: los 6 servicios (`frontend`, `backend`, `worker`, `mongo`, `mongo-init`, `redis`) en estado `healthy` o `Exited (0)` (mongo-init).

Run: `curl -i http://localhost/api/health`
Expected: `HTTP/1.1 200 OK` con cuerpo JSON de salud (confirma que Nginx del frontend sigue proxeando correctamente a `backend:5000` tras el cambio de hostname).

- [ ] **Step 5: Confirmar que el volumen de Mongo sigue siendo el mismo (no se ha creado uno nuevo/huérfano)**

Run: `docker volume ls | grep rfid-games`
Expected: aparecen `rfid-games-mongo-data` y `rfid-games-redis-data` — los mismos nombres de siempre, sin sufijos nuevos.

- [ ] **Step 6: Actualizar los comandos de backup en `docker/README.md`**

Sustituir en la sección "Backup":

```bash
# Backup de MongoDB
docker compose exec mongo mongodump --out /data/backup
docker cp rfid-games-mongo:/data/backup ./backups/mongo-$(date +%Y%m%d)

# Backup de Redis
docker compose exec redis redis-cli BGSAVE
docker cp rfid-games-redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

por:

```bash
# Backup de MongoDB
docker compose exec mongo mongodump --out /data/backup
docker compose cp mongo:/data/backup ./backups/mongo-$(date +%Y%m%d)

# Backup de Redis
docker compose exec redis redis-cli BGSAVE
docker compose cp redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

Y en la sección "Restaurar":

```bash
# Restaurar MongoDB
docker cp ./backups/mongo-20240101 rfid-games-mongo:/data/backup
docker compose exec mongo mongorestore /data/backup

# Restaurar Redis
docker compose stop redis
docker cp ./backups/redis-20240101.rdb rfid-games-redis:/data/dump.rdb
docker compose start redis
```

por:

```bash
# Restaurar MongoDB
docker compose cp ./backups/mongo-20240101 mongo:/data/backup
docker compose exec mongo mongorestore /data/backup

# Restaurar Redis
docker compose stop redis
docker compose cp ./backups/redis-20240101.rdb redis:/data/dump.rdb
docker compose start redis
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml frontend/nginx.conf docker/README.md
git commit -m "refactor: aislar nombres de volumen y quitar container_name fijo para soportar stacks paralelos"
```

---

### Task 4: `docker-compose.prod.yml` — promoción desde archive, ocultar puertos de verdad, `stop_grace_period`

**Files:**
- Create: `docker-compose.prod.yml` (raíz — contenido adaptado de `docker/archive/docker-compose.prod.yml`)
- Modify: `docker-compose.yml` (puerto de `frontend` parametrizado)
- Delete: `docker/archive/docker-compose.prod.yml`, `docker/archive/README.md` (contenido absorbido en `docker/README.md`, Tarea 11)

**Contexto — bug encontrado:** se comprobó empíricamente (`docker compose config`) que el `docker-compose.prod.yml` archivado NUNCA ocultó los puertos de `backend`/`mongo`/`redis` como decía su documentación: Compose fusiona `ports:` de forma ADITIVA, así que `ports: []` en el override no borra los puertos ya publicados en la base — siguen publicados. El fix real es el tag de fusión `!override`, soportado por Compose v5 (confirmado con un experimento local: `ports: !override []` sí vacía la lista; `ports: []` no). Esto es necesario para que Mongo/Redis no queden expuestos a la red pública de la VPS.

- [ ] **Step 1: Parametrizar el puerto de `frontend` en `docker-compose.yml`**

Sustituir:

```yaml
    ports:
      - "80:80"
```

(dentro del servicio `frontend`) por:

```yaml
    ports:
      - "${FRONTEND_PORT_BINDING:-80:80}"
```

- [ ] **Step 2: Crear `docker-compose.prod.yml` en la raíz del repo**

```yaml
# ============================================================================
# Docker Compose - PRODUCCIÓN / STAGING (autoalojado, VPS)
# ============================================================================
# Overlay real de despliegue (staging y producción) — promovido desde
# docker/archive/ tras dejar de usar Koyeb. Usar SIEMPRE junto a un -p
# <nombre-de-proyecto> distinto por entorno (eduplay-staging / eduplay-prod)
# y un --env-file específico de ese entorno.
#
# Uso:
#   docker compose -f docker-compose.yml -f docker-compose.prod.yml \
#     -p eduplay-prod --env-file .env.prod up -d --build
#
# `!override` (no `ports: []`): Compose fusiona `ports` de forma ADITIVA por
# defecto — un override vacío NO retira los puertos ya publicados en la base.
# `!override` fuerza el reemplazo real de la lista (Compose spec, soportado
# desde v2.24+). Verificado localmente antes de adoptarlo.
# ============================================================================

services:
  frontend:
    restart: always
    ports:
      - !override "${FRONTEND_PORT_BINDING}"
    deploy:
      resources:
        limits:
          memory: 128M
          cpus: '0.5'
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  backend:
    restart: always
    ports: !override []
    stop_grace_period: 30s
    environment:
      - NODE_ENV=production
      - TRUST_PROXY_HOPS=2
    command: >
      sh -c "npm run seed:if-empty && npm run migrate:sessions && npm start"
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1'
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  worker:
    restart: always
    stop_grace_period: 30s
    environment:
      - NODE_ENV=production
    deploy:
      resources:
        limits:
          memory: 256M
          cpus: '0.5'
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  mongo:
    restart: always
    ports: !override []
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1'
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "5"

  redis:
    restart: always
    ports: !override []
    command: >
      redis-server
      --appendonly yes
      --appendfsync everysec
      --maxmemory 512mb
      --maxmemory-policy noeviction
      --tcp-keepalive 60
      --timeout 300
      --loglevel warning
      --requirepass ${REDIS_PASSWORD}
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "3"
```

(`TRUST_PROXY_HOPS=2` fijo aquí porque la topología de doble Nginx es igual en staging y producción de la VPS — ver Tarea 1. `FRONTEND_PORT_BINDING` sin default: debe venir siempre del `--env-file` de cada entorno, para forzar que cada entorno declare explícitamente su puerto de loopback — ver Tarea 5.)

- [ ] **Step 3: Borrar el archive obsoleto**

```bash
git rm docker/archive/docker-compose.prod.yml
```

(El `docker/archive/README.md` se actualiza/retira en la Tarea 11 junto con el resto de documentación — no lo borres todavía en este paso, evita un estado intermedio roto en el índice de docs.)

- [ ] **Step 4: Verificar que `!override` oculta los puertos de verdad**

Necesita un `.env` de prueba (ver Tarea 6 para las variables completas); de momento, usar uno mínimo:

```bash
cp .env .env.smoke-test
echo "FRONTEND_PORT_BINDING=127.0.0.1:8099:80" >> .env.smoke-test
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.smoke-test -p eduplay-smoke config | grep -A5 "^  mongo:" | grep -A5 "ports:"
```

Expected: no aparece ningún bloque `ports:` bajo `mongo` (a diferencia del comportamiento roto anterior, que mostraba el puerto 27017 publicado).

Run: `rm .env.smoke-test` (limpieza; no dejar ficheros `.env.*` de prueba en el repo).

- [ ] **Step 5: Commit**

```bash
git add docker-compose.prod.yml docker-compose.yml
git rm docker/archive/docker-compose.prod.yml
git commit -m "feat: promover el overlay de producción con ocultado real de puertos internos"
```

---

### Task 5: `.env.example` — nuevas variables

**Files:**
- Modify: `.env.example`

**Contexto:** documentar las variables nuevas introducidas por las Tareas 1-4 para que cualquier persona que aprovisione un entorno (Samuel en la VPS, o un sucesor del proyecto) sepa qué rellenar.

- [ ] **Step 1: Añadir las variables nuevas**

Junto a la línea `# TRUST_PROXY=true` (línea 28 de `.env.example`), añadir:

```
# TRUST_PROXY_HOPS: nº de reverse proxies delante del backend. 1 = un solo
# proxy (Nginx local de dev/testing). 2 = doble Nginx (VPS: Nginx de host con
# TLS + Nginx del contenedor frontend). Solo tiene efecto si TRUST_PROXY=true
# o NODE_ENV=production.
# TRUST_PROXY_HOPS=1
```

Junto a la definición de `MONGO_URI` (buscar su bloque de comentarios existente), añadir:

```
# MONGO_INITDB_ROOT_USERNAME / MONGO_INITDB_ROOT_PASSWORD: credenciales de
# root del contenedor Mongo autoalojado (docker-compose.yml). Vacías en
# desarrollo local (Mongo arranca sin auth). En VPS staging/producción deben
# ir rellenas Y reflejarse en MONGO_URI con `authSource=admin`, p. ej.:
#   mongodb://eduplay:CONTRASEÑA@mongo:27017/rfid_games_db?replicaSet=rs0&authSource=admin
# MONGO_INITDB_ROOT_USERNAME=
# MONGO_INITDB_ROOT_PASSWORD=

# MONGO_VOLUME_NAME / REDIS_VOLUME_NAME: nombre del volumen Docker con los
# datos persistentes. Sin definir, usan el nombre histórico
# (rfid-games-mongo-data / rfid-games-redis-data) — NO cambiar en local dev
# para no dejar huérfanos los datos existentes. En la VPS, cada stack
# (staging/producción) debe usar un nombre distinto para no compartir base de
# datos entre entornos.
# MONGO_VOLUME_NAME=
# REDIS_VOLUME_NAME=

# FRONTEND_PORT_BINDING: mapeo host:contenedor del puerto 80 del frontend.
# Sin definir, "80:80" (comportamiento histórico de desarrollo local). En la
# VPS cada entorno lo ata solo a loopback, p. ej. "127.0.0.1:8090:80".
# FRONTEND_PORT_BINDING=
```

Junto a la línea `# WSS_DOMAIN=` (línea 115), actualizar el comentario de ejemplo:

```
# WSS_DOMAIN: dominio WebSocket para la CSP connect-src en producción (helmet
# NO tiene fallback wildcard en prod — sin esto, el navegador bloquea la
# conexión Socket.IO). Ejemplo VPS: wss://app.tudominio.com
# WSS_DOMAIN=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: documentar variables de entorno para el despliegue autoalojado"
```

---

### Task 6: Validación local end-to-end — dos stacks simultáneos

**Files:** ninguno (tarea de verificación pura; no produce cambios de código).

**Contexto:** antes de tocar la VPS real, probar en local exactamente el escenario de staging+producción coexistiendo (aislamiento de datos, replica set, puertos ocultos, `trust proxy` con 2 saltos) usando dos proyectos Compose con nombres y `.env` distintos.

- [ ] **Step 1: Crear dos ficheros `.env` de prueba a partir del `.env` real**

```bash
cp .env .env.test-a
cp .env .env.test-b
cat >> .env.test-a <<'EOF'
MONGO_VOLUME_NAME=eduplay-test-a-mongo-data
REDIS_VOLUME_NAME=eduplay-test-a-redis-data
FRONTEND_PORT_BINDING=127.0.0.1:18080:80
MONGO_INITDB_ROOT_USERNAME=eduplay
MONGO_INITDB_ROOT_PASSWORD=testPassA123!
MONGO_URI=mongodb://eduplay:testPassA123!@mongo:27017/rfid_games_db?replicaSet=rs0&authSource=admin
EOF
cat >> .env.test-b <<'EOF'
MONGO_VOLUME_NAME=eduplay-test-b-mongo-data
REDIS_VOLUME_NAME=eduplay-test-b-redis-data
FRONTEND_PORT_BINDING=127.0.0.1:18090:80
MONGO_INITDB_ROOT_USERNAME=eduplay
MONGO_INITDB_ROOT_PASSWORD=testPassB123!
MONGO_URI=mongodb://eduplay:testPassB123!@mongo:27017/rfid_games_db?replicaSet=rs0&authSource=admin
EOF
```

- [ ] **Step 2: Levantar ambos stacks**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p eduplay-test-a --env-file .env.test-a up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p eduplay-test-b --env-file .env.test-b up -d --build
docker compose -p eduplay-test-a ps
docker compose -p eduplay-test-b ps
```

Expected: ambos muestran `frontend`, `backend`, `worker`, `mongo`, `redis` en `healthy`/`running` y `mongo-init` en `Exited (0)`, sin errores de "nombre de contenedor en uso" ni de "puerto ya publicado".

- [ ] **Step 3: Verificar aislamiento de puertos**

Run: `curl -i http://127.0.0.1:18080/health` y `curl -i http://127.0.0.1:18090/health`
Expected: ambos `200 OK`, respuestas independientes.

Run: `curl -s http://127.0.0.1:27017 ; curl -s http://127.0.0.1:6379`
Expected: `curl: (7) Failed to connect` en ambos (Mongo/Redis no publicados en ningún stack, confirmando el fix de la Tarea 4).

- [ ] **Step 4: Verificar aislamiento de datos**

```bash
docker compose -p eduplay-test-a exec -T mongo mongosh rfid_games_db \
  -u eduplay -p testPassA123! --authenticationDatabase admin \
  --eval "db.markers.insertOne({stack: 'a'})"

docker compose -p eduplay-test-b exec -T mongo mongosh rfid_games_db \
  -u eduplay -p testPassB123! --authenticationDatabase admin \
  --eval "db.markers.countDocuments({})"
```

Expected: el segundo comando devuelve `0` (el documento insertado en el stack A no es visible en el stack B — confirma que son volúmenes/bases de datos completamente independientes).

- [ ] **Step 5: Verificar `trust proxy` con 2 saltos**

```bash
curl -s -H "X-Forwarded-For: 203.0.113.9, 10.0.0.5" http://127.0.0.1:18080/api/health -o /dev/null -w "%{http_code}\n"
docker compose -p eduplay-test-a logs backend --tail 20 | grep -i "trust proxy\|req.ip" || true
```

(Verificación manual: no hay un endpoint que devuelva `req.ip` directamente hoy — si se quiere confirmar con precisión, añadir temporalmente un log de `req.ip` en un middleware de depuración, comprobar que con `TRUST_PROXY_HOPS=2` y dos entradas en `X-Forwarded-For` el valor resuelto es `203.0.113.9`, y revertir el log. Documentar el resultado en el PR/checklist de la Tarea 12.)

- [ ] **Step 6: Limpieza — tirar ambos stacks y sus volúmenes de prueba**

```bash
docker compose -p eduplay-test-a down -v
docker compose -p eduplay-test-b down -v
rm .env.test-a .env.test-b
docker volume ls | grep eduplay-test
```

Expected: el último comando no devuelve nada (volúmenes de prueba eliminados; el volumen real `rfid-games-mongo-data` de Samuel permanece intacto porque nunca se referenció en `.env.test-a`/`.env.test-b`).

- [ ] **Step 7: Confirmar que el stack de desarrollo normal de Samuel sigue intacto**

```bash
docker compose up -d
docker compose exec mongo mongosh rfid_games_db --eval "db.users.estimatedDocumentCount()"
```

Expected: devuelve el número de usuarios que ya existían antes de esta tarea (sin auth, sin `.env.test-*` de por medio) — confirma que el volumen de datos real de desarrollo no se ha tocado.

(No hay commit en esta tarea — es solo verificación.)

---

### Task 7: GitHub Actions — `deploy-staging.yml` con runner self-hosted

**Files:**
- Modify: `.github/workflows/deploy-staging.yml`

**Contexto:** reemplaza la redirección a la CLI de Koyeb por comandos Docker Compose ejecutados directamente en la VPS por el runner self-hosted. Regla de seguridad (ver diseño): el trigger sigue siendo `workflow_run` (nunca `pull_request`), así que un fork no puede disparar este workflow.

- [ ] **Step 1: Sustituir el contenido completo de `deploy-staging.yml`**

```yaml
name: Deploy Staging

# Dispara el redeploy del stack "eduplay-staging" en la VPS Contabo cuando el
# workflow CI (build.yml) finaliza con éxito en la rama Maintenance. Se
# ejecuta en el runner self-hosted registrado en la propia VPS — por eso el
# trigger sigue siendo `workflow_run` (nunca `pull_request`): así un fork no
# puede colar un workflow que ejecute código en la VPS. Ver
# documentation/SECURITY.md#runner-self-hosted.
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [Maintenance]
  workflow_dispatch:

permissions:
  contents: read
  actions: read

concurrency:
  group: deploy-staging
  cancel-in-progress: true

jobs:
  deploy:
    name: Redeploy en VPS (staging)
    runs-on: [self-hosted, linux, contabo-vps]
    timeout-minutes: 15

    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.head_branch == 'Maintenance')

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Copiar el .env persistente del entorno
        run: cp /opt/eduplay/secrets/staging.env .env.staging

      - name: Levantar el stack (build + up)
        run: |
          set -e
          docker compose -f docker-compose.yml -f docker-compose.prod.yml \
            -p eduplay-staging --env-file .env.staging up -d --build

      - name: Smoke test /health/ready (8 intentos × 15s, directo por loopback)
        id: smoke
        run: |
          set +e
          OK=0
          PORT=$(grep -oP 'FRONTEND_PORT_BINDING=127\.0\.0\.1:\K[0-9]+' .env.staging)
          for i in $(seq 1 8); do
            sleep 15
            HTTP_CODE=$(curl -sS -o /tmp/health.json -w "%{http_code}" "http://127.0.0.1:${PORT}/health/ready" || echo "000")
            echo "Intento $i: HTTP $HTTP_CODE"
            [ "$HTTP_CODE" = "200" ] && OK=$((OK + 1))
            cat /tmp/health.json || true
            echo ""
          done
          echo "ok_count=$OK" >> "$GITHUB_OUTPUT"
          if [ "$OK" -lt 3 ]; then
            echo "::error::Smoke test falló: sólo $OK/8 intentos devolvieron 200"
            exit 1
          fi
          echo "Smoke test OK: $OK/8 intentos verdes"

      - name: Rollback al commit anterior si el smoke test falla
        if: failure() && steps.smoke.outcome == 'failure'
        run: |
          set +e
          echo "::warning::Smoke test falló — volviendo al commit desplegado previamente"
          PREV_SHA=$(cat /opt/eduplay/secrets/staging.last-good-sha 2>/dev/null || echo "")
          if [ -n "$PREV_SHA" ]; then
            git fetch origin "$PREV_SHA"
            git checkout "$PREV_SHA"
            docker compose -f docker-compose.yml -f docker-compose.prod.yml \
              -p eduplay-staging --env-file .env.staging up -d --build
          else
            echo "::error::No hay SHA anterior registrado — rollback manual requerido"
          fi

      - name: Registrar este SHA como "último bueno" si el smoke test pasa
        if: success()
        run: echo "${{ github.sha }}" > /opt/eduplay/secrets/staging.last-good-sha

      - name: Resumen del despliegue
        if: always()
        run: |
          {
            echo "## Deploy a staging (VPS)"
            echo "- SHA: ${{ github.sha }}"
            echo "- /health/ready 200 hits: ${{ steps.smoke.outputs.ok_count }}/8"
            echo "- Outcome smoke test: ${{ steps.smoke.outcome }}"
          } >> "$GITHUB_STEP_SUMMARY"
```

(`/opt/eduplay/secrets/staging.env` y `staging.last-good-sha` son ficheros que Samuel crea/mantiene manualmente en la VPS — ver Tarea 10, `Deploy_VPS.md`. No existen en este repositorio.)

- [ ] **Step 2: Validar la sintaxis YAML localmente**

Run: `cd .github/workflows && npx yaml-lint deploy-staging.yml || python -c "import yaml,sys; yaml.safe_load(open('deploy-staging.yml'))"`
Expected: sin errores de parseo.

(No se puede ejecutar el workflow completo sin runner self-hosted real — la verificación funcional queda para cuando Samuel registre el runner, Tarea 10.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-staging.yml
git commit -m "ci: desplegar staging al runner self-hosted de la VPS en vez de Koyeb"
```

---

### Task 8: GitHub Actions — `deploy-production.yml` con runner self-hosted

**Files:**
- Modify: `.github/workflows/deploy-production.yml`

**Contexto:** mismo patrón que la Tarea 7, pero disparado por tags `v*`/`workflow_dispatch` y con el approval gate del environment `production` intacto (no depende de Koyeb, sigue funcionando igual con runner self-hosted).

- [ ] **Step 1: Sustituir el contenido completo de `deploy-production.yml`**

```yaml
name: Deploy Production

# Dispara el redeploy del stack "eduplay-prod" en la VPS Contabo cuando se
# publica un tag semver `v*`. El environment `production` mantiene el
# approval gate manual. Se ejecuta en el runner self-hosted de la VPS — el
# trigger sigue siendo `tags`/`workflow_dispatch` (nunca `pull_request`): ver
# documentation/SECURITY.md#runner-self-hosted.
#
# Rollback: sin API de Koyeb, "rollback automático" es volver al SHA anterior
# y reconstruir. Más lento (~1-2 min) que un revert de Koyeb, sin infra nueva.

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      tag:
        description: "Tag a desplegar (ej. v1.0.0)"
        required: true
        type: string

permissions:
  contents: write
  actions: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  validate-tag:
    name: Validar tag semver
    runs-on: ubuntu-latest
    timeout-minutes: 5

    outputs:
      version: ${{ steps.parse.outputs.version }}

    steps:
      - name: Parsear y validar tag
        id: parse
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          if ! echo "$TAG" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$'; then
            echo "::error::Tag '$TAG' no cumple semver vMAJOR.MINOR.PATCH(-prerelease)"
            exit 1
          fi
          VERSION="${TAG#v}"
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
          echo "Tag válido: $TAG (versión: $VERSION)"

  deploy:
    name: Redeploy en VPS (producción)
    needs: validate-tag
    runs-on: [self-hosted, linux, contabo-vps]
    timeout-minutes: 20
    environment:
      name: production
      url: ${{ vars.PROD_URL }}

    steps:
      - name: Checkout del tag
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.tag || github.ref_name }}

      - name: Copiar el .env persistente del entorno
        run: cp /opt/eduplay/secrets/prod.env .env.prod

      - name: Levantar el stack (build + up)
        run: |
          set -e
          docker compose -f docker-compose.yml -f docker-compose.prod.yml \
            -p eduplay-prod --env-file .env.prod up -d --build

      - name: Smoke test /health/ready (8 intentos × 15s, directo por loopback)
        id: smoke
        run: |
          set +e
          OK=0
          FAIL=0
          PORT=$(grep -oP 'FRONTEND_PORT_BINDING=127\.0\.0\.1:\K[0-9]+' .env.prod)
          for i in $(seq 1 8); do
            sleep 15
            HTTP_CODE=$(curl -sS -o /tmp/health.json -w "%{http_code}" "http://127.0.0.1:${PORT}/health/ready" || echo "000")
            echo "Intento $i: HTTP $HTTP_CODE"
            if [ "$HTTP_CODE" = "200" ]; then OK=$((OK + 1)); else FAIL=$((FAIL + 1)); fi
          done
          echo "ok_count=$OK" >> "$GITHUB_OUTPUT"
          echo "fail_count=$FAIL" >> "$GITHUB_OUTPUT"
          if [ "$FAIL" -ge 5 ]; then
            echo "::error::Smoke test fallido: $FAIL/8 intentos devolvieron != 200 → rollback"
            exit 1
          fi
          echo "Smoke test OK: $OK/8 intentos verdes"

      - name: Rollback al SHA anterior si el smoke test falla
        if: failure() && steps.smoke.outcome == 'failure'
        run: |
          set +e
          echo "::warning::Smoke test falló — volviendo al tag desplegado previamente"
          PREV_TAG=$(cat /opt/eduplay/secrets/prod.last-good-tag 2>/dev/null || echo "")
          if [ -n "$PREV_TAG" ]; then
            git fetch origin "refs/tags/$PREV_TAG"
            git checkout "$PREV_TAG"
            docker compose -f docker-compose.yml -f docker-compose.prod.yml \
              -p eduplay-prod --env-file .env.prod up -d --build
          else
            echo "::error::No hay tag anterior registrado — rollback manual requerido"
          fi

      - name: Registrar este tag como "último bueno" si el smoke test pasa
        if: success()
        run: echo "${{ github.event.inputs.tag || github.ref_name }}" > /opt/eduplay/secrets/prod.last-good-tag

      - name: Crear GitHub Release
        if: success()
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          TAG="${{ github.event.inputs.tag || github.ref_name }}"
          if gh release view "$TAG" >/dev/null 2>&1; then
            echo "Release $TAG ya existe — actualizando con notas de despliegue"
            gh release edit "$TAG" --notes-append $'\n\n**Desplegado a producción:** '$(date -u +"%Y-%m-%dT%H:%M:%SZ")
          else
            gh release create "$TAG" --title "$TAG" --generate-notes
          fi

      - name: Resumen del despliegue
        if: always()
        run: |
          {
            echo "## Deploy a producción (VPS)"
            echo "- Tag: ${{ github.event.inputs.tag || github.ref_name }}"
            echo "- Versión: ${{ needs.validate-tag.outputs.version }}"
            echo "- /health/ready 200 hits: ${{ steps.smoke.outputs.ok_count }}/8"
            echo "- /health/ready fallos: ${{ steps.smoke.outputs.fail_count }}/8"
            echo "- Outcome smoke test: ${{ steps.smoke.outcome }}"
          } >> "$GITHUB_STEP_SUMMARY"
```

(`vars.PROD_URL` es una variable de repo GitHub → Settings → Variables, a crear con el valor `https://app.tudominio.com` una vez el dominio exista — mismo mecanismo que `vars.STAGING_URL` en la Tarea 9.)

- [ ] **Step 2: Validar sintaxis YAML**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-production.yml'))"`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-production.yml
git commit -m "ci: desplegar producción al runner self-hosted de la VPS en vez de Koyeb"
```

---

### Task 9: Retirar `preview-deploy.yml`, actualizar `zap-scan.yml` y `free-tier-monthly-review.yml`

**Files:**
- Delete: `.github/workflows/preview-deploy.yml`
- Modify: `.github/workflows/zap-scan.yml`
- Modify: `.github/workflows/free-tier-monthly-review.yml`

- [ ] **Step 1: Leer `preview-deploy.yml` para confirmar que depende de Cloudflare Pages antes de borrar**

Run: `grep -i "cloudflare\|pages.dev" .github/workflows/preview-deploy.yml`
Expected: al menos una coincidencia (confirma la dependencia antes de eliminar el fichero).

- [ ] **Step 2: Borrar el workflow**

```bash
git rm .github/workflows/preview-deploy.yml
```

- [ ] **Step 3: Actualizar la URL objetivo en `zap-scan.yml`**

Leer el fichero, localizar la URL de staging apuntada (probablemente una variable `KOYEB_STAGING_URL` o similar) y sustituirla por la referencia al nuevo dominio de staging (variable de repo `vars.STAGING_URL`, a crear en GitHub → Settings → Variables con el valor `https://staging.tudominio.com` una vez exista el dominio).

- [ ] **Step 4: Actualizar el checklist de `free-tier-monthly-review.yml`**

Quitar del cuerpo de la issue generada las líneas de checklist correspondientes a Koyeb, Atlas, Upstash y Cloudflare Pages (ya no aplican). Añadir una línea de checklist:

```
- [ ] VPS Contabo: uso de disco (`df -h /`) y memoria (`free -h`) dentro de rango — ver documentation/Free_Tier_Budget.md
```

- [ ] **Step 5: Validar sintaxis YAML de los ficheros modificados**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/zap-scan.yml')); yaml.safe_load(open('.github/workflows/free-tier-monthly-review.yml'))"`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/zap-scan.yml .github/workflows/free-tier-monthly-review.yml
git rm .github/workflows/preview-deploy.yml
git commit -m "ci: retirar preview-deploy.yml y actualizar objetivos de escaneo tras dejar Cloudflare/Koyeb"
```

---

### Task 10: Documentación — `Deploy_VPS.md` (nuevo runbook de bootstrap)

**Files:**
- Create: `documentation/Deploy_VPS.md`
- Delete: `documentation/Deploy_Koyeb.md`

**Contexto:** este documento lo EJECUTA Samuel por SSH — Claude no tiene acceso a la VPS real. Debe cubrir, en orden: hardening, Docker, Nginx+Certbot, registro del runner, estructura de `/opt/eduplay/secrets/`, primer arranque de cada stack.

- [ ] **Step 1: Escribir `documentation/Deploy_VPS.md`**

Contenido (estructura mínima; Samuel puede ampliar detalles operativos al ejecutarlo):

```markdown
# Deploy_VPS.md — Aprovisionamiento VPS Contabo (autoalojado)

> Sustituye a Deploy_Koyeb.md. Todo este documento lo ejecuta un humano por
> SSH en la VPS — Claude no tiene ni pide credenciales de acceso.

## 0. Datos de la VPS

- Proveedor: Contabo (cedida por el tutor del TFG).
- IP pública: 194.163.130.46 (actualizar si cambia).
- SO: Ubuntu 24.04.4 LTS. 6 vCPU, 11 GB RAM, 191 GB disco libre.

## 1. Hardening inicial (una vez, como root)

```bash
adduser deploy
usermod -aG sudo deploy
# Copiar la clave pública SSH de Samuel a /home/deploy/.ssh/authorized_keys
```

Editar `/etc/ssh/sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no`.
`systemctl restart sshd`.

```bash
apt update && apt install -y ufw fail2ban unattended-upgrades
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades
```

Swap de 2 GB:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Docker + Compose (como `deploy`, con sudo)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# Cerrar sesión y volver a entrar para que el grupo surta efecto
docker compose version   # confirmar >= v2.24 (soporte de !override)
```

## 3. Estructura de secretos persistentes

```bash
sudo mkdir -p /opt/eduplay/secrets
sudo chown deploy:deploy /opt/eduplay/secrets
chmod 700 /opt/eduplay/secrets
```

Crear `/opt/eduplay/secrets/staging.env` y `/opt/eduplay/secrets/prod.env` con,
como mínimo, todas las variables de `.env.example` (JWT secrets generados con
`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`,
`MONGO_INITDB_ROOT_USERNAME/PASSWORD`, `MONGO_URI` con esas credenciales +
`replicaSet=rs0&authSource=admin`, `MONGO_VOLUME_NAME`/`REDIS_VOLUME_NAME`
distintos por entorno, `FRONTEND_PORT_BINDING=127.0.0.1:8080:80` (staging) /
`127.0.0.1:8090:80` (prod), `TRUST_PROXY_HOPS=2`, `WSS_DOMAIN`,
`CORS_WHITELIST` con el dominio real, `APP_ENV=staging`/`production`).
`chmod 600` a ambos ficheros.

## 4. Nginx de host + Certbot (TLS)

```bash
sudo apt install -y nginx python3-certbot-nginx
```

Crear `/etc/nginx/sites-available/eduplay` con dos server blocks (`app.tudominio.com`
→ `127.0.0.1:8090`, `staging.tudominio.com` → `127.0.0.1:8080`), habilitar con
`ln -s` a `sites-enabled/`, `nginx -t && systemctl reload nginx`.

```bash
sudo certbot --nginx -d app.tudominio.com -d staging.tudominio.com
```

Certbot edita los server blocks para HTTPS y deja programado su propio
`certbot.timer` (renovación automática, sin cron manual).

## 5. Runner self-hosted de GitHub Actions

En GitHub → repo → Settings → Actions → Runners → New self-hosted runner,
seguir las instrucciones con label adicional `contabo-vps`. Instalar bajo el
usuario `deploy` (NO root):

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# Descargar y configurar según las instrucciones que muestra GitHub
./config.sh --url https://github.com/<org>/<repo> --token <TOKEN> --labels contabo-vps
sudo ./svc.sh install deploy
sudo ./svc.sh start
```

**Regla de seguridad:** este runner solo debe usarse en workflows disparados
por `push`/`tags`/`workflow_run`/`workflow_dispatch`. Nunca añadir la label
`self-hosted`/`contabo-vps` a un workflow con trigger `pull_request`.

## 6. Primer arranque de cada stack

```bash
cd /opt/eduplay # o donde el runner deje el checkout tras el primer job manual
git clone https://github.com/<org>/<repo>.git . # o usar el checkout del runner
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -p eduplay-staging --env-file /opt/eduplay/secrets/staging.env up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -p eduplay-prod --env-file /opt/eduplay/secrets/prod.env up -d --build
```

Verificar: `curl https://staging.tudominio.com/health/ready` y
`curl https://app.tudominio.com/health/ready` → `200`.

## 7. Backups

Cron diario (`crontab -e` como `deploy`):

```
0 3 * * * docker compose -p eduplay-prod exec -T mongo mongodump --archive --gzip > /opt/eduplay/backups/prod-$(date +\%Y\%m\%d).gz
0 4 * * * find /opt/eduplay/backups -name "*.gz" -mtime +14 -delete
```

Copia semanal a Supabase Storage: pendiente de scriptar (bucket privado
`db-backups`, mismo proyecto Supabase que los assets).

## Referencias

- `docs/plans/2026-07-06-migracion-despliegue-vps-contabo-design.md`
- `documentation/Secrets_Rotation.md`
- `documentation/Runbook_Operacional.md`
```

- [ ] **Step 2: Borrar `documentation/Deploy_Koyeb.md`**

```bash
git rm documentation/Deploy_Koyeb.md
```

- [ ] **Step 3: Commit**

```bash
git add documentation/Deploy_VPS.md
git rm documentation/Deploy_Koyeb.md
git commit -m "docs: sustituir Deploy_Koyeb.md por el runbook de bootstrap de la VPS Contabo"
```

---

### Task 11: Documentación — actualizar los `.md` existentes afectados

**Files:**
- Modify: `documentation/Free_Tier_Budget.md`
- Modify: `documentation/Runbook_Operacional.md`
- Modify: `documentation/SECURITY.md`
- Modify: `documentation/Secrets_Rotation.md`
- Modify: `docker/README.md`
- Delete: `docker/archive/README.md`

- [ ] **Step 1: `Free_Tier_Budget.md`**

Quitar las filas de la tabla §1 correspondientes a Koyeb, Cloudflare Pages (bandwidth ilimitado ya no aplica — sigue habiendo Cloudflare para DNS si se usa, pero no como hosting), y ajustar las filas de Atlas/Upstash indicando que ya no se usan (o eliminarlas si el reemplazo es total). Añadir una fila nueva "VPS Contabo (recursos propios)" con: límite duro = 11 GB RAM / 191 GB disco / 6 vCPU (fijo, sin cuota externa), consumo estimado de los 2 stacks (staging+prod) según los límites de memoria de `docker-compose.prod.yml` (~2.2 GB por stack, ~4.4 GB total), monitoreo = `free -h`/`df -h` manual o cron con alerta por email, sin umbral de "migración" (recurso propio, no de terceros).

- [ ] **Step 2: `Runbook_Operacional.md`**

Localizar los playbooks de deploy/rollback que referencian Koyeb (probablemente ligados a T-902/T-903) y sustituir sus pasos por los nuevos comandos de la Tarea 7/8 (`docker compose ... -p eduplay-{staging,prod} up -d --build`, rollback por SHA/tag anterior).

- [ ] **Step 3: `SECURITY.md`**

Actualizar la sección de CORS/CSP con los nuevos orígenes (`https://app.tudominio.com`, `https://staging.tudominio.com`) en vez de `*.koyeb.app`/`*.pages.dev`. Añadir una sección nueva "Runner self-hosted" documentando la regla de seguridad de la Tarea 7/8 (label `contabo-vps` solo en workflows sin trigger `pull_request`) y el motivo (repo público + riesgo de ejecución de código arbitrario desde un fork).

- [ ] **Step 4: `Secrets_Rotation.md`**

Sustituir el procedimiento de rotación de secretos vía UI de Koyeb por: editar `/opt/eduplay/secrets/{staging,prod}.env` en la VPS y relanzar `docker compose ... up -d` (recoge el nuevo valor al recrear el contenedor).

- [ ] **Step 5: `docker/README.md`**

Quitar el aviso de cabecera ("Docker se usa únicamente para desarrollo local...") — sustituir por una nota indicando que `docker-compose.yml` + `docker-compose.prod.yml` son ahora el mecanismo real de despliegue (staging y producción en la VPS), documentado en `documentation/Deploy_VPS.md`. Actualizar la sección "Testing local pre-deploy" para reflejar que el comando `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` (sin `docker/archive/`) sirve tanto para validar localmente como para el despliegue real.

- [ ] **Step 6: Borrar `docker/archive/README.md`**

```bash
git rm docker/archive/README.md
rmdir docker/archive 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add documentation/Free_Tier_Budget.md documentation/Runbook_Operacional.md \
  documentation/SECURITY.md documentation/Secrets_Rotation.md docker/README.md
git rm docker/archive/README.md
git commit -m "docs: actualizar documentacion operativa tras la migracion a la VPS Contabo"
```

---

### Task 12: Documentación — ADR en `Architecture_Decisions.md`

**Files:**
- Modify: `documentation/Architecture_Decisions.md`

- [ ] **Step 1: Añadir el ADR**

Seguir el formato de ADR existente en el documento (título, contexto, decisión, alcance, consecuencias). Contenido:

- **Título:** Migración de despliegue Koyeb→VPS autoalojada (Contabo)
- **Alcance:** Full-stack (Backend + Frontend) + Infraestructura
- **Contexto:** Koyeb elimina su free tier antes de la release v1.0.0. El tutor del TFG cede una VPS Contabo.
- **Decisión:** self-hosted completo (Mongo+Redis+backend+worker+frontend) en Docker Compose, dos stacks aislados (staging/producción) desplegados por un runner self-hosted de GitHub Actions, TLS Let's Encrypt directo (sin Cloudflare por delante, a petición explícita), MongoDB convertido a replica set de un solo nodo (requerido por `withTransaction`, antes silenciosamente degradado a standalone), fix del bug de `ports:` aditivo en Compose vía `!override`.
- **Consecuencias:** se retira la dependencia de free-tiers externos que motivó este cambio; backups pasan a ser responsabilidad propia (mongodump + copia a Supabase Storage); el runner self-hosted exige la disciplina de no usarlo en triggers `pull_request`.

- [ ] **Step 2: Commit**

```bash
git add documentation/Architecture_Decisions.md
git commit -m "docs: registrar ADR de la migracion de despliegue a VPS autoalojada"
```

---

## Self-Review (completado por quien escribió el plan)

- **Cobertura del spec:** las 8 secciones del diseño (topología, hardening, Docker Compose, TLS, CI/CD, backups, documentación, fuera de alcance) tienen tarea correspondiente (1-4 código/compose, 5-6 validación, 7-9 CI/CD, 10-12 documentación). El hardening de VPS (§2 del diseño) y el TLS (§4) son ejecución manual de Samuel documentada en la Tarea 10, no código de este repo.
- **Hallazgos adicionales no previstos en el diseño original**, incorporados durante la investigación de este plan: bug de merge aditivo de `ports:` en Compose (Tarea 4, verificado empíricamente), pérdida de atomicidad silenciosa de `withTransaction` por falta de replica set (Tarea 2), riesgo de `req.ip` incorrecto con doble proxy (Tarea 1), riesgo de truncar el graceful shutdown de 25s con el `stop_grace_period` por defecto de Docker de 10s (Tarea 4), riesgo de dejar huérfano el volumen de datos local de Samuel al parametrizar nombres (mitigado en Tarea 3 con defaults idénticos al valor actual).
- **Sin placeholders:** todos los bloques de código/YAML de este plan son completos; el único valor pendiente es el dominio real (`tudominio.com`), marcado explícitamente como pendiente de que Samuel lo registre (fuera de alcance de Claude).
