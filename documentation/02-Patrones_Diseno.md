# 02-Patrones_Diseno

Proyecto: Plataforma de Juegos Educativos con RFID (TFG)

Estado: Activo
Version: 1.0
Ultima actualizacion: 2026-02-09

## Proposito

Este documento describe de forma profesional y detallada los patrones de diseno aplicados en el proyecto, su motivacion, su implementacion tecnica, sus beneficios y sus riesgos. Tambien define reglas de consistencia y criterios de evolucion para mantener una arquitectura estable mientras el producto crece.

## Alcance

- Backend (Node.js/Express, Socket.IO, MongoDB/Mongoose)
- Frontend (React, Web Serial API)
- Capa tiempo real (Socket.IO + RFID)

## Audiencia

- Equipo de desarrollo
- Revision academica (TFG)
- Mantenimiento futuro

## Principios de arquitectura

- Separacion de responsabilidades (SRP)
- Minimo acoplamiento entre capas
- Consistencia de contratos de datos
- Observabilidad y seguridad por defecto
- Escalabilidad operativa

## Mapa rapido de patrones

- MVC: separacion modelo, controlador, vista
- Service Layer: orquestacion de reglas de negocio
- Middleware Pipeline: preocupaciones transversales
- Observer/EventEmitter: flujo de eventos RFID
- DTO: contratos de respuesta estables
- Singleton: instancias compartidas y controladas
- Rate Limiter Policy: mitigacion de abuso
- Facade Realtime: encapsulacion Socket.IO/RFID
- Repository: acceso a datos centralizado
- Strategy: variacion de mecanicas de juego
- State: modos RFID como estados explicitos
- Command: ejecucion de eventos Socket.IO
- Circuit Breaker: tolerancia a fallos externos

## Patrones actualmente en uso

### 1) MVC (Model-View-Controller)

**Intencion**
- Separar el dominio (Model) de la orquestacion HTTP (Controller) y la presentacion (View).

**Implementacion en el proyecto**
- Modelos en [backend/src/models](backend/src/models) con Mongoose.
- Controllers en [backend/src/controllers](backend/src/controllers).
- Vistas React en [frontend/src](frontend/src).

**Reglas de consistencia**
- Controllers orquestan, no ejecutan reglas complejas.
- Modelos no contienen logica HTTP.
- Vistas no contienen logica de negocio.

**Beneficios**
- Evolucion independiente de capas.
- Mayor testabilidad y mantenibilidad.

**Riesgos**
- Controllers inflados si no se usa Service Layer.

---

### 2) Service Layer (Capa de servicios)

**Intencion**
- Centralizar reglas de negocio y procesos no triviales.

**Implementacion en el proyecto**
- Servicios en [backend/src/services](backend/src/services), por ejemplo `gameEngine`, `rfidService`, `gamePlayService`.

**Reglas de consistencia**
- Los controllers validan entrada y delegan a servicios.
- Servicios no manejan `req`/`res`.
- Las validaciones clave viven en servicios para evitar divergencias.

**Beneficios**
- Reutilizacion de logica.
- Reduce duplicacion y riesgo de divergencia.

**Riesgos**
- Servicio monolitico si no se segmenta por dominio.

---

### 3) Middleware Pipeline (HTTP y Socket.IO)

**Intencion**
- Encapsular autenticacion, validacion, rate limiting y manejo de errores.

**Implementacion en el proyecto**
- Middlewares Express en [backend/src/middlewares](backend/src/middlewares).
- Rate limiting y validaciones en eventos Socket.IO en [backend/src/realtime/socketHandlers.js](backend/src/realtime/socketHandlers.js).

**Reglas de consistencia**
- Orden de middlewares definido en [backend/src/server.js](backend/src/server.js).
- Respuestas de error consistentes.

**Beneficios**
- Seguridad y observabilidad uniformes.
- Menos duplicacion.

**Riesgos**
- Orden incorrecto rompe seguridad (CSRF, auth).

---

### 4) Observer / EventEmitter

**Intencion**
- Desacoplar productores y consumidores de eventos.

**Implementacion en el proyecto**
- `rfidService` extiende `EventEmitter` en [backend/src/services/rfidService.js](backend/src/services/rfidService.js).
- Suscripcion en [backend/src/realtime/socketHandlers.js](backend/src/realtime/socketHandlers.js).

**Reglas de consistencia**
- Payloads normalizados (event, uid, type, sensorId).
- Enrutado por rooms para limitar alcance.

**Beneficios**
- Tiempo real desacoplado del core.
- Facilita pruebas con eventos simulados.

