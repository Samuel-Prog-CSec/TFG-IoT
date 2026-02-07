# Extensión del Uso de WebSockets en la Plataforma RFID

## Índice

1. [Estado Actual](#1-estado-actual)
2. [Análisis de Nuevos Casos de Uso](#2-análisis-de-nuevos-casos-de-uso)
3. [Arquitectura de Modos de Escaneo](#3-arquitectura-de-modos-de-escaneo)
4. [Implementación Detallada](#4-implementación-detallada)
5. [Flujos de Usuario](#5-flujos-de-usuario)
6. [Eventos WebSocket](#6-eventos-websocket)
7. [Consideraciones de Seguridad](#7-consideraciones-de-seguridad)
8. [Casos Límite y Errores](#8-casos-límite-y-errores)

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

- Registrar nuevas tarjetas en la base de datos
- Asignar tarjetas a assets durante la configuración de sesiones

---

## 2. Análisis de Nuevos Casos de Uso

### 2.1 Registro de Tarjetas RFID

#### Problema Actual

Para registrar una nueva tarjeta RFID, el profesor debe:

1. Escanear la tarjeta con una herramienta externa
2. Anotar manualmente el UID (8-14 caracteres hexadecimales)
3. Escribir el UID en el formulario de la aplicación
4. Enviar el formulario

**Problemas:**

- Propenso a errores de transcripción
- Requiere herramientas externas
- Experiencia de usuario deficiente

#### Solución con WebSockets

1. Profesor abre modal "Registrar tarjeta"
2. Sistema activa **modo registro**
3. Profesor escanea tarjeta en el sensor
4. UID se captura automáticamente y rellena el formulario
5. Profesor completa datos opcionales y guarda

**Beneficios:**

- Elimina errores de transcripción (100% precisión)
- No requiere herramientas externas
- Flujo intuitivo y rápido

#### Justificación Técnica

- El escaneo es un **evento asíncrono e impredecible**: no sabemos cuándo el profesor escaneará
- HTTP Request/Response no es adecuado (¿polling cada 100ms? Ineficiente)
- WebSocket es la solución natural: el servidor "empuja" el UID cuando ocurre

---

### 2.2 Asignación de Tarjetas a Assets

#### Problema Actual

Al crear una GameSession, el profesor debe:

1. Ver la lista de tarjetas disponibles (UIDs crípticos)
2. Recordar qué tarjeta física corresponde a qué UID
3. Seleccionar manualmente el UID para cada asset

**Problemas:**

- Los UIDs no son memorables (ej: `32B8FA05`)
- Requiere etiquetar físicamente las tarjetas
- Proceso tedioso si hay muchas tarjetas

#### Solución con WebSockets

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

#### Justificación Técnica

- Mismo razonamiento que el caso anterior: evento asíncrono
- Además, hay **contexto asociado**: qué asset estamos asignando
- El servidor debe saber "estoy esperando una tarjeta para España"

---

### 2.3 Notificaciones de Progreso (Futuro)

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

### 2.4 Dashboard de Estadísticas en Tiempo Real

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

```
┌─────────────────────────────────────────────────────────────┐
│                    SENSOR RFID (RC522)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  RFIDScanManager                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ currentMode: 'idle' | 'gameplay' | 'card_registration'│  │
│  │              | 'card_assignment'                      │  │
│  │ modeContext: { assetKey?, playId?, ... }             │  │
│  │ modeOwner: socketId                                   │  │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ GamePlay │    │ Card Reg │    │ Card     │
    │ Handler  │    │ Handler  │    │ Assign   │
    └──────────┘    └──────────┘    └──────────┘
```

### 3.2 Estados del Sistema

| Modo                | Descripción          | Acción al escanear                |
| ------------------- | -------------------- | --------------------------------- |
| `idle`              | Sin operación activa | Broadcast informativo a todos     |
| `gameplay`          | Partida en curso     | Validar respuesta en GameEngine   |
| `card_registration` | Registrando tarjeta  | Enviar UID al cliente solicitante |
| `card_assignment`   | Asignando a asset    | Enviar UID + assetKey al cliente  |

### 3.3 Exclusión Mutua

Solo puede haber **un modo activo a la vez** (excepto gameplay que puede coexistir con idle):

```
Reglas de transición:
- idle → cualquier modo: ✅ Permitido
- card_registration → idle: ✅ Permitido (tras escaneo o cancelación)
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
    case 'card_registration':
      await handleCardRegistrationScan(uid, eventData.type, owner);
      break;

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

async function handleCardRegistrationScan(uid, type, ownerSocket) {
  // Verificar si la tarjeta ya existe
  const existingCard = await Card.findOne({ uid });

  if (existingCard) {
    io.to(ownerSocket).emit('card_registration_error', {
      message: 'Esta tarjeta ya está registrada',
      uid,
      existingCardId: existingCard._id
    });
  } else {
    io.to(ownerSocket).emit('card_registration_scan', {
      uid,
      type,
      message: 'Tarjeta detectada. Completa los datos para registrarla.'
    });
  }

  rfidScanManager.reset();
}

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
  // MODO: Registro de tarjetas
  // ══════════════════════════════════════════════════════

  socket.on('start_card_registration', () => {
    const success = rfidScanManager.setMode(
      'card_registration',
      null,
      socket.id,
      30000 // 30 segundos timeout
    );

    if (success) {
      socket.emit('registration_mode_active', {
        message: 'Escanea la tarjeta que deseas registrar',
        timeout: 30
      });
    } else {
      socket.emit('error', {
        code: 'MODE_BLOCKED',
        message: 'No se puede activar el modo registro ahora'
      });
    }
  });

  socket.on('cancel_card_registration', () => {
    if (rfidScanManager.isOwner(socket.id)) {
      rfidScanManager.reset();
      socket.emit('registration_mode_cancelled');
    }
  });

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

### 5.1 Flujo: Registrar Nueva Tarjeta

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    PROFESOR     │     │     FRONTEND    │     │     BACKEND     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ Clic "Nueva Tarjeta"  │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │ start_card_registration
         │                       │──────────────────────>│
         │                       │                       │
         │                       │  registration_mode_active
         │                       │<──────────────────────│
         │                       │                       │
         │   Muestra modal       │                       │
         │   "Escanea tarjeta"   │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ Escanea tarjeta       │                       │
         │ física en sensor      │                       │
         │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─>│
         │                       │                       │
         │                       │  card_registration_scan
         │                       │<──────────────────────│
         │                       │    { uid: "32B8FA05" }│
         │                       │                       │
         │  Muestra UID          │                       │
         │  en formulario        │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │ Completa color, icono │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │ POST /api/cards       │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │    201 Created        │
         │                       │<──────────────────────│
         │                       │                       │
         │  "Tarjeta registrada" │                       │
         │<──────────────────────│                       │
         │                       │                       │
```

### 5.2 Flujo: Crear Sesión con Asignación de Tarjetas

```
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

| Evento                     | Payload                                     | Descripción                      |
| -------------------------- | ------------------------------------------- | -------------------------------- |
| `start_card_registration`  | `{}`                                        | Activar modo registro            |
| `cancel_card_registration` | `{}`                                        | Cancelar modo registro           |
| `start_card_assignment`    | `{ assetKey, assetDisplay, sessionDraft? }` | Activar modo asignación          |
| `cancel_card_assignment`   | `{}`                                        | Cancelar modo asignación         |
| `join_play`                | `{ playId }`                                | Unirse a partida (existente)     |
| `start_play`               | `{ playId }`                                | Iniciar partida (existente)      |
| `pause_play`               | `{ playId }`                                | Pausar partida (solo profesor)   |
| `resume_play`              | `{ playId }`                                | Reanudar partida (solo profesor) |
| `next_round`               | `{ playId }`                                | Solicitar siguiente ronda        |
| `leave_play`               | `{ playId }`                                | Abandonar partida (existente)    |
| `join_card_registration`   | `{}`                                        | Unirse al room de registro       |
| `leave_card_registration`  | `{}`                                        | Salir del room de registro       |
| `join_admin_room`          | `{}`                                        | Unirse al room de admin          |
| `leave_admin_room`         | `{}`                                        | Salir del room de admin          |
| `rfid_scan_from_client`    | `{ uid, type, sensorId, timestamp, source }` | Escaneo RFID desde cliente       |

#### Servidor → Cliente

| Evento                        | Payload                                                 | Descripción                                        |
| ----------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| `registration_mode_active`    | `{ message, timeout }`                                  | Modo registro activado                             |
| `registration_mode_cancelled` | `{}`                                                    | Modo registro cancelado                            |
| `card_registration_scan`      | `{ uid, type, message }`                                | Tarjeta escaneada (registro)                       |
| `card_registration_error`     | `{ message, uid, existingCardId? }`                     | Error en registro                                  |
| `assignment_mode_active`      | `{ message, assetKey, timeout }`                        | Modo asignación activado                           |
| `assignment_mode_cancelled`   | `{}`                                                    | Modo asignación cancelado                          |
| `card_assignment_scan`        | `{ uid, cardId, cardMetadata, assetKey, assetDisplay }` | Tarjeta asignada                                   |
| `card_assignment_error`       | `{ message, uid, assetKey }`                            | Error en asignación                                |
| `mode_timeout`                | `{ mode, context }`                                     | Timeout del modo activo                            |
| `rfid_event`                  | `{ event, uid?, type?, ... }`                           | Evento RFID dirigido por room                      |
| `rfid_status`                 | `{ status }`                                            | Estado de conexión sensor (admin_room)             |
| `play_paused`                 | `{ playId, currentRound, remainingTimeMs }`             | Partida pausada                                    |
| `play_resumed`                | `{ playId, currentRound, remainingTimeMs, challenge? }` | Partida reanudada                                  |
| `session_invalidated`         | `{ reason, timestamp }`                                 | Sesión cerrada por nuevo login en otro dispositivo |

### 6.2 Códigos de Error

| Código           | Descripción                               | Acción Recomendada               |
| ---------------- | ----------------------------------------- | -------------------------------- |
| `MODE_BLOCKED`   | No se puede activar modo (partida activa) | Esperar a que termine la partida |
| `INVALID_DATA`   | Faltan datos requeridos                   | Revisar payload del evento       |
| `NOT_OWNER`      | No eres el dueño del modo                 | No puedes cancelar modo ajeno    |
| `CARD_EXISTS`    | Tarjeta ya registrada                     | Usar tarjeta existente           |
| `CARD_NOT_FOUND` | Tarjeta no en BD                          | Registrar tarjeta primero        |
| `CARD_INACTIVE`  | Tarjeta desactivada                       | Activar tarjeta o usar otra      |
| `RATE_LIMITED`   | Exceso de eventos en ventana corta        | Reducir frecuencia de envío      |
| `TEMP_BLOCKED`   | Bloqueo temporal por abuso repetido       | Esperar y reintentar             |
| `PAYLOAD_TOO_LARGE` | Payload supera el tamaño permitido     | Reducir tamaño de payload        |
| `DUPLICATE_RFID_EVENT` | Evento RFID duplicado              | Evitar emitir UID repetido       |
| `AUTH_REQUIRED`  | Token requerido en handshake              | Enviar token al conectar         |
| `FORBIDDEN`      | No tienes permisos                        | Revisar rol/ownership            |

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
socket.on('join_card_registration', () => {
  // Solo profesores y super admin pueden registrar tarjetas
  if (!['teacher', 'super_admin'].includes(socket.data.userRole)) {
    socket.emit('error', {
      code: 'FORBIDDEN',
      message: 'Solo profesores pueden registrar tarjetas'
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

**Bloqueo temporal:** 3 violaciones consecutivas → 60s de bloqueo.

**Payload máximo:** 16 KB global, 8 KB para `rfid_scan_from_client`.

### 7.4 Invalidez de sesión y desconexión

- Si un usuario inicia sesión en otro dispositivo, se emite `session_invalidated` al socket anterior y se **desconecta** automáticamente.
- Si la cuenta se inactiva o se rechaza, el servidor revoca tokens y **cierra sockets activos** para evitar eventos en tiempo real no autorizados.

---

## 8. Casos Límite y Errores

### 8.1 Sensor Desconectado

```javascript
socket.on('start_card_registration', () => {
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

---

## Resumen

| Caso de Uso             | Prioridad | Justificación                    |
| ----------------------- | --------- | -------------------------------- |
| Registro de tarjetas    | **Alta**  | Elimina errores de transcripción |
| Asignación a assets     | **Alta**  | UX drásticamente mejorada        |
| Notificaciones progreso | Media     | Valor pedagógico                 |
| Dashboard tiempo real   | Baja      | Polling suficiente               |

La implementación del sistema de modos permite que un único sensor RFID sirva múltiples propósitos de forma segura y sin conflictos.
