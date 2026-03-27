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

#### Cards (eliminado — ver ADR-012)

Los endpoints `/api/cards` fueron eliminados. Las tarjetas RFID se tratan como tokens fungibles sin registro en BD. Se eliminaron los DTOs: `toCardDTOV1`, `toCardListDTOV1`, `toCardStatsDTOV1`.

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

### Contexto (ADR-013)

Tras la actualización masiva de dependencias, `npm audit` completo empezó a reportar vulnerabilidades en cadenas de tooling (lint/test/build) cuya mitigación forzada mediante overrides globales podía romper `eslint` o `jest` por incompatibilidades de API.

Se necesitaba una política que equilibrara seguridad efectiva en producción y estabilidad del ciclo de desarrollo.

### Decisión (ADR-013)

1. Definir un **gate bloqueante** en CI para dependencias de runtime:
  - Comando: `npm run audit:prod`
  - Alcance: backend + frontend con `--omit=dev`.
2. Mantener un **reporte completo no bloqueante** para deuda de tooling:
  - Comando: `npm run audit:all`
  - Configuración CI: `continue-on-error: true`.
3. Documentar explícitamente que las vulnerabilidades de dev tooling se tratan por roadmap de compatibilidad, no por overrides agresivos que comprometan estabilidad.
4. Establecer una revisión operativa **mensual** de dependencias y PRs de Dependabot.
5. No usar registro formal de excepciones; el control de deuda se realiza mediante revisión mensual + evidencia en CI.

### Consecuencias (ADR-013)

- **Seguridad de producción priorizada**: el merge queda condicionado a 0 vulnerabilidades runtime.
- **Estabilidad de desarrollo preservada**: lint/tests no se rompen por forzar resoluciones transitorias incompatibles.
- **Trazabilidad operativa**: la deuda de tooling sigue visible en CI y documentación para su remediación gradual.
- **Disciplina de mantenimiento**: la cadencia mensual reduce carga operativa sin bloquear flujo diario.

### Referencias (ADR-013)

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

---

## ADR-009: Campo `data` en errores operacionales (AppError)

### Contexto (ADR-009)

Algunos controllers (`userController.js`) necesitaban incluir datos adicionales en respuestas de error (por ejemplo, la entidad existente en un conflicto 409 para que el frontend pueda mostrarla al usuario). Al no existir un mecanismo en `AppError` para transportar datos extra, estos controllers devolvían respuestas inline (`res.status(409).json(...)`) que bypasseaban el error handler centralizado, creando inconsistencias en el formato de respuestas de error y dificultando la observabilidad (logs, Sentry).

### Decisión (ADR-009)

Se extiende `AppError` con un campo opcional `data`:

1. `AppError.constructor(message, statusCode, data = null)` acepta un tercer parámetro opcional.
2. Las subclases `ConflictError` y `ValidationError` propagan `data` como segundo argumento.
3. El `errorHandler` middleware incluye `data` en la respuesta JSON cuando está presente.
4. Los controllers que antes devolvían respuestas inline ahora lanzan errores tipados con `data`.

### Consecuencias (ADR-009)

- **Consistencia**: todas las respuestas de error pasan por el error handler centralizado.
- **Observabilidad mejorada**: todos los errores se loguean y reportan a Sentry uniformemente.
- **Compatibilidad**: el campo `data` es opcional; los errores existentes sin datos extra no se ven afectados.
- **Contrato de API extendido**: las respuestas de error pueden incluir un campo `data` opcional con contexto adicional.

### Evidencia técnica asociada (ADR-009)

- `backend/src/utils/errors.js` — campo `data` en `AppError`, `ConflictError`, `ValidationError`
- `backend/src/middlewares/errorHandler.js` — propagación de `data` en respuesta
- `backend/src/controllers/userController.js` — 5 respuestas inline migradas a errores tipados

---

## ADR-010: Checkpoints periódicos de partida y resiliencia ante crash

### Contexto (ADR-010)

El `gameEngine` mantiene el estado completo de cada partida activa en memoria: score, ronda actual, challenge, timers, y la referencia al documento Mongoose de `GamePlay`. Durante el ciclo de vida de una partida (entre `startPlay()` y `endPlay()`), los eventos de juego se persisten individualmente en MongoDB mediante `addEventAtomic()`, pero el **estado global de la partida** (score acumulado, métricas, arrays de eventos consolidados) solo se escribía en MongoDB al finalizar la partida.

Redis almacenaba un snapshot básico del estado (ronda, score, status, flags de pausa) que se sincronizaba tras cada evento, pero **no incluía** el array de eventos ni las métricas detalladas del documento `GamePlay`.

#### Análisis de riesgo

Si el servidor se reiniciaba o crasheaba durante una partida activa:

1. **Pérdida total de progreso**: todos los eventos acumulados, el score, y las métricas de la partida se perdían porque el documento Mongoose solo existía en memoria. La única información recuperable era el snapshot parcial de Redis (ronda y score numérico) que no incluía el historial de eventos.
2. **Experiencia del estudiante**: el alumno perdía todo el trabajo realizado sin posibilidad de recuperación, generando frustración y desconfianza en la plataforma.
3. **Percepción del docente**: el profesor veía desaparecer los datos de progreso de sus alumnos, afectando la credibilidad del sistema como herramienta de evaluación.
4. **Timers huérfanos**: existía un problema adicional con timers transitorios (como el delay de ocultación de cartas en modo memory). Si `endPlay()` o `pausePlay()` se ejecutaban mientras un `setTimeout` anónimo estaba pendiente, el callback podía dispararse sobre estado ya eliminado, causando errores silenciosos o comportamiento errático.
5. **Reconexión del cliente**: si el cliente perdía la conexión WebSocket y se reconectaba, no tenía un mecanismo explícito para solicitar y rehidratar el estado actual de la partida desde el servidor.

### Decisión (ADR-010)

Se implementa una estrategia de resiliencia en tres capas complementarias:

#### Capa 1: Checkpoints periódicos en MongoDB

Se introduce el método `checkpointPlayIfNeeded()` que se invoca automáticamente después de cada `addEventAtomic()`. Este método persiste el documento `GamePlay` completo (incluyendo `events`, `metrics`, `score`) en MongoDB cuando se cumple **cualquiera** de dos umbrales:

- **Umbral temporal**: han transcurrido `CHECKPOINT_INTERVAL_MS` (default 120000ms = 2 minutos) desde el último checkpoint.
- **Umbral por eventos**: se han acumulado `CHECKPOINT_EVENT_THRESHOLD` (default 5) nuevos eventos de respuesta (`totalAttempts`) desde el último checkpoint.

Cada checkpoint también sincroniza el estado con Redis (`syncPlayToRedis`).

El estado de checkpoint se rastrea en el `playState`:

- `lastCheckpointAt`: timestamp del último checkpoint exitoso.
- `lastCheckpointEventCount`: valor de `metrics.totalAttempts` en el último checkpoint.

#### Capa 2: Tracking de timers transitorios

Se añade un `Set` llamado `transientTimers` al `playState` de cada partida. El helper `scheduleTransientTimer(playState, callback, delayMs)` registra cada timer en el Set y lo auto-elimina al dispararse. `clearPlayTimers()` ahora también itera y limpia todos los timers transitorios registrados.

Esto resuelve el problema de callbacks anónimos que se disparaban sobre estado ya eliminado en `endPlay()`, `pausePlay()` o `resumePlay()`.

#### Capa 3: Sincronización de estado tras reconexión del cliente

Se implementa un nuevo comando Socket.IO `play_state_sync` (archivo `PlayStateSyncCommand.js`) que permite al cliente solicitar un snapshot completo del estado de la partida tras reconexión. El servidor utiliza `gameEngine.getPlayState(playId)` para devolver el estado actual.

En el frontend:

- El servicio de socket (`socket.js`) aumenta `reconnectionAttempts` de 5 a 15 y `reconnectionDelayMax` de 5s a 15s para tolerar mejor las desconexiones transitorias.
- Se añade el método `requestPlayStateSync(playId)`.
- Se emite un `CustomEvent('socket_reconnected')` en `window` al detectar reconexión.
- `GameSession.jsx` escucha este evento y solicita automáticamente el estado actualizado de la partida.

### Consecuencias (ADR-010)

#### Positivas

- **Ventana de pérdida de datos reducida**: de "toda la partida" a un máximo de 2 minutos o 5 eventos.
- **Limpieza de timers garantizada**: `endPlay()` y `pausePlay()` cancelan todos los timers pendientes, incluyendo los transitorios, eliminando callbacks sobre estado stale.
- **Reconexión transparente**: el alumno puede perder la conexión WebSocket y recuperar el estado de la partida automáticamente al reconectarse, sin intervención manual.
- **Compatibilidad con infraestructura existente**: los checkpoints usan el mismo `playDoc.save()` y `syncPlayToRedis()` que ya existían; no requieren nuevos modelos ni esquemas.

#### Negativas

- **Write amplification leve**: se añade ~1 escritura adicional a MongoDB cada 2 minutos por partida activa. En un escenario típico de 20 partidas simultáneas, esto equivale a ~10 writes/minuto adicionales, un overhead negligible para MongoDB.
- **Complejidad de estado**: se añaden 4 nuevos campos al `playState` (`lastCheckpointAt`, `lastCheckpointEventCount`, `transientTimers`, y el tracking de reconexión en frontend).

### Configuración (ADR-010)

| Variable de entorno | Default | Descripción |
|---|---|---|
| `CHECKPOINT_INTERVAL_MS` | `120000` (2 min) | Intervalo mínimo entre checkpoints |
| `CHECKPOINT_EVENT_THRESHOLD` | `5` | Eventos de respuesta acumulados antes de forzar checkpoint |

Ambos valores se pueden ajustar por entorno. Para entornos de producción de alta fiabilidad se pueden reducir (e.g., 60000ms y 3 eventos). Para entornos de desarrollo se pueden aumentar o desactivar elevando los umbrales.

### Evidencia técnica asociada (ADR-010)

- `backend/src/services/gameEngine.js` — `checkpointPlayIfNeeded()`, `scheduleTransientTimer()`, `clearPlayTimers()`, constantes `CHECKPOINT_INTERVAL_MS` y `CHECKPOINT_EVENT_THRESHOLD`
- `backend/src/commands/socket/PlayStateSyncCommand.js` — comando `play_state_sync`
- `backend/src/config/socketRateLimits.js` — rate limit de `play_state_sync` (1s, max 2)
- `frontend/src/services/socket.js` — `requestPlayStateSync()`, `CustomEvent('socket_reconnected')`
- `frontend/src/pages/GameSession.jsx` — listener de reconexión y rehidratación de estado

### Relación con otros ADRs

- **ADR-005** (Persistencia atómica de eventos): los checkpoints se invocan después de cada `addEventAtomic()`, complementando la persistencia por-evento con persistencia del estado global.
- **ADR-004** (Locks distribuidos): los checkpoints también sincronizan con Redis, manteniendo coherencia con el snapshot de estado distribuido.

