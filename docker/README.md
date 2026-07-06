# 🐳 Docker — Plataforma de Juegos Educativos con RFID

> **`docker-compose.yml` + `docker-compose.prod.yml` son el mecanismo real de
> despliegue.** Además de cubrir desarrollo local (perfil default/debug, ver
> abajo), este mismo par de ficheros levanta los dos entornos reales —
> `eduplay-staging` y `eduplay-prod` — en la VPS Contabo, uno por proyecto
> Compose (`-p eduplay-staging` / `-p eduplay-prod`), cada uno con su propio
> Mongo/Redis aislado. El despliegue lo ejecuta un runner de GitHub Actions
> self-hosted instalado en la propia VPS (`deploy-staging.yml` /
> `deploy-production.yml`). Aprovisionamiento completo de la VPS, dominios y
> TLS en [`documentation/Deploy_VPS.md`](../documentation/Deploy_VPS.md).

Este documento describe la configuración de Docker del proyecto: tanto el
uso en desarrollo local como el overlay de producción real (`docker-compose.prod.yml`).

## Índice

- [Requisitos](#requisitos)
- [Inicio Rápido](#inicio-rápido)
- [Arquitectura de Servicios](#arquitectura-de-servicios)
- [Comandos Útiles](#comandos-útiles)
- [Perfiles de Ejecución](#perfiles-de-ejecución)
- [Configuración](#configuración)
- [Desarrollo con Hot Reload](#desarrollo-con-hot-reload)
- [Testing local pre-deploy](#testing-local-pre-deploy)
- [Persistencia de Datos](#persistencia-de-datos)
- [Health Checks](#health-checks)
- [Troubleshooting](#troubleshooting)

---

## Requisitos

- **Docker Desktop** 4.0+ ([Descargar](https://www.docker.com/products/docker-desktop/))
- **Docker Compose** v2+ (incluido en Docker Desktop)

### Verificar instalación

```bash
docker --version
# Docker version 24.0.0 o superior

docker compose version
# Docker Compose version v2.20.0 o superior
```

---

## Inicio Rápido

### 1. Clonar y configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

### 2. Levantar todo el stack

```bash
docker compose up -d
```

### 3. Verificar que todos los servicios están healthy

```bash
docker compose ps
# Todos los servicios deberían mostrar "healthy"
```

### 4. Acceder a la aplicación

- **Frontend:** http://localhost
- **API:** http://localhost/api
- **Backend directo:** http://localhost:5000

---

## Arquitectura de Servicios

```
┌─────────────────────────────────────────────────────────────────┐
│                         Docker Network                          │
│                      (rfid-games-network)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────┐        ┌──────────────┐                      │
│   │   Frontend   │───────▶│   Backend    │                      │
│   │   (Nginx)    │        │  (Node.js)   │                      │
│   │   :80        │        │   :5000      │                      │
│   └──────────────┘        └──────┬───────┘                      │
│                                  │                              │
│              ┌───────────────────┼───────────────────┐          │
│              ▼                   ▼                   ▼          │
│   ┌──────────────┐     ┌──────────────┐    ┌──────────────┐     │
│   │    Redis     │     │   MongoDB    │    │  [Debug]     │     │
│   │   :6379      │     │   :27017     │    │  Tools       │     │
│   └──────────────┘     └──────────────┘    └──────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Servicios Disponibles

| Servicio            | Puerto | Descripción                       | Perfil  |
| ------------------- | ------ | --------------------------------- | ------- |
| **frontend**        | 80     | React SPA con Nginx               | default |
| **backend**         | 5000   | API REST Node.js/Express          | default |
| **mongo**           | 27017  | Base de datos MongoDB             | default |
| **redis**           | 6379   | Caché, tokens, estado de partidas | default |
| **redis-commander** | 8081   | UI web para Redis                 | debug   |
| **mongo-express**   | 8082   | UI web para MongoDB               | debug   |

---

## Comandos Útiles

### Gestión del Stack

```bash
# Iniciar todos los servicios
docker compose up -d

# Iniciar con herramientas de debug
docker compose --profile debug up -d

# Detener todos los servicios
docker compose down

# Reiniciar un servicio específico
docker compose restart backend

# Reconstruir imágenes (después de cambios en Dockerfile)
docker compose build --no-cache

# Ver estado de todos los servicios
docker compose ps
```

### Logs

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f backend

# Ver últimas 100 líneas
docker compose logs --tail 100 backend
```

### Ejecución de Comandos

```bash
# Ejecutar seed de base de datos
docker compose exec backend npm run seed

# Reset completo de base de datos
docker compose exec backend npm run seed:reset

# Acceder a shell de MongoDB (auth siempre activa, ver sección Configuración)
docker compose exec mongo mongosh rfid_games_db -u eduplay -p devMongo123! --authenticationDatabase admin

# Acceder a Redis CLI
docker compose exec redis redis-cli
```

---

## Perfiles de Ejecución

### Perfil Default (Desarrollo)

```bash
docker compose up -d
# Inicia: frontend, backend, mongo, redis
```

### Perfil Debug (Desarrollo)

```bash
docker compose --profile debug up -d
# Inicia: todo + redis-commander + mongo-express

# Acceder a herramientas:
# Redis Commander: http://localhost:8081
# Mongo Express:   http://localhost:8082
```

---

## Configuración

### Variables de Entorno

El archivo `.env` en la raíz del proyecto configura todos los servicios:

```env
# Entorno
NODE_ENV=development

# Puertos personalizados (opcional)
REDIS_PORT=6379
REDIS_COMMANDER_PORT=8081
MONGO_EXPRESS_PORT=8082

# Credenciales (importante en producción)
JWT_SECRET=tu_secret_seguro
JWT_REFRESH_SECRET=otro_secret_seguro
```

### Configuración de Redis

| Parámetro          | Valor       | Descripción               |
| ------------------ | ----------- | ------------------------- |
| `appendonly`       | yes         | Persistencia AOF activada |
| `appendfsync`      | everysec    | Sync a disco cada segundo |
| `maxmemory`        | 256mb       | Límite de memoria         |
| `maxmemory-policy` | noeviction  | Sin evicción: BullMQ, JWT blacklist e idempotencia requieren persistencia (los caches usan TTL) |

### Configuración de MongoDB

Igual que Redis, Mongo tiene **autenticación siempre activa** (no hay modo
sin auth, ni en local ni en despliegue). Sin `.env`, `docker-compose.yml`
usa por defecto `MONGO_INITDB_ROOT_USERNAME=eduplay` /
`MONGO_INITDB_ROOT_PASSWORD=devMongo123!` — cambia ambos valores en
producción.

Auth + `--replSet` exige `security.keyFile` (requisito de MongoDB, incluso
con un solo miembro): el servicio `mongo-keyfile-init` genera un keyfile
aleatorio en el volumen `rfid-games-mongo-keyfile-data` la primera vez
(`openssl rand -base64 756`) y no lo regenera en arranques posteriores —
regenerarlo invalidaría la autenticación interna de un replica set ya
inicializado.

`mongo-user-bootstrap` corre justo después y crea el usuario root vía la
"localhost exception" de MongoDB si todavía no existe ninguno — cubre el
caso de actualizar un volumen de datos que ya existía SIN auth (la imagen
oficial solo crea el usuario ella misma en un volumen recién creado/vacío;
en un volumen preexistente añade `--auth` igualmente pero nunca crea el
usuario, y sin este paso el stack no arrancaría nunca). Es idempotente: en
un volumen nuevo (donde la imagen ya creó el usuario) o en un arranque
posterior, no hace nada. `mongo-init` corre después y inicializa el replica
set `rs0` una sola vez (idempotente) ya autenticado con esas credenciales.

`MONGO_URI` (en `backend`/`worker`) deriva su valor por defecto de
`MONGO_INITDB_ROOT_USERNAME`/`PASSWORD` — si solo cambias la contraseña root
en el `.env`, `MONGO_URI` se actualiza sola. Solo hace falta sincronizar
ambas a mano si defines `MONGO_URI` explícita (p. ej. para un Mongo Atlas
externo en vez del contenedor local).

---

## Desarrollo con Hot Reload

Para desarrollo activo con hot-reload (cambios en código se reflejan inmediatamente):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Esto monta los directorios `frontend/` y `backend/` como volúmenes, permitiendo:

- **Frontend:** Vite dev server con HMR en puerto 5173
- **Backend:** Nodemon con auto-restart
- **Debug:** Puerto 9229 para debugger de Node.js

---

## Testing local pre-deploy

`docker-compose.prod.yml` (en la raíz del repositorio) es el overlay de producción — el mismo
que ejecutan `deploy-staging.yml`/`deploy-production.yml` en la VPS real (con
`-p eduplay-staging`/`-p eduplay-prod` y su propio `--env-file`, ver
[`documentation/Deploy_VPS.md`](../documentation/Deploy_VPS.md)). Levantarlo en local sirve
tanto para depurar el propio fichero como para validar un build representativo de producción
(restart policies, límites de recursos, puertos internos no expuestos, logging rotado) antes de
empujar un tag de release:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

> Usa un nombre de proyecto distinto (`-p verify-local`) y un `.env` de prueba si no quieres
> tocar los volúmenes del stack de desarrollo que puedas tener levantado en la misma máquina —
> por defecto Compose reutiliza los nombres de volumen/red del `docker-compose.yml` base.

Características del modo testing local de producción:

- ✅ `restart: always` en todos los servicios
- ✅ Límites de recursos (memoria y CPU)
- ✅ Puertos internos no expuestos (MongoDB, Redis)
- ✅ Logging con rotación de archivos
- ✅ Sin seed automático de base de datos
- ✅ Redis con configuración optimizada

### Tamaño de Imágenes

| Imagen              | Tamaño Esperado |
| ------------------- | --------------- |
| rfid-games-backend  | ~180MB          |
| rfid-games-frontend | ~25MB           |

Verificar tamaños:

```bash
docker images | grep rfid-games
```

---

## Persistencia de Datos

### Volúmenes

| Volumen                 | Servicio | Datos                  |
| ----------------------- | -------- | ---------------------- |
| `rfid-games-mongo-data` | MongoDB  | Base de datos completa |
| `rfid-games-redis-data` | Redis    | Caché y tokens         |

### Ver volúmenes

```bash
docker volume ls | grep rfid-games
```

### Backup

```bash
# Backup de MongoDB
docker compose exec mongo mongodump -u eduplay -p devMongo123! --authenticationDatabase admin --out /data/backup
docker compose cp mongo:/data/backup ./backups/mongo-$(date +%Y%m%d)

# Backup de Redis
docker compose exec redis redis-cli BGSAVE
docker compose cp redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

### Restaurar

```bash
# Restaurar MongoDB
docker compose cp ./backups/mongo-20240101 mongo:/data/backup
docker compose exec mongo mongorestore -u eduplay -p devMongo123! --authenticationDatabase admin /data/backup

# Restaurar Redis
docker compose stop redis
docker compose cp ./backups/redis-20240101.rdb redis:/data/dump.rdb
docker compose start redis
```

---

## Health Checks

Todos los servicios tienen health checks configurados:

| Servicio | Endpoint/Comando | Intervalo |
| -------- | ---------------- | --------- |
| frontend | `GET /health`    | 30s       |
| backend  | `GET /health`    | 30s       |
| mongo    | `mongosh ping`   | 30s       |
| redis    | `redis-cli ping` | 10s       |

Verificar salud:

```bash
docker compose ps
# Columna STATUS debe mostrar "healthy"

# Health check manual del backend
curl http://localhost:5000/health
```

---

## Troubleshooting

### Servicio no inicia

```bash
# Ver logs del servicio
docker compose logs backend

# Verificar que los puertos no están ocupados
lsof -i :5000

# Reintentar desde cero
docker compose down
docker compose up -d
```

### Error de conexión entre servicios

```bash
# Verificar que todos están en la misma red
docker network inspect rfid-games-network

# Probar conectividad desde backend
docker compose exec backend ping mongo
docker compose exec backend ping redis
```

### Limpiar todo y empezar de nuevo

```bash
# Detener y eliminar contenedores, redes y volúmenes
docker compose down -v

# Eliminar imágenes del proyecto
docker rmi $(docker images 'rfid-games-*' -q)

# Iniciar desde cero
docker compose build --no-cache
docker compose up -d
```

### MongoDB no conecta

```bash
# Verificar estado
docker compose logs mongo

# Acceder manualmente (auth siempre activa)
docker compose exec mongo mongosh -u eduplay -p devMongo123! --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

### Redis lleno

```bash
# Ver uso de memoria
docker compose exec redis redis-cli INFO memory

# Limpiar caché manualmente (⚠️ elimina tokens activos)
docker compose exec redis redis-cli FLUSHDB
```

---

## Estructura de Keys en Redis

El proyecto usa el prefijo `rfid-games:` para todas las keys:

| Key Pattern                    | Tipo   | TTL             | Descripción              |
| ------------------------------ | ------ | --------------- | ------------------------ |
| `rfid-games:blacklist:{jti}`   | String | Hasta exp token | Access tokens revocados  |
| `rfid-games:refresh:{jti}`     | Hash   | 7 días          | Refresh tokens activos   |
| `rfid-games:used:{jti}`        | String | 7 días          | Refresh tokens rotados   |
| `rfid-games:play:{playId}`     | Hash   | -               | Estado de partida activa |
| `rfid-games:card:{uid}`        | String | -               | Mapeo UID → playId       |
| `rfid-games:security:{userId}` | String | 1 hora          | Logout forzado           |

---

## Recursos

- [Documentación oficial de Docker Compose](https://docs.docker.com/compose/)
- [Redis Documentation](https://redis.io/docs/)
- [MongoDB Docker Hub](https://hub.docker.com/_/mongo)
- [Nginx Documentation](https://nginx.org/en/docs/)
