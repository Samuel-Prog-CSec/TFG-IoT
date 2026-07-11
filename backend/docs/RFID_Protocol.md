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
- Panel de configuración (asignación de tarjetas)

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
  "size": 4,
  "counter": 1287,
  "hmac": "3f9a1c0b...d4e7"
}
```

| Campo     | Tipo   | Descripción                                                                       |
| --------- | ------ | --------------------------------------------------------------------------------- |
| `event`   | string | Siempre `"card_detected"`                                                         |
| `uid`     | string | UID de la tarjeta en hexadecimal mayúsculas (4 o 7 bytes)                         |
| `type`    | string | Tipo de tarjeta detectada (`"MIFARE 1KB"`, `"MIFARE 4KB"`, `"NTAG"`, `"Unknown"`) |
| `size`    | number | Tamaño del UID en bytes (4 o 7)                                                   |
| `counter` | number | _(Opcional, firmware v1.1+)_ Counter monotónico por sensor usado en la firma anti-replay. Ver §4.6 |
| `hmac`    | string | _(Opcional, firmware v1.1+)_ Firma HMAC-SHA256 del scan en hex minúsculas (64 caracteres). Ver §4.6 |

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
  "free_heap": 32768,
  "counter": 1287
}
```

| Campo            | Tipo   | Descripción                                           |
| ---------------- | ------ | ----------------------------------------------------- |
| `event`          | string | Siempre `"status"`                                    |
| `uptime`         | number | Tiempo desde encendido en milisegundos                |
| `cards_detected` | number | Contador total de tarjetas detectadas desde el inicio |
| `free_heap`      | number | Memoria heap libre en bytes (diagnóstico)             |
| `counter`        | number | _(Opcional, firmware v1.1+)_ Valor actual del counter monotónico anti-replay. Ver §4.6 |

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

