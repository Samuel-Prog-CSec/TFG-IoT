# Registro de Decisiones de Arquitectura (ADR)

## ADR-001: Eliminación del Límite Duro de Partidas Simultáneas

### Contexto (ADR-001)

Inicialmente, el sistema imponía un límite duro (`MAX_ACTIVE_PLAYS`) en el número de partidas que podían ocurrir simultáneamente. Si se alcanzaba este límite, el servidor rechazaba nuevas conexiones de juego devolviendo un error.

El objetivo de este límite era proteger los recursos del servidor (memoria, CPU, conexiones de base de datos) ante picos de tráfico. Sin embargo, en la fase actual de despliegue y uso (clases controladas), este límite resultaba artificial y podía bloquear lecciones legítimas innecesariamente.

### Decisión (ADR-001)

Se ha decidido **eliminar el bloqueo duro** para nuevas partidas.

1. La variable `ACTIVE_PLAYS_WARNING_THRESHOLD` (antes `MAX_ACTIVE_PLAYS`) se mantiene como un **umbral de monitorización** (Soft Limit).
2. Si se supera el umbral, el sistema **permite** crear la partida, pero registra un **WARNING** en los logs.
3. Se confía en la monitorización externa y alertas (Sentry/Logs) para detectar saturación real.

### Posibles Impactos

#### 1. Rendimiento y Recursos (Memoria/CPU)

- **Impacto**: Al no haber límite, un número masivo de partidas podría agotar la memoria del servidor (Heap de Node.js) o saturar el Event Loop.
- **Mitigación**:
  - Cada estado de partida en `gameEngine` es relativamente ligero (~Kb).
  - Node.js maneja bien miles de objetos en memoria.
  - Se mantiene el `cleanupInterval` para eliminar partidas abandonadas y evitar fugas de memoria.

#### 2. Conexiones a Base de Datos

- **Impacto**: Cada partida genera eventos y escrituras. Un exceso de concurrencia podría saturar el pool de conexiones de MongoDB.
- **Mitigación**: Mongoose gestiona un pool de conexiones (default 5-10). Las peticiones se encolarán si el pool se agota, aumentando la latencia pero no tirando el servidor inmediatamente.

#### 3. Experiencia de Usuario

- **Positivo**: No habrá rechazos arbitrarios de servicio durante una clase.
- **Negativo (Riesgo)**: Si el servidor se satura realmente, todos los usuarios experimentarán lentitud (lag) en lugar de que solo los nuevos sean rechazados. Se prefiere degradación de servicio a denegación de servicio en este contexto educativo.

### Estado Futuro

Si el sistema escala a producción masiva, se deberá reimplementar un rate-limiting más inteligente (ej. por IP o por Tenant) o escalar horizontalmente el backend (lo cual requeriría migrar el estado en memoria de `gameEngine` totalmente a Redis).

---

## ADR-002: Autenticación Obligatoria en WebSockets y Desconexión por Invalidez

### Contexto (ADR-002)

Los eventos Socket.IO permiten controlar partidas y emitir escaneos RFID en tiempo real. Sin una autenticación obligatoria en el handshake y sin revocación activa, un socket podría continuar enviando eventos incluso después de que la cuenta sea inhabilitada o se inicie sesión en otro dispositivo.

### Decisión (ADR-002)

Se establece autenticación obligatoria en el handshake de Socket.IO, con validación de:

1. Token JWT (access token) desde `auth.token` o header `Authorization`.
2. Estado de cuenta (`active`) y aprobación (`approved` para docentes).
3. Single-session (el `sid` del token debe coincidir con `currentSessionId`).

Además, cuando una sesión se invalida (nuevo login) o la cuenta se desactiva/rechaza, se emite `session_invalidated` y se **desconectan** los sockets activos del usuario.

### Consecuencias (ADR-002)

- **Seguridad mejorada**: evita control de partidas o lecturas RFID desde sesiones inválidas.
- **Coherencia de sesión**: garantiza que el canal en tiempo real respete single-session.
- **Coste aceptable**: se añade una consulta de usuario en el handshake, asumible por volumen de conexiones.

---

## ADR-003: Capa de DTOs v1 y Contrato de Respuestas

### Contexto (ADR-003)

Las respuestas de la API mezclaban documentos Mongoose crudos con DTOs parciales. Esto exponía campos internos (`__v`) y creaba inconsistencias en la paginación (a veces anidada, a veces top-level). Además, algunos endpoints devolvían estructuras pesadas (por ejemplo `events` completos en listados), afectando rendimiento y seguridad.

### Decisión (ADR-003)

Se adopta una **capa de DTOs v1** como funciones puras y se define un **contrato de respuestas uniforme**:

1. **DTOs v1 como funciones puras** (sin clases): simples, testeables y fáciles de reutilizar.
2. **Resumen vs detalle** para entidades con payload pesado:
   - `GamePlay`: resumen sin `events` en listados, detalle con `events` en consulta individual.
   - `GameSession`: resumen sin `cardMappings`, detalle con mappings completos.
   - `GameContext` y `CardDeck`: resumen con contadores, detalle con assets/mappings.