---

## ADR-011: Socket.IO Redis Adapter para escalabilidad horizontal

### Contexto (ADR-011)

Socket.IO utiliza por defecto un adapter **in-memory** para gestionar rooms y broadcasts. Esto significa que cuando el servidor emite un evento a una room (e.g., `io.to('play_123').emit('new_round', ...)`), solo los sockets conectados a **esa misma instancia** del proceso Node.js reciben el evento.

En un despliegue con una única instancia del backend, esto no presenta problemas. Sin embargo, cuando se despliegan múltiples instancias detrás de un load balancer (escalamiento horizontal), dos clientes conectados a instancias diferentes no comparten rooms ni broadcasts, rompiendo toda la funcionalidad en tiempo real: los eventos de juego, las notificaciones RFID y la invalidación de sesiones dejan de funcionar correctamente.

Este problema ya se anticipaba en el **ADR-001** (sección "Estado Futuro"):

> *"Si el sistema escala a producción masiva [...] escalar horizontalmente el backend (lo cual requeriría migrar el estado en memoria de `gameEngine` totalmente a Redis)."*

Si bien la migración completa del `gameEngine` a Redis sigue pendiente, el problema más inmediato — rooms y broadcasts particionados por instancia — se resuelve con el Redis adapter para Socket.IO.

### Decisión (ADR-011)

Se instala `@socket.io/redis-adapter` y se configura **condicionalmente** durante la inicialización del servidor:

1. **Si Redis está disponible**: se crean dos conexiones Redis duplicadas (`pubClient` y `subClient`) a partir de la conexión existente (`getRedis().duplicate()`) y se configura el adapter con `createAdapter(pubClient, subClient)`.
2. **Si Redis no está disponible** (e.g., desarrollo local sin Redis, tests): se mantiene el adapter in-memory por defecto, sin error ni degradación funcional para escenarios de una sola instancia.

La configuración se realiza en `server.js` dentro de un bloque `try/catch` para garantizar que un fallo en la inicialización del adapter no impida el arranque del servidor.

### Funcionamiento técnico

El adapter funciona mediante **pub/sub de Redis**:

- Cuando una instancia emite a una room, el adapter **publica** el evento en un canal Redis.
- Todas las instancias que tienen sockets en esa room **reciben** la publicación y la reenvían a sus sockets locales.
- Este mecanismo es transparente para el código aplicativo: no se requiere ningún cambio en los event handlers, commands, ni en la lógica del `gameEngine`.

```
┌──────────────────────────────────────────────────────────────┐
│                     Load Balancer                            │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
     ┌─────────▼─────────┐       ┌─────────▼─────────┐
     │   Instancia A     │       │   Instancia B     │
     │ Socket.IO Server  │       │ Socket.IO Server  │
     │ (adapter Redis)   │       │ (adapter Redis)   │
     └─────────┬─────────┘       └─────────┬─────────┘
               │                           │
               │   ┌───────────────────┐   │
               └──►│   Redis (pub/sub) │◄──┘
                   │  Canal: socket.io │
                   └───────────────────┘
```

Cuando la instancia A ejecuta `io.to('play_123').emit('new_round', data)`:

1. El adapter publica `{ room: 'play_123', event: 'new_round', data }` en Redis.
2. La instancia B recibe la publicación y reenvía el evento a todos los sockets locales que estén en la room `play_123`.

### Diferencia con el uso existente de Redis

Es importante distinguir dos usos completamente independientes de Redis en la plataforma:

| Aspecto | Redis para datos (gameEngine) | Redis adapter (Socket.IO) |
|---|---|---|
| **Propósito** | Persistir estado de partidas, locks de UIDs, token blacklist | Coordinar rooms y broadcasts entre instancias |
| **Patrón** | `GET`/`SET`/`HSET`/`EVALSHA` (data store) | `PUBLISH`/`SUBSCRIBE` (mensajería) |
| **Conexiones** | 1 conexión principal (gestionada por `redisService`) | 2 conexiones adicionales (`pubClient` + `subClient`) |
| **Datos almacenados** | Sí (TTL/persistentes) | No (mensajes efímeros) |
| **Fallback si Redis cae** | Degradación controlada (ver `Arquitectura_Redis.md`) | Adapter in-memory (solo funciona single-instance) |

El adapter **no** lee ni escribe en las mismas keys que el `gameEngine`, `redisService` o el sistema de autenticación. Opera exclusivamente en canales pub/sub de Redis con prefijo propio de `@socket.io/redis-adapter`.

### Consecuencias (ADR-011)

#### Positivas

- **Escalabilidad horizontal habilitada**: múltiples instancias del backend pueden compartir rooms y broadcasts sin cambios en el código aplicativo.
- **Fallback seguro**: en entornos sin Redis (desarrollo, tests), el sistema funciona idénticamente con el adapter in-memory.
- **Preparación para producción**: resuelve el requisito anticipado en ADR-001 para el canal de comunicación en tiempo real.
- **Cero cambios en lógica de negocio**: los commands, handlers y el `gameEngine` no necesitan modificaciones.
- **Compatibilidad con arquitectura existente**: reutiliza la conexión Redis existente sin configuración adicional.

#### Negativas

- **2 conexiones Redis adicionales**: cada instancia del backend mantiene 2 conexiones extra (pub + sub). Con Upstash (tier gratuito: 1000 conexiones), esto es asumible para despliegues moderados.
- **Latencia marginal en broadcasts**: los eventos pasan por Redis antes de llegar al socket destino, añadiendo ~1-2ms de latencia. Imperceptible para la UX.
- **Dependencia parcial en Redis para multi-instancia**: si Redis cae en un despliegue multi-instancia, las rooms se particionan por instancia. Esto se mitiga con las capacidades de reconexión automática de ioredis.
- **No resuelve la migración completa del gameEngine**: el estado in-memory del motor de juego (`activePlays`, timers, locks) sigue siendo per-instancia. Para escalamiento horizontal completo del `gameEngine`, se necesitaría una arquitectura de sticky sessions o migración completa del estado a Redis (fuera del scope de este ADR).

### Evidencia técnica asociada (ADR-011)

- `backend/src/server.js` — configuración condicional del adapter en el bloque de inicialización de Socket.IO
- `backend/package.json` — dependencia `@socket.io/redis-adapter`
- `backend/src/config/redis.js` — `getRedis()` y `isRedisConnected()` usados para la inicialización

### Relación con otros ADRs

- **ADR-001** (Eliminación del límite duro): este ADR cumple parcialmente el "Estado Futuro" anticipado, habilitando la comunicación entre instancias sin migrar el `gameEngine` completo.
- **ADR-004** (Locks distribuidos): los locks de UIDs en Redis ya proporcionan coordinación de datos entre instancias; el adapter complementa con coordinación de eventos en tiempo real.
- **ADR-010** (Checkpoints periódicos): los checkpoints reducen la pérdida de datos si una instancia cae, complementando la resiliencia que el adapter aporta a la comunicación.

---

## ADR-012: Eliminación del modelo Card — Tarjetas RFID como tokens fungibles

### Contexto (ADR-012)

#### Situación actual

El sistema gestionaba las tarjetas RFID mediante un modelo `Card` en MongoDB que actuaba como registro centralizado. El flujo operativo requería tres pasos secuenciales:

1. **Registro por super_admin**: un administrador escaneaba cada tarjeta física y la registraba en la colección `Card` (uid, tipo MIFARE, estado).
2. **Creación de mazos por profesor**: el docente seleccionaba tarjetas *ya registradas* para construir un mazo (`CardDeck`), asociando cada UID a un valor semántico del contexto educativo.
3. **Gameplay por estudiantes**: durante el juego, el motor usaba Maps en memoria (`uid → mapping`) sin consultar la colección `Card`.

La validación crítica ocurría en el paso 2: `validateCardsExistAndActive()` exigía que cada tarjeta existiera en la colección `Card` con status `active`. Esto convertía al super_admin en cuello de botella obligatorio.

#### Limitaciones identificadas

El tutor del TFG identificó las siguientes limitaciones con este modelo durante la revisión del proyecto:

1. **Cuello de botella administrativo**: el super_admin debía escanear y registrar físicamente cada tarjeta antes de que cualquier profesor pudiera usarla. En un centro educativo con múltiples aulas y profesores, esto generaba dependencia innecesaria de un único rol administrativo.

2. **Fragilidad de los tokens físicos**: las tarjetas RFID son objetos físicos que se pierden, rompen, desgastan o desmagnetizan con frecuencia. Mantener un registro centralizado de ítems tan volátiles creaba gestión innecesaria: cada tarjeta perdida requería intervención del admin (marcar como `lost`, registrar el reemplazo).

3. **Fungibilidad inherente de las tarjetas**: una tarjeta RFID no tiene significado propio — su UID es un identificador opaco de 8 o 14 caracteres hexadecimales. El significado semántico (ej: "España", "5", "Rojo") lo asigna el profesor en el contexto del mazo. Dos tarjetas con UIDs distintos son funcionalmente intercambiables.

4. **Barrera de entrada para profesores**: un profesor nuevo que quisiera usar la plataforma no podía crear su primer mazo sin que el admin le proporcionara tarjetas pre-registradas. Esto ralentizaba la adopción y contradecía el objetivo de la plataforma: facilitar la integración de tecnología RFID en el aula.

5. **Redundancia del modelo**: el campo `uid` ya existía desnormalizado en `CardDeck.cardMappings` y `GameSession.cardMappings`. El modelo `Card` aportaba únicamente el campo `type` (tipo MIFARE) y `status`, ninguno de los cuales se utilizaba durante el gameplay ni en la lógica educativa.

#### Perspectiva pedagógica

Desde el punto de vista del uso educativo real de la plataforma:

- Los profesores necesitan **autonomía** para preparar actividades sin depender de personal técnico.
- Las tarjetas RFID son **material fungible de aula**, equivalentes a fichas, dados o tarjetas de cartulina — no activos de inventario que requieran control centralizado.
- La barrera entre "tengo las tarjetas físicas" y "puedo usarlas en clase" debe ser **mínima**: escanear y asignar, sin pasos previos de registro.
- En un entorno escolar real, las tarjetas se comparten entre clases, se mezclan entre kits, y se reemplazan con frecuencia. Un sistema rígido de registro no se adapta a esta realidad operativa.

### Decisión (ADR-012)

Se elimina completamente el modelo `Card` y todas sus dependencias. Las tarjetas RFID pasan a tratarse como **tokens fungibles**: cualquier tarjeta física compatible puede usarse directamente en la creación de mazos sin registro previo.

Cambios principales:

1. **Eliminar modelo Card**: colección, repositorio, controlador, rutas, validador y seeder.
2. **UID como único identificador**: el campo `cardId` (ObjectId, referencia a Card) se elimina de `CardDeck.cardMappings`, `GameSession.cardMappings`, `boardLayout` y `associationChallengePlan`. El `uid` (String, ya existente) pasa a ser el identificador primario.
3. **Validación simplificada**: se mantiene validación de formato de UID (8/14 hex, Zod schema) y unicidad dentro del mazo. Se elimina toda validación contra la colección Card.
4. **Asignación por escaneo en vivo**: el profesor entra en modo RFID de asignación (`CardAssignmentState`), selecciona un valor del contexto, y escanea la tarjeta física. El UID se captura automáticamente vía Web Serial.
5. **Eliminar gestión de cartas del panel admin**: se eliminan las páginas de CRUD de tarjetas del super_admin.

### Alternativas consideradas

#### A) Deprecación gradual

Hacer `cardId` opcional en los esquemas, eliminar la validación de existencia, y borrar Card en un sprint posterior.

- **Ventaja**: diffs más pequeños por iteración.
- **Desventaja**: código muerto, referencias fantasma, confusión para desarrolladores ("¿se usa cardId o no?"), dos pases de trabajo.
- **Motivo de descarte**: estamos en fase pre-1.0.0. La complejidad incremental no se justifica cuando podemos hacer el cambio limpio de una vez.

#### B) Auto-descubrimiento (Card como log automático)

Cada UID escaneado se registra automáticamente en una colección Card ligera, sin intervención del admin. Mantiene la referencia ObjectId de forma transparente.

- **Ventaja**: mantiene integridad referencial, permite tracking de uso.
- **Desventaja**: complejidad innecesaria, escrituras a BD en cada escaneo, no cumple con la directriz del tutor de "sin tracking".
- **Motivo de descarte**: el tutor determinó explícitamente que la gestión de tarjetas es innecesaria. Añadir una colección auto-poblada contradice esta decisión.

### Análisis de impacto

#### Lo que CAMBIA

| Capa | Archivos afectados | Cambio |
|------|-------------------|--------|
| Modelos | CardDeck.js, GameSession.js | Eliminar campo `cardId` de subdocumentos |
| Validadores | cardDeckValidator.js, gameSessionValidator.js | Eliminar `cardId` de schemas Zod |
| Controllers | cardDeckController.js, gameSessionController.js | Eliminar validación contra Card collection |
| Servicios | gameSessionService.js, sessionValidationHelpers.js | Cambiar lookups de cardId a uid |
| DTOs | dtos.js | Eliminar DTOs de Card, strip cardId de mappings |
| RFID States | states/rfid/index.js | Eliminar CardRegistrationState |
| Seeders | 02-cards.js (eliminar), 05-carddecks.js, 06-sessions.js | UIDs inline |
| API | server.js, routes/cards.js | Eliminar endpoint /api/cards |
| Frontend | api.js, DeckCreationWizard, DeckEditPage, admin pages | Eliminar cardsAPI, card management |
| Tests | ~12 archivos | Eliminar Card.create(), usar uid directo |

#### Lo que NO cambia

| Componente | Razón |
|-----------|-------|
| `gameEngine.js` | Ya usa Maps en memoria por uid, sin DB lookups durante gameplay |
| Redis distributed locking | Ya usa UIDs como keys, no cardIds |
| Web Serial service (frontend) | Ya lee UIDs del hardware RFID |
| `CardAssignmentState` | Se mantiene: necesario para escaneo durante creación de mazos |
| `uidSchema` (commonValidator) | Validación de formato (8/14 hex) sigue siendo necesaria |
| GamePlay model | No almacena cardId, usa uid en eventos |

### Consecuencias (ADR-012)

#### Positivas

1. **Autonomía del profesor**: puede crear mazos escaneando cualquier tarjeta física, sin esperar al admin.
2. **Eliminación del cuello de botella**: el super_admin ya no es requisito previo para la preparación de actividades.
3. **Resiliencia ante pérdida/rotura**: si una tarjeta se pierde, el profesor simplemente escanea otra para reemplazarla. Sin gestión administrativa.
4. **Simplificación del modelo de datos**: se elimina una entidad completa (Card) y su referencia en 4 sub-schemas, reduciendo complejidad y superficie de errores.
5. **Menor superficie de API**: se eliminan 6 endpoints (`/api/cards/*`), reduciendo mantenimiento y superficie de ataque.
6. **Coherencia arquitectónica**: el sistema deja de mantener una colección que no se consulta durante el gameplay (uso principal de la plataforma).

#### Negativas (trade-offs aceptados)

1. **Sin inventario de tarjetas**: el centro educativo pierde la capacidad de consultar cuántas tarjetas RFID tiene registradas. Se acepta porque: (a) las tarjetas son material fungible de bajo coste, y (b) un inventario físico fuera del sistema es más práctico.
2. **Sin detección de tipo MIFARE**: se pierde el tracking del tipo de tarjeta (MIFARE_1KB, 4KB, NTAG). Se acepta porque: (a) el tipo nunca se utilizó en la lógica del juego ni en la UI del profesor, y (b) Web Serial sigue detectando el tipo en el frontend si fuera necesario en el futuro.
3. **UIDs no validados contra registro central**: dos profesores podrían asignar la misma tarjeta física en mazos distintos sin advertencia. Se acepta porque: (a) es equivalente a compartir un dado entre dos juegos de mesa, (b) el Redis distributed locking ya previene conflictos en sesiones simultáneas (ADR-004).

### Implementación realizada (ADR-012)

#### Estrategia de implementación

La implementación se realizó en 6 fases secuenciales, siguiendo un orden de dependencias estricto que garantiza la integridad del sistema en cada etapa. Se priorizó la secuencialidad sobre el paralelismo porque cada fase modifica contratos de datos que las fases posteriores consumen: los esquemas Mongoose (Fase 1) definen la estructura que la lógica de negocio (Fase 2) manipula, que a su vez es la que los seeders (Fase 3) y tests (Fase 4) deben reproducir.

Este enfoque de "contrato hacia afuera" es consistente con la recomendación de Martin Fowler para refactorizaciones de modelos de datos en sistemas con múltiples capas de consumidores.

#### Fase 1 — Esquemas y validadores (fundación del cambio)

Se eliminó el campo `cardId` (ObjectId, ref a Card) de los subdocumentos de `CardDeck.cardMappings`, `GameSession.cardMappings`, `GameSession.boardLayout` y `GameSession.associationChallengePlan`. El `uid` (String) pasa a ser el único identificador de una tarjeta dentro del sistema.

Como mejora de ingeniería del software, se implementó **validación de defensa en profundidad** (defense-in-depth, patrón recomendado por OWASP) añadiendo un validador `match` con regex hexadecimal en los esquemas Mongoose que complementa la validación Zod existente en la boundary HTTP:

```javascript
uid: {
  type: String,
  required: true,
  uppercase: true,
  trim: true,
  match: [/^[0-9A-F]{8}$|^[0-9A-F]{14}$/, 'UID debe ser 8 o 14 caracteres hexadecimales']
}
```

La justificación es que la validación Zod protege la entrada HTTP, pero los seeders, scripts de migración y tests interactúan directamente con Mongoose sin pasar por la capa Zod. La validación a nivel de esquema garantiza integridad incluso en esos escenarios.

Adicionalmente, se añadió un validador Mongoose de unicidad de UIDs dentro de cada mazo en `CardDeck`, cerrando la posibilidad de corrupción de datos por bypass de la boundary HTTP.

Los validadores Zod de `cardDeckValidator.js` y `gameSessionValidator.js` se simplificaron: se eliminaron los campos `cardId: objectIdSchema` y los refinamientos de unicidad de cardId. La validación de unicidad de UIDs y assignedValues se mantuvo intacta, ya que es ortogonal al cambio de modelo.

**Archivos modificados:** `CardDeck.js`, `GameSession.js`, `cardDeckValidator.js`, `gameSessionValidator.js`

#### Fase 2 — Lógica de negocio y DTOs (propagación del cambio)

Esta fase eliminó toda la lógica que validaba la existencia de tarjetas contra la colección Card, y actualizó las estructuras de datos de respuesta (DTOs) para reflejar el nuevo modelo.

En `cardDeckController.js`, se eliminó la función `validateCardsExistAndActive()` de 30 líneas que realizaba tres queries al modelo Card: verificación de existencia, comprobación de estado activo, y validación de consistencia UID-cardId. Esta función representaba el cuello de botella principal del flujo anterior, ya que cada creación o actualización de mazo requería una consulta a la base de datos por cada tarjeta del mazo.

En `gameSessionService.js`, se eliminó el bloque análogo de validación contra la colección Card en `syncSessionFromDeck()`, que era responsable de sincronizar sesiones con sus mazos. El filtro de `boardLayout` cambió de `mappingCardIds` (basado en ObjectId) a `mappingUids` (basado en UID), lo que simplifica la lógica y elimina una dependencia del repositorio Card.

El cambio más delicado fue en `sessionValidationHelpers.js`, donde 6 funciones utilizaban Maps keyed por `cardId` para validar, normalizar y reparar boardLayouts y associationChallengePlans. Cada `mappingByCardId` se transformó en `mappingByUid`, y se eliminó el patrón de "doble resolución" (buscar primero por UID, luego por cardId como fallback) que existía como deuda técnica del modelo anterior.

Los DTOs de Card (`toCardDTOV1`, `toCardListDTOV1`, `toCardStatsDTOV1`) se eliminaron completamente. Los DTOs de mappings se simplificaron: `mapCardMappingDTOV1` pasó de retornar 6 campos (incluyendo `cardId` y un objeto `card` con populate) a retornar 4 campos (`id`, `uid`, `assignedValue`, `displayData`). Este cambio reduce el payload de red y simplifica el contrato de API.

**Archivos modificados:** `cardDeckController.js`, `gameSessionService.js`, `sessionValidationHelpers.js`, `gameSessionController.js`, `gameEngine.js`, `dtos.js`

#### Fase 3 — Eliminación de infraestructura y actualización de seeders

Se eliminaron 9 archivos del backend y 1 del frontend que constituían la infraestructura completa del modelo Card:

- **Capa de datos**: `Card.js` (modelo), `cardRepository.js` (repositorio)
- **Capa de API**: `cardController.js` (7 handlers CRUD), `cards.js` (rutas), `cardValidator.js` (schemas Zod)
- **Capa de estado RFID**: `CardRegistrationState.js` (máquina de estados), `JoinCardRegistrationCommand.js` y `LeaveCardRegistrationCommand.js` (comandos socket)
- **Datos de prueba**: `02-cards.js` (seeder)
- **UI de selección**: `CardSelector.jsx` (componente frontend)

Es importante notar que `CardAssignmentState`, `JoinCardAssignmentCommand` y `LeaveCardAssignmentCommand` se **mantuvieron** deliberadamente, ya que gestionan el flujo de escaneo RFID en vivo durante la creación de mazos — un flujo que sigue siendo necesario y funcional tras la refactorización.

