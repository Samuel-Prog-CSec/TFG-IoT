# Strategies

Esta carpeta agrupa patrones de estrategia usados por el backend.

## Proposito

Aislar variaciones de comportamiento (por ejemplo, mecanicas de juego) para reducir condicionales y permitir extensiones sin modificar el motor central.

## Estructura

- mechanics/: estrategias para mecanicas de juego

## Reglas

- Cada estrategia expone una interfaz minima y consistente.
- El estado por partida vive en `playState.strategyState`, no en la instancia compartida.
