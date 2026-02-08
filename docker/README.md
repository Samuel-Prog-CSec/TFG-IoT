# 🐳 Docker - Plataforma de Juegos Educativos con RFID

Este documento describe la configuración de Docker para el entorno de desarrollo y producción del proyecto.

## Índice

- [Requisitos](#requisitos)
- [Inicio Rápido](#inicio-rápido)
- [Arquitectura de Servicios](#arquitectura-de-servicios)
- [Comandos Útiles](#comandos-útiles)
- [Perfiles de Ejecución](#perfiles-de-ejecución)
- [Configuración](#configuración)
- [Desarrollo con Hot Reload](#desarrollo-con-hot-reload)
- [Producción](#producción)
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

# Acceder a shell de MongoDB
docker compose exec mongo mongosh rfid_games_db

# Acceder a Redis CLI
docker compose exec redis redis-cli
```

---

## Perfiles de Ejecución

### Perfil Default (Producción)

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
| `maxmemory-policy` | allkeys-lru | Evicción LRU cuando lleno |

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

## Producción

Para desplegar en producción:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Características del modo producción:

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
docker compose exec mongo mongodump --out /data/backup
docker cp rfid-games-mongo:/data/backup ./backups/mongo-$(date +%Y%m%d)

# Backup de Redis
docker compose exec redis redis-cli BGSAVE
docker cp rfid-games-redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb
```

### Restaurar

```bash
# Restaurar MongoDB
docker cp ./backups/mongo-20240101 rfid-games-mongo:/data/backup
docker compose exec mongo mongorestore /data/backup

# Restaurar Redis
docker compose stop redis
docker cp ./backups/redis-20240101.rdb rfid-games-redis:/data/dump.rdb
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

# Acceder manualmente
docker compose exec mongo mongosh --eval "db.adminCommand('ping')"
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
