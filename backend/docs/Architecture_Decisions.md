# Registro de Decisiones de Arquitectura (ADR)

## ADR-001: Eliminación del Límite Duro de Partidas Simultáneas

### Contexto (ADR-001)

Inicialmente, el sistema imponía un límite duro (`MAX_ACTIVE_PLAYS`) en el número de partidas que podían ocurrir simultáneamente. Si se alcanzaba este límite, el servidor rechazaba nuevas conexiones de juego devolviendo un error.

El objetivo de este límite era proteger los recursos del servidor (memoria, CPU, conexiones de base de datos) ante picos de tráfico. Sin embargo, en la fase actual de despliegue y uso (clases controladas), este límite resultaba artificial y podía bloquear lecciones legítimas innecesariamente.

### Decisión (ADR-001)

Se ha decidido **eliminar el bloqueo duro** para nuevas partidas.

1. La variable `ACTIVE_PLAYS_WARNING_THRESHOLD` (antes `MAX_ACTIVE_PLAYS`) se mantiene como un **umbral de monitorización** (Soft Limit).
2. Si se supera el umbral, el sistema **permite** crear la partida, pero registra un **WARNING** en los logs.
3. Se confía en la monitorización externa y alertas (Sentry/Logs) para detectar saturación real.

### Posibles Impactos

#### 1. Rendimiento y Recursos (Memoria/CPU)

- **Impacto**: Al no haber límite, un número masivo de partidas podría agotar la memoria del servidor (Heap de Node.js) o saturar el Event Loop.
- **Mitigación**:
  - Cada estado de partida en `gameEngine` es relativamente ligero (~Kb).
  - Node.js maneja bien miles de objetos en memoria.
  - Se mantiene el `cleanupInterval` para eliminar partidas abandonadas y evitar fugas de memoria.

#### 2. Conexiones a Base de Datos

- **Impacto**: Cada partida genera eventos y escrituras. Un exceso de concurrencia podría saturar el pool de conexiones de MongoDB.
- **Mitigación**: Mongoose gestiona un pool de conexiones (default 5-10). Las peticiones se encolarán si el pool se agota, aumentando la latencia pero no tirando el servidor inmediatamente.

#### 3. Experiencia de Usuario

- **Positivo**: No habrá rechazos arbitrarios de servicio durante una clase.
- **Negativo (Riesgo)**: Si el servidor se satura realmente, todos los usuarios experimentarán lentitud (lag) en lugar de que solo los nuevos sean rechazados. Se prefiere degradación de servicio a denegación de servicio en este contexto educativo.

### Estado Futuro

Si el sistema escala a producción masiva, se deberá reimplementar un rate-limiting más inteligente (ej. por IP o por Tenant) o escalar horizontalmente el backend (lo cual requeriría migrar el estado en memoria de `gameEngine` totalmente a Redis).

---

## ADR-002: Autenticación Obligatoria en WebSockets y Desconexión por Invalidez

### Contexto (ADR-002)

Los eventos Socket.IO permiten controlar partidas y emitir escaneos RFID en tiempo real. Sin una autenticación obligatoria en el handshake y sin revocación activa, un socket podría continuar enviando eventos incluso después de que la cuenta sea inhabilitada o se inicie sesión en otro dispositivo.

### Decisión (ADR-002)

Se establece autenticación obligatoria en el handshake de Socket.IO, con validación de:

1. Token JWT (access token) desde `auth.token` o header `Authorization`.
2. Estado de cuenta (`active`) y aprobación (`approved` para docentes).
3. Single-session (el `sid` del token debe coincidir con `currentSessionId`).

Además, cuando una sesión se invalida (nuevo login) o la cuenta se desactiva/rechaza, se emite `session_invalidated` y se **desconectan** los sockets activos del usuario.

### Consecuencias (ADR-002)

