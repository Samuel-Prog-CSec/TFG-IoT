# Game Mechanics Strategies

Implementacion del patron Strategy para seleccionar desafios y reglas de mecanicas.

## Contrato

Cada estrategia debe exponer:

- `getName()` -> string
- `initialize({ sessionDoc, playDoc })` -> estado por partida
- `selectChallenge({ playDoc, sessionDoc, playState })` -> cardMapping

## Notas

- La instancia de estrategia es stateless.
- El estado por partida se guarda en `playState.strategyState`.