Los seeders se actualizaron para generar UIDs sintéticos hex que simulan tarjetas RFID reales (formato MIFARE de 8 caracteres hexadecimales), eliminando la dependencia del seeder `02-cards.js` y el parámetro `cards` en las funciones de generación de mazos y sesiones.

Se creó un script de migración (`backend/scripts/migrate-remove-cardId.js`) idempotente con soporte `--dry-run` y logging estructurado con Pino, que permite limpiar bases de datos existentes realizando `$unset` del campo `cardId` en las colecciones `card_decks` y `game_sessions`, y opcionalmente dropeando la colección `cards`.

**Archivos eliminados:** 10 (9 backend + 1 frontend)
**Archivos modificados:** `server.js`, `states/rfid/index.js`, `commands/socket/index.js`, `realtime/socketHandlers.js`, `seeders/index.js`, `seeders/05-carddecks.js`, `seeders/06-sessions.js`
**Archivos creados:** `backend/scripts/migrate-remove-cardId.js`

#### Fase 4 — Actualización de tests

Se eliminó `cards.test.js` (test de CRUD de endpoints `/api/cards` que ya no existen) y se actualizaron 13 archivos de test.

Como mejora de ingeniería del software, se aplicó el **principio DRY** creando un helper centralizado `backend/tests/helpers/testFixtures.js` con la función `createTestCardMappings()`. Los 11 test files que antes duplicaban el patrón de crear documentos Card con `Card.create()` y usar `card._id` en mappings ahora utilizan este helper, que genera mappings con UIDs directos. Esto eliminó aproximadamente 40 líneas de código repetido por archivo y facilita el mantenimiento futuro: si el formato de los mappings cambia, solo hay que actualizar un archivo en lugar de 11.

La actualización de `validationEndpoints.test.js` eliminó 7 test cases de endpoints de Card, y `socketAuth.test.js` se actualizó para reemplazar referencias a `join_card_registration` por `join_card_assignment`.

**Archivos eliminados:** `cards.test.js`
**Archivos modificados:** 13 test files
**Archivos creados:** `backend/tests/helpers/testFixtures.js`

#### Fase 5 — Frontend

En el frontend, se eliminó el objeto `cardsAPI` de `api.js` (5 métodos de comunicación con `/api/cards`) y se reescribió `cardMapping.js` para usar `uid` como identificador primario. La función `normalizeCardMappingsFromDeck()` tenía una cadena de 4 niveles de fallback para resolver `cardId` (legado de múltiples iteraciones del backend), que se simplificó a una extracción directa de `mapping.uid`, reduciendo la complejidad ciclomática de la función.

Las páginas de mazos (`DeckCreationWizard.jsx`, `DeckEditPage.jsx`) se simplificaron al eliminar la carga de tarjetas pre-registradas via `cardsAPI.getCards()`. El componente `CardSelector.jsx` (que permitía seleccionar tarjetas de una lista cargada de la BD) se eliminó completamente, ya que el escaneo RFID en vivo via `RFIDScannerPanel` es ahora el único método de asignación de tarjetas.

Las páginas de sesiones (`CreateSession.jsx`, `SessionEdit.jsx`, `BoardSetup.jsx`, `GameSession.jsx`) se actualizaron para eliminar `cardId` de todos los objetos de mapping, layout y plan de asociación. Los parámetros de callbacks se renombraron de `cardId` a `uid` para reflejar la nueva semántica.

**Archivos eliminados:** `CardSelector.jsx`
**Archivos modificados:** `api.js`, `cardMapping.js`, `socket.js`, `DeckCreationWizard.jsx`, `DeckEditPage.jsx`, `CreateSession.jsx`, `SessionEdit.jsx`, `BoardSetup.jsx`, `GameSession.jsx`

#### Verificación de integridad del flujo RFID

Tras completar la implementación, se realizó una auditoría completa del flujo de comunicación RFID para verificar que la eliminación del modelo Card no introdujo regresiones en el canal de comunicación frontend ↔ backend.

La auditoría verificó la cadena completa: hardware ESP8266 → Web Serial API → `webSerialService.js` → Socket.IO (`rfid_scan_from_client`) → `socketHandlers.js` → `rfidService.js` → `gameEngine.js`. En ningún punto de esta cadena existía dependencia del modelo Card: el payload de escaneo (`{uid, type, sensorId, timestamp, source}`) se definió originalmente con `uid` como identificador primario, y el motor de juego (`gameEngine.js`) siempre utilizó Maps en memoria indexados por UID (`uidToMapping`, `cardUidToPlayId`) sin consultas a la base de datos durante el gameplay.

El contrato de validación entre frontend (payload emitido por `webSerialService`) y backend (schema `rfidClientEventSchema` en `rfidValidator.js`) se verificó campo por campo, confirmando una correspondencia exacta. El modo `CARD_ASSIGNMENT` de la máquina de estados RFID funciona correctamente sin el modelo Card, ya que su responsabilidad se limita a gestionar el estado del modo de escaneo y la pertenencia a rooms de Socket.IO.

#### Resultados de verificación

| Verificación | Resultado |
|---|---|
| `npm run lint` (backend) | 0 errores |
| `npm test` (backend) | 33 suites, 281 tests passed |
| `npm run lint` (frontend) | 0 errores |
| `npm test` (frontend) | 3 suites, 17 tests passed |
| `npm run build` (frontend) | Build exitoso |
| Referencias a `cardId` en backend/src | 0 (solo README.md) |
| Referencias a `cardId` en frontend/src | 0 |
| Flujo RFID end-to-end | Auditoría aprobada |

### Relación con otros ADRs

- **ADR-003** (DTOs): se eliminan `toCardDTOV1`, `toCardListDTOV1`, `toCardStatsDTOV1`. Se actualizan `mapCardMappingDTOV1` y DTOs de boardLayout/associationPlan. Se eliminan los endpoints de Cards del mapeo Endpoint → DTO.
- **ADR-004** (Locks distribuidos de UIDs): los locks ya usan UIDs como keys, no cardIds. Esta decisión valida retroactivamente la elección de ADR-004 de usar UIDs directamente.
- **ADR-008** (Gobierno de identidades): el super_admin pierde la responsabilidad de gestionar tarjetas, lo que simplifica su carga operativa y refuerza el foco en gestión de identidades.

---

## ADR-013: Flujo de Errores HTTP Centralizado

### Contexto (ADR-013)

La auditoría del Sprint 5 identificó **8 puntos** en el backend donde los errores HTTP se respondían directamente al cliente (`res.status().json()`) saltándose el `errorHandler` centralizado:

- **3 en `middlewares/validation.js`**: Los middlewares `validateBody`, `validateQuery` y `validateParams` capturaban `ZodError` y respondían con `res.status(400).json(...)` directamente.
- **1 en `middlewares/securityPayloadGuard.js`**: Respondía `res.status(400).json(...)` ante payloads peligrosos (NoSQL injection, prototype pollution).
- **4 en `config/security.js` (csrfProtection)**: Respondía `res.status(403).json(...)` directamente ante errores de CSRF/Referer.
- **1 en `middlewares/errorHandler.js` (notFoundHandler)**: Respondía `res.status(404).json(...)` directamente para rutas no encontradas.

Además se identificaron dos problemas adicionales:

1. **Bug del spread-operator**: `errorHandler` usaba `let error = { ...err }` que creaba un objeto plano, perdiendo la cadena de prototipos (`name`, `isOperational`, `data`, `errors`) de las clases de error personalizadas.
2. **Doble-captura en Sentry**: `Sentry.Handlers.errorHandler()` capturaba TODOS los errores que le llegaban, Y nuestro `errorHandler` llamaba manualmente `Sentry.captureException()` para errores 500. Resultado: errores 500 se capturaban dos veces.
3. **Boilerplate try/catch**: Los 11 controllers (~73 handlers) repetían manualmente `try { ... } catch (error) { next(error); }`, cuando Express 5.x maneja errores async nativamente.

### Decisión (ADR-013)

Se unifica **todo** el flujo de errores HTTP a través del `errorHandler` centralizado, con las siguientes medidas:

1. **Middleware de validación**: Los 3 middlewares Zod ahora construyen `ApiValidationError` con el array de errores formateados y lo delegan via `next(error)`.

2. **Security payload guard**: Construye `ApiValidationError` y delega via `next(error)`, preservando el `logSecurityEvent` para el audit trail.

3. **CSRF protection**: Las 4 respuestas directas ahora usan `next(new ForbiddenError(...))`.

4. **notFoundHandler**: Construye `AppError(msg, 404)` y delega via `next(error)`.

5. **errorHandler refactorizado**:
   - Eliminado el spread-operator bug — ahora usa variables independientes (`statusCode`, `message`, `errors`, `data`).
   - Cadena `if/else if` con prioridad: errores operacionales (AppError) → Mongoose → JWT → default 500.
   - Soporte para array `errors` en la respuesta (para errores de validación).
   - Logging Pino: `error` level para 500+, `warn` para 4xx.

6. **Sentry `shouldHandleError`**: Configurado para capturar solo errores con `statusCode >= 500` o `isOperational === false`. Eliminada la captura manual en `errorHandler`.

7. **`asyncHandler` utility**: Creado `utils/asyncHandler.js` que envuelve handlers async para capturar errores síncronos y asíncronos.

8. **Migración de controllers**: Los 11 controllers (~73 handlers) eliminan el try/catch boilerplate. Las rutas envuelven los handlers con `asyncHandler(handler)`.

### Alternativas Consideradas

1. **Mantener respuestas directas**: Rechazada porque impedía agregar comportamiento transversal (métricas, analytics) y causaba inconsistencia en formato de respuesta.
2. **Crear un error middleware por tipo**: Rechazada por complejidad innecesaria — un único `errorHandler` con detección de tipo es suficiente.
3. **Usar solo Express 5 native async**: Express 5 maneja errores async nativamente en route handlers, pero `asyncHandler` aporta safety net y documentación de intención.

### Consecuencias

**Positivas:**
- Un único punto de logging (Pino), captura (Sentry) y formato de respuesta para TODOS los errores HTTP
- Eliminación de la doble-captura en Sentry
- Reducción de ~400-600 LOC de boilerplate try/catch en controllers
- Formato de respuesta unificado: `{ success, message, errors?, data?, stack? }`
- Las rutas 404 ahora aparecen en el logging estructurado de Pino
- Los errores de CSRF ahora aparecen en el logging estructurado

**Negativas:**
- Latencia microscópica adicional en el path de error (un `next()` extra en middleware chain)
- `authController.js` mantiene try/catch selectivo en handlers con security logging (register, login, refresh)

### Archivos Afectados

- `backend/src/utils/errors.js` — `ApiValidationError` con propiedad `errors`
- `backend/src/utils/asyncHandler.js` — Nuevo: wrapper para handlers async
- `backend/src/middlewares/errorHandler.js` — Refactorizado completamente
- `backend/src/middlewares/validation.js` — Delegación via `next()`
- `backend/src/middlewares/securityPayloadGuard.js` — Delegación via `next()`
- `backend/src/config/security.js` — CSRF via `next(new ForbiddenError(...))`
- `backend/src/config/sentry.js` — `shouldHandleError`
- `backend/src/controllers/*.js` (11 archivos) — Eliminado try/catch boilerplate
- `backend/src/routes/*.js` (10 archivos) — `asyncHandler(handler)` en todas las rutas
- `backend/tests/errorFlow.test.js` — Tests del flujo unificado

