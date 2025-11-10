# Backend - Juegos RFID (MERN Stack)

Servidor backend para la aplicación de juegos educativos con tecnología RFID/NFC.

## Tecnologías

- **Node.js** 18+
- **Express.js** - Servidor HTTP y API REST
- **MongoDB** + **Mongoose** - Base de datos y ODM
- **Socket.io** - Comunicación en tiempo real
- **SerialPort** - Comunicación con sensor RFID
- **Winston** - Logging

---

## Estructura del Proyecto

```
backend/
├── src/
│   ├── server.js              # Punto de entrada principal
│   ├── config/
│   │   └── database.js        # Configuración MongoDB
│   ├── models/                # Modelos Mongoose
│   │   ├── Card.js
│   │   ├── GameMechanic.js
│   │   ├── GameContext.js
│   │   ├── GameSession.js
│   │   └── GamePlay.js
│   ├── services/              # Servicios principales
│   │   ├── rfidService.js     # Comunicación con sensor
│   │   └── gameEngine.js      # Motor de juego
│   └── utils/
│       ├── logger.js          # Sistema de logs
├── logs/                      # Archivos de log
├── package.json
├── .env.example
└── README.md
```

---

## Instalación

### 1. Instalar dependencias

```bash
cd backend
npm install
```

### 2. Configurar variables de entorno

Copia el archivo `.env.example` a `.env`:

```bash
copy .env.example .env
```

Edita `.env` y ajusta los valores según el sistema operativo:

**Importante:** para encontrar el puerto COM correcto en Windows:
1. Abrir el **Administrador de dispositivos** (Device manager)
2. Buscar en **Puertos (COM y LPT)**
3. Identificar el puerto del Wemos D1 mini (suele aparecer como "USB-SERIAL CH340")
4. Anotar el número de puerto (ej. COM3, COM4)

### 3. Iniciar servidor

```bash
# Modo desarrollo (con nodemon, recarga automática)
npm run dev

# Modo producción
npm start
```

El servidor estará disponible en `http://localhost:5000`

---

## Endpoints de la API

### Health Check

```
GET /api/health
```

Respuesta:
```json
{
  "status": "ok",
  "timestamp": "2025-11-02T12:00:00.000Z",
  "rfidConnected": true
}
```

### Cards (Tarjetas RFID)

```
GET    /api/cards           # Listar todas las tarjetas
GET    /api/cards/:uid      # Obtener tarjeta por UID
POST   /api/cards           # Crear nueva tarjeta
PUT    /api/cards/:uid      # Actualizar tarjeta
DELETE /api/cards/:uid      # Eliminar tarjeta
```

Ejemplo POST /api/cards:
```json
{
  "uid": "32B8FA05",
  "alias": "Tarjeta España",
  "type": "MIFARE 1KB",
  "metadata": {
    "color": "red",
    "icon": "🇪🇸"
  }
}
```

### Game mechanics (Mecánicas de juego)

```
GET /api/mechanics                # Listar mecánicas activas
GET /api/mechanics/:id            # Obtener detalle
GET /api/mechanics/:id/contexts   # Obtener contextos
```

### Game sessions (Sesiones de juego)

```
GET    /api/sessions              # Listar sesiones
GET    /api/sessions/:id          # Obtener sesión
POST   /api/sessions              # Crear sesión
PUT    /api/sessions/:id          # Actualizar sesión
DELETE /api/sessions/:id          # Eliminar sesión
POST   /api/sessions/:id/start    # Iniciar sesión
POST   /api/sessions/:id/pause    # Pausar sesión
POST   /api/sessions/:id/end      # Finalizar sesión
```

### Game plays (Partidas)

```
GET  /api/plays                 # Listar partidas
GET  /api/plays/:id             # Obtener partida
POST /api/plays                 # Crear partida
POST /api/plays/:id/event       # Registrar evento
GET  /api/plays/:id/results     # Obtener resultados
```

---

## WebSocket events (Socket.io)

### Cliente → Servidor

```javascript
// Conectar
socket.connect();

// Unirse a una partida
socket.emit('join_play', { playId: '673...' });

// Iniciar partida
socket.emit('start_play', { playId: '673...' });

// Pausar partida
socket.emit('pause_play', { playId: '673...' });

// Reanudar partida
socket.emit('resume_play', { playId: '673...' });

// Salir de partida
socket.emit('leave_play', { playId: '673...' });
```

### Servidor → Cliente

```javascript
// Evento del sensor RFID (todos los clientes)
socket.on('rfid_event', (event) => {
  // event.event: 'init', 'card_detected', 'card_removed', 'error', 'status'
  // event.uid: UID de la tarjeta (si aplica)
});

// Nueva ronda
socket.on('new_round', (data) => {
  // data.roundNumber, data.challenge, data.timeLimit, data.score
});

// Resultado de validación
socket.on('validation_result', (result) => {
  // result.isCorrect, result.pointsAwarded, result.newScore
});

// Fin de juego
socket.on('game_over', (data) => {
  // data.finalScore, data.totalRounds
});

// Error
socket.on('error', (error) => {
  // error.message
});
```

---

## Servicios principales

### RFID service

Gestiona la comunicación serie con el sensor RFID:

- Conexión automática al puerto serie
- Parsing de eventos JSON del sensor
- Reconexión automática en caso de desconexión

### Game engine

Motor de juego que gestiona:

- Inicio de partidas
- Generación de rondas aleatorias
- Validación de respuestas
- Sistema de puntuación
- Temporización de rondas
- Finalización de juegos

## 📝 Logs

Los logs se guardan en la carpeta `logs/`:
- `combined.log` - Todos los logs
- `error.log` - Solo errores

También se muestran en consola con colores para facilitar el debug.
