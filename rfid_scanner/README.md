# RFID Reader for Galgo School APP 🚀

[![GitHub stars](https://img.shields.io/github/stars/marchanero/rfid_scanner?style=social)](https://github.com/marchanero/rfid_scanner)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PlatformIO](https://img.shields.io/badge/PlatformIO-arduino-orange)](https://platformio.org/)

Proyecto optimizado para integrar un lector RFID RC522 (HW-126 clon) con Wemos D1 mini en aplicaciones MERN (MongoDB, Express, React, Node.js). Envía UIDs de tarjetas MIFARE por puerto serial en formato JSON para fácil parsing en el backend.

## ✨ Características

- 🔍 **Lectura precisa de UIDs**: Compatible con tarjetas MIFARE Classic, NTAG (botones azules, pegatinas), con fallback a anticollision cruda para clones.
- 📡 **Integración serial**: Salida JSON limpia para Node.js (`serialport`).
- 🛠️ **Optimizado para producción**: Código minimalista (~60 líneas), sin logs verbosos.
- 🔧 **Soporte clones**: Maneja firmwares no estándar (ej. VersionReg 0xB2) con reconstrucción manual de UIDs.
- ⚡ **Bajo consumo**: Inicialización rápida, loop eficiente, gain de antena optimizado (38dB).

## 📦 Instalación

### Requisitos

- [PlatformIO](https://platformio.org/) (IDE recomendado).
- Wemos D1 mini (ESP8266).
- Módulo RFID RC522 HW-126 (SPI).
- Tarjetas MIFARE Classic para testing.

### Setup del Proyecto

1. Clona el repo:

   ```bash
   git clone https://github.com/marchanero/rfid_scanner.git
   cd rfid_scanner
   ```

2. Instala dependencias:

   ```bash
   pio install
   ```

   > **Nota**: El proyecto usa la librería estándar `miguelbalboa/MFRC522` para compatibilidad con NTAG y clones HW-126.

3. Flashea el firmware:

   ```bash
   pio run -t upload -e d1_mini
   ```

4. Monitor serie:

   ```bash
   pio device monitor -e d1_mini
   ```

## 🔌 Conexiones Hardware

| Wemos D1 mini | RC522 HW-126 | Descripción |
|---------------|--------------|-------------|
| 3.3V         | VCC          | Alimentación |
| GND          | GND          | Tierra común |
| D8 (GPIO15)  | SS           | Chip Select |
| D1 (GPIO5)   | RST          | Reset |
| D7 (GPIO13)  | MOSI         | SPI Data Out |
| D6 (GPIO12)  | MISO         | SPI Data In |
| D5 (GPIO14)  | SCK          | SPI Clock |

> **Nota**: Pines SPI son fijos en ESP8266. Verifica jumpers del módulo en modo SPI.

## 🚀 Uso

### Salida Serial (JSON)

El dispositivo envía mensajes JSON por serial (115200 baudios) para monitoreo completo:

- **Init**: `{"event":"init","status":"success","version":"0xB2"}` (inicialización con versión del chip).
- **Error**: `{"event":"error","type":"init_failure","message":"RC522 communication failed"}` (errores detallados).
- **Card Detected**: `{"event":"card_detected","uid":"32B8FA05","type":"MIFARE 1KB","size":4}` (UID, tipo y tamaño).
- **Card Removed**: `{"event":"card_removed","uid":"32B8FA05"}` (cuando la tarjeta se aleja).
- **Status (Heartbeat)**: `{"event":"status","uptime":12345,"cards_detected":5,"free_heap":20480}` (cada 10s, estado del dispositivo).

### Integración con MERN (Node.js Backend)

Instala `serialport`:

```bash
npm install serialport
```

Ejemplo de código en `server.js`:

```javascript
const SerialPort = require('serialport');
const port = new SerialPort('/dev/ttyUSB0', { baudRate: 115200 });

port.on('data', (data) => {
  const line = data.toString().trim();
  if (line.startsWith('{')) {
    try {
      const event = JSON.parse(line);
      switch (event.event) {
        case 'init':
          console.log('RC522 inicializado:', event.status, 'Versión:', event.version);
          break;
        case 'card_detected':
          console.log('Tarjeta detectada:', event.uid, 'Tipo:', event.type, 'Tamaño:', event.size);
          // Guardar en MongoDB, enviar a React via Socket.io
          break;
        case 'card_removed':
          console.log('Tarjeta removida:', event.uid);
          break;
        case 'status':
          console.log('Heartbeat - Uptime:', event.uptime, 'Tarjetas:', event.cards_detected, 'Heap libre:', event.free_heap);
          break;
        case 'error':
          console.error('Error:', event.type, event.message);
          break;
      }
    } catch (e) {
      console.error('Error parsing JSON:', line);
    }
  }
});
```

### React Frontend (Ejemplo)

Usa WebSocket/Socket.io para recibir UIDs del backend y actualizar UI.

## 🛠️ API Serial

| Evento          | Payload                          | Descripción |
|-----------------|----------------------------------|-------------|
| `init`         | `{"status": "success/fail", "version": "0xXX"}` | Inicialización del RC522 |
| `error`        | `{"type": "string", "message": "string"}` | Errores (init, read, etc.) |
| `card_detected`| `{"uid": "HEXMAYUS", "type": "string", "size": int, "counter": int, "hmac": "hex64"}` | Tarjeta detectada (firmada, T-905 B8) |
| `card_removed` | `{"uid": "HEXSTRING"}` | Tarjeta removida |
| `status`       | `{"uptime": int, "cards_detected": int, "free_heap": int, "counter": int}` | Heartbeat periódico (10s) |

## 🔐 Provisionado del secret HMAC (T-905 B8)

Cada lectura se firma con `HMAC-SHA256(secret, UID_MAYÚSCULAS + ":" + counter)` y
lleva un `counter` monotónico persistido en EEPROM (anti-replay). El backend
verifica la firma cuando `RFID_HMAC_ENABLED=true`.

**El mismo secret debe estar en el firmware y en el backend.**

1. Genera un secret de 32 bytes:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Compila/flashea el firmware con el secret en la env var (no se commitea):
   ```bash
   RFID_HMAC_SECRET=<hex> pio run -t upload
   ```
3. Pon el **mismo** valor en el backend (`RFID_HMAC_SECRET`) y activa
   `RFID_HMAC_ENABLED=true` para forzar el enforcement.

Sin secret en el build, el firmware usa un stub que el backend rechaza con el
flag activo. El UID se firma en **mayúsculas** (forma canónica del sistema).

## 🔧 Troubleshooting

### No detecta tarjetas

- Verifica conexiones SPI (multímetro para continuidad).
- Acerca tarjeta a 1-2 cm del módulo.
- Conecta antena externa si la integrada falla.
- Firmware clon: Si VersionReg es 0xB2, es normal; el código maneja clones.
- Para botones azules (NTAG) y pegatinas: Asegúrate de usar la librería estándar MFRC522; gain ajustado a 38dB mejora detección de tags pequeños.

### Errores comunes

- **Init failed**: Verifica alimentación 3.3V estable, no 5V.
- **No JSON output**: Revisa baud rate (115200), puerto serial correcto.
- **UIDs inconsistentes**: Clones pueden requerir antena externa.

### Debug avanzado

Si el código optimizado no funciona, usa la rama `main` con diagnósticos para logs detallados.

## 📁 Estructura del Proyecto

```text
rfid_scanner/
├── platformio.ini          # Config PlatformIO
├── src/
│   └── main.cpp            # Sketch ESP8266
├── include/                # Headers (si aplica)
├── lib/                    # Librerías locales
└── README.md               # Esta doc
```

## 🤝 Contribuir

1. Fork el repo.
2. Crea una rama: `git checkout -b feature/nueva-funcion`.
3. Commit: `git commit -m 'Agrega nueva funcion'`.
4. Push: `git push origin feature/nueva-funcion`.
5. Abre un PR.

## 📄 Licencia

MIT License - ver [LICENSE](LICENSE) para detalles.

---

Hecho con ❤️ para proyectos IoT y RFID. ¡Issues y PRs bienvenidos!