> [!NOTE]
> **Reclasificación cliente de `read_failure` (ADR-237).** El navegador trata los `read_failure` ("Anticollision failed", "BCC mismatch") como **ruido transitorio** propio de un lector clon marginal: ya **no** los emite como `device_error` (rojo) ni cambian `deviceState`. Solo tras fallos **sostenidos** muestra una pista ámbar sutil (evento local `device_read_hint`, "Acerca la tarjeta y mantenla un momento") que se limpia con la primera lectura válida. El rojo (`device_error`) queda reservado a `init_failure` (sensor que no responde de verdad), ahora también traducido al español. Ver [WebSerial_Architecture.md](WebSerial_Architecture.md).

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
  "source": "web_serial",
  "counter": 1287,
  "hmac": "3f9a1c0b...d4e7"
}
```

| Campo | Tipo | Reglas |
| --- | --- | --- |
| `uid` | string | Hexadecimal mayusculas, 8 o 14 caracteres |
| `type` | string | `MIFARE_1KB` \| `MIFARE_4KB` \| `NTAG` \| `UNKNOWN` |
| `sensorId` | string | Identificador persistente por navegador |
| `timestamp` | number | Epoch en milisegundos (cliente) |
| `source` | string | `web_serial` (sensor físico) \| `touch_fallback` \| `touch_memory_flip` (juego sin sensor) |
| `counter` | number | _(Opcional)_ Counter monotónico reenviado tal cual desde el firmware. Presente cuando `source:'web_serial'` y firmware v1.1+. Ver §4.6 |
| `hmac` | string | _(Opcional)_ Firma reenviada tal cual desde el firmware (hex minúsculas, 64 caracteres). Presente cuando `source:'web_serial'` y firmware v1.1+. Ver §4.6 |

> El navegador **reenvía** `counter`/`hmac` sin recalcularlos: no porta el secret. La verificación es responsabilidad exclusiva del backend (§4.6). Las fuentes táctiles no incluyen estos campos.

### 4.6 Firma HMAC anti-replay (T-905 B8)

A partir del firmware v1.1, cada scan del sensor físico va **firmado** para garantizar autenticidad (procede de un sensor con el secret) y frescura (no es un scan reproducido). La medida está **activada end-to-end** (firmware firma → navegador reenvía → backend verifica) bajo el flag `RFID_HMAC_ENABLED`.

#### Contrato de firma

```text
hmac = HMAC-SHA256(secret, UID_MAYÚSCULAS + ":" + counter)   // hex minúsculas, 64 caracteres
```

- **UID canónico en MAYÚSCULAS.** El firmware convierte el UID a mayúsculas (`uidStr.toUpperCase()`) **antes** de firmar y de serializar; el backend recalcula la firma sobre el mismo UID en mayúsculas. El navegador, por su parte, normaliza el UID a mayúsculas (mismo formato que `card_decks.cardMappings[].uid`). Así la firma cuadra **byte a byte** en los tres lados y un desajuste de mayúsculas no la invalida.
- **`secret`** = `RFID_HMAC_SECRET` (32 bytes hex). Se inyecta en el firmware en build-time (`-DRFID_HMAC_SECRET="…"` vía `build_flags` de PlatformIO) y se lee del entorno en el backend. Nunca viaja por el cable ni reside en el navegador.
- **Hex en minúsculas**, 64 caracteres (digest SHA-256). El backend hace `hmac.toLowerCase()` antes de comparar para tolerar variaciones de caja.

#### Counter monotónico (anti-replay)

- El firmware mantiene un `counter` **estrictamente creciente** por sensor, persistido en EEPROM (offset 0..3, `uint32` little-endian). Para no desgastar la EEPROM (~100k ciclos), persiste en **batch de 100**: reserva un techo `counter + 100` y solo reescribe al superarlo (tras un reinicio el counter salta al último techo reservado, nunca retrocede).
- El backend implementa anti-replay en Redis, namespace **`rfid:counter`** (clave por `sensorId`, **TTL 30 días**): exige que `counter` recibido sea **estrictamente mayor** que el último almacenado para ese sensor. Un `counter <= previousCounter` se rechaza como replay.

#### Enforcement consciente del origen

La verificación distingue según el campo `source` del payload:

| `source` | Trato | Resultado del validador |
| --- | --- | --- |
| `web_serial` | **Obligado a firmar** (sensor físico, porta el secret) | `mode:'enforce'` — verifica HMAC + anti-replay |
| `touch_fallback` | **Exento** (juego sin sensor, no porta secret) | `mode:'exempt'`, `valid:true` |
| `touch_memory_flip` | **Exento** (juego sin sensor, no porta secret) | `mode:'exempt'`, `valid:true` |

Las fuentes táctiles se eximen **por diseño**: el secret vive en el firmware, no en el navegador, así que un panel táctil no puede firmar. El juego debe seguir siendo jugable sin sensor. Como consecuencia, la propiedad anti-suplantación/anti-replay aplica **solo a la entrada por sensor físico real**.

#### Flag de activación

- Gated por **`RFID_HMAC_ENABLED`** (parsing `?.toLowerCase() === 'true'`; no acepta `1`/`yes`).
  - `false` → el validador retorna `mode:'disabled'`, `valid:true` (convivencia con firmware viejo durante migración; emite métrica de observación).
  - `true` → enforcement activo (estado operativo actual). Un guard de arranque (`envValidator.js`) **exige `RFID_HMAC_SECRET`** cuando el flag está en `true`: ausencia → fallo de arranque en producción, warning en desarrollo.

#### Reason codes de rechazo (modo enforce)

| `reason` | Causa |
| --- | --- |
| `SOURCE_MISSING` | Payload sin `source` con el flag activo (malformado) |
| `HMAC_FIELDS_MISSING` | `source:'web_serial'` sin `counter` o sin `hmac` |
| `HMAC_SECRET_MISSING` | `RFID_HMAC_ENABLED=true` pero `RFID_HMAC_SECRET` no configurado |
| `HMAC_INVALID` | La firma recalculada no coincide (comparada con `crypto.timingSafeEqual`) |
| `COUNTER_REPLAY` | `counter` no es estrictamente mayor que el último conocido del sensor |

El validador emite una métrica `rfid_hmac_observed_total` con labels `valid|invalid|absent|replay|exempt` para observabilidad de la adopción y del volumen táctil exento.

> **Limitación honesta.** Los modos táctiles (juego sin sensor) **no firman**: son de confianza implícita. La garantía criptográfica anti-suplantación/anti-replay cubre exclusivamente los scans del sensor físico (`web_serial`).

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

| Modo              | Descripción               | Acción al Escanear                         |
| ----------------- | ------------------------- | ------------------------------------------ |
| `idle`            | Sin operación activa      | Broadcast informativo a todos los clientes |
| `gameplay`        | Partida en curso          | Validar respuesta en GameEngine            |
| `card_assignment` | Asignando tarjeta a asset | Enviar UID + assetKey al cliente           |

### 6.2 Diagrama de Estados de Modos

> 📊 **Diagrama**: [rfid_scan_modes.puml](diagrams/rfid_scan_modes.puml)

**Comportamiento por modo:**

- **`idle`**: Estado por defecto. Los escaneos se emiten como broadcast informativo a todos los clientes conectados. No se procesa ninguna lógica de juego.

- **`gameplay`**: Se activa cuando hay una partida en curso. Los escaneos se procesan en `GameEngine` para validar respuestas. Este modo **coexiste** con los demás (no bloquea otras operaciones).

- **`card_assignment`**: Se usa para asignar una tarjeta a un asset específico (ej: "España" → UID). Incluye el `assetKey` en la respuesta. Timeout de 60 segundos.

**Decisión de diseño**: El modo `gameplay` coexiste con otros modos para permitir que las partidas no bloqueen operaciones administrativas como la asignación de tarjetas. Sin embargo, si hay una partida activa que utiliza una tarjeta específica, esa tarjeta está "bloqueada" y no puede ser re-asignada.

### 6.3 Reglas de Transición

- ✅ `idle` → cualquier modo: **Permitido**
- ✅ `card_assignment` → `idle`: **Permitido** (tras escaneo o cancelación)
- ❌ `gameplay` → otro modo: **Bloqueado** (partidas tienen prioridad)
- ✅ cualquier modo → `gameplay`: **Permitido** (iniciar partida)

### 6.4 Propiedad del Modo

- Cada modo tiene un "dueño" (el socket que lo solicitó)
- Solo el dueño puede cancelar el modo
- Si el dueño se desconecta, el modo se resetea automáticamente
- Timeout configurable (60s para asignación)

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

> **Referencia canónica de eventos WebSocket**: Para la lista completa y actualizada de todos los eventos WebSocket (cliente→servidor y servidor→cliente), consultar [WebSockets-ExtendedUsage.md §6](WebSockets-ExtendedUsage.md#6-eventos-websocket). Esta sección solo documenta los eventos específicos del protocolo RFID.

### 8.1 Eventos Cliente → Servidor

| Evento | Payload | Descripción |
| --- | --- | --- |
| `join_play` | `{ playId }` | Unirse a la sala de una partida |
| `start_play` | `{ playId }` | Iniciar una partida configurada |
| `pause_play` | `{ playId }` | Pausar partida (solo profesor) |
| `resume_play` | `{ playId }` | Reanudar partida (solo profesor) |
| `leave_play` | `{ playId }` | Abandonar la sala de una partida |
| `next_round` | `{ playId }` | Solicitar siguiente ronda manualmente |
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
| `scan_ignored`      | `{ uid, reason }` reason: `play_paused` \| `not_awaiting_response` \| `card_not_in_play` | Escaneo ignorado (ADR-046) |
| `game_over`         | `{ finalScore, metrics }`                                            | Fin de partida                               |
| `play_paused`       | `{ playId, currentRound, remainingTimeMs }`                          | Partida pausada                              |
| `play_resumed`      | `{ playId, currentRound, remainingTimeMs, challenge? }`              | Partida reanudada                            |
| `play_interrupted`  | `{ playId, reason, message, finalScore }`                            | Partida interrumpida (ej. reinicio servidor) |

**Nota runtime:** `next_round` puede devolver `error` con `code: 'ROUND_BLOCKED'` si la ronda sigue en `awaitingResponse`.

#### Eventos de Registro/Asignación

| Evento | Payload | Descripción |
| --- | --- | --- |
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

> **Catálogo completo**: Para la lista consolidada de todos los códigos de error WebSocket (autenticación, RFID, gameplay, rate limiting), consultar [WebSockets-ExtendedUsage.md §6.2](WebSockets-ExtendedUsage.md#62-códigos-de-error). Esta sección solo lista los códigos específicos del protocolo hardware RFID.

| Código                | Descripción                               | HTTP Status |
| --------------------- | ----------------------------------------- | ----------- |
| `MODE_BLOCKED`        | No se puede activar modo (partida activa) | -           |
| `INVALID_DATA`        | Faltan datos requeridos                   | 400         |
| `NOT_OWNER`           | No eres el dueño del modo                 | 403         |
| `SENSOR_DISCONNECTED` | Sensor RFID no conectado                  | 503         |

---

## Apéndice C: Constantes de error y razones (`backend/src/constants/errorCodes.js`)

Centralizamos los strings que viajan en eventos `error`, `scan_ignored` y `play_interrupted` para que el frontend pueda ofrecer feedback granular consumiendo las mismas constantes.

### `RFID_ERROR_CODES`

| Constante                 | Valor                       | Uso                                                                     |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `SENSOR_DISABLED`         | `RFID_DISABLED`             | Servicio RFID off por configuración (`RFID_SOURCE=disabled`).           |
| `SENSOR_MISMATCH`         | `RFID_SENSOR_MISMATCH`      | El sensorId del payload no coincide con el ligado al modo.              |
| `SENSOR_UNAUTHORIZED`     | `RFID_SENSOR_UNAUTHORIZED`  | Sensor no autorizado para esta sesión.                                  |
| `MODE_TAKEN_OVER`         | `RFID_MODE_TAKEN_OVER`      | Otro socket del usuario tomó el control del modo.                       |
| `MODE_INVALID`            | `RFID_MODE_INVALID`         | El modo solicitado no es válido o no coincide con el room actual.       |
| `SOCKET_NOT_ACTIVE`       | `RFID_SOCKET_NOT_ACTIVE`    | El socket no está marcado como dueño activo del modo.                   |

### `SCAN_IGNORED_REASONS`

Valores que viajan en el campo `reason` del evento `scan_ignored`:

| Constante           | Valor                  | Cuándo se emite                                                  |
| ------------------- | ---------------------- | ---------------------------------------------------------------- |
| `PLAY_PAUSED`       | `play_paused`          | Partida pausada; el scan se descarta sin penalizar.              |
| `NOT_AWAITING`      | `not_awaiting_response`| Scan llegó entre rondas, sin respuesta esperada.                 |
| `CARD_NOT_IN_PLAY`  | `card_not_in_play`     | UID mapeado a la partida pero no encontrado en `uidToMapping`.   |
| `UID_UNKNOWN`       | `uid_unknown`          | UID no asociado a ninguna partida activa. **Emitido** por `GameEngine.handleCardScan` (rama `!playId`) al room `play_${expectedPlayId}` cuando el escaneo procede de una partida activa (ADR-237). |

> [!NOTE]
> **`uid_unknown` sí se emite (ADR-237).** Antes, un UID no mapeado a ninguna partida activa se descartaba en silencio y el cliente esperaba un timeout genérico de 3 s. Ahora, si el escaneo procede de una partida activa, `handleCardScan` emite `scan_ignored:{reason:'uid_unknown'}` al room `play_${expectedPlayId}` para dar feedback inmediato ("tarjeta no registrada"). Seguro ante reconexión: `cardUidToPlayId` sigue poblado durante un reconnect, así que una tarjeta válida no cae en esta rama. Ver [RFID_Runtime_Flows.md](RFID_Runtime_Flows.md) §16.1.

### `PLAY_INTERRUPTED_REASONS`

| Constante                 | Valor                       | Cuándo se emite                                                       |
| ------------------------- | --------------------------- | --------------------------------------------------------------------- |
| `INTERNAL_ERROR`          | `internal_error`            | Error fatal procesando un scan (BD caída, excepción inesperada).      |
| `RECONCILIATION_FAILED`   | `reconciliation_failed`     | Restauración tras reinicio del servidor sin estado recuperable.       |

> Estos VALORES son **contrato público** y no deben cambiar tras el primer despliegue. Si hace falta deprecar uno, añadir uno nuevo y mantener el antiguo durante una versión.

---

## Apéndice D: Endpoint de salud `GET /api/metrics/rfid`

Exposición granular de la salud del sensor para dashboards y monitorización externa, separada de las métricas runtime generales (`/api/metrics`).

**Acceso**: `Authorization: Bearer <token>` con role `teacher` o `super_admin`.

**Respuesta** (`200 OK`):

```json
{
  "success": true,
  "data": {
    "service": { "status": "client_ready", "source": "client" },
    "health": "ok",
    "counters": {
      "totalEvents": 1284,
      "totalScans": 612,
      "totalErrors": 3,
      "dedupeHits": 47,
      "errorsByType": { "read_failure": 2, "init_failure": 1 }
    },
    "rates": {
      "scanRate1m": 24,
      "scanRate5m": 113
    },
    "timestamps": {
      "lastScanAt": 1776640000000,
      "lastErrorAt": 1776630000000,
      "lastEventAt": 1776640012345,
      "connectedAt": 1776600000000
    },
    "security": {
      "hmacEnabled": true,
      "valid": 598,
      "invalid": 2,
      "absent": 0,
      "replay": 1,
      "exempt": 11
    },
    "gameEngine": {
      "activePlays": 3,
      "totalCardScans": 2150,
      "ignoredCardScans": 12,
      "ignoredScanRatioPct": 0.6,
      "lockContention": 0
    },
    "timestamp": "2026-04-19T23:18:34.862Z"
  }
}
```

**Campos `health`**:

- `ok` — servicio activo, último scan dentro de la ventana de 90 s.
- `degraded` — servicio activo pero sin scans en los últimos 90 s.
- `down` — servicio detenido / deshabilitado / mal configurado.

**Bloque `security`** (observabilidad de la firma HMAC, §13.2): contadores acumulados **por instancia desde el arranque**, leídos de `rfidHmacValidator.peekMetrics()` de forma **no destructiva** (no resetea, a diferencia de `drainMetrics`). Son volátiles y per-proceso (no agregados de cluster ni persistidos): sirven para un diagnóstico inmediato del enforcement, no para histórico.

- `hmacEnabled` — `true` si `RFID_HMAC_ENABLED=true` (enforcement activo); refleja `rfidHmacValidator.isEnabled()`.
- `valid` — scans con firma correcta (con el flag off, payloads que ya traían `counter`/`hmac`: adopción de firmware).
- `invalid` — firma que no cuadra, source ausente en enforce o secret no configurado (`HMAC_INVALID`/`SOURCE_MISSING`/`HMAC_SECRET_MISSING`).
- `absent` — enforce sin `counter`/`hmac` (`HMAC_FIELDS_MISSING`); con el flag off, payloads legacy sin firmar.
- `replay` — counter no estrictamente creciente (`COUNTER_REPLAY`).
- `exempt` — fuentes táctiles (`touch_fallback`/`touch_memory_flip`) eximidas del enforcement por diseño.

> El histórico operativo de los rechazos (`invalid`/`replay`) lo cubre el detector SmartAlert `rfid_hmac_spike` (contadores Redis con ventana de 1 h); ver `documentation/SECURITY.md` §13.6.

---

## Apéndice E: Watchdog del modo RFID (auto-cleanup)

Para evitar que un modo activo (gameplay o card_assignment) quede "stuck" cuando el profesor cierra el navegador sin disparar `leave_*`, el backend programa un watchdog de **5 minutos** por usuario que se refresca con cada actividad legítima:

1. **Scan RFID válido** (`rfid_scan_from_client`): tras pasar todas las validaciones, `refreshRfidModeActivity` actualiza `updatedAt` y reprograma el timer.
2. **Heartbeat explícito**: el frontend emite `rfid_mode_heartbeat` cada 60 s en el namespace `/game`.
3. **Reasignación de modo** (`setRfidModeState`): cualquier nuevo `setRfidModeState` cancela y reprograma.

Si transcurre `RFID_MODE_IDLE_TIMEOUT_MS` (env `RFID_MODE_IDLE_TIMEOUT_MS`, default 300000 ms) sin ninguna señal, el watchdog dispara `clearRfidModeState`. La UI se entera vía `rfid_mode_changed` con `mode=idle` y el log estructurado emite:

```
WARN  Modo RFID auto-limpiado por inactividad { userId, mode, socketId, idleMs: 300000 }
```

Implementación en `backend/src/realtime/socketHandlers.js` (helpers `scheduleRfidModeWatchdog`, `clearRfidModeTimer`, `refreshRfidModeActivity`).

---

## Changelog

| Versión | Fecha      | Cambios                                                              |
| ------- | ---------- | -------------------------------------------------------------------- |
| 1.1.0   | 2026-04-20 | Apéndices C/D/E: códigos error granulares, endpoint métricas, watchdog |
| 1.0.0   | 2026-01-06 | Documentación inicial completa                                       |
