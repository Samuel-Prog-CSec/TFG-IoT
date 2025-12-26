# Backend - Plataforma de Juegos Educativos con RFID

Sistema backend profesional con Express.js, MongoDB, Socket.IO y comunicación serial RFID para una plataforma educativa interactiva.

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

- **API REST** completa con 48 endpoints CRUD
- **WebSocket en tiempo real** con Socket.IO para gameplay
- **Comunicación serial RFID** con ESP8266 + RC522
- **Autenticación JWT** con refresh tokens y token rotation
- **Base de datos MongoDB** con Mongoose ODM

### Seguridad

- **Helmet** con CSP (Content Security Policy) personalizado
- **CORS** con whitelist dinámica de orígenes
- **Rate limiting** granular por endpoint y tipo de operación
- **Device fingerprinting** para protección contra robo de tokens
- **Token blacklist** en memoria para revocación instantánea
- **Bcrypt** para hash de contraseñas (rounds configurables)

### Rendimiento

- **Compression** con threshold de 1KB
- **Connection pooling** con MongoDB
- **Búsquedas O(1)** en gameEngine con Map
- **Cleanup automático** de partidas abandonadas
- **Buffer circular** de eventos RFID para debugging

### Monitoreo

- **Sentry** para tracking de errores y profiling
- **Winston** para logging estructurado
- **Métricas en tiempo real** de gameEngine y rfidService
- **Health checks** con uptime y estadísticas

### Arquitectura

- **Patrón MVC** con Services layer
- **Principios SOLID** aplicados
- **Validación con Zod** en todas las entradas
- **Error handling** centralizado
- **Graceful shutdown** con cleanup completo

## 🏗️ Arquitectura

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js       # Conexión MongoDB
│   │   ├── sentry.js          # Configuración Sentry v10
│   │   └── security.js        # CORS, Helmet, Rate Limiting
│   ├── models/                # Mongoose schemas (6 modelos)
│   │   ├── User.js
│   │   ├── Card.js
│   │   ├── GameMechanic.js
│   │   ├── GameContext.js
│   │   ├── GameSession.js
│   │   └── GamePlay.js
│   ├── controllers/           # Lógica de negocio (7 controllers, 48 endpoints)
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── cardController.js
│   │   ├── gameMechanicController.js
│   │   ├── gameContextController.js
│   │   ├── gameSessionController.js
│   │   └── gamePlayController.js
│   ├── routes/                # Rutas Express (7 archivos)
│   ├── services/              # Servicios core
│   │   ├── gameEngine.js      # Motor de juego stateful
│   │   └── rfidService.js     # Comunicación serial RFID
│   ├── middlewares/
│   │   ├── auth.js            # JWT con refresh tokens
│   │   ├── validation.js      # Validación con Zod
│   │   └── errorHandler.js    # Manejo centralizado de errores
│   ├── validators/            # Esquemas Zod (6 archivos)
│   ├── utils/
│   │   ├── errors.js          # Clases de error personalizadas
│   │   └── logger.js          # Winston logger
│   └── server.js              # Punto de entrada
├── logs/
├── tests/
├── .env
├── .env.example
├── package.json
└── README.md
```

## 📦 Requisitos

- **Node.js** ≥ 22.0.0
- **MongoDB** ≥ 6.0 (local o Atlas)
- **ESP8266 NodeMCU** + RC522 RFID (opcional, para hardware)
- **Puerto serie** disponible (COM3 en Windows, /dev/ttyUSB0 en Linux)

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

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rfid_games

# JWT (CAMBIAR EN PRODUCCIÓN)
JWT_SECRET=tu-secret-super-seguro
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=tu-refresh-secret-super-seguro
JWT_REFRESH_EXPIRES_IN=30d

# CORS (orígenes permitidos, separados por comas)
CORS_WHITELIST=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000    # 15 minutos
RATE_LIMIT_MAX_REQUESTS=100

# Sentry (opcional)
SENTRY_DSN=tu-sentry-dsn
SENTRY_ENVIRONMENT=development

# RFID
SERIAL_PORT=COM3
SERIAL_BAUD_RATE=115200
RFID_MAX_RECONNECT_ATTEMPTS=10

# GameEngine
MAX_ACTIVE_PLAYS=1000
PLAY_TIMEOUT_MS=3600000       # 1 hora
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
npm run dev                   # Desarrollo con hot-reload
npm start                     # Producción
npm run seed                  # Ejecutar seeders (próximamente)
npm test                      # Tests (próximamente)
npm run security:check-&-fix  # Auditoría de seguridad
npm run deps:update-minor     # Actualizar dependencias menores
npm run deps:update-major     # Actualizar dependencias mayores
npm run deps:analyze          # Analizar dependencias
```