3. **Paginación consistente top-level** con `data` y `pagination` (sin legacy).
4. **DTOs específicos de analytics por endpoint** para claridad semántica y estabilidad.
5. **Omisión explícita de campos sensibles** (password, `__v`, tokens internos, datos de infraestructura).
6. **Versión interna**: el sufijo `V1` solo existe en funciones internas, no en el payload.
7. **Sin compatibilidad legacy**: los clientes deben usar la última versión de la API.

### Contrato de Respuestas (v1)

#### 1. Respuesta de listado paginado

- **Formato**:
  - `data`: array de elementos DTO v1
  - `pagination`: objeto con metadatos

Campos obligatorios en `pagination`:

- `page` (number)
- `limit` (number)
- `total` (number)
- `totalPages` (number)
- `hasNext` (boolean)
- `hasPrev` (boolean)

#### 2. Respuesta de listado no paginado

- **Formato**:
  - `data`: array de elementos DTO v1
  - `meta`: objeto con `count`

#### 3. Respuesta de recurso único

- **Formato**:
  - `data`: objeto DTO v1

#### 4. Campos omitidos por seguridad

- `password`
- `__v`
- tokens internos (por ejemplo `_internal` de refresh tokens)
- datos internos de infraestructura no requeridos por el cliente

#### 5. Campos opcionales

- Los campos opcionales se omiten cuando no aplican (no se envían como `null`).

### Mapeo Endpoint → DTO (v1)

#### Auth

- `POST /api/auth/register` → `toUserDTOV1`
- `POST /api/auth/login` → `toAuthResponseDTOV1`
- `GET /api/auth/me` → `toUserDTOV1`
- `PUT /api/auth/me` → `toUserDTOV1`

#### Users

- `GET /api/users` → `toUserListDTOV1` + `toPaginatedDTOV1`
- `GET /api/users/:id` → `toUserDTOV1` o `toStudentDTOV1`
- `POST /api/users` → `toStudentDTOV1`
- `PUT /api/users/:id` → `toUserDTOV1` o `toStudentDTOV1`
- `POST /api/users/:id/transfer` → `toStudentDTOV1`
- `GET /api/users/:id/stats` → `toUserStatsDTOV1`
- `GET /api/users/teacher/:teacherId/students` → `toUserListDTOV1` + `meta.count`

#### Cards

- `GET /api/cards` → `toCardListDTOV1` + `toPaginatedDTOV1`
- `GET /api/cards/:id` → `toCardDTOV1`
- `POST /api/cards` → `toCardDTOV1`
- `PUT /api/cards/:id` → `toCardDTOV1`
- `POST /api/cards/batch` → `toCardListDTOV1`
- `GET /api/cards/stats` → `toCardStatsDTOV1`

#### Mechanics

- `GET /api/mechanics` → `toGameMechanicListDTOV1` + `toPaginatedDTOV1`
- `GET /api/mechanics/:id` → `toGameMechanicDTOV1`
- `POST /api/mechanics` → `toGameMechanicDTOV1`
- `PUT /api/mechanics/:id` → `toGameMechanicDTOV1`
- `GET /api/mechanics/active` → `toGameMechanicListDTOV1` + `meta.count`

#### Contexts

- `GET /api/contexts` → `toGameContextListDTOV1` + `toPaginatedDTOV1`
- `GET /api/contexts/:id` → `toGameContextDetailDTOV1`
- `POST /api/contexts` → `toGameContextDetailDTOV1`
- `PUT /api/contexts/:id` → `toGameContextDetailDTOV1`
- `POST /api/contexts/:id/assets` → `toGameContextDetailDTOV1`
- `DELETE /api/contexts/:id/assets/:assetKey` → `toGameContextDetailDTOV1`
- `GET /api/contexts/:id/assets` → `toGameContextDetailDTOV1` + `count`

#### Decks

- `GET /api/decks` → `toCardDeckListDTOV1` + `toPaginatedDTOV1`
- `GET /api/decks/:id` → `toCardDeckDetailDTOV1`
- `POST /api/decks` → `toCardDeckDetailDTOV1`
- `PUT /api/decks/:id` → `toCardDeckDetailDTOV1`

#### Sessions

- `GET /api/sessions` → `toGameSessionListDTOV1` + `toPaginatedDTOV1`
- `GET /api/sessions/:id` → `toGameSessionDetailDTOV1`
- `POST /api/sessions` → `toGameSessionDetailDTOV1`
- `PUT /api/sessions/:id` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/start` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/pause` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/end` → `toGameSessionDetailDTOV1`

#### Plays

- `GET /api/plays` → `toGamePlayListDTOV1` + `toPaginatedDTOV1`
- `GET /api/plays/:id` → `toGamePlayDetailDTOV1`
- `POST /api/plays` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/events` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/complete` → `toGamePlayDetailDTOV1` + `rating`
- `POST /api/plays/:id/abandon` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/pause` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/resume` → `toGamePlayDetailDTOV1`
- `GET /api/plays/stats/:playerId` → `toPlayerStatsDTOV1`

#### Sistema

- `GET /api/metrics` → `toSystemMetricsDTOV1` (sin envelope `success`)

### Consecuencias (ADR-003)

- **Seguridad mejorada**: se eliminan campos sensibles de las respuestas.
- **Consistencia**: el frontend no necesita manejar variantes de paginación.
- **Rendimiento**: listas más ligeras (sin eventos/mappings completos).
- **Mantenibilidad**: DTOs v1 centralizados y testeados.
