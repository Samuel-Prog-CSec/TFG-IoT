# 🐳 Docker - Plataforma de Juegos Educativos con RFID

Este documento describe la configuración de Docker para el entorno de desarrollo del proyecto.

## Índice

- [Requisitos](#requisitos)
- [Inicio Rápido](#inicio-rápido)
- [Servicios Disponibles](#servicios-disponibles)
- [Comandos Útiles](#comandos-útiles)
- [Perfiles](#perfiles)
- [Configuración](#configuración)
- [Persistencia de Datos](#persistencia-de-datos)
- [Troubleshooting](#troubleshooting)

---

## Requisitos

- **Docker Desktop** 4.0+ ([Descargar](https://www.docker.com/products/docker-desktop/))
- **Docker Compose** v2+ (incluido en Docker Desktop)

### Verificar instalación

```powershell
docker --version
# Docker version 24.0.0 o superior

docker compose version
# Docker Compose version v2.20.0 o superior
```

---

## Inicio Rápido

### 1. Iniciar Redis (mínimo necesario)

```powershell
# Desde la raíz del proyecto
docker compose up -d redis
```

### 2. Verificar que Redis está corriendo

```powershell
docker compose ps
# Debería mostrar: rfid-games-redis ... healthy

# Probar conexión
docker exec rfid-games-redis redis-cli ping
# Respuesta: PONG
```

### 3. Iniciar el backend

```powershell
cd backend
npm run dev
```

---

## Servicios Disponibles

| Servicio | Puerto | Descripción | Perfil |
|----------|--------|-------------|--------|
| **redis** | 6379 | Caché, tokens, estado de partidas | default |
| **redis-commander** | 8081 | UI web para inspeccionar Redis | debug |

> **Nota sobre MongoDB**: Este proyecto utiliza **MongoDB Atlas** (cloud) o una instalación local de MongoDB, **no Docker**. Configura la conexión en la variable de entorno `MONGO_URI` del backend.

---

## Comandos Útiles

### Gestión de Servicios

```powershell
# Iniciar solo Redis
docker compose up -d redis

# Iniciar Redis + UI de debugging
docker compose --profile debug up -d

# Detener todos los servicios
docker compose down

# Detener y eliminar volúmenes (⚠️ borra datos)
docker compose down -v
```

### Logs

```powershell
# Ver logs de Redis en tiempo real
docker compose logs -f redis

# Ver últimas 100 líneas de logs
docker compose logs --tail 100 redis

# Ver logs de todos los servicios
docker compose logs -f
```

### Acceso a Redis CLI

```powershell
# Abrir shell interactivo de Redis
docker exec -it rfid-games-redis redis-cli

# Comandos útiles dentro de redis-cli:
> PING                          # Verificar conexión
> KEYS *                        # Listar todas las keys
> KEYS rfid-games:*             # Listar keys del proyecto
> GET rfid-games:blacklist:xyz  # Obtener valor
> TTL rfid-games:blacklist:xyz  # Ver tiempo restante
> FLUSHDB                       # ⚠️ Borrar toda la DB
> INFO                          # Estadísticas del servidor
> MONITOR                       # Ver comandos en tiempo real
```

### Inspeccionar Estado

```powershell
# Ver estado de contenedores
docker compose ps

# Ver uso de recursos
docker stats rfid-games-redis

# Ver información detallada
docker inspect rfid-games-redis
```

---

## Perfiles

Docker Compose soporta perfiles para iniciar diferentes conjuntos de servicios:

### Perfil por defecto (solo Redis)

```powershell
docker compose up -d
# Inicia: redis
```

### Perfil `debug` (Redis + UI)

```powershell
docker compose --profile debug up -d
# Inicia: redis, redis-commander
# Acceder a UI: http://localhost:8081
```

---

## Configuración

### Variables de Entorno

Puedes personalizar puertos y configuración creando un archivo `.env` en la raíz:

```env
# Puertos personalizados
REDIS_PORT=6379
REDIS_COMMANDER_PORT=8081
```

### Configuración de Redis

El contenedor Redis está configurado con:

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| `appendonly` | yes | Persistencia AOF activada |
| `appendfsync` | everysec | Sync a disco cada segundo |
| `maxmemory` | 256mb | Límite de memoria |
| `maxmemory-policy` | allkeys-lru | Evicción LRU cuando lleno |
| `tcp-keepalive` | 60 | Keepalive cada 60s |

---

## Persistencia de Datos

### Volúmenes

Los datos de Redis se persisten en volúmenes Docker:

| Volumen | Servicio | Ubicación en contenedor |
|---------|----------|-------------------------|
| `rfid-games-redis-data` | redis | `/data` |

### Ver volúmenes

```powershell
docker volume ls | findstr rfid-games
```

### Backup de Redis

```powershell
# Forzar snapshot
docker exec rfid-games-redis redis-cli BGSAVE

# Copiar archivo de backup
docker cp rfid-games-redis:/data/dump.rdb ./backup/redis-dump.rdb
```

### Restaurar Redis

```powershell
# Detener Redis
docker compose stop redis

# Copiar backup al volumen
docker cp ./backup/redis-dump.rdb rfid-games-redis:/data/dump.rdb

# Reiniciar
docker compose start redis
```

---

## Troubleshooting

### Redis no inicia

```powershell
# Ver logs de error
docker compose logs redis

# Verificar que el puerto no está ocupado
netstat -an | findstr 6379

# Reiniciar contenedor
docker compose restart redis
```

### Error de conexión desde Node.js

1. Verificar que Redis está corriendo:
   ```powershell
   docker compose ps
   ```

2. Verificar variable de entorno en backend:
   ```env
   REDIS_URL=redis://localhost:6379
   ```

3. Probar conexión manual:
   ```powershell
   docker exec rfid-games-redis redis-cli ping
   ```

### Limpiar todo y empezar de nuevo

```powershell
# Detener y eliminar contenedores, redes y volúmenes
docker compose down -v

# Eliminar imágenes descargadas (opcional)
docker rmi redis:7-alpine rediscommander/redis-commander:latest

# Iniciar desde cero
docker compose up -d redis
```

### Puerto ocupado

```powershell
# Encontrar proceso usando el puerto
netstat -ano | findstr :6379

# Cambiar puerto en .env
REDIS_PORT=6380
```

---

## Estructura de Keys en Redis

El proyecto usa el prefijo `rfid-games:` para todas las keys:

| Key Pattern | Tipo | TTL | Descripción |
|-------------|------|-----|-------------|
| `rfid-games:blacklist:{jti}` | String | Hasta exp token | Access tokens revocados |
| `rfid-games:refresh:{jti}` | Hash | 7 días | Refresh tokens activos |
| `rfid-games:used:{jti}` | String | 7 días | Refresh tokens rotados |
| `rfid-games:play:{playId}` | Hash | - | Estado de partida activa |
| `rfid-games:card:{uid}` | String | - | Mapeo UID → playId |
| `rfid-games:security:{userId}` | String | 1 hora | Logout forzado |

---

## Recursos

- [Documentación oficial de Redis](https://redis.io/docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Redis Commander GitHub](https://github.com/joeferner/redis-commander)