### Relación con otros ADRs

- **ADR-003** (DTOs): el formato de respuesta de errores se mantiene compatible con el estándar `{ success, message, data }` definido en DTOs.
- Esta decisión es prerequisito de **T-519** (responseHelper + filterBuilder) y **T-601** (nuevos endpoints analytics), que podrán usar el errorHandler y asyncHandler unificados.

---

## ADR-014: Utilidades centralizadas de respuesta y filtrado (responseHelper + filterBuilder)

### Contexto (ADR-014)

La auditoría del Sprint 5 detectó dos patrones de boilerplate repetitivo en los controllers:

1. **Respuestas manuales (~70 instancias)**: Cada handler construía manualmente `res.status(XXX).json({ success: true, data, message })`. Este código repetitivo dificultaba mantener el contrato de respuesta uniforme definido en ADR-003 y multiplicaba los puntos de fallo ante cambios en el formato.

2. **Filtros duplicados**: Las funciones `buildUsersFilter` (userController), los filtros inline en `getMechanics` (gameMechanicController) y `getDecks` (cardDeckController) replicaban la misma lógica de conversión query params → filtros MongoDB (exact match, regex search, etc.). Esto generaba inconsistencias (unos escapaban regex, otros no) y dificultaba agregar nuevos tipos de filtro.

**Tarea:** T-519 (consolida T-519 + T-530)

### Decisión (ADR-014)

Se crean dos utilidades centralizadas:

1. **`utils/responseHelper.js`** — 4 funciones de respuesta:
   - `sendSuccess(res, data, message?, status=200)` — Respuesta genérica exitosa
   - `sendCreated(res, data, message?)` — Recurso creado (201)
   - `sendPaginated(res, dtoData, { page, limit, total })` — Integra `toPaginatedDTOV1` internamente, eliminando la necesidad de importarlo en cada controller
   - `sendNoContent(res)` — Operaciones sin respuesta (204)

2. **`utils/filterBuilder.js`** — Factory genérica `buildFilter(queryParams, fieldMappings, options)` con 6 tipos de mapping:
   - `exact`: Igualdad directa (`filter[field] = value`)
   - `regex`: Búsqueda parcial con escape automático via `escapeRegex` (prevención ReDoS)
   - `search`: Búsqueda multi-campo con `$or` y regex escapado
   - `range`: Rango numérico/fecha con `$gte`/`$lte` desde params separados
   - `in`: Lista de valores con split por comas o array directo
   - `computed`: Lógica custom via callback `(value, filter, allParams) => void`

### Alternativas Consideradas (ADR-014)

1. **Clase `ApiResponse` estática**: Rechazada por inconsistencia con el estilo funcional del proyecto (sin clases en utilidades) y porque requiere importar la clase completa cuando solo se usa una función.
2. **Middleware de respuesta automática**: Un middleware que intercepte `res.locals.data` y construya la respuesta. Rechazado por magia implícita — los controllers pierden visibilidad sobre qué se envía.
3. **ORM-level query builder (Mongoose query helpers)**: Para filterBuilder, usar Mongoose query helpers integrados en los schemas. Rechazado porque acoplaría la lógica de filtrado al modelo, violando la separación controller/repository.

### Consecuencias (ADR-014)

**Positivas:**
- Contrato de respuesta garantizado: cambiar el formato solo requiere modificar `responseHelper.js`
- Eliminación progresiva de ~70 instancias de `{ success: true }` manual
- filterBuilder escapa regex automáticamente, eliminando una categoría de vulnerabilidad (ReDoS)
- El tipo `computed` permite migrar filtros complejos (como el scope de teacher → student) sin pérdida de expresividad
- 37 tests unitarios cubren ambas utilidades

**Negativas:**
- Indirección adicional: los controllers ya no muestran el `res.json()` directamente, lo que puede dificultar la comprensión inicial del flujo

### Migración Completa (Mantenimiento Sprint 5)

La migración piloto inicial cubría solo 2 controllers. Durante el mantenimiento del Sprint 5 se completó la migración a todos los controllers del proyecto:

**responseHelper — Migración completa (9/10 controllers):**

| Controller | Calls migradas | Funciones usadas |
|------------|---------------|-----------------|
| adminController | 3 | sendSuccess, sendPaginated |
| analyticsController | 5 (handlers pre-T-601) | sendSuccess |
| authController | 6 | sendSuccess, sendCreated |
| userController | 8 | sendSuccess, sendCreated, sendPaginated |
| gameContextController | 6 | sendSuccess, sendCreated, sendPaginated |
| gameMechanicController | 6 | sendSuccess, sendCreated, sendPaginated |
| gamePlayController | 9 | sendSuccess, sendCreated, sendPaginated |
| gameSessionController | 8 | sendSuccess, sendCreated, sendPaginated |
| assetController | 5 | sendSuccess, sendCreated |
| **Total** | **~56 calls migradas** | |

**Exclusión documentada:** `healthController.js` no usa responseHelper porque sus endpoints de health/metrics siguen convenciones de infraestructura (formato libre, sin wrapper `{ success, data }`).

**filterBuilder — Migración completa (6/10 controllers con filtros):**

| Controller | Mapping declarativo | Tipos usados | Líneas eliminadas |
|------------|-------------------|-------------|-------------------|
| userController (piloto) | `userFilterMappings` | exact, search, computed | — (ya migrado) |
| gamePlayController | `playFilterMappings` | exact, range | ~36 (eliminadas `buildScoreRangeFilter` y `buildPlaysFilter`) |
| gameSessionController | `sessionFilterMappings` | exact | ~17 |
| adminController | `pendingTeacherFilterMappings` | search (con baseFilter) | ~12 |
| gameMechanicController | `mechanicFilterMappings` | exact, search | ~14 |
| gameContextController | `contextFilterMappings` | search, exact | ~14 |

Los 4 controllers restantes (authController, assetController, cardDeckController, healthController) no tienen endpoints de listado con filtros query-based, por lo que no aplican para filterBuilder.

Imports de `escapeRegex` eliminados de adminController, gameMechanicController y gameContextController — ya no necesitan el escape manual porque filterBuilder lo aplica internamente en el tipo `search`.

### Archivos Afectados

- `backend/src/utils/responseHelper.js` (nuevo — 4 funciones exportadas)
- `backend/src/utils/filterBuilder.js` (nuevo — factory genérica)
- `backend/src/controllers/*.js` (9 controllers migrados a responseHelper, 6 a filterBuilder)
- `backend/tests/responseHelper.test.js` (nuevo — 17 tests unitarios)
- `backend/tests/filterBuilder.test.js` (nuevo — 20 tests unitarios)

### Relación con otros ADRs

- **ADR-003** (DTOs): responseHelper preserva el contrato `{ success, data, pagination }` definido en DTOs. `sendPaginated` integra `toPaginatedDTOV1` como dependencia interna.
- **ADR-013** (Errores centralizados): Los helpers de respuesta cubren el path de éxito; el errorHandler cubre el path de error. Juntos garantizan formato uniforme en el 100% de las respuestas HTTP.

---

## ADR-015: Patrón Repository completo con operaciones de escritura, transacciones y batch

### Contexto (ADR-015)

Los repositorios del proyecto implementaban un patrón Repository incompleto: solo exponían operaciones de lectura (`find`, `findById`, `findOne`, `count`) y creación (`create`). La auditoría identificó:

- **~25 llamadas directas a `doc.save()`** en controllers y services, bypasseando la capa de abstracción
- **Sin métodos de actualización ni eliminación** en los repositorios — los controllers usaban `Model.findByIdAndUpdate()` directamente
- **Sin soporte de transacciones** — operaciones multi-documento no tenían garantía de atomicidad
- **Sin operaciones batch** — la creación masiva de documentos (seeders, importaciones) usaba bucles con `create()` individual

Esto violaba el principio de separación de responsabilidades: los controllers conocían detalles de Mongoose (`doc.save()`, opciones de `findByIdAndUpdate`), dificultando el testing y la eventual migración a otro ORM.

**Tarea:** T-520 (consolida T-520 + T-533 + T-534)

### Decisión (ADR-015)

Se amplía el patrón Repository en 3 fases:

**Fase A — Operaciones de escritura** en `baseRepository.js`:
- `updateById(Model, id, update, options)` — Wrapper de `findByIdAndUpdate` con defaults seguros (`returnDocument: 'after'`, `runValidators: true`)
- `updateOne(Model, filter, update, options)` — Wrapper de `findOneAndUpdate` con mismos defaults
- `deleteById(Model, id)` — Wrapper de `findByIdAndDelete`
- `deleteMany(Model, filter)` — Wrapper de `Model.deleteMany`

Cada repositorio concreto (6 total) envuelve estas funciones con su Model bindeado, siguiendo el mismo patrón que `find`/`findById`:
```js
const updateById = (id, update, options = {}) => baseRepo.updateById(User, id, update, options);
```

**Fase B — Transacciones** con `utils/withTransaction.js`:
- Patrón `session → startTransaction → callback(session) → commit/abort → endSession`
- Logging automático de transacciones abortadas con Pino
- Los métodos de `applyQueryOptions` ahora aceptan `session` como opción para pass-through a Mongoose

**Fase C — Operaciones batch**:
- `insertMany(Model, docs, options)` — Para creación masiva eficiente
- `bulkWrite(Model, operations, options)` — Para operaciones mixtas atómicas
- Expuestos en repositorios relevantes: `userRepository` (bulk student creation), `gamePlayRepository` (batch events), `cardDeckRepository` (batch mappings)

**Decisión importante**: NO se migran controllers/services para usar los nuevos métodos en esta tarea. La migración se hará en tareas futuras para limitar el blast radius del cambio.

### Alternativas Consideradas (ADR-015)

1. **Clase BaseRepository con herencia**: Un `BaseRepository<T>` del que hereden los repositorios concretos. Rechazada porque el proyecto usa estilo funcional (módulos con funciones exportadas, sin clases) y la herencia añade complejidad innecesaria.
2. **Mongoose plugins**: Registrar plugins en los schemas que expongan métodos CRUD. Rechazado porque acoplaría la lógica de repository al modelo y dificultaría el testing con mocks.
3. **Active Record pattern (métodos en el documento)**: Ya lo hace Mongoose con `doc.save()`. Rechazado explícitamente porque queremos que el Repository sea la única puerta de acceso a datos, facilitando el testing y el audit trail.

### Consecuencias (ADR-015)

