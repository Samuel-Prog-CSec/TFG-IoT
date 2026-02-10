# Commands

Esta carpeta agrupa patrones de comando usados por el backend.

## Proposito

Estandarizar la ejecucion de acciones (por ejemplo eventos Socket.IO) para reducir duplicacion y facilitar auditoria.

## Estructura

- socket/: comandos para eventos Socket.IO

## Reglas

- Cada comando expone un contrato consistente.
- El comando no conoce detalles del transporte mas alla del contexto recibido.