**Riesgos**
- Eventos sin contrato estable generan inconsistencias.

---

### 5) DTO (Data Transfer Object)

**Intencion**
- Definir contratos de respuesta estables y seguros.

**Implementacion en el proyecto**
- DTOs centralizados en [backend/src/utils/dtos.js](backend/src/utils/dtos.js).
- Controllers usan DTOs para respuestas de entidades.
- En endpoints de assets se usa `toAssetDTOV1` para devolver solo campos permitidos.

**Reglas de consistencia**
- No exponer `password`, `__v` ni campos internos.
- Preferir DTOs para listas y detalle.

**Beneficios**
- Contratos estables para frontend.
- Reduccion de riesgo de fuga de datos.

**Riesgos**
- Si se omite DTO, se filtra estructura interna.

**Nota de auditoria**
- Las respuestas de analiticas retornan datos agregados (no documentos Mongoose). No usan DTO aun porque ya son payloads derivados. Si el contrato se vuelve critico, se recomienda agregar DTOs especificos.

---

### 6) Singleton (instancias compartidas)

**Intencion**
- Evitar multiples instancias de recursos globales.

**Implementacion en el proyecto**
- Logger, Redis y Socket.IO como instancias unicas en [backend/src/server.js](backend/src/server.js).
- `socketService` en frontend como singleton.

**Reglas de consistencia**
- Inicializacion controlada.
- Shutdown limpio (tests y cierre del server).

**Beneficios**
- Menos conexiones duplicadas.
- Estado consistente.

**Riesgos**
- Dificultad para pruebas si no se limpia correctamente.

---

### 7) Rate Limiter como politica centralizada

**Intencion**
- Mitigar abuso y cargas no deseadas.

**Implementacion en el proyecto**
- Rate limiter HTTP en seguridad global.
- Socket rate limiter en [backend/src/middlewares/socketRateLimiter.js](backend/src/middlewares/socketRateLimiter.js).

**Reglas de consistencia**
- Limites por evento y bloqueo temporal.
- Dedupe para RFID.

**Beneficios**
- Proteccion ante abuso y DoS.

**Riesgos**
- Configuracion excesiva puede afectar UX.

---

### 8) Facade de tiempo real (realtime)

**Intencion**
- Encapsular la complejidad de Socket.IO/RFID.

**Implementacion en el proyecto**
- API de registro en [backend/src/realtime/index.js](backend/src/realtime/index.js).
- Handlers en [backend/src/realtime/socketHandlers.js](backend/src/realtime/socketHandlers.js).

**Reglas de consistencia**
- `server.js` solo invoca funciones de registro.
- La logica realtime no se mezcla con HTTP.

**Beneficios**
- Menor acoplamiento.
- Facilita test y mantenimiento.

**Riesgos**
- Si se rompe la interfaz publica, impacta a `server.js`.

---

### 9) Repository (Capa de acceso a datos)

**Intencion**
- Centralizar queries y aislar Mongoose.

**Implementacion en el proyecto**
- Repositorios en [backend/src/repositories](backend/src/repositories).
- Controllers y services delegan acceso a datos.
- Realtime usa repositorios para mantener consistencia transversal.

**Reglas de consistencia**
- Queries con opciones comunes via `applyQueryOptions`.
- Evitar acceso directo a modelos fuera de repositorios.

**Beneficios**
- Menor acoplamiento con la capa de persistencia.
- Facilita cacheo y pruebas.

**Riesgos**
- Repositorios demasiado genericos pueden ocultar reglas de negocio.

---

### 10) Strategy (Mecanicas de juego)

**Intencion**
- Encapsular la logica de seleccion de desafios por mecanica.

**Implementacion en el proyecto**
- Estrategias en [backend/src/strategies/mechanics](backend/src/strategies/mechanics).
- `GameEngine` delega la seleccion del desafio en la estrategia activa.
- Se soportan `association`, `sequence` y `memory`, con fallback controlado.

**Reglas de consistencia**
- Las estrategias son stateless; el estado por partida vive en `playState.strategyState`.
- El motor solo usa el contrato `initialize` y `selectChallenge`.

**Beneficios**
- Elimina condicionales por mecanica en el motor.
- Facilita agregar nuevas mecanicas sin modificar el core (OCP).

**Riesgos**
- Estrategias incompletas pueden degradar UX si no se testean.

---

### 11) State (Modos RFID)

**Intencion**
- Encapsular reglas y validaciones por modo RFID.

**Implementacion en el proyecto**
- Estados en [backend/src/states/rfid](backend/src/states/rfid).
- La capa realtime usa el estado para validar lecturas y coherencia de rooms.

