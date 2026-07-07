# Backend Docs

## Proposito

Documentacion tecnica del backend. Incluye decisiones de arquitectura, seguridad, protocolos, rendimiento y guias de operacion.

## Estructura

- API_v0.5.0.md: especificacion API REST actual.
- Analytics_Design_Rationale.md: diseno del sistema de analytics.
- Arquitectura_Redis.md: arquitectura de Redis (cache, colas, pub/sub).
- AssetProcessing.md: pipeline de procesamiento de assets.
- Logging_Strategy.md: estrategia de logging con Pino.
- Performance_Notes.md: notas de rendimiento y optimizaciones.
- Rate_Limiting_Analysis.md: analisis de rate limiting.
- Redis_Optimization_Analysis.md: optimizacion de Redis.
- RFID_Protocol.md: contrato y eventos RFID.
- RFID_Runtime_Flows.md: flujos runtime RFID (autoridad, secuencias y errores esperados).
- WebSerial_Architecture.md: arquitectura Web Serial.
- WebSockets-ExtendedUsage.md: eventos y patrones de WebSocket.
- diagrams/: diagramas de arquitectura.
- Flujos_Accion/: flujos operativos.

## Uso

Consulta el archivo relevante segun el area del sistema que estes modificando. Mantener la documentacion actualizada es requisito de calidad.

## Ruta recomendada para TFG (gobierno de usuarios)

Para revisar el modelo vigente de permisos y sus decisiones de diseno:

1. `API_v0.5.0.md` (contratos y permisos efectivos por endpoint).
2. `Flujos_Accion/Admin_user.md` (flujo de aprobacion de docentes).
3. `Flujos_Accion/FLUJO_USUARIOS.md` (gobierno de identidades y responsabilidades por rol).

## Decisiones de Diseno

Se mantiene un enfoque modular: cada documento describe un dominio especifico para facilitar mantenimiento y revision.

## Mejoras Futuras

- Consolidar un indice general de docs a nivel de repositorio.
- Versionado formal de documentos con changelog.
