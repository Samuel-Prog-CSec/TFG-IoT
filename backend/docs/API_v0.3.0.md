# Documentación de la API ("RFID Games Backend") - v0.3.0

Este documento detalla los endpoints de la API REST para el Backend de Juegos Educativos RFID.

**URL Base:** `/api`
**Versión:** 0.3.0

## Autenticación y Seguridad

### Cabeceras (Headers)

- **Authorization:** `Bearer <token>` (Requerido para rutas protegidas)
- **X-CSRF-Token:** Requerido para métodos POST/PUT/DELETE (double-submit con cookie `csrfToken`).
- **Límites de Velocidad (Rate Limits):**
  - **Global:** 100 peticiones / 15 min
  - **Auth:** 5 peticiones / 15 min
  - **Creación:** 10 creaciones / 1 min (Sesiones, Contextos, etc.)

---

## Endpoints

### 0. Sistema y Observabilidad

| Método | Endpoint   | Descripción                                                                     | Acceso   |
| :----- | :--------- | :------------------------------------------------------------------------------ | :------- |
| `GET`  | `/health`  | Health check (MongoDB, Redis, RFID, memoria, uptime)                            | Público  |
| `GET`  | `/metrics` | Métricas runtime (latencia HTTP, conexiones WS, partidas activas, eventos RFID) | Profesor |

> Nota: La URL base del documento es `/api`. Por tanto:
>
> - `GET /api/health` es el endpoint principal.
> - `GET /health` existe como alias en la raíz (útil para herramientas externas).
> - `GET /api/metrics` es una ruta protegida.

#### GET `/health`

Devuelve el estado de salud del sistema.

- **200** si MongoDB está saludable y (en no-producción) Redis puede estar degradado.
- **503** si alguna dependencia crítica no está saludable (en producción, Redis se considera crítico).

Respuesta (resumen):

```json
{
  "status": "healthy",
  "issues": { "critical": [], "degraded": [] },
  "timestamp": "2026-01-02T12:00:00.000Z",
  "uptime": "0h 10m 5s",
  "services": {
    "mongodb": { "status": "healthy", "responseTime": "2ms" },
    "redis": { "status": "healthy", "responseTime": "1ms" },
    "rfid": { "status": "disconnected" }
  },
  "system": { "memory": { "heapUsed": "40 MB" } }
}
```

En entornos `development/test`, si Redis no está disponible, el campo `status` puede ser `degraded`.

El campo `issues` desglosa dependencias afectadas:

- `issues.critical`: servicios críticos que fuerzan `503` en producción.
- `issues.degraded`: servicios degradados (permitidos en no-producción).

#### GET `/metrics` (equivale a `GET /api/metrics`)

Devuelve métricas runtime del backend.

- Requiere `Authorization: Bearer <token>`.
- Roles permitidos: `teacher` y `super_admin`.

Campos relevantes:

- `http.avgLatencyMs`: latencia media (ms) desde arranque.
- `websocket.connectedClients`: conexiones activas.
- `websocket.events.authCacheHits`: aciertos de caché de revalidación auth en eventos sensibles.
- `websocket.events.authCacheMisses`: fallos de caché de revalidación auth.
- `gameEngine.activePlays`: partidas activas.
- `gameEngine.lockContention`: contención detectada por lock serializado por `playId`.
- `gameEngine.scanRaceDiscarded`: descartes por carrera (`scan/timeout`) durante ronda.
- `rfid.processed.totalEventsProcessed`: eventos RFID procesados por el servidor.

### 1. Autenticación (`/auth`)

| Método | Endpoint           | Descripción                    | Acceso  | Rate Limit |
| :----- | :----------------- | :----------------------------- | :------ | :--------- |
| `POST` | `/register`        | Registrar nuevo profesor       | Público | 3/h        |
| `POST` | `/login`           | Login (profesor o super admin) | Público | 5/15m      |
| `POST` | `/refresh`         | Refrescar access token         | Público | -          |
| `POST` | `/logout`          | Cerrar sesión y revocar tokens | Privado | -          |
| `GET`  | `/me`              | Obtener perfil actual          | Privado | -          |
| `PUT`  | `/me`              | Actualizar perfil actual       | Privado | -          |
| `PUT`  | `/change-password` | Cambiar contraseña             | Privado | -          |