**Reglas de consistencia**
- Los estados son stateless; el modo actual vive en el store realtime.
- El handler consume un contrato estable: `allowsReads` y `validateRoom`.

**Beneficios**
- Reduce condicionales por modo y hace el flujo extensible.
- Facilita agregar nuevos modos sin tocar validaciones centrales.

**Riesgos**
- Si un estado no aplica validaciones correctas, se debilita la seguridad del flujo.

---

### 12) Command (Eventos Socket.IO)

**Intencion**
- Encapsular ejecucion de eventos Socket.IO en comandos reutilizables.

**Implementacion en el proyecto**
- Comandos en [backend/src/commands/socket](backend/src/commands/socket).
- Realtime delega a comandos segun el nombre del evento.

**Reglas de consistencia**
- Un comando por evento sensible.
- Validaciones comunes via helpers compartidos.

**Beneficios**
- Reduce duplicacion en handlers.
- Facilita auditoria y pruebas por comando.

**Riesgos**
- Si el comando no valida permisos, expone el evento.

---

### 13) Circuit Breaker (Dependencias externas)

**Intencion**
- Evitar cascadas de fallos cuando Redis o Supabase no estan disponibles.

**Implementacion en el proyecto**
- Circuit Breaker en [backend/src/utils/circuitBreaker.js](backend/src/utils/circuitBreaker.js).
- Aplicado en [backend/src/services/redisService.js](backend/src/services/redisService.js).
- Aplicado en [backend/src/services/storageService.js](backend/src/services/storageService.js).

**Reglas de consistencia**
- Los breakers son por dependencia.
- Se registran exitos y fallos en cada operacion.
- Los rechazos por circuito abierto no extienden el timeout.

**Beneficios**
- Reduce latencia y evita tormentas de reintentos.
- Permite degradacion controlada.

**Riesgos**
- Configuracion agresiva puede ocultar fallos reales.

## Decisiones documentadas y justificacion

### Repositorios en la capa realtime

**Decision**
- Usar repositorios tambien en Socket.IO.

**Razon**
- El patron Repository pierde valor si la capa realtime accede a modelos directamente. Mantener el contrato unico evita divergencias, facilita observabilidad y asegura consistencia entre HTTP y tiempo real.

### DTO en endpoints de assets

**Decision**
- Responder assets usando `toAssetDTOV1`.

**Razon**
- Los assets son subdocumentos de contexto y pueden crecer en campos internos. El DTO limita la superficie expuesta y mantiene estabilidad del contrato sin filtrar detalles del modelo.

### DTOs en analiticas

**Decision**
- No se aplican DTOs aun a respuestas de analiticas.

**Razon**
- Los payloads ya son datos agregados y no exponen documentos Mongoose. Se puede introducir un DTO de analiticas si el contrato se fija o si se requiere versionado formal.

### Strategy para mecanicas

**Decision**
- Aplicar Strategy en el motor de juego para seleccionar desafios por mecanica.

**Razon**
- Las mecanicas eran un punto de crecimiento natural y terminaban en condicionales. La estrategia permite introducir nuevas reglas sin tocar el core y mantiene el juego extensible.

### State para modos RFID

**Decision**
- Aplicar State en la capa realtime para validar lecturas segun modo.

**Razon**
- El flujo RFID tiene reglas distintas por modo. Encapsularlas reduce duplicacion y hace mas segura la transicion entre estados.

### Command para eventos Socket.IO

**Decision**
- Aplicar Command en la capa realtime para manejar eventos.

**Razon**
- Reduce repeticion y centraliza validaciones; facilita test y auditoria.

### Consolidacion de Service Layer

**Decision**
- Centralizar creacion y cierre de partidas en `gamePlayService` y creacion de alumnos en `userService`.

**Razon**
- Evita duplicacion entre controllers y services, y mantiene reglas coherentes en un unico punto.

### Circuit Breaker para dependencias externas

**Decision**
- Aplicar Circuit Breaker a Redis y Supabase Storage.

**Razon**
- Ambas dependencias son criticas y susceptibles a fallos intermitentes. El breaker evita saturar el sistema y mejora estabilidad percibida.

## Criterios de auditoria (resumen)

- No hay imports directos de modelos en controllers/services/realtime (excepto comentarios).
- Respuestas de entidades pasan por DTOs.
- Realtime desacoplado mediante facade.
- Eventos RFID normalizados y auditables.

## Patrones recomendados para incorporar

Actualmente no hay patrones pendientes. Nuevas propuestas se documentaran aqui.
