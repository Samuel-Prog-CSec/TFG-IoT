# Extensión del Uso de WebSockets en la Plataforma RFID

> [!NOTE]
> Para una explicación operacional end-to-end de actores, ownership, modos y errores esperados en runtime RFID, ver [RFID_Runtime_Flows.md](RFID_Runtime_Flows.md).

## Índice

1. [Estado Actual](#1-estado-actual)
2. [Análisis de Nuevos Casos de Uso](#2-análisis-de-nuevos-casos-de-uso)
3. [Arquitectura de Modos de Escaneo](#3-arquitectura-de-modos-de-escaneo)
4. [Implementación Detallada](#4-implementación-detallada)
5. [Flujos de Usuario](#5-flujos-de-usuario)
6. [Eventos WebSocket](#6-eventos-websocket)
7. [Consideraciones de Seguridad](#7-consideraciones-de-seguridad)
8. [Casos Límite y Errores](#8-casos-límite-y-errores)
9. [Optimización Runtime (Sprint 4)](#9-optimización-runtime-sprint-4)
10. [Rate Limiting de Eventos WebSocket](#10-rate-limiting-de-eventos-websocket)
11. [Estado en Memoria del WebSocket Layer](#11-estado-en-memoria-del-websocket-layer)

---

## 1. Estado Actual

### 1.1 Uso Existente de WebSockets

Actualmente, Socket.IO se utiliza en el contexto del **GameEngine** y como canal de ingesta RFID para:

| Funcionalidad     | Evento                  | Descripción                                      |
| ----------------- | ----------------------- | ------------------------------------------------ |
| Unirse a partida  | `join_play`             | Cliente se une a sala de partida                 |
| Iniciar partida   | `start_play`            | Activa el flujo de juego                         |
| Nuevo desafío     | `new_round`             | Envía pregunta al alumno                         |
| Validar respuesta | `validation_result`     | Resultado de escaneo RFID                        |
| Fin de partida    | `game_over`             | Puntuación y métricas finales                    |
| Ingesta RFID      | `rfid_scan_from_client` | Evento RFID enviado por Web Serial (cliente)     |
| Estado RFID       | `rfid_status`           | Estado del servicio RFID (client_ready/disabled) |

### 1.2 Limitación Actual

El sensor RFID actualmente opera en un único modo implícito: **gameplay**. Cualquier tarjeta escaneada se procesa como respuesta a un desafío de juego.

Esto impide usar el mismo sensor físico para otras operaciones como:

- Asignar tarjetas a assets durante la configuración de sesiones

---

## 2. Análisis de Nuevos Casos de Uso

### 2.1 Asignación de Tarjetas a Assets

#### Problema Actual (Asignación)

Al crear una GameSession, el profesor debe:

1. Ver la lista de tarjetas disponibles (UIDs crípticos)
2. Recordar qué tarjeta física corresponde a qué UID
3. Seleccionar manualmente el UID para cada asset

**Problemas:**

- Los UIDs no son memorables (ej: `32B8FA05`)
- Requiere etiquetar físicamente las tarjetas
- Proceso tedioso si hay muchas tarjetas

#### Solución con WebSockets (Asignación)

1. Profesor crea sesión: selecciona mecánica + contexto
2. Sistema muestra assets del contexto (España 🇪🇸, Francia 🇫🇷...)
3. Profesor hace clic en "España"
4. Sistema activa **modo asignación** para ese asset
5. Profesor escanea la tarjeta que quiere asociar
6. Sistema captura UID y crea el mapping automáticamente
7. Repetir para cada asset

**Beneficios:**

- Flujo natural: "escanea la tarjeta de España"
- No necesita recordar UIDs
- Las tarjetas pueden no tener etiquetas (el sistema las identifica)

#### Justificación Técnica (Asignación)

- Mismo razonamiento que el caso anterior: evento asíncrono
- Además, hay **contexto asociado**: qué asset estamos asignando
- El servidor debe saber "estoy esperando una tarjeta para España"

---

### 2.2 Notificaciones de Progreso (Futuro)

#### Caso de Uso

El profesor supervisa múltiples alumnos jugando simultáneamente:

- Alumno A completó partida con 80 puntos
- Alumno B lleva 3 errores seguidos (posible dificultad)
- Alumno C ha estado inactivo 2 minutos

#### Justificación

- Los eventos ocurren en tiempo real durante las partidas
- El profesor no está en la pantalla de cada alumno
- Permite intervención temprana si un alumno necesita ayuda

#### Prioridad

**Media** - No es crítico para MVP pero añade valor pedagógico significativo.

---

### 2.3 Dashboard de Estadísticas en Tiempo Real

#### Análisis

Las estadísticas agregadas (media de clase, rankings) no cambian con alta frecuencia.

#### Recomendación

**NO usar WebSockets** para este caso:

- Polling cada 30-60 segundos es suficiente
- Reduce complejidad del sistema
- Las estadísticas se calculan bajo demanda

#### Excepción

Si múltiples profesores ven el mismo dashboard y queremos consistencia inmediata, entonces sí tendría sentido.

---

## 3. Arquitectura de Modos de Escaneo

### 3.1 Concepto de "Modo"

El sensor RFID es un recurso compartido único. Para soportar múltiples casos de uso, implementamos un **sistema de modos**:

```text
┌─────────────────────────────────────────────────────────────┐
│                    SENSOR RFID (RC522)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  RFIDScanManager                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ currentMode: 'idle' | 'gameplay' | 'card_assignment'│   │
│  │ modeContext: { assetKey?, playId?, ... }             │   │
│  │ modeOwner: socketId                                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                ┌─────────┴─────────┐
                ▼                   ▼
          ┌──────────┐        ┌──────────┐
          │ GamePlay │        │ Card     │
          │ Handler  │        │ Assign   │
          └──────────┘        └──────────┘
```

### 3.2 Estados del Sistema

| Modo              | Descripción          | Acción al escanear               |
| ----------------- | -------------------- | -------------------------------- |
| `idle`            | Sin operación activa | Broadcast informativo a todos    |
| `gameplay`        | Partida en curso     | Validar respuesta en GameEngine  |
| `card_assignment` | Asignando a asset    | Enviar UID + assetKey al cliente |

### 3.3 Exclusión Mutua

Solo puede haber **un modo activo a la vez** (excepto gameplay que puede coexistir con idle):

```text
Reglas de transición:
- idle → cualquier modo: ✅ Permitido
- card_assignment → idle: ✅ Permitido (tras escaneo o cancelación)
- gameplay → otro modo: ❌ Bloqueado (partidas tienen prioridad)
- cualquier modo → gameplay: ✅ Permitido (inicia partida)
```

### 3.4 Propiedad del Modo

Cada modo tiene un "dueño" (el socket que lo solicitó):

- Solo el dueño puede cancelar el modo
- Si el dueño se desconecta, el modo se resetea automáticamente
- Previene conflictos si múltiples clientes intentan usar el sensor

---

## 4. Implementación Detallada

### 4.1 RFIDScanManager (Nuevo Servicio)

```javascript
// services/rfidScanManager.js

/**
 * Gestiona los modos de operación del sensor RFID.
 * Implementa patrón Singleton para estado global.
 *
 * Responsabilidades:
 * - Controlar qué modo está activo
 * - Almacenar contexto del modo (assetKey, sessionId, etc.)
 * - Identificar al cliente propietario del modo
 * - Emitir eventos de cambio de modo
 */
class RFIDScanManager extends EventEmitter {
  constructor() {
    this.currentMode = 'idle';
    this.modeContext = null;
    this.modeOwner = null;
    this.modeTimeout = null;
  }

  /**
   * Intenta cambiar al modo especificado.
   *
   * @param {string} mode - Nuevo modo
   * @param {object} context - Datos del contexto
   * @param {string} socketId - Cliente que solicita
   * @param {number} timeoutMs - Auto-reset tras X ms (opcional)
   * @returns {boolean} Éxito del cambio
   */
  setMode(mode, context, socketId, timeoutMs = 30000) {
    // Validar transición permitida
    if (!this.canTransitionTo(mode)) {
      return false;
    }

    // Limpiar timeout anterior
    this.clearModeTimeout();

    // Establecer nuevo modo
    this.currentMode = mode;
    this.modeContext = context;
    this.modeOwner = socketId;

    // Configurar auto-reset por timeout
    if (mode !== 'idle' && mode !== 'gameplay') {
      this.modeTimeout = setTimeout(() => {
        this.reset();
        this.emit('mode_timeout', { mode, context });
      }, timeoutMs);
    }

    this.emit('mode_changed', { mode, context, owner: socketId });
    return true;
  }

  canTransitionTo(newMode) {
    // No cambiar de gameplay a otros modos (excepto idle)
    if (this.currentMode === 'gameplay' && newMode !== 'idle') {
      return false;
    }
    return true;
  }
}
```

### 4.2 Integración en server.js

```javascript
// Manejador central de eventos RFID
rfidService.on('rfid_event', async eventData => {
  if (eventData.event !== 'card_detected') {
    // Eventos no-scan: broadcast normal
    io.emit('rfid_event', eventData);
    return;
  }

  const uid = eventData.uid.toUpperCase();
  const { mode, context, owner } = rfidScanManager.getMode();

  switch (mode) {
    case 'card_assignment':
      await handleCardAssignmentScan(uid, context, owner);
      break;

    case 'gameplay':
      await gameEngine.handleCardScan(uid);
      break;

    default: // idle
      io.emit('rfid_event', eventData); // Informativo
  }
});

async function handleCardAssignmentScan(uid, context, ownerSocket) {
  // Buscar tarjeta en BD
  const card = await Card.findOne({ uid, status: 'active' });

  if (!card) {
    io.to(ownerSocket).emit('card_assignment_error', {
      message: 'Tarjeta no registrada. Regístrala primero.',
      uid,
      assetKey: context.assetKey
    });
  } else {
    io.to(ownerSocket).emit('card_assignment_scan', {
      uid,
      cardId: card._id,
      cardMetadata: card.metadata,
      assetKey: context.assetKey,
      assetDisplay: context.assetDisplay
    });
  }

  rfidScanManager.reset();
}
```

### 4.3 Handlers de Socket.IO

```javascript
io.on('connection', socket => {
  // ══════════════════════════════════════════════════════
  // MODO: Asignación de tarjetas a assets
  // ══════════════════════════════════════════════════════

  socket.on('start_card_assignment', data => {
    // Validar datos requeridos
    if (!data.assetKey || !data.assetDisplay) {
      socket.emit('error', {
        code: 'INVALID_DATA',
        message: 'Falta assetKey o assetDisplay'
      });
      return;
    }

    const success = rfidScanManager.setMode(
      'card_assignment',
      {
        assetKey: data.assetKey,
        assetDisplay: data.assetDisplay,
        sessionDraft: data.sessionDraft // ID temporal de la sesión en creación
      },
      socket.id,
      60000 // 60 segundos timeout (más tiempo para buscar tarjeta)
    );

    if (success) {
      socket.emit('assignment_mode_active', {
        message: `Escanea la tarjeta para: ${data.assetDisplay}`,
        assetKey: data.assetKey,
        timeout: 60
      });
    } else {
      socket.emit('error', {
        code: 'MODE_BLOCKED',
        message: 'No se puede activar el modo asignación ahora'
      });
    }
  });

  socket.on('cancel_card_assignment', () => {
    if (rfidScanManager.isOwner(socket.id)) {
      rfidScanManager.reset();
      socket.emit('assignment_mode_cancelled');
    }
  });

  // ══════════════════════════════════════════════════════
  // Limpieza al desconectar
  // ══════════════════════════════════════════════════════

  socket.on('disconnect', () => {
    if (rfidScanManager.isOwner(socket.id)) {
      rfidScanManager.reset();
    }
  });
});
```

---

## 5. Flujos de Usuario

### 5.1 Flujo: Crear Sesión con Asignación de Tarjetas

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    PROFESOR     │     │     FRONTEND    │     │     BACKEND     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Selecciona mecánica   │                       │
         │ "Asociación"          │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │ Selecciona contexto   │                       │
         │ "Geografía"           │                       │
         │──────────────────────>│                       │
         │                       │ GET /api/contexts/:id │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │ Assets: España, Francia...
         │                       │<──────────────────────│
         │                       │                       │
         │  Muestra assets       │                       │
         │  para asignar         │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ Clic en "España 🇪🇸"  │                       │
         │──────────────────────>│                       │
         │                       │ start_card_assignment │
         │                       │ { assetKey: "spain",  │
         │                       │   assetDisplay: "🇪🇸" }│
         │                       │──────────────────────>│
         │                       │                       │
         │                       │ assignment_mode_active│
         │                       │<──────────────────────│
         │                       │                       │
         │ "Escanea tarjeta      │                       │
         │  para España"         │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ Escanea tarjeta       │                       │
         │ física en sensor      │                       │
         │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
         │                       │                       │
         │                       │ card_assignment_scan  │
         │                       │ { uid: "32B8FA05",    │
         │                       │   cardId: "...",      │
         │                       │   assetKey: "spain" } │
         │                       │<──────────────────────│
         │                       │                       │
         │ ✓ España asignada     │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ [Repetir para Francia, Italia, etc.]         │
         │                       │                       │
         │ Clic "Crear Sesión"   │                       │
         │──────────────────────>│                       │
         │                       │ POST /api/sessions    │
         │                       │ { cardMappings: [...] }
         │                       │──────────────────────>│
         │                       │                       │
         │                       │    201 Created        │
         │                       │<──────────────────────│
         │                       │                       │
```

---

## 6. Eventos WebSocket

### 6.1 Tabla Completa de Eventos

#### Cliente → Servidor

| Evento | Payload | Descripción |
| --- | --- | --- |
| `join_play` | `{ playId }` | Unirse a partida (existente) |
| `start_play` | `{ playId }` | Iniciar partida (existente) |
| `pause_play` | `{ playId }` | Pausar partida (solo profesor) |
| `resume_play` | `{ playId }` | Reanudar partida (solo profesor) |
| `next_round` | `{ playId }` | Solicitar siguiente ronda |
| `leave_play` | `{ playId }` | Abandonar partida (existente) |
| `join_card_assignment` | `{}` | Unirse al room de asignación |
| `leave_card_assignment` | `{}` | Salir del room de asignación |
| `join_admin_room` | `{}` | Unirse al room de admin |
| `leave_admin_room` | `{}` | Salir del room de admin |
| `rfid_scan_from_client` | `{ uid, type, sensorId, timestamp, source }` | Escaneo RFID desde cliente |
| `play_state_sync` | `{ playId }` | Solicitar snapshot de estado de partida tras reconexión |

#### Servidor → Cliente

| Evento | Payload | Descripción |
| --- | --- | --- |
| `rfid_event` | `{ event, uid?, type?, ... }` | Evento RFID dirigido por room |
| `rfid_status` | `{ status }` | Estado de conexión sensor (admin_room) |
| `rfid_mode_changed` | `{ mode, sensorId, metadata, socketId, updatedAt }` | Estado canónico del modo RFID por usuario |
| `play_state` | `{ playId, status, isPaused, mechanicName, currentRound, score, maxRounds, awaitingResponse, remainingTimeMs, timeLimitSeconds, currentChallenge?, memoryState? }` | Snapshot exacto de partida para rehidratación tras `join_play`, `play_state_sync` o reconexión |
| `new_round` | `{ roundNumber, totalRounds, challenge, timeLimit, score }` | Inicio de ronda o modo activo |
| `validation_result` | `{ isCorrect, timeout?, pointsAwarded, newScore, feedbackDelayMs?, ... }` | Resultado de escaneo/validación |
| `memory_turn_state` | `{ playId, board, matchedCount, totalCards, attempts, remainingTimeMs, score, phase }` | Estado intermedio de memoria (primera carta, match, mismatch, conceal) |
| `game_over` | `{ playId, finalScore, metrics, ... }` | Cierre de partida con métricas |
| `play_interrupted` | `{ playId, reason, message, finalScore }` | Interrupción forzada de partida (ej. reinicio de servidor) |
| `play_paused` | `{ playId, currentRound, remainingTimeMs }` | Partida pausada |
| `play_resumed` | `{ playId, currentRound, remainingTimeMs, challenge? }` | Partida reanudada |
| `session_invalidated` | `{ reason, timestamp }` | Sesión cerrada por nuevo login en otro dispositivo |

### 6.2 Códigos de Error

Los códigos de error emitidos por el servidor via `socket.emit('error', { code, message, ... })` se organizan por categoría:

#### Autenticación y Autorización

| Código | Descripción | Acción recomendada |
| --- | --- | --- |
| `AUTH_REQUIRED` | Token requerido en handshake | Enviar token al conectar |
| `AUTH_INVALID` | Token JWT inválido o expirado | Refrescar token y reconectar |
| `FORBIDDEN` | Rol insuficiente para el evento | Revisar rol requerido |
| `OWNERSHIP_INVALID` | No eres dueño de la partida | Verificar playId correcto |
| `MAX_CONNECTIONS_EXCEEDED` | Límite de conexiones simultáneas por usuario alcanzado | Cerrar conexiones inactivas |

#### RFID

| Código | Descripción | Acción recomendada |
| --- | --- | --- |
| `RFID_DISABLED` | Fuente RFID del cliente deshabilitada en servidor | Configurar `RFID_SOURCE=client` en backend |
| `RFID_MODE_INVALID` | Modo actual no permite lecturas | Verificar modo activo (gameplay/card_assignment) |
| `RFID_SOCKET_NOT_ACTIVE` | Este socket no es el owner del modo RFID | Solo un socket por usuario puede controlar RFID |
| `RFID_SENSOR_MISMATCH` | SensorId cambió inesperadamente | Verificar conexión del sensor |
| `RFID_SENSOR_UNAUTHORIZED` | Sensor no autorizado para esta sesión | Usar el sensor configurado en la sesión |
| `RFID_MODE_TAKEN_OVER` | Otro socket tomó el control del modo RFID | Reconectar si se necesita control |
| `DUPLICATE_RFID_EVENT` | UID escaneado dentro del cooldown (1200ms) | Esperar antes de re-escanear |

#### Gameplay

| Código | Descripción | Acción recomendada |
| --- | --- | --- |
| `PLAY_NOT_FOUND` | Partida no existe en base de datos | Verificar playId |
| `PLAY_NOT_ACTIVE` | Partida no está activa en el motor de juego | Puede haber terminado o no iniciado |
| `PLAY_ID_INVALID` | Formato de playId inválido (no es ObjectId) | Enviar ObjectId válido |
| `ROUND_BLOCKED` | Ronda bloqueada por `awaitingResponse` | Esperar `validation_result` o timeout |
| `COMMAND_ERROR` | Error interno al ejecutar un comando | Reintentar; si persiste, reportar |

#### Rate Limiting

| Código | Descripción | Acción recomendada |
| --- | --- | --- |
| `RATE_LIMITED` | Exceso de eventos en ventana corta | Reducir frecuencia (ver §10.1) |
| `TEMP_BLOCKED` | Bloqueo temporal por 3+ violaciones consecutivas (60s) | Esperar y reintentar |
| `PAYLOAD_TOO_LARGE` | Payload supera el límite (16KB global, 8KB RFID) | Reducir tamaño del payload |

#### Validación

| Código | Descripción | Acción recomendada |
| --- | --- | --- |
| `VALIDATION_ERROR` | Payload no pasa validación Zod | Revisar esquema del evento |
| `INVALID_DATA` | Faltan datos requeridos | Completar campos obligatorios |

> Para errores RFID específicos del protocolo hardware, ver [RFID_Protocol.md Apéndice B](RFID_Protocol.md#apéndice-b-códigos-de-error).

### 6.3 Flujo realtime específico para Memoria (Sprint 4)

1. Cliente envía `join_play` y `start_play`.
2. Servidor emite `new_round` con `challenge.displayData.mode = "memory_board"`.
3. Al primer escaneo válido, servidor emite `memory_turn_state` con `phase = "first_pick"`.
4. Al segundo escaneo:
   - Si hay pareja correcta: `validation_result` + `memory_turn_state` (`phase = "match"`).
   - Si hay pareja incorrecta: `validation_result` + `memory_turn_state` (`phase = "mismatch"`) y, tras delay, `memory_turn_state` (`phase = "concealed"`).
5. La partida termina por tiempo global agotado o por tablero completado (todas las parejas encontradas).

### 6.4 Payload mínimo de `memory_turn_state`

```json
{
  "playId": "<ObjectId>",
  "phase": "first_pick",
  "attempts": 3,
  "matchedCount": 4,
  "totalCards": 10,
  "remainingTimeMs": 27450,
  "score": 20,
  "board": [
    {
      "slotIndex": 0,
      "uid": "AA000001",
      "assignedValue": "España",
      "isMatched": false,
      "isSelected": true,
      "isRevealed": true,
      "displayData": { "key": "spain", "display": "🇪🇸", "value": "España" }
    }
  ]
}
```

### 6.5 Payload mínimo de `play_state` (snapshot de reconexión)

```json
{
  "playId": "<ObjectId>",
  "status": "in-progress",
  "isPaused": false,
  "mechanicName": "memory",
  "currentRound": 2,
  "score": 30,
  "maxRounds": 5,
  "awaitingResponse": true,
  "remainingTimeMs": 8200,
  "timeLimitSeconds": 15,
  "currentChallenge": {
    "uid": "AA000001",
    "assignedValue": "España",
    "displayData": { "key": "spain", "display": "🇪🇸", "value": "España" }
  },
  "memoryState": {
    "attempts": 3,
    "matchedCount": 4,
    "totalCards": 10,
    "board": []
  }
}
```

---

## 7. Consideraciones de Seguridad

### 7.1 Autenticación de WebSockets

**Autenticación obligatoria:** El socket debe enviar `token` en `socket.handshake.auth.token` (o header `Authorization: Bearer ...`). El servidor valida el token en el handshake, comprueba estado de cuenta y single-session, y asigna `socket.data.userId` y `socket.data.userRole`.

El siguiente ejemplo muestra un enfoque alternativo (autenticación global por handshake) a modo de referencia:

```javascript
// Middleware de autenticación obligatorio para Socket.IO
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Token requerido'));

  try {
    const decoded = verifyAccessToken(token, { headers: socket.handshake.headers });
    // Se valida estado de cuenta y single-session antes de aceptar
    socket.data.userId = decoded.id;
    socket.data.userRole = decoded.role;
    socket.join(`user_${decoded.id}`);
    next();
  } catch {
    next(new Error('Token inválido'));
  }
});
```

### 7.2 Autorización por Rol y Ownership

Los eventos de control de partida (`join_play`, `start_play`, `pause_play`, `resume_play`, `next_round`) requieren **rol docente** (`teacher` o `super_admin`) y **ownership** de la sesión asociada a la partida.

```javascript
socket.on('join_card_assignment', () => {
  // Solo profesores y super admin pueden asignar tarjetas
  if (!['teacher', 'super_admin'].includes(socket.data.userRole)) {
    socket.emit('error', {
      code: 'FORBIDDEN',
      message: 'Solo profesores pueden asignar tarjetas'
    });
    return;
  }
  // ... resto de la lógica
});
```

### 7.3 Rate Limiting de Eventos

El backend aplica **rate limiting por evento** con ventana deslizante, bloqueo temporal y control de payload. La clave de rate limit prioriza `userId` (si el socket está autenticado) y usa `socket.id` como fallback.

**Política por defecto (configurable):**

| Evento | Ventana | Máx | Nota |
| --- | --- | --- | --- |
| `authenticate` | 1s | 3 | Evitar brute force por socket |
| `join_play` | 1s | 3 | Protección de rooms |
| `leave_play` | 1s | 3 | Protección de rooms |
| `start_play` | 1s | 1 | Evitar duplicados |
| `pause_play` | 1s | 2 | Control moderado |
| `resume_play` | 1s | 2 | Control moderado |
| `next_round` | 1s | 5 | Tolerante para UI |
| `rfid_scan_from_client` | 3s | 2 | ~1 evento cada 1.5s |
| `play_state_sync` | 1s | 2 | Limitado para evitar abuso en reconexiones rápidas |

**Bloqueo temporal:** 3 violaciones consecutivas → 60s de bloqueo.

**Payload máximo:** 16 KB global, 8 KB para `rfid_scan_from_client`.

### 7.4 Invalidez de sesión y desconexión

- Si un usuario inicia sesión en otro dispositivo, se emite `session_invalidated` al socket anterior y se **desconecta** automáticamente.
- Si la cuenta se inactiva o se rechaza, el servidor revoca tokens y **cierra sockets activos** para evitar eventos en tiempo real no autorizados.

### 7.5 Locks distribuidos y leases runtime

- El arranque de partida (`start_play`) reserva UIDs de tarjetas en Redis con semántica atómica de claim (`SET NX`), evitando colisiones multi-instancia.
- Las claves activas de partida/tarjetas se crean con TTL (`GAME_ENGINE_LOCK_TTL_SECONDS`, default `90s`).
- El motor renueva leases de forma periódica con heartbeat (`GAME_ENGINE_LOCK_HEARTBEAT_MS`, default `30000ms`).
- La liberación de tarjetas en fin de partida/recovery se hace con verificación de owner (`delIfValueMatches`) para no borrar locks ajenos.
- En `next_round`, si la ronda está esperando respuesta, el servidor responde con `ROUND_BLOCKED` para evitar saltos de estado.

---

## 8. Casos Límite y Errores

### 8.1 Sensor Desconectado

```javascript
socket.on('start_card_assignment', () => {
  // Verificar estado del sensor antes de activar modo
  if (!rfidService.isConnected) {
    socket.emit('error', {
      code: 'SENSOR_DISCONNECTED',
      message: 'El sensor RFID no está conectado'
    });
    return;
  }
  // ...
});
```

### 8.2 Timeout del Modo

```javascript
// En RFIDScanManager
this.modeTimeout = setTimeout(() => {
  const previousMode = this.currentMode;
  this.reset();

  // Notificar al cliente dueño
  io.to(this.modeOwner).emit('mode_timeout', {
    mode: previousMode,
    message: 'Tiempo de espera agotado. Inténtalo de nuevo.'
  });
}, timeoutMs);
```

### 8.3 Cliente Desconectado Durante Modo

```javascript
socket.on('disconnect', () => {
  if (rfidScanManager.isOwner(socket.id)) {
    logger.info(`[Socket.IO] Cliente desconectado durante modo ${rfidScanManager.currentMode}`);
    rfidScanManager.reset();
  }
});
```

### 8.4 Tarjeta en Uso en Otra Sesión

```javascript
async function handleCardAssignmentScan(uid, context, ownerSocket) {
  const card = await Card.findOne({ uid, status: 'active' });

  if (!card) {
    // ... tarjeta no existe
  }

  // Verificar si ya está asignada en el draft de sesión actual
  const alreadyAssigned = context.assignedCards?.includes(uid);
  if (alreadyAssigned) {
    io.to(ownerSocket).emit('card_assignment_error', {
      message: 'Esta tarjeta ya está asignada a otro asset en esta sesión',
      uid,
      assetKey: context.assetKey
    });
    return;
  }

  // ... continuar con asignación
}
```

## 9. Optimización Runtime (Sprint 4)

### 9.1 Caché de revalidación auth en eventos sensibles

Para eventos socket sensibles (join/start/pause/resume/next y modos RFID), se aplica revalidación de token con caché TTL corta:

- Variable: `AUTH_REVALIDATION_CACHE_TTL_MS` (default `30000`).
- Métricas: `websocket.events.authCacheHits` y `websocket.events.authCacheMisses`.

Objetivo: reducir lecturas repetidas de usuario durante secuencias rápidas de eventos sin perder control de sesión.

### 9.2 Caché de ownership en dos niveles

La validación de ownership de `playId` usa dos capas:

1. **Caché global TTL** por clave compuesta (`role:userId:playId:mode`).
2. **Caché local por socket** para comandos consecutivos del mismo cliente.

Configuración principal:

- `PLAY_OWNERSHIP_CACHE_TTL_MS` (default `5000`).

La ruta `start_play` mantiene carga full-runtime para no degradar la inicialización del `gameEngine`.

### 9.3 Higiene de memoria en cachés TTL

Se incorporó barrido de entradas expiradas cuando el tamaño de caché supera umbral:

- `SOCKET_CACHE_SWEEP_THRESHOLD` (default `2000`).

Esto evita acumulación de entradas expiradas en picos de reconexiones o rotación alta de tokens/sockets.

Adicionalmente, se incorporó una limpieza periódica cada 5 minutos (`CACHE_CLEANUP_INTERVAL_MS`) que ejecuta `sweepAllExpiredEntries()` sobre ambas caches de forma proactiva, independientemente del umbral. Este intervalo:
- Se configura con `.unref()` para no impedir el cierre del proceso.
- Se detiene explícitamente durante el graceful shutdown via `stopCacheCleanup()`.
- Coexiste con el barrido por umbral como protección complementaria.

### 9.4 Reconexión y recuperación de estado de partida

#### Problema

En entornos educativos (WiFi de aula, conexiones inestables), las desconexiones transitorias del WebSocket son frecuentes. Con la configuración anterior (5 intentos, max delay 5s), el cliente abandonaba demasiado pronto los reintentos. Además, tras reconectar no existía un mecanismo para que el cliente recuperara el estado actual de la partida, resultando en una interfaz desincronizada.

#### Mejoras en la configuración de reconexión

Se actualizan los parámetros del cliente Socket.IO en `frontend/src/services/socket.js`:

| Parámetro | Antes | Después | Motivo |
|---|---|---|---|
| `RECONNECTION_ATTEMPTS` | 5 | 15 | Tolerar desconexiones de hasta ~2 minutos con backoff |
| `RECONNECTION_DELAY_MAX` | 5000ms | 15000ms | Evitar saturar el servidor con reintentos rápidos |
| `RECONNECTION_DELAY` | 1000ms | 1000ms | Sin cambio (delay inicial) |

#### Comando `play_state_sync`

Nuevo comando Socket.IO que permite al cliente solicitar el estado completo de una partida activa. Implementado en `PlayStateSyncCommand.js`:

**Flujo**:
1. El cliente emite `play_state_sync` con `{ playId }`.
2. El servidor valida formato, rol y existencia de la partida en el motor de juego.
3. Si la partida existe en memoria, responde con `play_state` (mismo evento que usa `join_play`).
4. Si no existe, responde con `play_state: null`.

**Roles permitidos**: `teacher`, `student`, `super_admin`.

**Rate limit**: 2 eventos/segundo (ventana de 1s, max 2).

**Revalidación auth**: incluido en la lista de eventos sensibles que requieren revalidación de token.

#### Evento `socket_reconnected` en el navegador

Al detectar una reconexión exitosa tras una desconexión previa, el servicio de socket emite un `CustomEvent` estándar en `window`:

```javascript
// frontend/src/services/socket.js
if (this._wasConnected) {
  window.dispatchEvent(new CustomEvent('socket_reconnected'));
}
this._wasConnected = true;
```

Este evento es un `CustomEvent` estándar del DOM, no un evento Socket.IO. Cualquier componente React puede escucharlo con `window.addEventListener('socket_reconnected', handler)`.

#### Flujo completo de recuperación

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    CLIENTE      │     │   SOCKET.IO     │     │    BACKEND      │
│  (GameSession)  │     │   (socket.js)   │     │  (gameEngine)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │ ──── desconexión ──── │
         │                       │                       │
         │                       │ reconexión automática  │
         │                       │ (hasta 15 intentos)    │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │ conexión establecida   │
         │                       │<──────────────────────│
         │                       │                       │
         │  CustomEvent          │                       │
         │  'socket_reconnected' │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ requestPlayStateSync  │                       │
         │──────────────────────>│                       │
         │                       │ play_state_sync       │
         │                       │ { playId }            │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │                       │ getPlayState()
         │                       │                       │
         │                       │ play_state            │
         │                       │ { score, round, ... } │
         │                       │<──────────────────────│
         │                       │                       │
         │ handlePlayState()     │                       │
         │ (rehidrata UI)        │                       │
         │                       │                       │
         │ toast.success(        │                       │
         │   'Reconectado')      │                       │
         │                       │                       │
```

**Comportamiento en caso de fallo**: si `requestPlayStateSync()` falla (e.g., la partida ya finalizó o fue marcada como abandonada durante la desconexión), el error se captura silenciosamente. El usuario ya fue notificado de la reconexión por el banner de estado en tiempo real, y la UI se mantiene en el último estado conocido.

#### Evidencia técnica

- `backend/src/commands/socket/PlayStateSyncCommand.js` — implementación del comando
- `backend/src/config/socketRateLimits.js` — rate limit configurado
- `frontend/src/services/socket.js` — `requestPlayStateSync()`, constantes de reconexión, `CustomEvent`
- `frontend/src/pages/GameSession.jsx` — listener `socket_reconnected` y rehidratación

---

## 10. Rate Limiting de Eventos WebSocket

El servidor aplica rate limiting por evento con ventana deslizante (sliding window) por usuario autenticado. La configuración se encuentra en `config/socketRateLimits.js`.

### 10.1 Límites por Evento

| Evento | Ventana | Máximo | Notas |
| --- | --- | --- | --- |
| `join_play` | 1s | 3 | |
| `leave_play` | 1s | 3 | |
| `start_play` | 1s | 1 | Más estricto: previene doble inicio |
| `pause_play` | 1s | 2 | |
| `resume_play` | 1s | 2 | |
| `next_round` | 1s | 5 | Permite avance manual rápido |
| `rfid_scan_from_client` | 3s | 2 | ~1 scan/1.5s + deduplicación de 1200ms |
| `play_state_sync` | 1s | 2 | Reconexión / sincronización |
| _(otros eventos)_ | 1s | 10 | Default para eventos no configurados |

### 10.2 Política de Bloqueo

Tras **3 violaciones consecutivas** de rate limit por un mismo usuario, se aplica un bloqueo temporal de **60 segundos**. Durante este periodo, todos los eventos del usuario son rechazados con código `TEMP_BLOCKED`.

### 10.3 Límites de Payload

| Ámbito | Límite |
| --- | --- |
| Global (todos los eventos) | 16 KB |
| `rfid_scan_from_client` | 8 KB |

El payload se valida **antes** del rate limit. Si excede el límite, se rechaza con `PAYLOAD_TOO_LARGE` sin consumir ventana de rate limit.

### 10.4 Deduplicación RFID

Además del rate limit, los eventos `rfid_scan_from_client` pasan por un filtro de deduplicación: si el mismo UID se escanea desde el mismo sensor dentro de **1200ms**, el evento se descarta con código `DUPLICATE_RFID_EVENT`. Este cooldown es independiente de la ventana de rate limit.

---

## 11. Estado en Memoria del WebSocket Layer

El servidor mantiene varias estructuras de datos en memoria (Maps de JavaScript) para optimizar operaciones frecuentes. Estas estructuras son efímeras por naturaleza pero algunas cuentan con respaldo en Redis para recuperación tras reinicio.

### 11.1 Estructuras de Estado

| Map | Clave | Valor | TTL | Redis backup |
| --- | --- | --- | --- | --- |
| `rfidModeByUserId` | `userId` | `{ mode, socketId, sensorId, metadata, updatedAt }` | Sin TTL (limpiado en disconnect) | Sí (`rfid:mode:{userId}`, TTL 1h) |
| `sensorIdToUserId` | `sensorId` | `userId` | Sin TTL (limpiado en disconnect) | Sí (`rfid:sensor:{sensorId}`, TTL 1h) |
| `authRevalidationCache` | `token_hash` | `{ userId, role, expiresAt }` | 30s (configurable: `AUTH_REVALIDATION_CACHE_TTL_MS`) | No |
| `playOwnershipCache` | `role:userId:playId:mode` | `{ play, session?, expiresAt }` | 5s (configurable: `PLAY_OWNERSHIP_CACHE_TTL_MS`) | No |
| `connectionCountByUserId` | `userId` | `number` (conexiones activas) | Sin TTL (decrementado en disconnect) | No |

### 11.2 Limpieza

- **En disconnect**: Se ejecuta `clearRfidModeState()`, se decrementa `connectionCountByUserId` y se limpia el rate limiter del socket.
- **Barrido por umbral**: Cuando una cache supera `SOCKET_CACHE_SWEEP_THRESHOLD` (default 2000) entradas, se ejecuta barrido de entradas expiradas.
- **Limpieza periódica**: Cada 5 minutos (`CACHE_CLEANUP_INTERVAL_MS`), `sweepAllExpiredEntries()` barre proactivamente ambas caches TTL (auth y ownership). El intervalo usa `.unref()` para no bloquear el cierre del proceso.

### 11.3 Comportamiento tras Reinicio del Servidor

| Estructura | Comportamiento |
| --- | --- |
| `rfidModeByUserId` | Recuperada de Redis al primer acceso (fallback read). El profesor puede continuar sin re-entrar al juego. |
| `sensorIdToUserId` | Restaurada junto con `rfidModeByUserId` desde Redis. |
| `authRevalidationCache` | Vacía. Los primeros eventos sensibles tras reinicio consultan la base de datos directamente. |
| `playOwnershipCache` | Vacía. Se repobla naturalmente con los primeros comandos de cada socket. |
| `connectionCountByUserId` | Vacía. Se reconstruye conforme los clientes reconectan (automático con Socket.IO reconnection). |

---

## Resumen

| Caso de Uso             | Prioridad | Justificación                    |
| ----------------------- | --------- | -------------------------------- |
| Asignación a assets     | **Alta**  | UX drásticamente mejorada        |
| Notificaciones progreso | Media     | Valor pedagógico                 |
| Dashboard tiempo real   | Baja      | Polling suficiente               |

La implementación del sistema de modos permite que un único sensor RFID sirva múltiples propósitos de forma segura y sin conflictos.

---

## Notas de mantenimiento (2026-04-12)

### Auth revalidation cache — ventana de 30s para tokens revocados

La revalidación de JWT en eventos sensibles de Socket.IO (`join_play`, `rfid_scan_from_client`, etc.) usa un cache in-memory de 30 segundos (`AUTH_REVALIDATION_CACHE_TTL_MS`). Esto significa que un token revocado sigue siendo válido para operaciones socket hasta 30 segundos después de la revocación.

**Justificación:** Para el caso de uso del proyecto (profesores en aula, decenas de usuarios), esta ventana es aceptable. La alternativa (verificar en Redis/DB en cada evento) añadiría latencia significativa a los escaneos RFID que requieren respuesta < 100ms.

**Decisión:** Se implementó invalidación inmediata vía `authEventBus` para el caso de `revokeAllUserTokens()` (logout forzado, detección de robo). Las entradas del userId se purgan instantáneamente del cache. Para revocación individual, el TTL de 30s cubre el caso (impacto mínimo). Ver ADR-043.

### Hard cap en caches in-memory

Los caches `authRevalidationCache` y `playOwnershipCache` ahora tienen un hard cap de `CACHE_SWEEP_THRESHOLD` (default 2000 entradas). Si el cache llega al límite incluso tras un sweep de entradas expiradas, las nuevas entradas se descartan con un warning. En uso normal, los caches no superan unas pocas decenas de entradas.

### Arquitectura de namespaces Socket.IO (ADR-044)

El sistema utiliza dos namespaces Socket.IO:

| Namespace | Propósito | Auth | Rate Limiting |
|-----------|-----------|------|---------------|
| `/` (default) | Sistema: connect, disconnect, session_invalidated, rfid_mode_changed | Sí (con conteo de conexiones) | No |
| `/game` | Gameplay: join_play, start_play, rfid_scan, card_assignment, y todos los eventos de partida | Sí (sin conteo — reutiliza conexión) | Sí |

**Frontend:** El `SocketService` gestiona dos conexiones multiplexadas sobre el mismo WebSocket. Métodos `on`/`emit` operan en el namespace default; `onGame`/`emitGame` operan en `/game`.

**Backend:** El `GameEngine` recibe la referencia al namespace `/game` y emite gameplay events directamente. El `socketHandlers.js` registra handlers separados para cada namespace: el default maneja conexión/desconexión y RFID mode; `/game` maneja todos los comandos de juego con rate limiting.