**Cuerpo de la Petición (Registro):**

```json
{
  "name": "Nombre Profesor",
  "email": "profesor@email.com",
  "password": "contraseñaSegura123"
}
```

Notas:

- Al registrar un profesor, la cuenta queda en `accountStatus: pending_approval` y NO se emiten tokens.
- Un `super_admin` debe aprobar/rechazar la cuenta antes de que el profesor pueda hacer login.
- **Sesión Única**: Al iniciar sesión, cualquier sesión activa anterior de este usuario será invalidada (token refresh deja de funcionar) y se emitirá un evento `session_invalidated` vía WebSocket al dispositivo anterior.
- **Refresh Token**: Se entrega como cookie `httpOnly` (`refreshToken`) y NO se devuelve en el body.
- **Refresh endpoint**: `POST /api/auth/refresh` usa body vacío (`{}`) y obtiene el refresh token exclusivamente de cookie.
- **CSRF**: Se usa double-submit. El cliente debe enviar el header `X-CSRF-Token` con el valor de la cookie `csrfToken` en métodos que modifican datos, incluido `POST /api/auth/refresh`.

### 1.1 Administración (`/admin`)

Endpoints protegidos para el flujo de aprobación de profesores.

| Método | Endpoint             | Descripción       | Acceso        |
| :----- | :------------------- | :---------------- | :------------ |
| `POST` | `/users/:id/approve` | Aprobar profesor  | `super_admin` |
| `POST` | `/users/:id/reject`  | Rechazar profesor | `super_admin` |

Notas:

- Solo se puede aprobar/rechazar usuarios con `role: teacher`.
- El rechazo/aprobación se aplica mediante el campo `accountStatus` (`approved` / `rejected`).

---

### 2. Usuarios (`/users`)

| Método   | Endpoint                | Descripción                                    | Acceso   |
| :------- | :---------------------- | :--------------------------------------------- | :------- |
| `GET`    | `/`                     | Obtener lista de usuarios                      | Profesor |
| `GET`    | `/:id`                  | Obtener usuario por ID                         | Privado  |
| `POST`   | `/`                     | Crear usuario ALUMNO                           | Profesor |
| `PUT`    | `/:id`                  | Actualizar usuario                             | Privado  |
| `DELETE` | `/:id`                  | Eliminar usuario (soft delete, borrado lógico) | Profesor |
| `GET`    | `/:id/stats`            | Obtener estadísticas del alumno                | Privado  |
| `GET`    | `/teacher/:id/students` | Obtener alumnos de un profesor                 | Profesor |
| `POST`   | `/:id/transfer`         | Transferir alumno a otro profesor              | Profesor |

**Cuerpo de la Petición (Transferir Alumno):**

```json
{
  "newTeacherId": "<ObjectId>",
  "newClassroom": "Nueva Clase B"
}
```

> **Nota de Seguridad:** Solo el profesor creador del alumno (`createdBy`) o un `super_admin` pueden iniciar la transferencia.

**Cuerpo de la Petición (Crear Alumno):**

```json
{
  "name": "Nombre Alumno",
  "role": "student"
}
```

---

### 3. Tarjetas RFID (`/cards`)

| Método   | Endpoint | Descripción                 | Acceso   |
| :------- | :------- | :-------------------------- | :------- |
| `GET`    | `/`      | Listar todas las tarjetas   | Profesor |
| `GET`    | `/:id`   | Obtener detalles de tarjeta | Profesor |
| `POST`   | `/`      | Registrar nueva tarjeta     | Profesor |
| `POST`   | `/batch` | Registrar tarjetas en lote  | Profesor |
| `PUT`    | `/:id`   | Actualizar info de tarjeta  | Profesor |
| `DELETE` | `/:id`   | Eliminar tarjeta            | Profesor |
| `GET`    | `/stats` | Obtener estadísticas de uso | Profesor |

---

### 4. Mecánicas de Juego (`/mechanics`)

