# RFID State

Implementacion del patron State para modos RFID.

## Contrato

Cada estado debe exponer:

- `getMode()` -> string
- `allowsReads()` -> boolean
- `validateRoom({ socket, rooms, modeState })` -> boolean
- `getReadNotAllowedMessage()` -> string
- `getRoomMismatchMessage()` -> string
- `getRoomMismatchReason()` -> string

## Notas

- Los estados son stateless.
- El modo actual se guarda en `rfidModeByUserId`.
