# Requisitos Funcionales - Comunicación en Tiempo Real

## RF-RT: WebSocket y Motor de Juego

---

## Motor de Juego (RF-RT-001 a RF-RT-008)

### RF-RT-001: Gestión de Partidas Activas ✅

**Descripción:** El motor de juego debe mantener en memoria el estado de todas las partidas activas.

**Criterios de Aceptación:**

- Mapa de partidas activas (playId → estado)
- Límite configurable de partidas simultáneas (MAX_ACTIVE_PLAYS)
- Estado incluye: documentos, índices, timers, flags

**Estructura del Estado:**

```javascript
{
  playDoc: GamePlay,           // Documento Mongoose
  sessionDoc: GameSession,     // Documento de sesión
  uidToMapping: Map,           // Índice O(1) uid → mapping
  currentChallenge: Object,    // Desafío actual
  roundTimer: Timeout,         // Timer de ronda
  awaitingResponse: Boolean,   // Esperando respuesta
  roundStartTime: Number,      // Timestamp inicio ronda
  createdAt: Number            // Timestamp creación
}
```

---

### RF-RT-002: Inicio de Partida ✅

**Descripción:** El motor debe iniciar una partida bloqueando las tarjetas necesarias.

**Criterios de Aceptación:**

- Verificar límite de partidas activas
- Bloquear todas las tarjetas de la sesión (evitar conflictos)
- Construir índice O(1) para búsqueda por UID
- Emitir primer desafío automáticamente

**Evento de Entrada:** `start_play { playId }`

---

### RF-RT-003: Generación de Desafíos ✅

**Descripción:** El motor debe generar desafíos aleatorios para cada ronda.

**Criterios de Aceptación:**

- Selección aleatoria de cardMapping
- Registrar evento `round_start` en BD
- Emitir desafío al cliente con displayData
- Iniciar timer de timeout

**Evento Emitido:** `new_round`

```json
{
  "roundNumber": 1,
  "totalRounds": 5,
  "challenge": {
    "displayData": { "value": "España", "display": "🇪🇸" }
  },
  "timeLimit": 15,
  "score": 0
}
```

---

### RF-RT-004: Procesamiento de Escaneos ✅

**Descripción:** El motor debe procesar los escaneos RFID y validar respuestas.

**Criterios de Aceptación:**

- Búsqueda O(1) de partida por UID de tarjeta
- Verificar que la partida espera respuesta
- Cancelar timer de timeout
- Calcular puntuación y tiempo de respuesta
- Registrar evento en BD

**Flujo:**

1. `rfidService` detecta tarjeta
2. `gameEngine.handleCardScan(uid)` busca partida
3. Validar respuesta (correcta/incorrecta)
4. Emitir resultado al cliente
5. Avanzar a siguiente ronda (con delay)

---

### RF-RT-005: Cálculo de Puntuación ✅

**Descripción:** El motor debe calcular puntos según la configuración de la sesión.

**Reglas:**

- Respuesta correcta: `+config.pointsPerCorrect`
- Respuesta incorrecta: `+config.penaltyPerError` (negativo)
- Timeout: 0 puntos

**Evento Emitido:** `validation_result`

```json
{
  "isCorrect": true,
  "expected": { "value": "España", "display": "🇪🇸" },
  "actual": { "value": "España" },
  "pointsAwarded": 10,
  "newScore": 50,
  "timeout": false
}
```

---

### RF-RT-006: Manejo de Timeout ✅

**Descripción:** El motor debe manejar timeouts cuando el jugador no responde.

**Criterios de Aceptación:**

- Timer programado con `config.timeLimit` segundos
- Registrar evento `timeout` en BD
- No otorgar ni restar puntos
- Avanzar a siguiente ronda automáticamente

---

### RF-RT-007: Finalización de Partida ✅

**Descripción:** El motor debe finalizar partidas correctamente liberando recursos.

**Criterios de Aceptación:**