| Método   | Endpoint  | Descripción                  | Acceso       |
| :------- | :-------- | :--------------------------- | :----------- |
| `GET`    | `/`       | Listar todas las mecánicas   | Profesor     |
| `GET`    | `/active` | Listar mecánicas habilitadas | Público/Auth |
| `GET`    | `/:id`    | Obtener detalles de mecánica | Profesor     |
| `POST`   | `/`       | Crear nueva mecánica         | Profesor     |
| `PUT`    | `/:id`    | Actualizar mecánica          | Profesor     |
| `DELETE` | `/:id`    | Eliminar mecánica            | Profesor     |

---

### 5. Contextos de Juego (`/contexts`)

| Método   | Endpoint                | Descripción                               | Acceso   | Rate Limit |
| :------- | :---------------------- | :---------------------------------------- | :------- | :--------- |
| `GET`    | `/`                     | Listar contextos                          | Profesor | -          |
| `GET`    | `/:id`                  | Obtener detalles de contexto              | Profesor | -          |
| `GET`    | `/:id/assets`           | Obtener recursos (assets) del contexto    | Profesor | -          |
| `GET`    | `/upload-config`        | Obtener configuración de subida de assets | Profesor | -          |
| `POST`   | `/`                     | Crear nuevo contexto                      | Profesor | Creación   |
| `POST`   | `/:id/images`           | Subir imagen al contexto (WebP)           | Profesor | Upload     |
| `POST`   | `/:id/audio`            | Subir audio al contexto (MP3/OGG)         | Profesor | Upload     |
| `PUT`    | `/:id`                  | Actualizar contexto                       | Profesor | Creación   |
| `DELETE` | `/:id`                  | Eliminar contexto                         | Profesor | Creación   |
| `DELETE` | `/:id/images/:assetKey` | Eliminar imagen del asset                 | Profesor | -          |
| `DELETE` | `/:id/audio/:assetKey`  | Eliminar audio del asset                  | Profesor | -          |

#### Rate Limits Especiales

- **Upload:** 10 subidas / minuto por IP

#### Límites de Assets

- **Máximo:** 30 assets por contexto

---

#### GET `/contexts/upload-config`

Obtiene la configuración actual de subida de assets.

**Respuesta (200):**

```json
{
  "success": true,
  "data": {
    "image": {
      "allowedFormats": ["PNG", "JPG", "JPEG", "GIF", "WebP"],
      "outputFormat": "WebP",
      "maxInputSizeMB": 8,
      "minDimensions": { "width": 256, "height": 256 },
      "maxDimensions": { "width": 2048, "height": 2048 },
      "thumbnailDimensions": { "width": 256, "height": 256 }
    },
    "audio": {
      "allowedFormats": ["MP3", "OGG"],
      "maxSizeMB": 5,
      "recommendedMaxDurationSeconds": 30
    },
    "maxAssetsPerContext": 30,
    "storageEnabled": true
  }
}
```

---

#### POST `/:id/images`

Sube una imagen a un asset del contexto. La imagen se procesa automáticamente:

- Se valida el tipo real mediante magic bytes (previene falsificación de extensiones)
- Se convierte a formato WebP (calidad 85%)
- Se redimensiona si excede 768x768 (manteniendo aspect ratio)
- Se genera un thumbnail de 256x256

**Headers:**

- `Content-Type: multipart/form-data`

**Form Data:**

- `image`: Archivo de imagen (PNG, JPG, GIF, WebP)
- `key`: Identificador único del asset (ej: "espana")
- `value`: Valor textual del asset (ej: "España")
- `display`: Representación visual (emoji/texto) - opcional

**Respuesta (201):**

```json
{
  "success": true,
  "message": "Imagen subida y procesada correctamente",
  "data": {
    "key": "espana",
    "value": "España",
    "display": "🇪🇸",
    "imageUrl": "https://storage.supabase.co/.../espana_main.webp",
    "thumbnailUrl": "https://storage.supabase.co/.../espana_thumb.webp"
  }
}
```

**Errores comunes:**

- `400` - Archivo no proporcionado o formato inválido
- `400` - Imagen demasiado pequeña (< 256x256)
- `400` - Límite de assets alcanzado (30)
- `404` - Contexto no encontrado
- `413` - Archivo demasiado grande (> 8MB)