- **Seguridad mejorada**: evita control de partidas o lecturas RFID desde sesiones inválidas.
- **Coherencia de sesión**: garantiza que el canal en tiempo real respete single-session.
- **Coste aceptable**: se añade una consulta de usuario en el handshake, asumible por volumen de conexiones.

---

## ADR-003: Capa de DTOs v1 y Contrato de Respuestas

### Contexto (ADR-003)

Las respuestas de la API mezclaban documentos Mongoose crudos con DTOs parciales. Esto exponía campos internos (`__v`) y creaba inconsistencias en la paginación (a veces anidada, a veces top-level). Además, algunos endpoints devolvían estructuras pesadas (por ejemplo `events` completos en listados), afectando rendimiento y seguridad.

### Decisión (ADR-003)

Se adopta una **capa de DTOs v1** como funciones puras y se define un **contrato de respuestas uniforme**:

1. **DTOs v1 como funciones puras** (sin clases): simples, testeables y fáciles de reutilizar.
2. **Resumen vs detalle** para entidades con payload pesado:
   - `GamePlay`: resumen sin `events` en listados, detalle con `events` en consulta individual.
   - `GameSession`: resumen sin `cardMappings`, detalle con mappings completos.
   - `GameContext` y `CardDeck`: resumen con contadores, detalle con assets/mappings.
3. **Paginación consistente top-level** con `data` y `pagination` (sin legacy).
4. **DTOs específicos de analytics por endpoint** para claridad semántica y estabilidad.
5. **Omisión explícita de campos sensibles** (password, `__v`, tokens internos, datos de infraestructura).
6. **Versión interna**: el sufijo `V1` solo existe en funciones internas, no en el payload.
7. **Sin compatibilidad legacy**: los clientes deben usar la última versión de la API.

### Contrato de Respuestas (v1)

#### 1. Respuesta de listado paginado

- **Formato**:
  - `data`: array de elementos DTO v1
  - `pagination`: objeto con metadatos

Campos obligatorios en `pagination`:

- `page` (number)
- `limit` (number)
- `total` (number)
- `totalPages` (number)
- `hasNext` (boolean)
- `hasPrev` (boolean)

#### 2. Respuesta de listado no paginado

- **Formato**:
  - `data`: array de elementos DTO v1
  - `meta`: objeto con `count`

#### 3. Respuesta de recurso único

- **Formato**:
  - `data`: objeto DTO v1

#### 4. Campos omitidos por seguridad

- `password`
- `__v`
- tokens internos (por ejemplo `_internal` de refresh tokens)
- datos internos de infraestructura no requeridos por el cliente

#### 5. Campos opcionales

- Los campos opcionales se omiten cuando no aplican (no se envían como `null`).

### Mapeo Endpoint → DTO (v1)

#### Auth

- `POST /api/auth/register` → `toUserDTOV1`
- `POST /api/auth/login` → `toAuthResponseDTOV1`
- `GET /api/auth/me` → `toUserDTOV1`
- `PUT /api/auth/me` → `toUserDTOV1`

#### Users

- `GET /api/users` → `toUserListDTOV1` + `toPaginatedDTOV1`
- `GET /api/users/:id` → `toUserDTOV1` o `toStudentDTOV1`
- `POST /api/users` → `toStudentDTOV1`
- `PUT /api/users/:id` → `toUserDTOV1` o `toStudentDTOV1`
- `POST /api/users/:id/transfer` → `toStudentDTOV1`
- `GET /api/users/:id/stats` → `toUserStatsDTOV1`
- `GET /api/users/teacher/:teacherId/students` → `toUserListDTOV1` + `meta.count`

#### Cards

- `GET /api/cards` → `toCardListDTOV1` + `toPaginatedDTOV1`
- `GET /api/cards/:id` → `toCardDTOV1`
- `POST /api/cards` → `toCardDTOV1`
- `PUT /api/cards/:id` → `toCardDTOV1`
- `POST /api/cards/batch` → `toCardListDTOV1`
- `GET /api/cards/stats` → `toCardStatsDTOV1`

