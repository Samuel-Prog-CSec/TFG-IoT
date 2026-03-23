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

### Evidencia técnica asociada (ADR-012)

**Archivos eliminados:**
- `backend/src/models/Card.js`, `backend/src/repositories/cardRepository.js`
- `backend/src/controllers/cardController.js`, `backend/src/routes/cards.js`
- `backend/src/validators/cardValidator.js`, `backend/seeders/02-cards.js`
- `backend/src/states/rfid/CardRegistrationState.js`
- `backend/src/commands/socket/JoinCardRegistrationCommand.js`, `LeaveCardRegistrationCommand.js`

**Archivos modificados (core):**
- `backend/src/models/CardDeck.js`, `backend/src/models/GameSession.js`
- `backend/src/controllers/cardDeckController.js`, `backend/src/services/gameSessionService.js`
- `backend/src/controllers/helpers/sessionValidationHelpers.js`
- `backend/src/utils/dtos.js`

### Relación con otros ADRs

- **ADR-003** (DTOs): se eliminan `toCardDTOV1`, `toCardListDTOV1`, `toCardStatsDTOV1`. Se actualizan `mapCardMappingDTOV1` y DTOs de boardLayout/associationPlan. Se eliminan los endpoints de Cards del mapeo Endpoint → DTO.
- **ADR-004** (Locks distribuidos de UIDs): los locks ya usan UIDs como keys, no cardIds. Esta decisión valida retroactivamente la elección de ADR-004 de usar UIDs directamente.
- **ADR-008** (Gobierno de identidades): el super_admin pierde la responsabilidad de gestionar tarjetas, lo que simplifica su carga operativa y refuerza el foco en gestión de identidades.