---

#### POST `/:id/audio`

Sube un archivo de audio a un asset existente del contexto.

**Headers:**

- `Content-Type: multipart/form-data`

**Form Data:**

- `audio`: Archivo de audio (MP3, OGG)
- `key`: Identificador del asset al que asociar el audio

**Respuesta (200):**

```json
{
  "success": true,
  "message": "Audio subido correctamente",
  "data": {
    "key": "espana",
    "audioUrl": "https://storage.supabase.co/.../espana.mp3"
  }
}
```

**Errores comunes:**

- `400` - Archivo no proporcionado o formato inválido
- `404` - Contexto o asset no encontrado
- `413` - Archivo demasiado grande (> 5MB)

---

#### DELETE `/:id/images/:assetKey`

Elimina la imagen (y thumbnail) de un asset específico.

**Respuesta (200):**

```json
{
  "success": true,
  "message": "Imagen eliminada correctamente"
}
```

---

#### DELETE `/:id/audio/:assetKey`

Elimina el audio de un asset específico.

**Respuesta (200):**

```json
{
  "success": true,
  "message": "Audio eliminado correctamente"
}
```

---

**Estructura de Asset (modelo):**

```json
{
  "key": "espana",
  "display": "🇪🇸",
  "value": "España",
  "imageUrl": "https://storage.supabase.co/.../espana_main.webp",
  "thumbnailUrl": "https://storage.supabase.co/.../espana_thumb.webp",
  "audioUrl": "https://storage.supabase.co/.../espana.mp3"
}
```

**Estructura (Crear Contexto):**

```json
{
  "name": "Conceptos Básicos",
  "description": "Sumas sencillas",
  "contextId": "matematicas",
  "assets": [
    {
      "key": "uno",
      "display": "1️⃣",
      "value": "Uno"
    }
  ]
}
```

**Nota:** Las imágenes y audios se suben después de crear el contexto, usando los endpoints de upload.

---

### 6. Sesiones de Juego (`/sessions`)

| Método   | Endpoint     | Descripción                | Acceso   |
| :------- | :----------- | :------------------------- | :------- |
| `GET`    | `/`          | Listar sesiones            | Profesor |
| `GET`    | `/:id`       | Obtener detalles de sesión | Profesor |
| `POST`   | `/`          | Crear sesión               | Profesor |
| `PUT`    | `/:id`       | Actualizar sesión          | Profesor |
| `DELETE` | `/:id`       | Eliminar sesión            | Profesor |
| `POST`   | `/:id/start` | Iniciar sesión             | Profesor |
| `POST`   | `/:id/pause` | Pausar sesión              | Profesor |
| `POST`   | `/:id/end`   | Finalizar sesión           | Profesor |

**Ciclo de Vida de la Sesión:**

1. **Crear:** Define el mapeo (Tarjetas <-> Recursos/Valores) y Configuración (Rondas, Tiempo).
2. **Iniciar:** Inicializa el `GameEngine` para esta sesión.
3. **Finalizar:** Cierra métricas y libera recursos.

**Nota importante (Decks y mapeos):**

- El mapeo de tarjetas (`cardMappings`) de una sesión **se deriva del mazo** (`deckId`).
- Al crear/consultar/actualizar/iniciar una sesión, el backend **sincroniza** el mapping con el mazo actual, para que si el mazo cambia (nuevas tarjetas, cambios de valores), la sesión use siempre el mapping vigente.
- `config.numberOfCards` depende del número de `cardMappings` del mazo y se ajusta automáticamente.

---

### 6.1. Mazos Reutilizables (`/decks`)

Los **mazos** (CardDeck) permiten al profesor **reutilizar** la configuración de mapeos `UID → assignedValue` para un `GameContext` y usarla en múltiples sesiones.

| Método   | Endpoint | Descripción                                    | Acceso   | Rate Limit |
| :------- | :------- | :--------------------------------------------- | :------- | :--------- |
| `GET`    | `/`      | Listar mazos del profesor (paginado + filtros) | Profesor | -          |
| `GET`    | `/:id`   | Obtener mazo por ID                            | Profesor | -          |
| `POST`   | `/`      | Crear nuevo mazo                               | Profesor | Creación   |
| `PUT`    | `/:id`   | Actualizar mazo                                | Profesor | Creación   |
| `DELETE` | `/:id`   | Eliminar mazo (soft delete → `archived`)       | Profesor | Creación   |

