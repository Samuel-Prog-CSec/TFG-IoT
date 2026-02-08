# Backend Docs

## Proposito

Documentacion tecnica del backend. Incluye decisiones de arquitectura, seguridad, protocolos, rendimiento y guias de operacion.

## Estructura

- API_v0.3.0.md: especificacion API REST actual.
- Architecture_Decisions.md: decisiones de arquitectura y rationale.
- AssetProcessing.md: pipeline de procesamiento de assets.
- Logging_Strategy.md: estrategia de logging con Pino.
- Performance_Notes.md: notas de rendimiento y optimizaciones.
- RFID_Protocol.md: contrato y eventos RFID.
- Security_Logging.md: eventos y estrategia de logging de seguridad.
- WebSerial_Architecture.md: arquitectura Web Serial.
- WebSockets-ExtendedUsage.md: eventos y patrones de WebSocket.
- diagrams/: diagramas de arquitectura.
- Flujos_Accion/: flujos operativos.

## Uso

Consulta el archivo relevante segun el area del sistema que estes modificando. Mantener la documentacion actualizada es requisito de calidad.

## Decisiones de Diseno

Se mantiene un enfoque modular: cada documento describe un dominio especifico para facilitar mantenimiento y revision.

## Mejoras Futuras

- Consolidar un indice general de docs a nivel de repositorio.
- Versionado formal de documentos con changelog.