## 📡 API Endpoints

### Autenticación (`/api/auth`)

| Método | Endpoint | Descripción | Autenticación | Rol |
|--------|----------|-------------|---------------|-----|
| POST | `/register` | Registrar **PROFESOR** (público) | No | - |
| POST | `/login` | Login de profesor | No | - |
| POST | `/refresh` | Refrescar access token | No (refresh token) | - |
| POST | `/logout` | Cerrar sesión y revocar tokens | Sí | Teacher |
| GET | `/me` | Obtener perfil del usuario | Sí | Teacher |
| PUT | `/me` | Actualizar perfil | Sí | Teacher |
| PUT | `/change-password` | Cambiar contraseña | Sí | Teacher |

**⚠️ IMPORTANTE**: Los alumnos NO se registran en `/register`. Son creados por profesores en `POST /api/users`.

### Usuarios (`/api/users`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar usuarios | Teacher |
| GET | `/:id` | Obtener usuario | Teacher |
| POST | `/` | Crear **ALUMNO** (sin email/password) | Teacher |
| PUT | `/:id` | Actualizar usuario (nombre, clase, profesor) | Teacher |
| DELETE | `/:id` | Desactivar usuario | Teacher |
| GET | `/:id/stats` | Estadísticas del usuario | Teacher/Owner |
| GET | `/teacher/:teacherId/students` | Alumnos de un profesor | Teacher |

**⚠️ IMPORTANTE**:
- `POST /api/users` solo crea alumnos (sin credenciales). Los profesores se registran en `/api/auth/register`.
- **Validación de duplicados**: No se pueden crear dos alumnos activos con el mismo nombre (nombre = Nombre + Apellidos) en la misma clase del mismo profesor.
- **Actualización de alumnos**: Se puede cambiar nombre, clase (`profile.classroom`), profesor asignado (`createdBy`), edad, etc.
- **Casos de uso comunes**:
  - Alumno cambia de clase: `PUT /api/users/:id` con `{ "profile": { "classroom": "B" } }`
  - Alumno cambia de profesor: `PUT /api/users/:id` con `{ "createdBy": "<nuevoProfesorId>" }`
  - Corrección de nombre: `PUT /api/users/:id` con `{ "name": "Nombre Correcto" }` (valida duplicados)

### Tarjetas RFID (`/api/cards`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar tarjetas | Teacher |
| GET | `/:id` | Obtener tarjeta | Teacher |
| POST | `/` | Crear tarjeta | Teacher |
| PUT | `/:id` | Actualizar tarjeta | Teacher |
| DELETE | `/:id` | Desactivar tarjeta | Teacher |
| POST | `/batch` | Crear múltiples tarjetas | Teacher |
| GET | `/stats` | Estadísticas de tarjetas | Teacher |

### Mecánicas (`/api/mechanics`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar mecánicas | Teacher |
| GET | `/active` | Mecánicas activas | Public |
| GET | `/:id` | Obtener mecánica | Teacher |
| POST | `/` | Crear mecánica | Teacher |
| PUT | `/:id` | Actualizar mecánica | Teacher |
| DELETE | `/:id` | Desactivar mecánica | Teacher |

### Contextos (`/api/contexts`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar contextos | Teacher |
| GET | `/:id` | Obtener contexto | Teacher |
| POST | `/` | Crear contexto | Teacher |
| PUT | `/:id` | Actualizar contexto | Teacher |
| DELETE | `/:id` | Eliminar contexto | Teacher |
| POST | `/:id/assets` | Añadir asset | Teacher |
| DELETE | `/:id/assets/:key` | Eliminar asset | Teacher |
| GET | `/:id/assets` | Listar assets | Teacher |

### Sesiones (`/api/sessions`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar sesiones | Teacher |
| GET | `/:id` | Obtener sesión | Teacher/Owner |
| POST | `/` | Crear sesión | Teacher |
| PUT | `/:id` | Actualizar sesión | Teacher/Owner |
| DELETE | `/:id` | Eliminar sesión | Teacher/Owner |
| POST | `/:id/start` | Iniciar sesión | Teacher/Owner |
| POST | `/:id/pause` | Pausar sesión | Teacher/Owner |
| POST | `/:id/end` | Finalizar sesión | Teacher/Owner |

### Partidas (`/api/plays`)

| Método | Endpoint | Descripción | Rol |
|--------|----------|-------------|-----|
| GET | `/` | Listar partidas | Teacher/Student (own) |
| GET | `/:id` | Obtener partida | Teacher/Owner |
| POST | `/` | Crear partida | Teacher |
| POST | `/:id/events` | Añadir evento | Sistema |
| POST | `/:id/complete` | Completar partida | Teacher/Owner |
| POST | `/:id/abandon` | Abandonar partida | Teacher/Owner |
| GET | `/stats/:playerId` | Estadísticas del jugador | Teacher/Owner |