**Positivas:**
- Los 6 repositorios ahora ofrecen CRUD completo + batch + transactions
- Defaults seguros (`runValidators: true`) previenen escrituras que violen validaciones de Mongoose
- El soporte de `session` permite transacciones sin romper la API existente (es opt-in via options)
- Los controllers/services podrán migrar progresivamente sin breaking changes
- `withTransaction` encapsula el boilerplate de session management (~15 LOC por transacción)

**Negativas:**
- Los métodos no se consumen aún en controllers/services (migración futura), creando API surface sin consumidores inmediatos
- Las transacciones requieren replica set de MongoDB — en entornos standalone (desarrollo local sin Docker) no funcionarán. Se documenta el requisito y se testea con mocks
- `returnDocument: 'after'` (Mongoose 9) reemplaza el deprecated `new: true` — los controllers que usen `findByIdAndUpdate` directamente podrían confundirse si ven ambos estilos

### Archivos Afectados

- `backend/src/repositories/baseRepository.js` — 7 funciones nuevas (updateById, updateOne, deleteById, deleteMany, insertMany, bulkWrite) + session support
- `backend/src/repositories/userRepository.js` — 7 métodos nuevos expuestos
- `backend/src/repositories/gamePlayRepository.js` — 7 métodos nuevos expuestos
- `backend/src/repositories/gameSessionRepository.js` — 5 métodos nuevos (sin batch)
- `backend/src/repositories/gameContextRepository.js` — 5 métodos nuevos (sin batch)
- `backend/src/repositories/gameMechanicRepository.js` — 5 métodos nuevos (sin batch)
- `backend/src/repositories/cardDeckRepository.js` — 7 métodos nuevos expuestos
- `backend/src/utils/withTransaction.js` — Nuevo: utility de transacciones
- `backend/tests/repositoryWriteOps.test.js` — Nuevo: tests de integración con MongoDB real
- `backend/tests/withTransaction.test.js` — Nuevo: tests unitarios con mocks

### Relación con otros ADRs

- **ADR-005** (Persistencia atómica de eventos): `withTransaction` proporciona la infraestructura necesaria para operaciones multi-documento que ADR-005 abordaba a nivel de operador `$push + $inc`.
- **ADR-006** (Lean reads): Los nuevos métodos de lectura heredan el soporte de `lean` existente en `applyQueryOptions`.

---

## ADR-016: Rate Limiting con Redis Store y protección de pause/resume

### Contexto (ADR-016)

La auditoría de seguridad del Sprint 5 identificó dos problemas en el rate limiting:

1. **Store en memoria inadecuado para producción**: Los 6 rate limiters existentes (global, auth, register, createResource, event, upload) usaban el `MemoryStore` por defecto de `express-rate-limit`. Esto significa que:
   - Cada instancia del servidor mantiene contadores independientes — con N instancias, un atacante puede hacer N × limit peticiones
   - Los contadores se reinician al reiniciar el servidor
   - No hay visibilidad centralizada de los rate limits

2. **Pause/Resume sin protección**: Las acciones `POST /api/plays/:id/pause` y `POST /api/plays/:id/resume` no tenían rate limiting, a diferencia de `/events` (que ya usaba `eventRateLimiter`). Un cliente malicioso podría hacer spam de pause/resume para degradar el rendimiento del servidor.

**Tarea:** T-521

### Decisión (ADR-016)

1. **Redis Store factory** en `config/security.js`:
   - Se crea `createRedisStore(prefix)` que usa `rate-limit-redis` v4 con el cliente `ioredis` v5 existente
   - Se integra en `createRateLimiter` para que **todos** los rate limiters usen Redis automáticamente sin modificar sus definiciones individuales
   - Import lazy: `rate-limit-redis` se importa dentro de la factory para evitar errores si Redis no está configurado
   - Adapter ioredis: `sendCommand: (...args) => client.call(...args)` según la documentación oficial de `rate-limit-redis` para ioredis

2. **Fallback graceful**: Si Redis no está disponible (no conectado, error de módulo), `createRedisStore` retorna `undefined` y `express-rate-limit` usa su `MemoryStore` por defecto. Se loguea un warning para visibilidad.

3. **Protección de Pause/Resume**: Se agrega `eventRateLimiter` (120 req/min por userId, key compuesta `user:${userId}` o `ip:${req.ip}`) a ambas rutas.

4. **Prefijos separados**: Cada rate limiter tiene un prefijo único en Redis para evitar colisiones de keys:
   - `rl:global:` — Rate limiter global
   - `rl:auth:` — Autenticación (skipSuccessfulRequests)
   - `rl:register:` — Registro de profesores
   - `rl:create:` — Creación de recursos
   - `rl:event:` — Eventos de juego + pause/resume
   - `rl:upload:` — Subida de archivos

### Alternativas Consideradas (ADR-016)

1. **Rate limiter dedicado para pause/resume**: Crear un rate limiter específico más restrictivo (ej: 10 req/min). Rechazado porque pause/resume son acciones del mismo flujo de juego que events, y el `eventRateLimiter` existente (120 req/min) ya es adecuado.
2. **Redis store a nivel de proxy (Nginx)**: Mover el rate limiting a Nginx con `ngx_http_limit_req_module`. Rechazado porque:
   - Perdemos la key compuesta `user:${userId}` (Nginx solo conoce IP)
   - En contexto escolar, muchos estudiantes comparten la misma IP (NAT del colegio)
   - No podemos tener `skipSuccessfulRequests` en Nginx
3. **Sliding window algorithm**: Implementar sliding window con Redis directamente (más preciso). Rechazado por complejidad innecesaria — `express-rate-limit` con fixed window es suficiente para el caso de uso educativo.

### Consecuencias (ADR-016)

**Positivas:**
- Escalabilidad horizontal: los contadores de rate limiting se comparten entre todas las instancias del servidor
- Persistencia de contadores: los rate limits sobreviven a reinicios del servidor
- Pause/resume protegidos contra abuse
- Zero-config: la integración es transparente — `createRateLimiter` inyecta el store automáticamente
- Fallback seguro: el sistema funciona con MemoryStore si Redis cae

**Negativas:**
- Dependencia adicional: `rate-limit-redis` (1 package, ~50KB)
- Latencia marginal: cada check de rate limit requiere un round-trip a Redis (~1ms en red local)
- En desarrollo local sin Redis, se usa MemoryStore (comportamiento diferente al de producción)

### Archivos Afectados

- `backend/src/config/security.js` — `createRedisStore` factory, `createRateLimiter` ampliado, prefijos en 6 rate limiters
- `backend/src/routes/plays.js` — `eventRateLimiter` agregado a pause (línea 137) y resume (línea 150)
- `backend/package.json` — Nueva dependencia: `rate-limit-redis` v4.x

### Relación con otros ADRs

- **ADR-002** (WebSocket auth): El rate limiting HTTP complementa la protección del socketRateLimiter (definido en `socketRateLimits.js`) para cubrir ambos canales de comunicación.
- **ADR-011** (Socket.IO Redis Adapter): La infraestructura Redis ya existe para Socket.IO adapter; reutilizarla para rate limiting es coherente y no añade nueva infraestructura.

---

## ADR-017: Endpoints de Analytics expandidos para Dashboard

### Contexto (ADR-017)

El dashboard frontend depende de datos de analytics para visualizar KPIs, distribuciones de rendimiento y progreso de estudiantes. En el estado previo, solo existían 5 endpoints básicos:
- `/classroom/summary` — KPIs básicos (studentsInRisk, averageScore, totalGames, gamesToday)
- `/classroom/comparison` — Promedio diario de clase por fecha
- `/classroom/difficulties` — Error rate por contexto/mecánica
- `/student/:id/progress` — Evolución temporal del score
- `/student/:id/difficulties` — Dificultades individuales

Estos endpoints eran insuficientes para las mejoras de dashboard planificadas (T-602 a T-606):
- **T-602**: Necesita lista de estudiantes con métricas y tier → No existe endpoint
- **T-603**: Necesita distribución de rendimiento → No existe endpoint
- **T-604**: Necesita trends comparativos → No existe endpoint
- **T-606**: Necesita resumen completo de estudiante → No existe endpoint

**Tarea:** T-601

### Decisión (ADR-017)

Se crean **6 nuevos endpoints** de analytics, manteniendo el patrón existente (auth + role middleware, Zod validators, asyncHandler, DTOs):

| Endpoint | Descripción | Datos fuente |
|----------|-------------|--------------|
| `GET /classroom/students` | Lista estudiantes con métricas, tier, accuracyRate | `User` (studentMetrics) |
| `GET /classroom/distribution` | Distribución en 4 rangos | `User` (studentMetrics.averageScore) |
| `GET /classroom/trends` | Comparación período actual vs anterior, 6 KPIs | `GamePlay` (aggregation) + `User` |
| `GET /student/:id/summary` | Resumen completo con últimas partidas, contextos, mecánicas | `GamePlay` ($facet) + `User` |
| `GET /classroom/heatmap` | Actividad por día de semana × hora | `GamePlay` ($dayOfWeek, $hour) |
| `GET /classroom/rankings` | Top N contextos y mecánicas | `GamePlay` (aggregation) |

**Decisiones de diseño clave:**

1. **User.studentMetrics vs agregación en tiempo real**: Los endpoints de `/classroom/students` y `/classroom/distribution` usan `User.studentMetrics` (datos pre-agregados, actualizados atómicamente con `$inc` al completar cada partida). Esto evita pipelines pesados de agregación sobre la colección `gameplays` para operaciones frecuentes. Los endpoints de `/trends`, `/heatmap` y `/rankings` sí usan agregación porque sus datos son inherentemente temporales y no se pre-computan.

2. **$facet para student summary**: El endpoint `/student/:id/summary` usa un pipeline con `$facet` que ejecuta 4 sub-pipelines en un solo round-trip a MongoDB (lastGames, byContext, byMechanic, overallStats). La comparativa con la clase es una query separada a `User` (simple, sin agregación). Total: 2 queries por request en vez de 5+.

3. **Clasificación de tiers**: Rangos fijos basados en `averageScore`:
   - `risk`: 0-49 (rojo) — Estudiantes que necesitan intervención
   - `average`: 50-69 (amarillo) — Rendimiento básico
   - `good`: 70-89 (azul) — Buen rendimiento
   - `excellent`: 90-100 (verde) — Rendimiento excepcional

   Se eligieron rangos fijos en vez de percentiles porque el profesor debe poder interpretar los tiers de forma absoluta, no relativa a la clase.

4. **Endpoints extra (heatmap y rankings)**: No estaban en la especificación original pero añaden valor significativo al dashboard:
   - Heatmap permite al profesor identificar las franjas horarias de mayor actividad → optimizar planificación
   - Rankings permite identificar qué contenidos son más utilizados y efectivos → informar decisiones pedagógicas

5. **accuracyRate calculado**: Se calcula como `totalCorrectAnswers / (totalCorrectAnswers + totalErrors) * 100`. Es un campo derivado, no almacenado, para evitar inconsistencias con los contadores atómicos.

