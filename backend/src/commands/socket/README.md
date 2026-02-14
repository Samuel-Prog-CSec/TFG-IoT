# Socket Commands

Implementacion del patron Command para eventos Socket.IO.

## Contrato

Cada comando debe exponer:

- `getName()` -> string
- `execute(context)` -> Promise<void>

## Contexto esperado

- `socket`
- `data`
- `logger`
- `io`
- `gameEngine`
- `rfidService`
- `helpers`