### Sistema

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metrics` | Métricas del sistema (dev only) |

## 🔌 WebSocket Events

### Cliente → Servidor

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `join_play` | `{ playId }` | Unirse a una partida |
| `leave_play` | `{ playId }` | Abandonar partida |
| `start_play` | `{ playId }` | Iniciar partida |
| `pause_play` | `{ playId }` | Pausar partida |
| `resume_play` | `{ playId }` | Reanudar partida |
| `next_round` | `{ playId }` | Solicitar siguiente ronda |

### Servidor → Cliente

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `rfid_event` | `{ event, uid, type, ... }` | Evento del sensor RFID |
| `rfid_status` | `{ status }` | Estado del sensor |
| `play_state` | `{ playId, currentRound, score, ... }` | Estado inicial de partida |
| `new_round` | `{ roundNumber, challenge, timeLimit, ... }` | Nuevo desafío |
| `validation_result` | `{ isCorrect, pointsAwarded, newScore, ... }` | Resultado de respuesta |
| `game_over` | `{ finalScore, metrics }` | Partida finalizada |
| `error` | `{ message }` | Error en la partida |

## 🔒 Seguridad

### JWT con Refresh Tokens

- **Access tokens**: Corta duración (15 min), para operaciones diarias
- **Refresh tokens**: Larga duración (30 días), para renovar access tokens
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

## 📊 Monitoreo

### Sentry

Tracking automático de:

- Errores no capturados
- Performance profiling
- Request tracing
- User context en errores

### Winston Logger

Niveles de log:

- **error**: Errores críticos → `logs/error.log`
- **warn**: Advertencias
- **info**: Información general → `logs/combined.log`
- **debug**: Debugging (solo dev)

### Métricas en Tiempo Real

```bash
# Endpoint de métricas (solo dev)
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

### Testing (Próximamente)

```bash
npm test                 # Ejecutar todos los tests
npm run test:watch       # Modo watch
npm run test:coverage    # Cobertura de código
```

#### RFIDService: por qué no importamos SerialPort arriba

En [src/services/rfidService.js](src/services/rfidService.js) **no** se hace `require('serialport')` en el top-level del módulo.
En su lugar, el `require()` se hace **dentro de** `connect()` (lazy load) y además existe `setSerialImplementations()`.

Motivos:
- **Evitar acceso a hardware / bindings nativos en tests**: el simple import de `serialport` puede inicializar dependencias nativas o dejar handles abiertos.
- **Hacer el mock fiable**: en Jest, si el módulo se importa antes del `jest.mock()`, queda cacheado y el mock no aplica.
- **Mantener RFID opt-in**: si `RFID_ENABLED!==true` o falta `SERIAL_PORT`, no se carga SerialPort ni se intenta abrir puertos.

Cómo se mockea en tests (inyección, sin depender de `jest.mock`):

```js
const rfidService = require('../src/services/rfidService');

const parserInstance = { on: jest.fn() };
const SerialPortMock = jest.fn(() => ({
  pipe: jest.fn(() => parserInstance),
  on: jest.fn(),
  open: jest.fn(cb => cb && cb(null)),
  close: jest.fn(cb => cb && cb(null)),
  isOpen: true,
  path: 'COM_TEST',
  baudRate: 115200
}));
const ReadlineParserMock = jest.fn(() => ({}));

rfidService.setSerialImplementations({
  SerialPort: SerialPortMock,
  ReadlineParser: ReadlineParserMock
});
```

Ejemplo real: [tests/serial.test.js](tests/serial.test.js)

## 🚢 Despliegue

### Pre-Despliegue

1. **Actualizar secretos**: Cambiar JWT_SECRET, JWT_REFRESH_SECRET
2. **Configurar Sentry**: Añadir SENTRY_DSN de producción
3. **Configurar MongoDB**: Usar MongoDB Atlas
4. **Whitelist CORS**: Añadir dominio de producción
5. **Rate limits**: Ajustar según tráfico esperado
6. **Node version**: Verificar >=22.0.0

### Variables de Entorno (Producción)

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/rfid_games
JWT_SECRET=<secret-super-seguro-produccion>
JWT_REFRESH_SECRET=<refresh-secret-super-seguro>
CORS_WHITELIST=https://app.com
SENTRY_DSN=<sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% en prod
```

### Healthcheck

```bash
curl https://app.com/api/health

# Response esperado:
{
  "status": "ok",
  "timestamp": "2025-11-24T...",
  "environment": "production",
  "rfid": {
    "connected": true,
    "uptime": "5h 23m"
  }
}
```

## 👤 Autor

**Samuel Blanchart Pérez**