#### Mechanics

- `GET /api/mechanics` → `toGameMechanicListDTOV1` + `toPaginatedDTOV1`
- `GET /api/mechanics/:id` → `toGameMechanicDTOV1`
- `POST /api/mechanics` → `toGameMechanicDTOV1`
- `PUT /api/mechanics/:id` → `toGameMechanicDTOV1`
- `GET /api/mechanics/active` → `toGameMechanicListDTOV1` + `meta.count`

#### Contexts

- `GET /api/contexts` → `toGameContextListDTOV1` + `toPaginatedDTOV1`
- `GET /api/contexts/:id` → `toGameContextDetailDTOV1`
- `POST /api/contexts` → `toGameContextDetailDTOV1`
- `PUT /api/contexts/:id` → `toGameContextDetailDTOV1`
- `POST /api/contexts/:id/assets` → `toGameContextDetailDTOV1`
- `DELETE /api/contexts/:id/assets/:assetKey` → `toGameContextDetailDTOV1`
- `GET /api/contexts/:id/assets` → `toGameContextDetailDTOV1` + `count`

#### Decks

- `GET /api/decks` → `toCardDeckListDTOV1` + `toPaginatedDTOV1`
- `GET /api/decks/:id` → `toCardDeckDetailDTOV1`
- `POST /api/decks` → `toCardDeckDetailDTOV1`
- `PUT /api/decks/:id` → `toCardDeckDetailDTOV1`

#### Sessions

- `GET /api/sessions` → `toGameSessionListDTOV1` + `toPaginatedDTOV1`
- `GET /api/sessions/:id` → `toGameSessionDetailDTOV1`
- `POST /api/sessions` → `toGameSessionDetailDTOV1`
- `PUT /api/sessions/:id` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/start` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/pause` → `toGameSessionDetailDTOV1`
- `POST /api/sessions/:id/end` → `toGameSessionDetailDTOV1`

#### Plays

