# Protocolo de Eventos RFID

## Índice

1. [Introducción](#1-introducción)
2. [Arquitectura del Sistema RFID](#2-arquitectura-del-sistema-rfid)
3. [Hardware: Sensor RFID RC522](#3-hardware-sensor-rfid-rc522)
4. [Protocolo Serial: Formato de Eventos JSON](#4-protocolo-serial-formato-de-eventos-json)
5. [Backend: Servicio RFID](#5-backend-servicio-rfid)
6. [Sistema de Modos de Escaneo](#6-sistema-de-modos-de-escaneo)
7. [Flujo de Asociación Sensor-Partida](#7-flujo-de-asociación-sensor-partida)
8. [Eventos WebSocket](#8-eventos-websocket)
9. [Configuración y Despliegue](#9-configuración-y-despliegue)
10. [Troubleshooting](#10-troubleshooting)

> [!TIP]
> **Diagramas PlantUML disponibles** en [`backend/docs/diagrams/`](diagrams/):
>
> | Diagrama                 | Archivo                                                                   |
> | ------------------------ | ------------------------------------------------------------------------- |
> | Arquitectura del Sistema | [rfid_architecture.puml](diagrams/rfid_architecture.puml)                 |
> | Flujo de Datos           | [rfid_data_flow.puml](diagrams/rfid_data_flow.puml)                       |
> | Estados del Servicio     | [rfid_service_states.puml](diagrams/rfid_service_states.puml)             |
> | Modos de Escaneo         | [rfid_scan_modes.puml](diagrams/rfid_scan_modes.puml)                     |
> | Inicio de Partida        | [rfid_start_play_sequence.puml](diagrams/rfid_start_play_sequence.puml)   |
> | Procesamiento de Escaneo | [rfid_card_scan_processing.puml](diagrams/rfid_card_scan_processing.puml) |
> | Flujo de Gameplay        | [rfid_gameplay_sequence.puml](diagrams/rfid_gameplay_sequence.puml)       |
> | Inicialización           | [rfid_init_sequence.puml](diagrams/rfid_init_sequence.puml)               |
> | Registro de Tarjetas     | [rfid_card_registration.puml](diagrams/rfid_card_registration.puml)       |
>
> Para generar imágenes: `plantuml diagrams/*.puml`

> [!NOTE]
> Para la arquitectura Web Serial completa, ver [WebSerial_Architecture.md](WebSerial_Architecture.md).
>
> Para entender la operativa runtime (quién inicia, quién decide, secuencias por modo y errores esperados), ver [RFID_Runtime_Flows.md](RFID_Runtime_Flows.md).

---

## 1. Introducción

Este documento describe el protocolo de comunicación RFID implementado en la Plataforma de Juegos Educativos. El sistema utiliza lectores RFID RC522 conectados a microcontroladores ESP8266 para detectar tarjetas MIFARE, permitiendo a los alumnos interactuar con juegos educativos mediante tarjetas físicas.

### 1.1 Propósito

El sistema RFID permite:

- **Interacción física**: Los alumnos responden a desafíos escaneando tarjetas físicas
- **Retroalimentación inmediata**: El sistema valida respuestas en tiempo real
- **Registro de tarjetas**: Los profesores pueden registrar nuevas tarjetas en el sistema
- **Asignación dinámica**: Las tarjetas se asignan a conceptos educativos por sesión de juego

### 1.2 Componentes Principales

| Componente       | Ubicación                             | Descripción                                              |
| ---------------- | ------------------------------------- | -------------------------------------------------------- |
| Firmware ESP8266 | `rfid_scanner/`                       | Código del microcontrolador que lee tarjetas             |
| Web Serial API   | Frontend (navegador)                  | Lectura del puerto serie desde el PC del profesor        |
| RFIDService      | `backend/src/services/rfidService.js` | Servicio Node.js que ingiere eventos desde el cliente    |
| GameEngine       | `backend/src/services/gameEngine.js`  | Motor de juego que procesa escaneos durante partidas     |
| WebSockets       | `backend/src/server.js`               | Comunicación en tiempo real con clientes (Socket.IO)     |

---

## 2. Arquitectura del Sistema RFID

### 2.1 Visión General

> 📊 **Diagrama**: [rfid_architecture.puml](diagrams/rfid_architecture.puml)

El sistema RFID está compuesto por tres capas principales:

**Capa Hardware:**

- **ESP8266 (Wemos D1 Mini)**: Microcontrolador WiFi que ejecuta el firmware
- **RC522**: Módulo lector RFID que detecta tarjetas MIFARE a 13.56 MHz
- **Tarjetas MIFARE**: Tarjetas físicas con UIDs únicos (4 o 7 bytes)

**Capa Backend:**

- **RFIDService**: Singleton que gestiona la conexión serial, reconexión automática, buffer de eventos y métricas
- **GameEngine**: Motor de juego que procesa escaneos, gestiona partidas activas y valida respuestas
- **Socket.IO**: Capa de comunicación en tiempo real para emitir eventos a clientes

**Capa Frontend:**

- Pantalla del alumno (visualización de desafíos y feedback)
- Dashboard del profesor (monitoreo y control)
- Panel de configuración (registro y asignación de tarjetas)

### 2.2 Flujo de Datos

> 📊 **Diagrama**: [rfid_data_flow.puml](diagrams/rfid_data_flow.puml)

El flujo de datos sigue una arquitectura de eventos unidireccional:

1. **Detección física**: La tarjeta MIFARE entra en el campo NFC del RC522 (13.56 MHz)
2. **Lectura SPI**: El RC522 comunica el UID al ESP8266 vía SPI
3. **Serialización**: El firmware convierte los datos a JSON y los envía por USB serial (115200 baud)
4. **Lectura en navegador**: Web Serial API captura el JSON en el PC del profesor
5. **Normalización**: El frontend normaliza el evento al contrato estable
6. **Transporte**: Socket.IO envía el evento al backend
7. **Procesamiento**: `GameEngine` procesa el evento según el modo activo
8. **Notificación**: Socket.IO emite el resultado al frontend en tiempo real

### 2.3 Limitaciones actuales

> [!WARNING]
> **Limitaciones conocidas**: Web Serial requiere HTTPS (excepto localhost) y actualmente solo funciona en Chrome/Edge. Cada profesor debe conectar el sensor físicamente a su propio PC.

**Decisión de diseño**: Se prioriza despliegue cloud y escalabilidad por aula, evitando depender de USB en el servidor.

**Mejora futura propuesta (MQTT)**:

- Múltiples ESP8266 conectados vía WiFi
- Cada aula/usuario puede tener su propio lector sin cable USB
- Comunicación mediante topics MQTT: `rfid/reader_{id}/card_detected`

---

## 3. Hardware: Sensor RFID RC522

### 3.1 Especificaciones Técnicas

| Característica       | Valor                      |
| -------------------- | -------------------------- |
| Chip                 | MFRC522 (clon HW-126)      |
| Interfaz             | SPI                        |
| Frecuencia           | 13.56 MHz                  |
| Tarjetas soportadas  | MIFARE Classic 1K/4K, NTAG |
| Distancia de lectura | 1-3 cm                     |
| Ganancia de antena   | 38 dB (configurada)        |
| Alimentación         | 3.3V                       |

### 3.2 Conexiones Hardware

| Wemos D1 Mini | RC522 HW-126 | Descripción  |
| ------------- | ------------ | ------------ |
| 3.3V          | VCC          | Alimentación |
| GND           | GND          | Tierra común |
| D8 (GPIO15)   | SS           | Chip Select  |
| D1 (GPIO5)    | RST          | Reset        |
| D7 (GPIO13)   | MOSI         | SPI Data Out |
| D6 (GPIO12)   | MISO         | SPI Data In  |
| D5 (GPIO14)   | SCK          | SPI Clock    |

> [!NOTE]
> Los pines SPI son fijos en ESP8266. Verificar que el módulo RC522 esté configurado en modo SPI (no I2C).

### 3.3 Firmware (main.cpp)

El firmware implementa las siguientes funcionalidades:

1. **Inicialización del módulo RC522** con hardware reset para compatibilidad con clones
2. **Detección de tarjetas** con reintentos múltiples (hasta 3 intentos)
3. **Fallback de anticollision cruda** para clones con firmware no estándar
4. **Heartbeat periódico** cada 10 segundos con métricas del dispositivo
5. **Detección de remoción** de tarjeta (tras 10 ciclos sin detectar)

---

## 4. Protocolo Serial: Formato de Eventos JSON

### 4.1 Configuración de Comunicación

| Parámetro    | Valor                       |
| ------------ | --------------------------- |
| Velocidad    | 115200 baudios              |
| Formato      | JSON (una línea por evento) |
| Delimitador  | Salto de línea (`\n`)       |
| Codificación | ASCII/UTF-8                 |

> [!NOTE]
> Este JSON se consume directamente en el navegador mediante Web Serial API.

### 4.2 Tipos de Eventos

#### 4.2.1 Evento `init`

Emitido al encender el dispositivo, indica el estado de inicialización del módulo RFID.

```json
{
  "event": "init",
  "status": "success",
  "version": "0xB2"
}
```

| Campo     | Tipo   | Descripción                            |
| --------- | ------ | -------------------------------------- |
| `event`   | string | Siempre `"init"`                       |
| `status`  | string | `"success"` o `"fail"`                 |
| `version` | string | Versión del chip MFRC522 (hexadecimal) |

> [!NOTE]
> La versión `0xB2` indica un clon HW-126, común en módulos económicos. El firmware lo maneja correctamente.

---

#### 4.2.2 Evento `card_detected`

Emitido cuando se detecta una tarjeta RFID en el campo de lectura.

```json
{
  "event": "card_detected",
  "uid": "32B8FA05",
  "type": "MIFARE 1KB",
  "size": 4
}
```

| Campo   | Tipo   | Descripción                                                                       |
| ------- | ------ | --------------------------------------------------------------------------------- |
| `event` | string | Siempre `"card_detected"`                                                         |
| `uid`   | string | UID de la tarjeta en hexadecimal mayúsculas (4 o 7 bytes)                         |
| `type`  | string | Tipo de tarjeta detectada (`"MIFARE 1KB"`, `"MIFARE 4KB"`, `"NTAG"`, `"Unknown"`) |
| `size`  | number | Tamaño del UID en bytes (4 o 7)                                                   |

**Ejemplos de UIDs:**

| Formato                   | Ejemplo          | Longitud      |
| ------------------------- | ---------------- | ------------- |
| 4 bytes (MIFARE Classic)  | `32B8FA05`       | 8 caracteres  |
| 7 bytes (NTAG/UltraLight) | `04E1B2A3C4D5E6` | 14 caracteres |

---

#### 4.2.3 Evento `card_removed`

Emitido cuando una tarjeta previamente detectada sale del campo de lectura.

```json
{
  "event": "card_removed",
  "uid": "32B8FA05"
}
```

| Campo   | Tipo   | Descripción                        |
| ------- | ------ | ---------------------------------- |
| `event` | string | Siempre `"card_removed"`           |
| `uid`   | string | UID de la tarjeta que fue removida |

> [!NOTE]
> La detección de remoción tiene un debounce de ~10 ciclos (aproximadamente 1 segundo) para evitar falsos positivos.

---

#### 4.2.4 Evento `status` (Heartbeat)

Emitido cada 10 segundos para indicar que el dispositivo está operativo.

```json
{
  "event": "status",
  "uptime": 125000,
  "cards_detected": 15,
  "free_heap": 32768
}
```

| Campo            | Tipo   | Descripción                                           |
| ---------------- | ------ | ----------------------------------------------------- |
| `event`          | string | Siempre `"status"`                                    |
| `uptime`         | number | Tiempo desde encendido en milisegundos                |
| `cards_detected` | number | Contador total de tarjetas detectadas desde el inicio |
| `free_heap`      | number | Memoria heap libre en bytes (diagnóstico)             |

---

#### 4.2.5 Evento `error`

Emitido cuando ocurre un error en el sensor.

```json
{
  "event": "error",
  "type": "init_failure",
  "message": "RC522 communication failed"
}
```

| Campo     | Tipo   | Descripción                                        |
| --------- | ------ | -------------------------------------------------- |
| `event`   | string | Siempre `"error"`                                  |
| `type`    | string | Tipo de error (`"init_failure"`, `"read_failure"`) |
| `message` | string | Descripción del error                              |

**Tipos de error:**

| Tipo           | Causa                  | Solución                                 |
| -------------- | ---------------------- | ---------------------------------------- |
| `init_failure` | Comunicación SPI falló | Verificar conexiones y alimentación 3.3V |
| `read_failure` | Anticollision falló    | Acercar tarjeta, verificar módulo        |

---

### 4.3 Ejemplo de Sesión Típica

```text
// Encendido del dispositivo
{"event":"init","status":"success","version":"0xB2"}

// Heartbeat inicial
{"event":"status","uptime":10000,"cards_detected":0,"free_heap":35840}

// Usuario escanea tarjeta
{"event":"card_detected","uid":"32B8FA05","type":"MIFARE 1KB","size":4}

// Usuario retira tarjeta
{"event":"card_removed","uid":"32B8FA05"}

// Heartbeat periódico
{"event":"status","uptime":20000,"cards_detected":1,"free_heap":35840}
```

---

### 4.5 Contrato de Evento RFID (Web Serial)

El navegador normaliza los eventos del firmware al siguiente contrato estable y lo envía al backend por Socket.IO (`rfid_scan_from_client`).

```json
{
  "uid": "32B8FA05",
  "type": "MIFARE_1KB",
  "sensorId": "sensor-0f5e1b9c",
  "timestamp": 1736467200000,
  "source": "web_serial"
}
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `uid` | string | Hexadecimal mayusculas, 8 o 14 caracteres |
| `type` | string | `MIFARE_1KB` \| `MIFARE_4KB` \| `NTAG` \| `UNKNOWN` |
| `sensorId` | string | Identificador persistente por navegador |
| `timestamp` | number | Epoch en milisegundos (cliente) |
| `source` | string | Siempre `web_serial` |

## 5. Backend: Servicio RFID

### 5.1 RFIDService

El servicio `rfidService.js` es un **singleton** que ingiere eventos RFID enviados por el navegador.

#### Características Principales

| Característica               | Descripción                                        |
| ---------------------------- | -------------------------------------------------- |
| **Buffer de eventos**        | Almacena los últimos 100 eventos para debugging    |
| **Métricas**                 | Contador de eventos, detecciones, errores y uptime |
| **Habilitación condicional** | Activo si `RFID_SOURCE=client`                     |

#### Estados del Servicio

> 📊 **Diagrama**: [rfid_service_states.puml](diagrams/rfid_service_states.puml)

El servicio puede estar en uno de los siguientes estados:

| Estado | Descripción |
| --- | --- |
| `disabled` | `RFID_SOURCE=disabled`. El backend ignora eventos RFID. |
| `misconfigured` | `RFID_SOURCE` inválido. Requiere corrección en entorno. |
| `client_ready` | Servicio activo esperando eventos del cliente (Web Serial). |
| `stopped` | Servicio detenido (shutdown o no inicializado aún). |

**Decisión de diseño**: El backend mantiene autoridad validando el contrato del evento y delegando la lectura física al navegador del profesor.

#### Eventos Emitidos por RFIDService

| Evento       | Payload                       | Descripción                                                                                                       |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `rfid_event` | `{ event, uid?, type?, ... }` | Cualquier evento del sensor parseado                                                                              |
| `status`     | `string`                      | Cambio de estado (`client_ready`, `disabled`, `misconfigured`, `stopped`)                                         |

### 5.2 Configuración del Servicio

Variables de entorno en `.env`:

```env
# Fuente de eventos RFID
# Opciones: client | disabled
RFID_SOURCE=client
```

### 5.3 API del Servicio

```javascript
// Obtener estado actual
const status = rfidService.getStatus();
// Returns: {
//   status: string,
//   source: string,
//   metrics: { totalEventsReceived, totalCardDetections, ... },
//   recentEvents: Array
// }

// Obtener buffer de eventos
const events = rfidService.getEventBuffer();

// Limpiar buffer
rfidService.clearEventBuffer();
```

---

## 6. Sistema de Modos de Escaneo

El sensor RFID es un recurso compartido que puede operar en diferentes modos según el contexto de uso.

### 6.1 Modos Disponibles

| Modo                | Descripción               | Acción al Escanear                         |
| ------------------- | ------------------------- | ------------------------------------------ |
| `idle`              | Sin operación activa      | Broadcast informativo a todos los clientes |
| `gameplay`          | Partida en curso          | Validar respuesta en GameEngine            |
| `card_registration` | Registrando nueva tarjeta | Enviar UID al cliente solicitante          |
| `card_assignment`   | Asignando tarjeta a asset | Enviar UID + assetKey al cliente           |

### 6.2 Diagrama de Estados de Modos

> 📊 **Diagrama**: [rfid_scan_modes.puml](diagrams/rfid_scan_modes.puml)

**Comportamiento por modo:**

- **`idle`**: Estado por defecto. Los escaneos se emiten como broadcast informativo a todos los clientes conectados. No se procesa ninguna lógica de juego.

- **`gameplay`**: Se activa cuando hay una partida en curso. Los escaneos se procesan en `GameEngine` para validar respuestas. Este modo **coexiste** con los demás (no bloquea otras operaciones).

- **`card_registration`**: Se activa cuando un profesor inicia el registro de una nueva tarjeta. El primer escaneo se envía únicamente al cliente que solicitó el modo. Tiene un timeout de 30 segundos.

- **`card_assignment`**: Similar a registro, pero se usa para asignar una tarjeta existente a un asset específico (ej: "España" → UID). Incluye el `assetKey` en la respuesta. Timeout de 60 segundos.

**Decisión de diseño**: El modo `gameplay` coexiste con otros modos para permitir que las partidas no bloqueen operaciones administrativas como el registro de tarjetas. Sin embargo, si hay una partida activa que utiliza una tarjeta específica, esa tarjeta está "bloqueada" y no puede ser re-asignada.

### 6.3 Reglas de Transición

- ✅ `idle` → cualquier modo: **Permitido**
- ✅ `card_registration` → `idle`: **Permitido** (tras escaneo o cancelación)
- ✅ `card_assignment` → `idle`: **Permitido** (tras escaneo o cancelación)
- ❌ `gameplay` → otro modo: **Bloqueado** (partidas tienen prioridad)
- ✅ cualquier modo → `gameplay`: **Permitido** (iniciar partida)

### 6.4 Propiedad del Modo

- Cada modo tiene un "dueño" (el socket que lo solicitó)
- Solo el dueño puede cancelar el modo
- Si el dueño se desconecta, el modo se resetea automáticamente
- Timeout configurable (30s para registro, 60s para asignación)

---

## 7. Flujo de Asociación Sensor-Partida

### 7.1 Estructuras de Datos Clave

#### cardUidToPlayId Map

```javascript
// Map global para búsqueda O(1) de partida por UID
(Map < string, string > cardUidToPlayId);
// Ejemplo: { "32B8FA05" => "676f2a8b...", "A1B2C3D4" => "676f2a8b..." }
```

#### activePlays Map

```javascript
// Estado completo de cada partida activa
Map<string, PlayState> activePlays

interface PlayState {
  playDoc: GamePlay;           // Documento MongoDB de la partida
  sessionDoc: GameSession;     // Configuración de la sesión
  uidToMapping: Map;           // Índice UID → cardMapping
  currentChallenge: Object;    // Desafío actual
  roundTimer: Timeout;         // Timer de timeout de ronda
  awaitingResponse: boolean;   // ¿Esperando escaneo?
  paused: boolean;             // ¿Partida pausada?
  createdAt: number;           // Timestamp de creación
}
```

### 7.2 Flujo de Inicio de Partida

> 📊 **Diagrama**: [rfid_start_play_sequence.puml](diagrams/rfid_start_play_sequence.puml)

1. El cliente emite `start_play` con el ID de la partida.
2. `GameEngine` recupera la configuración de la partida y sesión de MongoDB.
3. Se verifica que ninguna de las tarjetas requeridas esté siendo usada en otra partida activa.
4. **Bloqueo**: Se crean entradas en el mapa global `cardUidToPlayId` para cada tarjeta de la partida.
5. Se inicializa el estado en memoria (`activePlays`) y se sincroniza con Redis.
6. Se emite el evento `new_round` para comenzar el juego.

### 7.3 Flujo de Procesamiento de Escaneo

> 📊 **Diagrama**: [rfid_card_scan_processing.puml](diagrams/rfid_card_scan_processing.puml)

1. El sensor detecta una tarjeta y el navegador envía `rfid_scan_from_client`.
2. `RFIDService` ingiere el evento y lo reemite internamente.
3. `GameEngine` recibe el evento con el UID.
4. **Búsqueda O(1)**: Usa `cardUidToPlayId` para identificar a qué partida pertenece el UID.
5. Si encuentra una partida activa, obtiene su estado de `activePlays`.
6. Verifica si la partida está esperando respuesta (`awaitingResponse`).
7. Valida si la tarjeta corresponde al desafío actual.
8. Actualiza la puntuación y emite `validation_result` al cliente.

### 7.4 Validación de Respuestas

Cuando un alumno escanea una tarjeta durante una partida:

1. **Búsqueda O(1)**: El UID se busca en `cardUidToPlayId` para encontrar la partida
2. **Verificación de estado**: Se comprueba que la partida esté esperando respuesta
3. **Obtención del mapping**: Se obtiene el `cardMapping` asociado al UID
4. **Comparación**: Se compara el UID escaneado con el UID del desafío actual
5. **Puntuación**:
   - ✅ **Correcto**: `+pointsPerCorrect` (default: 10)
   - ❌ **Incorrecto**: `+penaltyPerError` (default: -2)
   - ⏱️ **Timeout**: 0 puntos

---

## 8. Eventos WebSocket

### 8.1 Eventos Cliente → Servidor

| Evento | Payload | Descripción |
| --- | --- | --- |
| `join_play` | `{ playId }` | Unirse a la sala de una partida |
| `start_play` | `{ playId }` | Iniciar una partida configurada |
| `pause_play` | `{ playId }` | Pausar partida (solo profesor) |
| `resume_play` | `{ playId }` | Reanudar partida (solo profesor) |
| `leave_play` | `{ playId }` | Abandonar la sala de una partida |
| `next_round` | `{ playId }` | Solicitar siguiente ronda manualmente |
| `join_card_registration` | `{}` | Activar modo registro de tarjetas (room por usuario) |
| `leave_card_registration` | `{}` | Salir de modo registro |
| `join_card_assignment` | `{}` | Activar modo asignación (room por usuario) |
| `leave_card_assignment` | `{}` | Salir de modo asignación |
| `rfid_scan_from_client` | `{ uid, type, sensorId, ... }` | Evento RFID desde Web Serial |

### 8.2 Eventos Servidor → Cliente

#### Eventos de Estado del Sensor

| Evento | Payload | Descripción |
| --- | --- | --- |
| `rfid_event` | `{ event, uid?, type?, ... }` | Evento directo del sensor (modo idle) |
| `rfid_status` | `{ status }` | Estado del servicio RFID (client_ready/disabled) |
| `rfid_mode_changed` | `{ mode, sensorId, metadata, socketId, updatedAt }` | Estado canónico del modo RFID por usuario |

#### Eventos de Partida

| Evento              | Payload                                                              | Descripción                                  |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `play_state`        | `{ playId, currentRound, score, maxRounds }`                         | Estado actual de la partida                  |
| `new_round`         | `{ roundNumber, totalRounds, challenge, timeLimit, score }`          | Nueva ronda/desafío                          |
| `validation_result` | `{ isCorrect, expected, actual, pointsAwarded, newScore, timeout? }` | Resultado de escaneo                         |
| `game_over`         | `{ finalScore, metrics }`                                            | Fin de partida                               |
| `play_paused`       | `{ playId, currentRound, remainingTimeMs }`                          | Partida pausada                              |
| `play_resumed`      | `{ playId, currentRound, remainingTimeMs, challenge? }`              | Partida reanudada                            |
| `play_interrupted`  | `{ playId, reason, message, finalScore }`                            | Partida interrumpida (ej. reinicio servidor) |

**Nota runtime:** `next_round` puede devolver `error` con `code: 'ROUND_BLOCKED'` si la ronda sigue en `awaitingResponse`.

#### Eventos de Registro/Asignación

| Evento | Payload | Descripción |
| --- | --- | --- |
| `rfid_event` (room `card_registration_<userId>`) | `{ event, uid, type, sensorId, ... }` | Evento RFID en modo registro |
| `rfid_event` (room `card_assignment_<userId>`) | `{ event, uid, type, sensorId, ... }` | Evento RFID en modo asignación |

---

## 9. Configuración y Despliegue

### 9.1 Requisitos de Sistema

| Componente | Requisito |
| --- | --- |
| Node.js | v18+ |
| Navegador | Chrome/Edge con Web Serial habilitado |
| HTTPS | Obligatorio en produccion (localhost exento) |
| USB local | Sensor conectado al PC del profesor |

### 9.2 Configuración de Variables de Entorno

```env
# === RFID Configuration ===

# Fuente de eventos RFID
# Opciones: client | disabled
RFID_SOURCE=client
```

### 9.3 Notas de despliegue

- El sensor solo se conecta al PC del profesor, no al servidor cloud.
- El navegador solicita permisos al usuario para acceder al puerto.
- En produccion se requiere HTTPS para habilitar Web Serial.

---

## 10. Troubleshooting

### 10.1 Problemas Comunes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| No detecta tarjetas | Alimentación insuficiente | Usar fuente 3.3V estable, no 5V |
| UID inconsistentes | Módulo clon con firmware no estándar | El firmware incluye fallback para clones |
| `init_failure` | Cable suelto o módulo dañado | Verificar conexiones SPI |
| Permiso denegado | Usuario rechazo el permiso serial | Reconectar y aceptar permiso |
| Web Serial no disponible | Navegador no soportado o sin HTTPS | Usar Chrome/Edge y HTTPS |

### 10.2 Verificación de Funcionamiento

1. Abrir la pantalla que habilita RFID.
2. Pulsar "Conectar" y seleccionar el puerto.
3. Escanear una tarjeta y verificar que el evento llega a la UI.

### 10.3 Logs del Backend

```javascript
// Nivel debug para ver todos los eventos RFID
// En .env: LOG_LEVEL=debug

// Logs esperados al iniciar:
// [INFO] Iniciando servicio RFID en modo cliente...
// [INFO] Estado del servicio RFID: client_ready
// [DEBUG] Evento RFID recibido desde cliente
```

### 10.4 Métricas de Diagnóstico

Endpoint: `GET /api/metrics` (requiere autenticación de profesor)

```json
{
  "rfid": {
    "processed": {
      "total": 150,
      "cardDetected": 75,
      "cardRemoved": 73,
      "status": 10,
      "error": 2
    },
    "service": {
      "isConnected": true,
      "port": "/dev/ttyUSB0",
      "baudRate": 115200,
      "metrics": {
        "totalEventsReceived": 150,
        "totalCardDetections": 75,
        "totalErrors": 2,
        "connectionUptime": 3600000,
        "uptimeFormatted": "1h 0m"
      }
    }
  }
}
```

---

## Apéndice A: Tipos de Tarjetas Soportadas

| Tipo              | UID Size | Frecuencia | Notas                            |
| ----------------- | -------- | ---------- | -------------------------------- |
| MIFARE Classic 1K | 4 bytes  | 13.56 MHz  | Más común, compatible con clones |
| MIFARE Classic 4K | 4 bytes  | 13.56 MHz  | Mayor capacidad de memoria       |
| MIFARE Ultralight | 7 bytes  | 13.56 MHz  | Económica, menos segura          |
| NTAG213/215/216   | 7 bytes  | 13.56 MHz  | NFC, compatible con móviles      |

---

## Apéndice B: Códigos de Error

| Código                | Descripción                               | HTTP Status |
| --------------------- | ----------------------------------------- | ----------- |
| `MODE_BLOCKED`        | No se puede activar modo (partida activa) | -           |
| `INVALID_DATA`        | Faltan datos requeridos                   | 400         |
| `NOT_OWNER`           | No eres el dueño del modo                 | 403         |
| `CARD_EXISTS`         | Tarjeta ya registrada                     | 409         |
| `CARD_NOT_FOUND`      | Tarjeta no en BD                          | 404         |
| `CARD_INACTIVE`       | Tarjeta desactivada                       | 400         |
| `SENSOR_DISCONNECTED` | Sensor RFID no conectado                  | 503         |

---

## Changelog

| Versión | Fecha      | Cambios                        |
| ------- | ---------- | ------------------------------ |
| 1.0.0   | 2026-01-06 | Documentación inicial completa |