#### Reglas de Validación (negocio)

- `cardMappings` debe tener entre **2 y 20** elementos.
- Dentro del mazo no se permiten duplicados de: `uid`, `cardId`, `assignedValue`.
- Cada `assignedValue` debe existir en `GameContext.assets[].value` del `contextId` del mazo.
- Todas las `Card` referenciadas deben existir y estar en `status=active`.
- Consistencia: el `uid` del mapping debe coincidir con el `uid` de la tarjeta (`Card.uid`).

#### GET `/decks` (listado)

**Query params (opcionales):**

- `page`, `limit`, `sortBy`, `order`
- `contextId`: filtra por contexto
- `status`: `active` | `archived`
- `search`: busca por `name` / `description`

**Respuesta (200):**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "...",
        "name": "Geografía - Banderas",
        "description": "Mazo para banderas",
        "contextId": "...",
        "status": "active",
        "createdBy": "...",
        "createdAt": "2025-12-15T10:00:00.000Z",
        "updatedAt": "2025-12-15T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1,
      "hasMore": false,
      "hasPrevious": false
    }
  }
}
```

#### GET `/decks/:id`

**Respuesta (200):**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Geografía - Banderas",
    "description": "Mazo para banderas",
    "contextId": "...",
    "context": {
      "id": "...",
      "contextId": "geography",
      "name": "Geografía"
    },
    "cardMappings": [
      {
        "id": "...",
        "cardId": "...",
        "uid": "AA000001",
        "assignedValue": "España",
        "displayData": { "key": "spain", "display": "🇪🇸", "value": "España" }
      }
    ],
    "status": "active",
    "createdBy": "...",
    "createdAt": "2025-12-15T10:00:00.000Z",
    "updatedAt": "2025-12-15T10:00:00.000Z"
  }
}
```

#### POST `/decks` (crear)

**Body:**

```json
{
  "name": "Test Deck",
  "description": "Deck para reutilizar",
  "contextId": "<ObjectId>",
  "status": "active",
  "cardMappings": [
    {
      "cardId": "<ObjectId>",
      "uid": "AA000001",
      "assignedValue": "A",
      "displayData": { "key": "asset1", "display": "A1", "value": "A" }
    },
    {
      "cardId": "<ObjectId>",
      "uid": "AA000002",
      "assignedValue": "B",
      "displayData": { "key": "asset2", "display": "A2", "value": "B" }
    }
  ]
}
```

**Respuesta (201):**

```json
{
  "success": true,
  "message": "Mazo creado exitosamente",
  "data": {
    "id": "...",
    "name": "Test Deck",
    "contextId": "...",
    "status": "active",
    "cardMappings": [
      {
        "id": "...",
        "cardId": "...",
        "uid": "AA000001",
        "assignedValue": "A",
        "displayData": { "key": "asset1", "display": "A1", "value": "A" }
      }
    ]
  }
}
```

#### PUT `/decks/:id` (actualizar)

Permite actualizar `name`, `description`, `status`, `contextId` y/o `cardMappings`. Si cambia `contextId`, se revalida que `assignedValue` siga existiendo en los assets del nuevo contexto.

#### DELETE `/decks/:id` (soft delete)

No borra el documento: cambia `status` a `archived`.

---

### 7. Partidas (`/plays`)

| Método | Endpoint           | Descripción                                         | Acceso                        |
| :----- | :----------------- | :-------------------------------------------------- | :---------------------------- |
| `GET`  | `/`                | Listar historial de partidas                        | Privado                       |
| `GET`  | `/:id`             | Obtener partida específica                          | Privado                       |
| `GET`  | `/stats/:playerId` | Obtener estadísticas de jugador                     | Privado                       |
| `POST` | `/`                | Iniciar nueva instancia de partida                  | Profesor                      |
| `POST` | `/:id/pause`       | Pausar partida (congela el temporizador)            | Profesor (dueño de la sesión) |
| `POST` | `/:id/resume`      | Reanudar partida (reanuda desde el tiempo restante) | Profesor (dueño de la sesión) |
| `POST` | `/:id/events`      | Registrar evento de juego                           | Privado                       |
| `POST` | `/:id/complete`    | Marcar partida como completada                      | Privado                       |
| `POST` | `/:id/abandon`     | Marcar partida como abandonada                      | Privado                       |

