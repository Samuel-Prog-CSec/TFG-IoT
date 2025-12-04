# Requisitos Funcionales - Hardware RFID

## RF-RFID: Sistema de Tarjetas y Sensor RFID

---

## Tarjetas RFID (RF-RFID-001 a RF-RFID-005)

### RF-RFID-001: Registro de Tarjetas RFID ✅

**Descripción:** El sistema debe permitir registrar tarjetas RFID físicas en la base de datos.

**Criterios de Aceptación:**

- UID único en formato hexadecimal (8 o 14 caracteres)
- Conversión automática a mayúsculas
- Tipos soportados: MIFARE 1KB, MIFARE 4KB, NTAG, UNKNOWN
- Estado inicial: "active"

**Endpoint:** `POST /api/cards`

**Datos de Entrada:**

```json
{
  "uid": "32B8FA05",
  "type": "MIFARE 1KB",
  "metadata": {
    "color": "azul",
    "icon": "star"
  }
}
```

---

### RF-RFID-002: Validación de UID ✅

**Descripción:** El sistema debe validar el formato del UID de las tarjetas.

**Criterios de Aceptación:**

- Regex: `/^[0-9A-F]{8}$|^[0-9A-F]{14}$/`
- 8 caracteres: UID de 4 bytes (MIFARE Classic)
- 14 caracteres: UID de 7 bytes (NTAG, MIFARE Plus)
- Rechazo de formatos inválidos con error 400

---

### RF-RFID-003: Estados de Tarjeta ✅

**Descripción:** Las tarjetas deben tener estados que controlen su disponibilidad.

**Estados:**

- `active`: Tarjeta disponible para uso en juegos
- `inactive`: Tarjeta deshabilitada temporalmente
- `lost`: Tarjeta reportada como perdida

**Criterios de Aceptación:**

- Solo tarjetas "active" pueden asignarse a sesiones
- Transiciones de estado mediante API
- Registro de último uso

---

### RF-RFID-004: Metadata de Tarjetas ✅

**Descripción:** Las tarjetas pueden tener metadata adicional para identificación visual.

**Campos de Metadata:**

- `color`: Color físico de la tarjeta (para identificación)
- `icon`: Icono o símbolo asociado
- `lastUsed`: Última fecha de uso

**Nota:** El campo `alias` fue eliminado por redundancia. El significado contextual se asigna en `GameSession.cardMappings.assignedValue`.

---

### RF-RFID-005: CRUD de Tarjetas ✅

**Descripción:** El sistema debe proporcionar operaciones CRUD para tarjetas.

**Endpoints:**

- `GET /api/cards` - Listar tarjetas
- `GET /api/cards/:id` - Obtener tarjeta
- `POST /api/cards` - Crear tarjeta
- `PUT /api/cards/:id` - Actualizar tarjeta
- `DELETE /api/cards/:id` - Desactivar tarjeta
- `POST /api/cards/batch` - Crear múltiples tarjetas
- `GET /api/cards/stats` - Estadísticas de tarjetas

---

## Sensor RFID (RF-RFID-006 a RF-RFID-010)

### RF-RFID-006: Comunicación Serial ✅

**Descripción:** El backend debe comunicarse con el sensor RFID vía puerto serie.

**Criterios de Aceptación:**

- Puerto configurable via variable de entorno (SERIAL_PORT)
- Baud rate: 115200
- Parser de líneas para lectura de JSON
- Manejo de buffer para datos incompletos

**Configuración:**

```env
SERIAL_PORT=COM3
SERIAL_BAUD_RATE=115200
```

---

### RF-RFID-007: Reconexión Automática ✅

**Descripción:** El servicio RFID debe reconectarse automáticamente tras desconexión.

**Criterios de Aceptación:**

- Detección de desconexión por cierre de puerto o error
- Intentos de reconexión con backoff exponencial
- Máximo de intentos configurable (RFID_MAX_RECONNECT_ATTEMPTS)
- Delay entre intentos: max(5s * intentos, 60s)
- Evento de status emitido en cada cambio

**Estados de Conexión:**

- `connected`: Sensor conectado y operativo
- `disconnected`: Sensor desconectado
- `reconnecting`: Intentando reconectar
- `failed`: Máximo de intentos alcanzado

---

### RF-RFID-008: Eventos del Sensor ✅

**Descripción:** El sensor debe emitir eventos en formato JSON que el backend procesa.

**Eventos Soportados:**

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `init` | Sensor inicializado | `{ status, version }` |
| `card_detected` | Tarjeta detectada | `{ uid, type, size }` |
| `card_removed` | Tarjeta retirada | `{ uid }` |
| `error` | Error del sensor | `{ type, message }` |
| `status` | Heartbeat periódico | `{ uptime, cards_detected, free_heap }` |

---

### RF-RFID-009: Buffer de Eventos ✅

**Descripción:** El servicio debe mantener un buffer circular de eventos recientes.

**Criterios de Aceptación:**

- Tamaño configurable (default: 100 eventos)
- Útil para debugging y auditoría
- Timestamp añadido a cada evento
- Accesible vía API de métricas

---

### RF-RFID-010: Métricas del Servicio RFID ✅

**Descripción:** El servicio debe exponer métricas de rendimiento.

**Métricas:**

- `totalEventsReceived`: Total de eventos procesados
- `totalCardDetections`: Total de tarjetas detectadas
- `totalErrors`: Total de errores
- `lastEventTimestamp`: Timestamp del último evento
- `connectionUptime`: Tiempo de conexión activa
- `reconnectAttempts`: Intentos de reconexión actuales

**Endpoint:** `GET /api/metrics` (desarrollo)

---

## Hardware ESP8266 + RC522

### RF-RFID-HW-001: Firmware del Lector ✅

**Descripción:** El ESP8266 debe ejecutar firmware para lectura de tarjetas RFID.

**Especificaciones:**

- Microcontrolador: ESP8266 NodeMCU
- Módulo RFID: RC522 (13.56 MHz)
- Conexión: SPI
- Pines: RST=GPIO5 (D1), SS=GPIO15 (D8)

**Características del Firmware:**

- Detección de tarjetas MIFARE y NTAG
- Lectura de UID con reintentos
- Detección de remoción de tarjeta
- Heartbeat cada 10 segundos
- Anticollision para tarjetas problemáticas

---

### RF-RFID-HW-002: Formato de Salida ✅

**Descripción:** El firmware debe enviar datos en formato JSON por serial.

**Ejemplos de Salida:**

```json
{"event":"init","status":"success","version":"0x91"}
{"event":"card_detected","uid":"32b8fa05","type":"MIFARE 1KB","size":4}
{"event":"card_removed","uid":"32b8fa05"}
{"event":"status","uptime":60000,"cards_detected":5,"free_heap":45000}
{"event":"error","type":"read_failure","message":"Anticollision failed"}
```

---

### RF-RFID-HW-003: Configuración de Antena ✅

**Descripción:** El firmware debe configurar la ganancia de antena para lecturas óptimas.

**Configuración:**

- Ganancia: RxGain_38dB (máxima sensibilidad)
- Hardware reset al inicializar
- Delay de estabilización de 50ms

