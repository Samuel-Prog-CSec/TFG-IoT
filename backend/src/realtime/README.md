# Realtime

## Proposito

Este directorio agrupa la logica de tiempo real (Socket.IO) y el enrutado de eventos RFID.
Separa responsabilidades para mantener `server.js` mas simple y estable.

## Estructura

- `socketHandlers.js`: Registro de handlers Socket.IO, control de modos RFID y emision de eventos por rooms.

## Uso

```javascript
const {
  registerSocketHandlers,
  registerRfidHandlers
} = require('./realtime/socketHandlers');

registerSocketHandlers({ io, gameEngine, rfidService, socketRateLimiter, logger });
registerRfidHandlers({ io, gameEngine, rfidService, logger });
```

## Decisiones de diseno

- Se mantiene un estado en memoria por usuario para modos RFID y mapeo `sensorId -> userId`.
- La autenticacion de sockets y el ownership se validan en un unico lugar para evitar duplicacion.
- Se usan rooms dedicadas para minimizar fugas de datos entre partidas.

## Mejoras futuras

- Extraer validaciones en modulos mas pequenos si crece el numero de eventos.
- Agregar tests unitarios especificos para el enrutado RFID y los modos.
