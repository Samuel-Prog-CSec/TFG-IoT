# Backend - Plataforma de Juegos Educativos con RFID

Sistema backend profesional con Express.js, MongoDB y Socket.IO con ingesta RFID via Web Serial desde el cliente.

## 📋 Índice

- [Características](#características)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Uso](#uso)
- [API Endpoints](#api-endpoints)
- [WebSocket Events](#websocket-events)
- [Seguridad](#seguridad)
- [Monitoreo](#monitoreo)
- [Desarrollo](#desarrollo)
- [Testing](#testing)
- [Despliegue](#despliegue)

## 🚀 Características

### Core

- **API REST** completa (auth, usuarios, mazos, mecánicas, contextos, sesiones, partidas, analytics, notificaciones, admin)
- **WebSocket en tiempo real** con Socket.IO para gameplay
- **Ingesta RFID Web Serial** desde el navegador
- **Autenticación JWT** con refresh tokens y token rotation
- **Single Session Policy** para seguridad de sesiones concurrentes
- **Base de datos MongoDB** con Mongoose ODM

### Seguridad

- **Helmet** con CSP (Content Security Policy) personalizado
- **CORS** con whitelist dinámica de orígenes
- **Rate limiting** granular por endpoint y tipo de operación
- **Device fingerprinting** para protección contra robo de tokens
- **Token blacklist** en Redis para revocación instantánea
- **Bcrypt** para hash de contraseñas (rounds configurables)

### Rendimiento

- **Compression** con threshold de 1KB
- **Connection pooling** con MongoDB
- **Búsquedas O(1)** en gameEngine con Map
- **Cleanup automático** de partidas abandonadas
- **Buffer circular** de eventos RFID para debugging

### Monitoreo

- **Sentry** para tracking de errores y profiling
- **Pino** para logging estructurado (JSON a stdout, shipping a Grafana Cloud Loki vía `pino-loki`)
- **Métricas en tiempo real** de gameEngine y rfidService
- **Health checks** con uptime y estadísticas

### Arquitectura

No es un MVC simple: es un pipeline con capas separadas por responsabilidad.

- **Controllers** — orquestación delgada, delegan a services/repositories
- **Services** — lógica de negocio y coordinación cross-modelo (`gameEngine` para orquestación stateful de partidas)
- **Repositories** — capa de acceso a datos (`baseRepository` + repos especializados por entidad)
- **DTOs** — obligatorios en toda respuesta de dominio; nunca se devuelven documentos Mongoose crudos
- **Validators** — schemas Zod en `validators/`, aplicados vía middleware
- **State pattern** — gestión de estados RFID (`states/`)
- **Strategy pattern** — mecánicas de juego (`strategies/`, `gameMechanics/`)
- **Command pattern** — handlers de eventos de socket (`commands/`)
- **Principios SOLID**, error handling centralizado (`AppError` + Sentry) y graceful shutdown con cleanup completo

## 🏗️ Arquitectura

```
backend/
├── src/
│   ├── config/          # database, redis, security (CORS/Helmet/rate-limit), sentry, swagger (OpenAPI)
│   ├── models/           # Mongoose schemas (User, GameMechanic, GameContext, GameSession,
│   │                     #   GamePlay, CardDeck, Notification, SmartAlert, SystemAlert, ...)
│   ├── controllers/      # Orquestación delgada por dominio (auth, users, cardDeck,
│   │                     #   gameContext, gameSession, gamePlay, analytics, admin, ...)
│   ├── routes/           # Rutas Express (auth, users, decks, mechanics, contexts, sessions,
│   │                     #   plays, analytics, notifications, admin, reports, health, metrics)
│   ├── services/         # Lógica de negocio (gameEngine/, analytics/, rfidService, redisService, ...)
│   ├── repositories/     # Acceso a datos (baseRepository + repos especializados)
│   ├── realtime/         # Handlers Socket.IO, pub/sub multi-instancia
│   ├── commands/         # Command pattern para eventos de socket
│   ├── states/           # State pattern (estados RFID)
│   ├── strategies/       # Strategy pattern (mecánicas: association, memory, sequence)
│   ├── workers/          # Jobs BullMQ (retención de datos, detección de alertas, analytics)
│   ├── queues/           # Registro central de queues BullMQ
│   ├── middlewares/      # auth (JWT), validation (Zod), errorHandler, rate limiting, MFA
│   ├── validators/       # Esquemas Zod por dominio
│   ├── utils/            # dtos.js, errors.js, logger.js (Pino), cacheHelper, cryptoUtils, ...
│   ├── worker.js         # Punto de entrada del proceso worker (BullMQ)
│   └── server.js         # Punto de entrada de la API HTTP/WebSocket
├── seeders/              # Datos deterministas de desarrollo/demo
├── scripts/              # Migraciones, auditorías, benchmarks
├── tests/
├── .env.example
├── package.json
└── README.md
```

## 📦 Requisitos

- **Node.js** ≥ 24.14.0
- **MongoDB** 7 (contenedor Docker en desarrollo y en despliegue; no se usa MongoDB Atlas)
- **Redis** 7 (contenedor Docker; caché, rate limiting, blacklist de tokens, colas BullMQ)
- **ESP8266 NodeMCU** + RC522 RFID (opcional, para hardware — la lectura real llega por Web Serial desde el navegador, no por puerto serie del backend)

## 📥 Instalación

```bash
# Clonar repositorio
git clone <url-del-repositorio>
cd backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores
```

## ⚙️ Configuración

### Variables de Entorno Críticas

```env
# Servidor
PORT=5000
NODE_ENV=development

# MongoDB (contenedor Docker local; en despliegue apunta al contenedor mongo de la VPS)
MONGODB_URI=mongodb://localhost:27017/rfid_games

# Redis (contenedor Docker; caché, rate limiting, blacklist de tokens, colas BullMQ)
REDIS_URL=redis://localhost:6379

# JWT (CAMBIAR EN PRODUCCIÓN)
JWT_SECRET=tu-secret-super-seguro
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=tu-refresh-secret-super-seguro
JWT_REFRESH_EXPIRES_IN=7d

# CORS (orígenes permitidos, separados por comas)
CORS_WHITELIST=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100

# Sentry (opcional)
SENTRY_DSN=tu-sentry-dsn
SENTRY_ENVIRONMENT=development

# RFID (Web Serial desde cliente)
RFID_SOURCE=client

# GameEngine
ACTIVE_PLAYS_WARNING_THRESHOLD=1000  # Umbral para warnings (soft limit)
PLAY_TIMEOUT_MS=3600000              # 1 hora
```

Ver `.env.example` para la lista completa.

## 🚀 Uso

### Desarrollo

```bash
# Modo desarrollo con nodemon
npm run dev

# Modo producción
npm start
```

### Scripts Disponibles

```bash
npm run dev                   # Desarrollo con hot-reload (nodemon)
npm start                     # Producción
npm run worker                # Proceso worker BullMQ (producción)
npm run worker:dev            # Worker con hot-reload

npm test                      # Tests (Jest)
npm run lint                  # ESLint
npm run format                # Prettier

npm run seed                  # Seed de la base de datos (idempotente)
npm run seed:reset            # Reset completo + re-seed
npm run seed:if-empty         # Seed solo si la BD está vacía (usado por Docker)
npm run seed:storage          # Seed de assets en Supabase Storage

npm run migrate:sessions              # Migración de estado de sesiones
npm run migrate:birthdate             # Migración de campo birthdate
npm run migrate:dominant-colors       # Backfill de colores dominantes
# Ver package.json para el resto de migraciones puntuales (migrate:*)

npm run data:audit             # Auditoría de datos (PII en modelos Mongoose)
npm run data:retention         # Ejecutar política de retención de datos (RGPD)
npm run data:retention:dry-run # Retención en modo simulación

npm run audit:prod            # Auditoría de dependencias runtime/prod (sin devDependencies)
npm run audit:full            # Auditoría completa (incluye tooling)
npm run deps:analyze          # Analizar dependencias desactualizadas
npm run drop-db               # Eliminar base de datos (solo desarrollo)
```

### Política de seguridad en CI (dependencias)

- **Bloqueante:** `npm run audit:prod` desde raíz (backend + frontend con `--omit=dev`).
- **Informativo (no bloqueante):** `npm run audit:all` para seguimiento de deuda en tooling (`eslint`, `jest`, etc.).
- **Objetivo operativo:** mantener **0 vulnerabilidades en runtime** sin romper lint/tests por overrides incompatibles de devDependencies.
## 📡 API Endpoints

### Autenticación (`/api/auth`)

| Método | Endpoint           | Descripción                      | Autenticación      | Rol     |
| ------ | ------------------ | -------------------------------- | ------------------ | ------- |
| POST   | `/register`        | Registrar **PROFESOR** (público) | No                 | -       |
| POST   | `/login`           | Login de profesor                | No                 | -       |
| POST   | `/refresh`         | Refrescar access token           | No (refresh token) | -       |
| POST   | `/logout`          | Cerrar sesión y revocar tokens   | Sí                 | Teacher |
| GET    | `/me`              | Obtener perfil del usuario       | Sí                 | Teacher |
| PUT    | `/me`              | Actualizar perfil                | Sí                 | Teacher |
| PUT    | `/change-password` | Cambiar contraseña               | Sí                 | Teacher |

**⚠️ IMPORTANTE**: Los alumnos NO se registran en `/register`. Son creados por profesores en `POST /api/users`.

### Usuarios (`/api/users`)

| Método | Endpoint                       | Descripción                                  | Rol           |
| ------ | ------------------------------ | -------------------------------------------- | ------------- |
| GET    | `/`                            | Listar usuarios                              | Teacher       |
| GET    | `/:id`                         | Obtener usuario                              | Teacher       |
| POST   | `/`                            | Crear **ALUMNO** (sin email/password)        | Teacher       |
| PUT    | `/:id`                         | Actualizar usuario (nombre, clase, estado)   | Teacher       |
| DELETE | `/:id`                         | Desactivar usuario                           | Teacher       |
| GET    | `/:id/stats`                   | Estadísticas del usuario                     | Teacher/Owner |
| GET    | `/teacher/:teacherId/students` | Alumnos de un profesor                       | Teacher       |
| POST   | `/:id/transfer`                | Transferir alumno de profesor (ownership)    | Teacher/Admin |

**⚠️ IMPORTANTE**:

- `POST /api/users` solo crea alumnos (sin credenciales). Los profesores se registran en `/api/auth/register`.
- **Validación de duplicados**: No se pueden crear dos alumnos activos con el mismo nombre (nombre = Nombre + Apellidos) en la misma clase del mismo profesor.
- **Actualización de alumnos (`PUT /api/users/:id`)**: Permite nombre, clase y estado, pero **no** permite cambiar `createdBy`.
- **Transferencia de ownership**: Solo por `POST /api/users/:id/transfer` con controles de permisos (profesor propietario actual o `super_admin`).
- **Casos de uso comunes**:
  - Alumno cambia de clase: `PUT /api/users/:id` con `{ "profile": { "classroom": "B" } }`
  - Alumno cambia de profesor: `POST /api/users/:id/transfer` con `{ "newTeacherId": "<nuevoProfesorId>", "newClassroom": "B" }`
  - Corrección de nombre: `PUT /api/users/:id` con `{ "name": "Nombre Correcto" }` (valida duplicados)

### Mazos (`/api/decks`)

> No existe un modelo `Card` independiente ni endpoints `/api/cards`: las tarjetas RFID son
> tokens fungibles (`cardMappings` dentro de un mazo), no entidades con registro propio.

| Método | Endpoint          | Descripción                                        | Rol     |
| ------ | ----------------- | --------------------------------------------------- | ------- |
| GET    | `/`               | Listar mazos                                       | Teacher |
| GET    | `/:id`            | Obtener mazo                                       | Teacher |
| POST   | `/`               | Crear mazo (cartas + mapeo RFID)                   | Teacher |
| PUT    | `/:id`            | Actualizar mazo                                    | Teacher |
| DELETE | `/:id`            | Archivar mazo (soft delete)                        | Teacher |
| GET    | `/check-card`     | Verificar si un UID ya existe en otro mazo activo  | Teacher |

### Mecánicas (`/api/mechanics`)

| Método | Endpoint  | Descripción         | Rol     |
| ------ | --------- | ------------------- | ------- |
| GET    | `/`       | Listar mecánicas    | Teacher |
| GET    | `/active` | Mecánicas activas   | Public  |
| GET    | `/:id`    | Obtener mecánica    | Teacher |
| POST   | `/`       | Crear mecánica      | Teacher |
| PUT    | `/:id`    | Actualizar mecánica | Teacher |
| DELETE | `/:id`    | Desactivar mecánica | Teacher |

### Contextos (`/api/contexts`)

| Método | Endpoint           | Descripción         | Rol     |
| ------ | ------------------ | ------------------- | ------- |
| GET    | `/`                | Listar contextos    | Teacher |
| GET    | `/:id`             | Obtener contexto    | Teacher |
| POST   | `/`                | Crear contexto      | Teacher |
| PUT    | `/:id`             | Actualizar contexto | Teacher |
| DELETE | `/:id`             | Eliminar contexto   | Teacher |
| POST   | `/:id/assets`      | Añadir asset        | Teacher |
| DELETE | `/:id/assets/:key` | Eliminar asset      | Teacher |
| GET    | `/:id/assets`      | Listar assets       | Teacher |

### Sesiones (`/api/sessions`)

| Método | Endpoint     | Descripción       | Rol           |
| ------ | ------------ | ----------------- | ------------- |
| GET    | `/`          | Listar sesiones   | Teacher       |
| GET    | `/:id`       | Obtener sesión    | Teacher/Owner |
| POST   | `/`          | Crear sesión      | Teacher       |
| PUT    | `/:id`       | Actualizar sesión | Teacher/Owner |
| DELETE | `/:id`       | Eliminar sesión   | Teacher/Owner |
| POST   | `/:id/start` | Iniciar sesión    | Teacher/Owner |
| POST   | `/:id/pause` | Pausar sesión     | Teacher/Owner |
| POST   | `/:id/end`   | Finalizar sesión  | Teacher/Owner |

### Partidas (`/api/plays`)

| Método | Endpoint           | Descripción              | Rol                   |
| ------ | ------------------ | ------------------------ | --------------------- |
| GET    | `/`                | Listar partidas          | Teacher/Student (own) |
| GET    | `/:id`             | Obtener partida          | Teacher/Owner         |
| POST   | `/`                | Crear partida            | Teacher               |
| POST   | `/:id/pause`       | Pausar partida           | Teacher/Owner         |
| POST   | `/:id/resume`      | Reanudar partida         | Teacher/Owner         |
| POST   | `/:id/events`      | Añadir evento            | Sistema               |
| POST   | `/:id/complete`    | Completar partida        | Teacher/Owner         |
| POST   | `/:id/abandon`     | Abandonar partida        | Teacher/Owner         |
| GET    | `/stats/:playerId` | Estadísticas del jugador | Teacher/Owner         |

### Sistema

| Método | Endpoint       | Descripción                                        |
| ------ | -------------- | --------------------------------------------------- |
| GET    | `/api/health`  | Health check (Mongo, Redis, RFID, memoria, uptime)  |
| GET    | `/api/metrics` | Métricas runtime (Teacher/super_admin)              |

### Otros grupos de rutas

Esta sección es un resumen orientativo, no exhaustivo. También existen `/api/analytics`
(dashboards y detección de patrones), `/api/notifications` (notificaciones en tiempo real),
`/api/admin` (auditoría, RGPD, alertas de sistema, anuncios) y `/api/reports`. La referencia
completa y actualizada de todos los endpoints está en
[`backend/docs/API_v0.5.0.md`](docs/API_v0.5.0.md); la spec **OpenAPI 3.1** generada desde el
código vive en `GET /api/docs` (UI) y `GET /api/openapi.json` (JSON descargable).

## 🔌 WebSocket Events

### Cliente → Servidor

| Evento        | Payload                   | Descripción                          |
| ------------- | ------------------------- | ------------------------------------ |
| `join_play`   | `{ playId }`              | Unirse a una partida                 |
| `leave_play`  | `{ playId }`              | Abandonar partida                    |
| `start_play`  | `{ playId }`              | Iniciar partida                      |
| `pause_play`  | `{ playId, accessToken }` | Pausar partida (requiere profesor)   |
| `resume_play` | `{ playId, accessToken }` | Reanudar partida (requiere profesor) |
| `next_round`  | `{ playId }`              | Solicitar siguiente ronda            |
| `join_card_registration`  | `{}`               | Unirse a room de registro            |
| `leave_card_registration` | `{}`               | Salir de room de registro            |
| `join_admin_room`         | `{}`               | Unirse a room admin                  |
| `leave_admin_room`        | `{}`               | Salir de room admin                  |

### Servidor → Cliente

| Evento              | Payload                                                 | Descripción               |
| ------------------- | ------------------------------------------------------- | ------------------------- |
| `rfid_event`        | `{ event, uid, type, ... }`                             | Evento del sensor RFID    |
| `rfid_status`       | `{ status }`                                            | Estado del sensor (admin) |
| `play_state`        | `{ playId, currentRound, score, ... }`                  | Estado inicial de partida |
| `new_round`         | `{ roundNumber, challenge, timeLimit, ... }`            | Nuevo desafío             |
| `validation_result` | `{ isCorrect, pointsAwarded, newScore, ... }`           | Resultado de respuesta    |
| `play_paused`       | `{ playId, currentRound, remainingTimeMs }`             | Partida pausada           |
| `play_resumed`      | `{ playId, currentRound, remainingTimeMs, challenge? }` | Partida reanudada         |
| `game_over`         | `{ finalScore, metrics }`                               | Partida finalizada        |
| `error`             | `{ message }`                                           | Error en la partida       |

## 🔒 Seguridad

### JWT con Refresh Tokens

- **Access tokens**: Corta duración (15 min), para operaciones diarias
- **Refresh tokens**: Larga duración (7 días), para renovar access tokens
- **Token rotation**: Al refrescar, se revoca el antiguo refresh token
- **Device fingerprinting**: Tokens vinculados al navegador/dispositivo
- **Token blacklist**: Revocación instantánea al logout

### CORS

- Whitelist dinámica de orígenes permitidos
- Credentials habilitados para cookies/auth headers
- Métodos permitidos: GET, POST, PUT, DELETE, PATCH

### Helmet (Security Headers)

- **CSP**: Content Security Policy restrictivo
- **HSTS**: Enforce HTTPS (1 año)
- **X-Content-Type-Options**: nosniff
- **X-XSS-Protection**: activado
- **Referrer-Policy**: strict-origin-when-cross-origin

### Rate Limiting

- **Global**: 100 req/15 min en `/api/*`
- **Autenticación**: 5 intentos/15 min en login/register
- **Creación**: 10 operaciones/min en POST endpoints
- **Uploads**: 20 archivos/hora
- **WebSockets**: límites por evento con ventana deslizante, bloqueo temporal y payload máximo (16 KB global, 8 KB para `rfid_scan_from_client`)

### WebSocket Auth

- **Handshake requerido**: el cliente debe enviar `token` en `socket.handshake.auth.token` (o `Authorization: Bearer <token>`).
- El servidor asigna `socket.data.userId` y `socket.data.userRole` y se une a `user_{id}` automáticamente.

## 📊 Monitoreo

### Sentry

Tracking automático de:

- Errores no capturados
- Performance profiling
- Request tracing
- User context en errores

### Pino Logger

Logging estructurado JSON a stdout (nunca a fichero ni `console.log`), con redacción
automática de datos sensibles (passwords, tokens, cookies, headers de auth). En producción,
opcionalmente se envía también a Grafana Cloud Loki (`pino-loki`) si `LOG_SHIPPING_ENABLED=true`;
si falta la configuración, degrada de forma silenciosa a solo-stdout.

Niveles: `error`, `warn`, `info`, `debug` (nivel por defecto `info` en producción, `debug` en desarrollo).

### Métricas en Tiempo Real

```bash
# Endpoint de métricas (requiere rol teacher o super_admin)
GET /api/metrics

Response:
{
  "gameEngine": {
    "totalPlaysStarted": 42,
    "totalPlaysCompleted": 38,
    "activePlays": 4,
    "averagePlayDuration": 245000
  },
  "rfidService": {
    "isConnected": true,
    "totalCardDetections": 156,
    "connectionUptime": "2h 34m"
  }
}
```

## 🛠️ Desarrollo

### Estructura de un Controller

```javascript
const getResource = async (req, res, next) => {
  try {
    // 1. Validación (ya hecha por middleware)
    // 2. Lógica de negocio
    const data = await Service.getData();

    // 3. Respuesta exitosa
    res.json({
      success: true,
      data: { resource: data }
    });
  } catch (error) {
    // 4. Delegar error al handler
    next(error);
  }
};
```

### Añadir Nuevo Endpoint

1. Crear controller en `src/controllers/`
2. Crear validator en `src/validators/` (Zod)
3. Definir ruta en `src/routes/`
4. Montar ruta en `src/server.js`
5. Documentar en este README

### Testing

```bash
npm test                          # Ejecutar todos los tests (Jest)
npm test -- --findRelatedTests <file>  # Tests relacionados con un archivo
```

#### RFIDService: arquitectura Web Serial

El servicio [src/services/rfidService.js](src/services/rfidService.js) no abre puertos serie en el backend.
El sensor se conecta al PC del profesor y el navegador envía los eventos por Socket.IO.

Motivos:

- **Despliegue cloud**: el servidor no depende de hardware USB.
- **Escalabilidad**: cada profesor usa su propio lector local.
- **Seguridad**: el backend valida el contrato del evento antes de procesar.

## 🚢 Despliegue

El backend se despliega autoalojado en una VPS Contabo, como parte del stack Docker Compose
completo (frontend + backend + worker + Mongo + Redis) — no hay despliegue independiente del
backend suelto. Guía completa de aprovisionamiento en
[`documentation/Deploy_VPS.md`](../documentation/Deploy_VPS.md).

### Pre-Despliegue

1. **Secretos por entorno**: `JWT_SECRET`/`JWT_REFRESH_SECRET`, credenciales de Mongo/Redis y
   demás secretos viven en `/opt/eduplay/secrets/{staging,prod}.env` en la VPS (fuera del
   checkout de git), nunca en el repositorio.
2. **Configurar Sentry**: Añadir `SENTRY_DSN` de producción/staging.
3. **MongoDB/Redis**: Contenedores Docker del propio stack (`docker-compose.yml` +
   `docker-compose.prod.yml`), no servicios gestionados externos.
4. **Whitelist CORS / `WSS_DOMAIN`**: Apuntar al dominio real de cada entorno.
5. **Rate limits**: Ajustar según tráfico esperado.
6. **Node version**: Verificar >=24.14.0 (fijado en `engines` de `package.json`).

### Cómo se levanta (lo ejecuta el pipeline de CI/CD, no a mano)

```bash
cp /opt/eduplay/secrets/<entorno>.env .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -p eduplay-<entorno> up -d --build
```

### Healthcheck

```bash
curl https://eduplay-tfg.duckdns.org/api/health/ready

# Response esperado:
{
  "ready": true,
  "shuttingDown": false,
  "checks": { "mongo": "ok", "redis": "ok", "redisCircuit": "closed" },
  "timestamp": "2026-07-07T10:09:40.773Z"
}
```

## 👤 Autor

**Samuel Blanchart Pérez**