- Limpiar timers pendientes
- Guardar estado final en BD (método `complete()`)
- Emitir evento `game_over` con puntuación final
- Liberar tarjetas bloqueadas
- Eliminar partida de memoria activa
- Actualizar métricas del motor

**Evento Emitido:** `game_over`

```json
{
  "finalScore": 50,
  "metrics": {
    "totalAttempts": 5,
    "correctAttempts": 4,
    "errorAttempts": 1,
    "averageResponseTime": 3200
  }
}
```

---

### RF-RT-008: Cleanup de Partidas Abandonadas ✅

**Descripción:** El motor debe detectar y limpiar partidas abandonadas automáticamente.

**Criterios de Aceptación:**

- Verificación periódica cada 5 minutos
- Timeout configurable (PLAY_TIMEOUT_MS, default: 1 hora)
- Finalizar partidas que exceden el timeout
- Registrar métricas de partidas canceladas

---

## WebSocket (RF-RT-009 a RF-RT-012)

### RF-RT-009: Gestión de Conexiones ✅

**Descripción:** El servidor debe gestionar conexiones WebSocket con Socket.IO.

**Criterios de Aceptación:**

- CORS configurado igual que API REST
- Ping/Pong para detección de desconexión
- Soporte WebSocket y polling como fallback
- Logging de conexiones/desconexiones

**Configuración:**

```javascript
{
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
}
```

---

### RF-RT-010: Salas de Partida (Rooms) ✅

**Descripción:** Cada partida debe tener su propia sala para emisión de eventos.

**Criterios de Aceptación:**

- Nomenclatura: `play_{playId}`
- Clientes se unen al entrar a partida
- Eventos solo llegan a clientes de la sala
- Limpieza al abandonar o desconectar

**Eventos:**

- `join_play { playId }` - Unirse a sala
- `leave_play { playId }` - Abandonar sala

---

### RF-RT-011: Eventos Cliente → Servidor ✅

**Descripción:** El cliente puede emitir eventos para controlar la partida.

**Eventos Soportados:**

| Evento | Payload | Descripción |
|--------|---------|-------------|
| `join_play` | `{ playId }` | Unirse a partida |
| `leave_play` | `{ playId }` | Abandonar partida |
| `start_play` | `{ playId }` | Iniciar partida |
| `pause_play` | `{ playId }` | Pausar partida |
| `resume_play` | `{ playId }` | Reanudar partida |
| `next_round` | `{ playId }` | Siguiente ronda (manual) |

---

### RF-RT-012: Eventos Servidor → Cliente ✅

**Descripción:** El servidor emite eventos para actualizar el estado del cliente.

**Eventos Emitidos:**

| Evento | Descripción |
|--------|-------------|
| `rfid_event` | Evento del sensor RFID |
| `rfid_status` | Estado de conexión del sensor |
| `play_state` | Estado inicial de partida |
| `new_round` | Nuevo desafío |
| `validation_result` | Resultado de respuesta |
| `game_over` | Partida finalizada |
| `error` | Error en la partida |

---

## Integración RFID-WebSocket (RF-RT-013 a RF-RT-015)

### RF-RT-013: Broadcast de Eventos RFID ✅

**Descripción:** Los eventos del sensor deben propagarse a todos los clientes conectados.

**Flujo:**

1. `rfidService` emite evento `rfid_event`
2. `server.js` escucha y hace broadcast
3. Todos los clientes reciben el evento

---

### RF-RT-014: Procesamiento Selectivo ✅

**Descripción:** Solo las partidas afectadas procesan los eventos RFID.

**Criterios de Aceptación:**

- Evento `card_detected` dispara `gameEngine.handleCardScan(uid)`
- Búsqueda O(1) encuentra la partida correcta
- Partidas no afectadas ignoran el evento

---

### RF-RT-015: Estado de Conexión RFID ✅

**Descripción:** Los clientes deben recibir actualizaciones del estado del sensor.

**Evento:** `rfid_status { status }`

**Estados:**

- `connected`: Sensor operativo
- `disconnected`: Sensor desconectado
- `reconnecting`: Intentando reconectar
- `failed`: Reconexión fallida

