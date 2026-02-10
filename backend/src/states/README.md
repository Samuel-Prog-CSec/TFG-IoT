# States

Esta carpeta agrupa patrones de estado usados por el backend.

## Proposito

Encapsular transiciones y reglas por estado para reducir condicionales y mejorar la mantenibilidad.

## Estructura

- rfid/: estados del flujo RFID

## Reglas

- Cada estado expone un contrato consistente.
- El estado actual se guarda en el store de la capa realtime, no dentro de la clase.
