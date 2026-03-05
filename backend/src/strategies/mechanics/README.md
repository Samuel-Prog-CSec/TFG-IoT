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

## Cobertura Sprint 4

- `association`: mecánica productiva principal (consigna en pantalla + escaneo de respuesta).
- `memory`: mecánica productiva principal con estado de soporte para tablero de memoria (grupos, cursor de ronda y última carta revelada).
- `sequence`: visible en catálogo pero marcada como `coming_soon` para creación de sesiones en este sprint.