- `GET /api/plays` → `toGamePlayListDTOV1` + `toPaginatedDTOV1`
- `GET /api/plays/:id` → `toGamePlayDetailDTOV1`
- `POST /api/plays` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/events` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/complete` → `toGamePlayDetailDTOV1` + `rating`
- `POST /api/plays/:id/abandon` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/pause` → `toGamePlayDetailDTOV1`
- `POST /api/plays/:id/resume` → `toGamePlayDetailDTOV1`
- `GET /api/plays/stats/:playerId` → `toPlayerStatsDTOV1`

#### Sistema

- `GET /api/metrics` → `toSystemMetricsDTOV1` (sin envelope `success`)

### Consecuencias (ADR-003)

- **Seguridad mejorada**: se eliminan campos sensibles de las respuestas.
- **Consistencia**: el frontend no necesita manejar variantes de paginación.
- **Rendimiento**: listas más ligeras (sin eventos/mappings completos).
- **Mantenibilidad**: DTOs v1 centralizados y testeados.

---

## ADR-004: Locks distribuidos de UIDs con lease TTL + heartbeat

### Contexto (ADR-004)

El `gameEngine` mantiene estado en memoria (`activePlays`, `cardUidToPlayId`) pero el despliegue puede ejecutarse en más de una instancia del backend. Sin un lock distribuido, dos instancias podrían reservar el mismo UID de tarjeta para partidas distintas.

### Decisión (ADR-004)

1. Reservar UIDs en Redis usando claim atómico `SET NX`.
2. Asignar TTL a claves activas (`GAME_ENGINE_LOCK_TTL_SECONDS`, default 90s).
3. Renovar leases con heartbeat periódico (`GAME_ENGINE_LOCK_HEARTBEAT_MS`, default 30000ms).
4. Liberar/renovar claves de tarjeta solo si el owner coincide (`value === playId`) para evitar sobrescrituras entre instancias.

### Consecuencias (ADR-004)

- **Consistencia multi-instancia**: evita colisiones simultáneas de tarjetas.
- **Autorecuperación**: locks huérfanos expiran si una instancia cae.
- **Complejidad controlada**: se mantiene el core stateful local con coordinación ligera en Redis.

---

## ADR-005: Persistencia atómica de eventos de partida

### Contexto (ADR-005)

El flujo de ronda realizaba múltiples escrituras por iteración (`round_start`, resultado, avance de ronda), incrementando write amplification y superficie de inconsistencias bajo carga.

### Decisión (ADR-005)

1. Introducir `GamePlay.addEventAtomic` con update único (`$push + $inc + $slice`).
2. Persistir resultado de ronda y avance de `currentRound` en la misma operación.
3. Desactivar por defecto la persistencia de `round_start` para priorizar throughput (`PERSIST_ROUND_START_EVENTS=false`).
4. Contabilizar `metrics.totalAttempts` solo para eventos de respuesta (`correct`, `error`, `timeout`).

### Consecuencias (ADR-005)

- **Menos escrituras por ronda** en flujos normales.
- **Mejor coherencia** entre score/métricas/ronda por operación atómica.
- **Trazabilidad configurable**: se puede reactivar `round_start` cuando se requiera auditoría más granular.

---

## ADR-006: Lectura de sesiones sin mutación + caché de ownership por capas

### Contexto (ADR-006)

Los endpoints de consulta de sesiones y comandos socket de control mostraban sobrecoste evitable en lectura:

1. Hidratación Mongoose completa en rutas read-heavy donde no se requiere mutación.
2. Revalidaciones de ownership repetidas en comandos consecutivos del mismo socket/play.

### Decisión (ADR-006)

1. Estandarizar consultas de lectura de sesión con `lean` en endpoints `GET /api/sessions` y `GET /api/sessions/:id`.
2. Mantener contrato estricto read-only: ningún endpoint `GET` de sesión ejecuta persistencia (`save`) como side-effect.
3. Implementar caché de ownership en dos niveles para comandos socket:
  - Nivel global TTL (`userId + role + playId + mode`) para reutilización transversal.
  - Nivel local por socket para comandos consecutivos del mismo cliente.
4. Mantener `start_play` con ruta full-runtime (`includeSessionRuntime=true`) para preservar inicialización completa del motor de juego.

### Consecuencias (ADR-006)

- **Menor overhead de lectura** en consultas de sesiones al evitar hidratación innecesaria.
- **Menos consultas redundantes** de ownership en secuencias de comandos socket.
- **Mayor mantenibilidad** al separar claramente rutas de lectura ligera y rutas que requieren contexto runtime completo.

---

## ADR-007: Security Gate de dependencias en CI (runtime bloqueante)

### Contexto (ADR-007)

Tras la actualización masiva de dependencias, `npm audit` completo empezó a reportar vulnerabilidades en cadenas de tooling (lint/test/build) cuya mitigación forzada mediante overrides globales podía romper `eslint` o `jest` por incompatibilidades de API.

Se necesitaba una política que equilibrara seguridad efectiva en producción y estabilidad del ciclo de desarrollo.

### Decisión (ADR-007)

1. Definir un **gate bloqueante** en CI para dependencias de runtime:
  - Comando: `npm run audit:prod`
  - Alcance: backend + frontend con `--omit=dev`.
2. Mantener un **reporte completo no bloqueante** para deuda de tooling:
  - Comando: `npm run audit:all`
  - Configuración CI: `continue-on-error: true`.
3. Documentar explícitamente que las vulnerabilidades de dev tooling se tratan por roadmap de compatibilidad, no por overrides agresivos que comprometan estabilidad.
4. Establecer una revisión operativa **mensual** de dependencias y PRs de Dependabot.
5. No usar registro formal de excepciones; el control de deuda se realiza mediante revisión mensual + evidencia en CI.

### Consecuencias (ADR-007)

- **Seguridad de producción priorizada**: el merge queda condicionado a 0 vulnerabilidades runtime.
- **Estabilidad de desarrollo preservada**: lint/tests no se rompen por forzar resoluciones transitorias incompatibles.
- **Trazabilidad operativa**: la deuda de tooling sigue visible en CI y documentación para su remediación gradual.
- **Disciplina de mantenimiento**: la cadencia mensual reduce carga operativa sin bloquear flujo diario.

### Referencias (ADR-007)

- Workflow CI: `.github/workflows/build.yml`
- Scripts root: `package.json` (`audit:prod`, `audit:all`)
- Política arquitectónica: `documentation/02-Patrones_Diseno.md`
- Plan operativo: `documentation/03-Gestion_Dependencias.md`

---

## ADR-008: Gobierno de identidades centrado en Super Admin + contrato paginado explícito FE/BE

### Contexto (ADR-008)

Durante la revisión de seguridad y calidad se detectó una tensión clásica entre usabilidad operativa y control de privilegios:

1. Parte de la documentación histórica asumía que `teacher` podía gestionar identidad de alumnos.
2. El código actual evolucionó a un modelo más estricto donde `super_admin` concentra acciones críticas.
3. Existía riesgo de regresión en frontend al consumir respuestas paginadas (`data + pagination`) de forma inconsistente.

En términos de TFG, esto impacta directamente en trazabilidad de decisiones, evidencia de diseño seguro y coherencia entre especificación y ejecución.

### Decisión (ADR-008)

Se formaliza el modelo de gobierno vigente con dos líneas de decisión:

1. **Identidad crítica centralizada en `super_admin`**
  - Crear/editar/eliminar alumnos: `super_admin`.
  - Transferir alumnos entre docentes: `super_admin`.
  - Aprobar/rechazar docentes: `super_admin` y solo desde `pending_approval`.

2. **Contrato paginado FE/BE explícito en docs y consumo frontend**
  - Endpoints paginados responden con `data` y `pagination` al mismo nivel.
  - Frontend consume el envelope completo para no perder metadatos de paginación.

### Alternativas consideradas

#### A) Permitir gestión de alumnos por `teacher`

- **Ventaja**: menor dependencia del rol administrativo.
- **Desventaja**: mayor superficie de abuso y difuminación de responsabilidades.
- **Motivo de descarte**: no encaja con el objetivo de control administrativo fuerte del dominio educativo.

#### B) Unificar transferencia de alumno dentro de `PUT /users/:id`

- **Ventaja**: menos endpoints.
- **Desventaja**: mezcla semántica entre actualización de perfil y cambio de custodia pedagógica.
- **Motivo de descarte**: pérdida de claridad auditiva y mayor riesgo de cambios laterales de ownership.

### Consecuencias positivas

1. **Seguridad**: minimiza escalada horizontal de privilegios en operaciones sensibles.
2. **Auditoría**: decisiones críticas quedan concentradas y rastreables.
3. **Mantenibilidad**: separa operaciones de “perfil” y “custodia” en contratos distintos.
4. **Robustez frontend**: evita bugs por parseo parcial de respuestas paginadas.

### Trade-offs asumidos

1. **Mayor carga operativa para `super_admin`** en centros con alta rotación de alumnado.
2. **Más pasos administrativos** frente a un modelo delegado al docente.

Se acepta este trade-off por priorizar control, seguridad y trazabilidad institucional.

### Evidencia técnica asociada

- Rutas: `backend/src/routes/admin.js`, `backend/src/routes/users.js`.
- Controladores: `backend/src/controllers/adminController.js`, `backend/src/controllers/userController.js`.
- Validación: `backend/src/validators/userValidator.js`.
- Frontend admin: `frontend/src/pages/admin/ApprovalPanel.jsx`, `frontend/src/pages/admin/StudentManagement.jsx`.
- Tests de contrato y permisos: `backend/tests/superAdminApproval.test.js`, `backend/tests/users.test.js`.