### Alternativas Consideradas (ADR-017)

1. **GraphQL para analytics**: Un endpoint GraphQL que permita al frontend construir queries flexibles. Rechazado por:
   - Añade una dependencia y paradigma nuevo al proyecto (solo REST)
   - Los pipelines de agregación de MongoDB no se mapean bien a resolvers GraphQL
   - Para un TFG, la complejidad no se justifica

2. **Materialización en colección separada**: Pre-computar los datos de analytics en una colección `analytics_snapshots` con un cron job. Rechazado porque:
   - Añade lag (los datos no son en tiempo real)
   - Requiere infraestructura adicional (cron/scheduler)
   - Los volúmenes actuales (cientos de partidas, no millones) no lo justifican

3. **Calcular tiers con percentiles (curva normal)**: En vez de rangos fijos, usar percentiles de la distribución real. Rechazado porque:
   - Con pocos estudiantes (5-30), los percentiles son inestables
   - El profesor espera interpretar "70% = bueno" de forma absoluta

### Consecuencias (ADR-017)

**Positivas:**
- Desbloquea las tareas T-602 a T-606 del dashboard frontend
- Los endpoints usan datos pre-agregados cuando es posible, manteniendo buen rendimiento
- El patrón $facet reduce round-trips a MongoDB
- Validación Zod estricta en todos los endpoints (sort, order, tier, timeRange, limit)
- Ownership check reutilizado (`ensureStudentOwnership`) para endpoints de estudiante individual
- 16 tests de integración con supertest

**Negativas:**
- Los pipelines de agregación son complejos y difíciles de debuggear (especialmente el $facet de student summary)
- La clasificación de tiers está hardcodeada en el service — si el profesor quiere personalizar los rangos, requiere cambio de código
- Los endpoints de trends hacen 2 queries (aggregation + User.count para studentsInRisk), lo que podría optimizarse con un pipeline combinado

### Archivos Afectados

- `backend/src/services/analyticsService.js` — 6 funciones nuevas (getClassroomStudents, getClassroomDistribution, getClassroomTrends, getStudentSummary, getClassroomHeatmap, getTopContextsAndMechanics)
- `backend/src/controllers/analyticsController.js` — 6 handlers nuevos + helper `ensureStudentOwnership`
- `backend/src/routes/analytics.js` — 6 rutas nuevas con validators y asyncHandler
- `backend/src/validators/analyticsValidator.js` — 6 schemas Zod nuevos
- `backend/tests/analyticsEndpoints.test.js` — 16 tests de integración

### Relación con otros ADRs

- **ADR-003** (DTOs): Los nuevos endpoints usan `sendSuccess` de responseHelper (ADR-014) que preserva el contrato de DTOs.
- **ADR-005** (Persistencia atómica): Los datos de `studentMetrics` que consumen estos endpoints son actualizados atómicamente por los operadores `$inc`/`$push` definidos en ADR-005.
- **ADR-013** (Errores centralizados): Los handlers usan `asyncHandler` y lanzan `NotFoundError`/`ForbiddenError` que fluyen por el errorHandler centralizado.
- **ADR-014** (responseHelper): Los nuevos controllers usan `sendSuccess` en vez de `res.json()` manual.

---

## ADR-018: Plan de descomposicion modular de gameEngine.js

### Contexto (ADR-018)

`gameEngine.js` ha crecido hasta ~1915 lineas con ~50 funciones distribuidas en 10 grupos de responsabilidad. El archivo mezcla logica de juego, persistencia en MongoDB, coordinacion distribuida con Redis, comunicacion WebSocket y gestion de timers en una unica clase singleton.

Esto genera cuatro problemas concretos:

1. **Acoplamiento vertical**: Testear `processResponse` (logica de juego pura) requiere mockear Redis, MongoDB, Socket.IO y los Maps internos del motor.
2. **Estado compartido sin encapsulacion**: `this.activePlays` (Map), `this.cardUidToPlayId` (Map) y `this.playLocks` (Map) son accesibles directamente por todos los metodos sin ninguna capa de abstraccion.
3. **Timers anidados**: `roundTimer`, `nextRoundTimer`, `playTimer` y `transientTimers` interactuan con la logica de pausa/reanudacion que debe recalcular remaining time, generando codigo fragil.
4. **Complejidad cognitiva**: Un desarrollador nuevo necesita leer ~1915 lineas para entender una sola responsabilidad. No existe una guia de "How to Add a New Mechanic".

### Analisis de responsabilidades actuales

| # | Grupo | Lineas aprox. | Metodos principales | Complejidad |
|---|-------|---------------|---------------------|-------------|
| 1 | Ciclo de vida | ~200 | `startPlay`, `endPlay`, `shutdown` | Alta (orquesta todo) |
| 2 | Logica de rondas | ~370 | `sendNextRound`, `processResponse`, `handleTimeout`, `advanceToNextRound` | Alta (core del juego) |
| 3 | Modo Memory | ~200 | `processMemoryScan`, `emitMemoryTurnState`, `handleMemoryTimeout` | Media |
| 4 | Entrada RFID | ~65 | `handleCardScan`, `getPlayIdByCardUid` | Baja |
| 5 | Pausa/Reanudacion | ~295 | `pausePlay`, `resumePlay`, `calculatePauseRemainingTime`, `persistPauseState` | Alta (timers + estado) |
| 6 | Gestion de timers | ~130 | `scheduleTransientTimer`, `clearPlayTimers`, `startCleanupTimer`, `startLockHeartbeatTimer` | Media |
| 7 | Persistencia/Sync | ~240 | `syncPlayToRedis`, `checkpointPlayIfNeeded`, `recoverActivePlays`, `recoverOrphanedPlaysFromDB` | Alta (Redis + MongoDB) |
| 8 | Ops distribuidas Redis | ~155 | `reserveDistributedCardMappings`, `releaseDistributedCardMappings`, `refreshActivePlayLeases` | Alta |
| 9 | Observabilidad | ~120 | `getPlayState`, `getRealtimeRemainingTimeMs`, `getPlayRuntimeContext`, `getMetrics` | Baja |
| 10 | Control de concurrencia | ~50 | `executeWithPlayLock`, `processInBatches` | Media |

### Estructuras de datos en memoria

| Estructura | Tipo | Proposito | Tamano tipico |
|---|---|---|---|
| `this.activePlays` | `Map<playId, playState>` | Estado completo de cada partida activa | 100-500 entradas |
| `this.cardUidToPlayId` | `Map<uid, playId>` | Busqueda O(1) inversa: UID → partida | 1500-15000 mappings |
| `this.playLocks` | `Map<playId, Promise>` | Mutex en memoria por partida (serializa operaciones) | Partidas con operaciones en vuelo |
| `this.metrics` | `Object` | Contadores de telemetria del motor | ~25 campos |

### Decision (ADR-018)

Descomponer `gameEngine.js` en **11 modulos** bajo `services/gameEngine/`, manteniendo backward compatibility via `index.js` que re-exporta la misma API publica.

**Esta ADR es un plan de ejecucion futura — no se modifica codigo.**

#### Estructura de modulos propuesta

```
backend/src/services/gameEngine/
├── index.js                    # Re-export backward compatible (module.exports = GameEngine)
├── GameEngine.js               # Orquestador: instancia managers, delega operaciones
├── PlayStateManager.js         # Encapsula activePlays, cardUidToPlayId (CRUD + queries)
├── RoundManager.js             # sendNextRound, processResponse, handleTimeout, advanceToNextRound
├── MemoryGameManager.js        # processMemoryScan, emitMemoryTurnState, handleMemoryTimeout
├── PlayPauseManager.js         # pausePlay, resumePlay, calculatePauseRemainingTime
├── RFIDInputHandler.js         # handleCardScan, getPlayIdByCardUid
├── PersistenceManager.js       # syncPlayToRedis, checkpoint, recoverActivePlays, recoverOrphaned
├── DistributedLockManager.js   # reserveDistributedCardMappings, releaseDistributed, refreshLeases
├── TimerManager.js             # Abstraccion sobre setTimeout/clearTimeout, cleanup, heartbeat
├── MetricsCollector.js         # getPlayState, getMetrics, contadores de telemetria
└── ConcurrencyControl.js       # executeWithPlayLock, processInBatches
```

#### Diagrama de dependencias entre modulos

```
GameEngine (orquestador)
├── PlayStateManager          (sin dependencias externas — puro estado en memoria)
├── TimerManager              (sin dependencias externas — wrapper de setTimeout)
├── ConcurrencyControl        (sin dependencias externas — mutex + batching)
├── MetricsCollector          ← PlayStateManager (lee activePlays.size para snapshots)
├── RFIDInputHandler          ← PlayStateManager (cardUidToPlayId lookup)
├── DistributedLockManager    ← redisService (inyectado)
├── PersistenceManager        ← PlayStateManager, redisService, gamePlayRepository (inyectados)
├── RoundManager              ← PlayStateManager, TimerManager, PersistenceManager, io (inyectados)
├── MemoryGameManager         ← PlayStateManager, TimerManager, PersistenceManager, io (inyectados)
└── PlayPauseManager          ← PlayStateManager, TimerManager, PersistenceManager, io (inyectados)
```

#### Patron de inyeccion (Constructor Dependency Injection)

Cada manager recibe sus dependencias en el constructor:

```javascript
class RoundManager {
  constructor({ playStateManager, timerManager, persistenceManager, io, logger }) {
    this.playState = playStateManager;
    this.timers = timerManager;
    this.persistence = persistenceManager;
    this.io = io;
    this.logger = logger;
  }

  async sendNextRound(playId) {
    const playState = this.playState.get(playId);
    // ... logica de ronda usando this.timers, this.persistence, this.io
  }
}
```

El `GameEngine` orquestador instancia todos los managers y los conecta:

```javascript
class GameEngine {
  constructor(io) {
    this.playState = new PlayStateManager();
    this.timers = new TimerManager();
    this.concurrency = new ConcurrencyControl();
    this.metrics = new MetricsCollector({ playState: this.playState });
    this.locks = new DistributedLockManager({ redisService });
    this.persistence = new PersistenceManager({ playState: this.playState, redisService, ... });
    this.rounds = new RoundManager({ playState: this.playState, timers: this.timers, ... });
    // ... etc.
  }
}
```

### Estrategia de migracion (3 fases)

#### Fase 1 — Modulos sin dependencias externas (~4h, bajo riesgo)

| Modulo | Lineas | Metodos | Riesgo | Justificacion |
|--------|--------|---------|--------|---------------|
| `ConcurrencyControl` | ~50 | `executeWithPlayLock`, `processInBatches` | Muy bajo | Funciones puras, sin estado compartido complejo |
| `TimerManager` | ~130 | `scheduleTransientTimer`, `clearPlayTimers`, `startCleanupTimer`, etc. | Bajo | Wrapper sobre Node.js timers |
| `MetricsCollector` | ~120 | `getPlayState`, `getMetrics`, contadores | Bajo | Solo lectura de estado |
| `PlayStateManager` | ~80 | Encapsular Maps con API publica (get, set, delete, has) | Bajo | Fundamental para los demas modulos |