**Notas:**

- Al pausar, se persisten los campos `pausedAt` y `remainingTime` (milisegundos) en `GamePlay`.
- Al reanudar, `pausedAt` y `remainingTime` vuelven a `null` y el temporizador continúa desde el tiempo restante.

---

## Eventos WebSocket (Socket.IO)

**Namespace:** `/`

| Evento | Dirección | Descripción | Datos |
| --- | --- | --- | --- |
| `join_play` | Cliente -> Servidor | Unirse a la sala de juego | `{ playId }` |
| `leave_play` | Cliente -> Servidor | Salir de la sala de juego | `{ playId }` |
| `start_play` | Cliente -> Servidor | Comenzar partida | `{ playId }` |
| `pause_play` | Cliente -> Servidor | Pausar partida | `{ playId }` |
| `resume_play` | Cliente -> Servidor | Reanudar partida | `{ playId }` |
| `next_round` | Cliente -> Servidor | Siguiente ronda manual | `{ playId }` |
| `join_card_registration` | Cliente -> Servidor | Unirse a sala de registro | `{}` |
| `leave_card_registration` | Cliente -> Servidor | Salir de sala de registro | `{}` |
| `join_admin_room` | Cliente -> Servidor | Unirse a sala admin | `{}` |
| `leave_admin_room` | Cliente -> Servidor | Salir de sala admin | `{}` |
| `rfid_scan_from_client` | Cliente -> Servidor | Escaneo RFID desde cliente | `{ uid, type, sensorId, timestamp, source }` |
| `play_state` | Servidor -> Cliente | Estado inicial | `{ playId, currentRound, score, maxRounds }` |
| `new_round` | Servidor -> Cliente | Nuevo desafío | `{ roundNumber, totalRounds, challenge, timeLimit, score }` |
| `validation_result` | Servidor -> Cliente | Resultado respuesta | `{ isCorrect, expected, actual, pointsAwarded, newScore, timeout? }` |
| `game_over` | Servidor -> Cliente | Fin de partida | `{ finalScore, metrics }` |
| `play_interrupted` | Servidor -> Cliente | Partida interrumpida | `{ playId, reason, message, finalScore }` |
| `play_paused` | Servidor -> Cliente | Partida pausada | `{ playId, currentRound, remainingTimeMs }` |
| `play_resumed` | Servidor -> Cliente | Partida reanudada | `{ playId, currentRound, remainingTimeMs, challenge? }` |
| `rfid_event` | Servidor -> Cliente | Tarjeta escaneada | `{ uid, type }` |
| `session_invalidated` | Servidor -> Cliente | Sesión invalidada | `{ reason, timestamp }` |

**Seguridad (WebSocket):**

- La conexión WebSocket **requiere token** en el handshake (`auth.token` o `Authorization: Bearer <token>`).
- El backend valida **rol**, **estado de cuenta** y **single-session** antes de aceptar eventos.
- Eventos de control (`join_play`, `start_play`, `pause_play`, `resume_play`, `next_round`) solo están permitidos a `teacher`/`super_admin`.
- `next_round` devuelve error tipado `ROUND_BLOCKED` cuando la partida sigue en `awaitingResponse`.
- Los sockets se desconectan automáticamente si la sesión es invalidada (por login en otro dispositivo o cambios de seguridad).

---

## Documentación Relacionada

- **[AssetProcessing.md](./AssetProcessing.md)** - Guía completa de procesamiento de imágenes y audio
- **[WebSockets-ExtendedUsage.md](./WebSockets-ExtendedUsage.md)** - Uso extendido de WebSockets

---

_Última actualización: 16-02-2026_
_Versión: 0.3.0 (runtime actualizado)_