#### Fase 2 — Modulos con dependencias simples (~8h, riesgo medio)

| Modulo | Lineas | Dependencias | Riesgo | Justificacion |
|--------|--------|-------------|--------|---------------|
| `RFIDInputHandler` | ~65 | PlayStateManager | Bajo | Solo lookup O(1) + delegacion |
| `DistributedLockManager` | ~155 | redisService | Medio | Operaciones Lua atomicas — tests criticos |
| `PersistenceManager` | ~240 | PlayStateManager, redisService, repositories | Medio | I/O con dos stores — requiere tests de integracion |

#### Fase 3 — Modulos complejos (~12h, riesgo alto)

| Modulo | Lineas | Dependencias | Riesgo | Justificacion |
|--------|--------|-------------|--------|---------------|
| `RoundManager` | ~370 | PlayStateManager, TimerManager, PersistenceManager, io | Alto | Core del juego, interaccion con timers y Socket.IO |
| `MemoryGameManager` | ~200 | PlayStateManager, TimerManager, PersistenceManager, io | Medio-Alto | Logica especifica de memoria con timers de ocultacion |
| `PlayPauseManager` | ~295 | PlayStateManager, TimerManager, PersistenceManager, io | Alto | Remaining time gymnastics, timer freeze/restore |
| `GameEngine.js` (refactor) | ~200 | Todos los managers | Alto | Orquestador puro — delegacion sin logica propia |

**Estimacion total:** ~24h de desarrollo + ~8h de testing = ~32h

### Alternativas consideradas

1. **No descomponer, solo documentar**: Mantener el monolito pero añadir JSDoc extensivo y guias. Rechazado porque no resuelve el problema de testabilidad ni la complejidad cognitiva para nuevos desarrolladores.

2. **Dividir en 3-4 modulos grandes** (lifecycle, gameplay, infrastructure): Mas rapido pero mantiene acoplamiento dentro de cada modulo. Rechazado porque la testabilidad apenas mejora.

3. **Migrar a event-driven con EventEmitter**: Desacoplar modulos mediante eventos internos. Considerado para futuro (Sprint 6+) pero anade complejidad de indirectacion que no se justifica en el scope actual.

### Consecuencias (ADR-018)

**Positivas:**
- Archivos de ~100-300 lineas en vez de uno de ~1915
- Testing aislado por modulo (mock solo dependencias directas del manager, no toda la infra)
- Facilita onboarding: un desarrollador nuevo puede leer `RoundManager.js` (~370 lineas) para entender la logica de rondas sin wade through 1900 lineas
- `index.js` re-exporta la misma API publica → backward compatible para consumers (server.js, socketHandlers, commands)
- Posibilita "How to Add a New Mechanic" como guia documental

**Negativas:**
- Esfuerzo significativo (~32h)
- Riesgo de regresiones en logica de timers y pausa/reanudacion (Fase 3)
- Mas archivos para navegar (11 vs 1), mitigado con buena organizacion y JSDoc
- El patron DI requiere disciplina para no volver a acoplar

**Riesgos:**
- La logica de pausa/reanudacion con remaining time es la parte mas fragil de la Fase 3
- Los tests de integracion existentes (`gameFlow.test.js`, `playPauseResume.test.js`, `memoryStrategy.test.js`) deben pasar sin cambios — son la red de seguridad principal
- El `index.js` debe mantener exactamente la misma interfaz publica que `gameEngine.js` actual

### Relacion con otros ADRs

- **ADR-001** (Soft limit de partidas): `PlayStateManager` encapsulara el threshold warning de `ACTIVE_PLAYS_WARNING_THRESHOLD`
- **ADR-004** (Locks distribuidos de UIDs): `DistributedLockManager` aisla las operaciones Lua de reserva/liberacion/renovacion
- **ADR-005** (Persistencia atomica de eventos): `PersistenceManager` consolida `addEventAtomic`, `checkpointPlayIfNeeded` y `syncPlayToRedis`
- **ADR-010** (Checkpoints periodicos): `PersistenceManager` gestiona los umbrales de checkpoint (`CHECKPOINT_INTERVAL_MS`, `CHECKPOINT_EVENT_THRESHOLD`)
- **ADR-011** (Redis Adapter): `DistributedLockManager` mantiene compatibilidad con el Redis adapter para scaling horizontal

---

## ADR-019: Optimización de queries con lean() e índices compuestos

### Contexto (ADR-019)

Todas las consultas de lectura de Mongoose devolvían documentos completos con getters, setters y métodos del modelo, consumiendo aproximadamente 5 veces más memoria que objetos JavaScript planos (POJOs). Este overhead era innecesario en la mayoría de endpoints de listado, donde los resultados se transforman a DTOs antes de enviarlos al cliente y nunca necesitan `.save()`.

Adicionalmente, los endpoints de analytics como `classroom/students` y `student/summary` ejecutaban queries sin índices compuestos óptimos, provocando escaneos completos de colección (collection scans) que degradaban el rendimiento conforme crecía el volumen de datos.

### Decisión (ADR-019)

Se adoptan dos optimizaciones complementarias:

1. **Aplicar `.lean()` automáticamente en `baseRepository.applyQueryOptions`** para queries de listado — aquellas que incluyen `sort`, `limit` o `skip`. Sus resultados siempre se transforman a DTOs y nunca requieren `.save()`. Para `findById` y `findOne`, lean permanece como opt-in porque muchos flujos de controllers/services siguen el patrón find → modify → `.save()`.

2. **Añadir 3 índices compuestos** para las consultas más costosas:
   - `GamePlay { playerId: 1, completedAt: -1 }` — historial de partidas por estudiante, ordenado por fecha de completado
   - `GamePlay { status: 1, completedAt: -1 }` — agregaciones de analytics filtradas por estado
   - `User { createdBy: 1, role: 1 }` — listados de estudiantes de un aula (teacher → students)

### Alternativas Consideradas (ADR-019)

1. **Lean global por defecto en todas las queries**: Rechazada porque rompería aproximadamente 30 call sites que usan `.save()` tras un find, requiriendo una refactorización masiva a patrón `updateById`. El riesgo de regresión no justificaba la ganancia.

2. **Override de lean por repositorio**: Cada repositorio decidiría si aplicar lean o no. Rechazada por inconsistencia — algunos repositorios lo aplicarían y otros no, generando confusión y errores difíciles de depurar.

### Consecuencias (ADR-019)

**Positivas:**
- Las queries de listado devuelven POJOs (~5x menos memoria por documento) sin cambios en controllers ni DTOs
- Los endpoints de analytics se benefician de los índices compuestos, evitando collection scans
- La aplicación es transparente: `applyQueryOptions` detecta automáticamente si la query tiene sort/limit/skip y aplica lean sin intervención del desarrollador
- Los flujos de escritura (find → modify → save) no se ven afectados

**Negativas:**
- Los POJOs devueltos por lean no tienen virtuals, getters ni métodos de instancia del modelo — si algún consumidor futuro los necesita en una query de listado, deberá añadir `lean: false` explícitamente en las opciones
- Los índices compuestos consumen espacio adicional en disco y RAM de MongoDB, aunque el impacto es mínimo para el volumen de datos actual

### Relación con otros ADRs

- **ADR-003** (DTOs): Los resultados lean son compatibles con la capa de DTOs porque estos solo acceden a propiedades planas del documento, no a métodos de Mongoose
- **ADR-006** (Lecturas lean en sesiones): ADR-006 aplicó lean manualmente en endpoints de sesión como caso piloto; ADR-019 generaliza el patrón a nivel de baseRepository
- **ADR-015** (Repository completo): La lógica lean se centraliza en `applyQueryOptions` del baseRepository, consistente con el principio de que el acceso a datos se gestiona desde la capa repository

---

## ADR-020: Estrategia de cache Redis para entidades de alta lectura

### Contexto (ADR-020)

Las mecánicas de juego (~3 en el sistema) y los contextos temáticos (~15) se consultan en cada carga de sesión, inicio de partida y vista de dashboard, pero cambian muy raramente (solo cuando un administrador crea o edita). Los resúmenes de analytics de clase agregan datos a través de múltiples colecciones. Todas estas consultas impactan MongoDB en cada petición sin ningún tipo de cache.

### Decisión (ADR-020)

Se adopta el patrón **cache-aside** mediante `utils/cacheHelper.js`, reutilizando la infraestructura existente de `redisService` con circuit breaker. Se definen tres niveles de cache:

1. **Mecánicas** — TTL de 1 hora. Se cachean las consultas `getById` (llamadas frecuentemente, datos estables). Los endpoints de listado quedan sin cache (se llaman raramente y tienen combinaciones variables de filtros que generarían demasiadas cache keys).

2. **Contextos** — TTL de 30 minutos. Misma estrategia que mecánicas: solo `getById` cacheado. Los listados quedan sin cache por las mismas razones.

3. **Analytics** — TTL de 5 minutos. TTL corto porque los datos cambian con cada partida completada. La key incluye `teacherId` para aislamiento entre profesores.

4. **Invalidación**: las mutaciones (create/update/delete) invalidan explícitamente mediante `cacheInvalidate`. Analytics usa solo expiración por TTL (sin invalidación explícita necesaria).

5. **Fallback**: si Redis no está disponible, `cacheGet` cae transparentemente a la función de fetch (sin cache, sin error).

### Alternativas Consideradas (ADR-020)

1. **Cache-through (Redis como lectura primaria)**: Rechazada. Añade complejidad y dependencia de Redis para todas las lecturas.

2. **TTL global sin invalidación explícita**: Rechazada para mecánicas y contextos. Datos obsoletos durante hasta 1 hora tras ediciones es inaceptable para la experiencia del administrador.

3. **Cache en endpoints de listado**: Rechazada. Las combinaciones variables de filtros, ordenamiento y paginación crean demasiadas cache keys con baja tasa de acierto.

### Consecuencias (ADR-020)

**Positivas:**
- Reducción de carga en MongoDB para lecturas repetidas de mecánicas, contextos y analytics
- Sin cambio de comportamiento para los consumidores — la interfaz de servicios permanece idéntica
- El fallo de Redis es transparente: el sistema opera sin cache en modo degradado
- Invalidación explícita garantiza datos frescos tras mutaciones de administrador

**Negativas:**
- Complejidad adicional en la capa de servicios para gestionar invalidación
- Las cache keys de analytics incluyen `teacherId`, lo que limita la reutilización entre profesores (decisión deliberada por aislamiento de datos)

### Relación con otros ADRs

- **ADR-016** (Rate limiting Redis store): Reutiliza la misma infraestructura de `redisService` con circuit breaker. Los namespaces `CACHE_MECHANIC`, `CACHE_CONTEXT` y `CACHE_ANALYTICS` se añaden al enum `NAMESPACES`
