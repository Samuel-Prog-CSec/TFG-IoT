# Registro de Decisiones de Arquitectura (ADR)

Documento unificado de todas las decisiones arquitectonicas del proyecto.
Cada ADR indica su alcance: **[Backend]**, **[Frontend]**, **[Full-stack]** o **[DevOps]**.

## Indice de ADRs

| ADR | Titulo | Alcance |
|-----|--------|---------|
| ADR-001 | Eliminación del Límite Duro de Partidas Simultáneas | Backend |
| ADR-002 | Autenticación Obligatoria en WebSockets y Desconexión por Invalidez | Backend |
| ADR-003 | Capa de DTOs v1 y Contrato de Respuestas | Backend |
| ADR-004 | Locks distribuidos de UIDs con lease TTL + heartbeat | Backend |
| ADR-005 | Persistencia atómica de eventos de partida | Backend |
| ADR-006 | Lectura de sesiones sin mutación + caché de ownership por capas | Backend |
| ADR-007 | Security Gate de dependencias en CI (runtime bloqueante) | DevOps |
| ADR-008 | Gobierno de identidades centrado en Super Admin + contrato paginado explícito FE/BE | Full-stack |
| ADR-009 | Campo `data` en errores operacionales (AppError) | Backend |
| ADR-010 | Checkpoints periódicos de partida y resiliencia ante crash | Full-stack |
| ADR-011 | Socket.IO Redis Adapter para escalabilidad horizontal | Backend |
| ADR-012 | Eliminación del modelo Card — Tarjetas RFID como tokens fungibles | Full-stack |
| ADR-013 | Flujo de Errores HTTP Centralizado | Backend |
| ADR-014 | Utilidades centralizadas de respuesta y filtrado (responseHelper + filterBuilder) | Backend |
| ADR-015 | Patrón Repository completo con operaciones de escritura, transacciones y batch | Backend |
| ADR-016 | Rate Limiting con Redis Store y protección de pause/resume | Backend |
| ADR-017 | Endpoints de Analytics expandidos para Dashboard | Backend |
| ADR-018 | Plan de descomposicion modular de gameEngine.js | Backend |
| ADR-019 | Optimización de queries con lean() e índices compuestos | Backend |
| ADR-020 | Estrategia de cache Redis para entidades de alta lectura | Backend |
| ADR-021 | Revision de patrones de diseno — ownership helpers, Service Layer y rate limiting | Backend |
| ADR-022 | Hardening de la capa WebSocket — persistencia RFID en Redis y limite de conexiones por usuario | Full-stack |
| ADR-023 | Unicidad cross-deck de tarjetas RFID por profesor | Full-stack |
| ADR-024 | Mejoras del Sistema de Assets — Sharpening, LQIP y AudioMiniPlayer | Full-stack |
| ADR-025 | Vinculación de Audio a Assets Existentes | Full-stack |
| ADR-026 | Descomposición modular del servicio de Analytics | Backend |
| ADR-027 | Arquitectura Frontend de Analytics — Suite de 4 Páginas | Frontend |
| ADR-028 | Estrategia de Composición de Componentes de Analytics | Frontend |
| ADR-029 | Consolidación de umbrales RAG y filtrado híbrido en Dashboard | Full-stack |
| ADR-030 | Protección de datos de menores — Minimización, consentimiento y ciclo de vida | Full-stack |
| ADR-031 | Endurecimiento del consentimiento parental — Autorización, trazabilidad y defense in depth | Full-stack |
| ADR-032 | Centralización de operaciones RGPD en el rol Super Admin | Full-stack |
| ADR-033 | Derecho de oposición a analytics comportamentales (Art. 21 RGPD) | Full-stack |
| ADR-034 | Centralización de verificación de consentimiento RGPD | Backend |
| ADR-035 | Serialización de operaciones RFID mode con mutex por usuario | Backend |
| ADR-036 | Endpoint de métricas del sistema (/api/health/metrics) | Backend |
| ADR-037 | Protección de estabilidad del proceso (unhandledRejection/uncaughtException) | Backend |
| ADR-038 | Límite duro de partidas activas simultáneas | Backend |
| ADR-039 | Timeout de queries aggregate (maxTimeMS) | Backend |
| ADR-040 | Observabilidad del circuit breaker y health check mejorado | Backend |
| ADR-041 | Recovery de card locks tras reconexión Redis | Backend |
| ADR-042 | Multer memory storage como diseño aceptado | Backend |
| ADR-043 | Invalidación inmediata de auth cache vía eventos internos | Backend |
| ADR-044 | Migración a Socket.IO namespaces (/game) | Full-stack |
| ADR-045 | Decomposición modular del GameEngine | Backend |
| ADR-046 | Feedback explícito para escaneos RFID ignorados (scan_ignored) | Full-stack |
| ADR-047 | Política de bloqueo RFID relajada para entorno educativo | Backend |
| ADR-048 | Selección de Librería de Visualización (Recharts) | Frontend |
| ADR-049 | Patrón de Diseño de Dashboard (Jerarquía "F") | Frontend |
| ADR-050 | Estrategia de Fetching de Datos (On-Mount + Polling Sincronizado) | Frontend |
| ADR-051 | Sistema de Alertas Basado en Reglas (Frontend) | Frontend |
| ADR-052 | Mecánicas de juego inmutables en API | Backend |
| ADR-053 | Política de ownership en assets de contextos | Full-stack |
| ADR-054 | UI admin para CRUD de contextos con limpieza de Storage | Full-stack |
| ADR-055 | Enum `difficulty` ampliado con `custom` y marker de sesion en cliente | Full-stack |
| ADR-056 | AnimatePresence `mode="popLayout"` para transiciones de ruta en React 19 | Frontend |
| ADR-057 | Integridad de scores: `maxScore` obligatorio y clamp defensivo en 3 capas | Full-stack |
| ADR-058 | `HoverLiftCard` primitive — micro-interaccion unificada en listados | Frontend |
| ADR-059 | Propagación explícita de variants Framer cuando hay wrapper intermedio | Frontend |
| ADR-060 | `pointer-events: none` durante exit de AnimatePresence de ruta | Frontend |
| ADR-061 | Tema visual por contexto de juego (signature cross-pantalla) | Frontend |

**Leyenda de alcance:**
- **Backend**: Cambios exclusivamente en el servidor (Node.js/Express)
- **Frontend**: Cambios exclusivamente en el cliente (React/Vite)
- **Full-stack**: Cambios que afectan tanto al backend como al frontend
- **DevOps**: Cambios en CI/CD, infraestructura o tooling

---

## ADR-001: Eliminación del Límite Duro de Partidas Simultáneas [Backend]

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

## ADR-002: Autenticación Obligatoria en WebSockets y Desconexión por Invalidez [Backend]

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

## ADR-003: Capa de DTOs v1 y Contrato de Respuestas [Backend]

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

## ADR-004: Locks distribuidos de UIDs con lease TTL + heartbeat [Backend]

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

## ADR-005: Persistencia atómica de eventos de partida [Backend]

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

## ADR-006: Lectura de sesiones sin mutación + caché de ownership por capas [Backend]

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

## ADR-007: Security Gate de dependencias en CI (runtime bloqueante) [DevOps]

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

## ADR-008: Gobierno de identidades centrado en Super Admin + contrato paginado explícito FE/BE [Full-stack]

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

## ADR-009: Campo `data` en errores operacionales (AppError) [Backend]

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

## ADR-010: Checkpoints periódicos de partida y resiliencia ante crash [Full-stack]

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

## ADR-011: Socket.IO Redis Adapter para escalabilidad horizontal [Backend]

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

## ADR-012: Eliminación del modelo Card — Tarjetas RFID como tokens fungibles [Full-stack]

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

## ADR-013: Flujo de Errores HTTP Centralizado [Backend]

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

## ADR-014: Utilidades centralizadas de respuesta y filtrado (responseHelper + filterBuilder) [Backend]

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

## ADR-015: Patrón Repository completo con operaciones de escritura, transacciones y batch [Backend]

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

## ADR-016: Rate Limiting con Redis Store y protección de pause/resume [Backend]

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

## ADR-017: Endpoints de Analytics expandidos para Dashboard [Backend]

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

## ADR-018: Plan de descomposicion modular de gameEngine.js [Backend]

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

## ADR-019: Optimización de queries con lean() e índices compuestos [Backend]

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

## ADR-020: Estrategia de cache Redis para entidades de alta lectura [Backend]

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

## ADR-021: Revision de patrones de diseno — ownership helpers, Service Layer y rate limiting [Backend]

### Contexto (ADR-021)

Una revision exhaustiva de los 13 patrones de diseno documentados revelo tres areas de mejora concreta:

1. **Ownership checks duplicados**: El patron `entity.createdBy.toString() !== req.user._id.toString()` aparecia 18 veces en 5 controllers con 3 variantes distintas (simple, con bypass super_admin, teacher-student). Las variaciones sutiles (manejo de objetos populados vs ObjectId directo) aumentaban el riesgo de bugs silenciosos.

2. **Service Layer incompleto**: `gameSessionController.createSession()` contenia ~120 lineas de logica de negocio (validacion de mecanica, config, boardLayout, associationChallengePlan) que deberian estar en el service, violando la regla documentada: "Controllers orquestan, no ejecutan reglas complejas."

3. **Rate limiting incompleto**: Los 12 endpoints de analytics ejecutaban aggregations MongoDB costosas sin rate limiter especifico (solo el global de 100 req/15min).

Adicionalmente, se identificaron 3 patrones ya implementados pero no documentados (Cache-Aside, Factory Method, Decorator) y 2 inconsistencias menores (filterBuilder no usado en cardDeckController, DRY violation en analyticsController).

### Decision (ADR-021)

1. **ownershipHelpers** (`utils/ownershipHelpers.js`): Tres funciones centralizadas:
   - `ensureResourceOwnership(entity, userId, resourceName)` — check simple
   - `ensureResourceOwnershipOrAdmin(entity, user, resourceName)` — con bypass super_admin
   - `ensureStudentBelongsToTeacher(studentId, user, userRepository)` — relacion teacher-student
   - `getOwnerId(entity)` — extrae createdBy manejando tanto ObjectId como objeto populado

2. **createSessionFromDeck** en `gameSessionService.js`: Consolida toda la logica de creacion de sesion desde mazo. El controller queda como orquestador de ~15 lineas.

3. **analyticsRateLimiter** en `config/security.js`: 30 req/min por usuario en produccion, aplicado como middleware de router en `routes/analytics.js`.

4. **filterBuilder** adoptado en `cardDeckController.getDecks()` reemplazando construccion manual.

5. **Documentacion**: Patrones 14 (Cache-Aside), 15 (Factory Method) y 16 (Decorator) anadidos a `02-Patrones_Diseno.md`.

### Alternativas Consideradas (ADR-021)

1. **Authorization Policy pattern** (politicas por entidad): Evaluado y pospuesto. El ownershipHelpers cubre el 95% de los casos. Se recomienda activar si las reglas de autorizacion crecen (sesiones compartidas entre profesores, permisos granulares).

2. **Dependency Injection container**: Descartado. Node.js module system con `require()` ya actua como DI simple; un contenedor formal es excesivo para el tamano del proyecto.

3. **Builder pattern** para construccion de sesiones: Descartado. Mongoose + Service Layer ya manejan la construccion; un builder aniade indirection sin beneficio real.

### Consecuencias (ADR-021)

**Positivas:**
- 18 bloques de codigo duplicado eliminados de 5 controllers
- Mensajes de error de autorizacion ahora son consistentes
- `gameSessionController.createSession()` reducido de ~120 a ~15 lineas
- Analytics protegidos contra abuso de aggregations costosas
- 16 patrones documentados (vs 13 previos)

**Negativas:**
- `ownershipHelpers` introduce una dependencia transversal; cambios en la firma afectan 5 controllers
- `createSessionFromDeck` importa helpers desde `controllers/helpers/` — inversion de dependencia atipica (service importa de controller helpers). Los helpers son funciones puras sin dependencia HTTP, pero la ubicacion es suboptima. Considerar mover a `utils/` o `services/helpers/` en futuras iteraciones

## ADR-022: Hardening de la capa WebSocket — persistencia RFID en Redis y limite de conexiones por usuario [Full-stack]

### Contexto (ADR-022)

Una auditoria de la comunicacion frontend-backend revelo dos vulnerabilidades en la capa WebSocket:

1. **Estado RFID volatil**: Los Maps en memoria `rfidModeByUserId` y `sensorIdToUserId` se pierden si el servidor se reinicia durante una partida activa. El profesor debe re-entrar al juego manualmente para restaurar el modo RFID, interrumpiendo la sesion educativa.

2. **Conexiones ilimitadas por usuario**: No existia limite de conexiones WebSocket simultaneas por usuario. Un usuario (o atacante) podia abrir conexiones ilimitadas, agotando recursos del servidor.

Adicionalmente, se identificaron dos bugs menores:
- El contexto de usuario en Sentry referenciaba `socket.user` (inexistente) en lugar de `socket.data.userId`.
- El error generico de fallo de comando no incluia codigo de error ni nombre del evento.

### Decision (ADR-022)

**Persistencia RFID en Redis (write-through)**:
- Al cambiar el modo RFID (`setRfidModeState`), se escribe simultaneamente en el Map en memoria y en Redis (`rfid:mode:{userId}`, TTL 1h).
- Al consultar el modo (`getRfidModeState`), se lee primero del Map; si esta vacio (post-reinicio), se recupera de Redis y se restaura el Map.
- Al limpiar el modo (`clearRfidModeState`), se borra de ambos.
- Los bindings sensor-usuario siguen el mismo patron (`rfid:sensor:{sensorId}`).
- Las escrituras a Redis son fire-and-forget (no bloquean el flujo principal).
- Si Redis no esta disponible, el sistema opera solo con el Map en memoria (degradacion transparente).

**Limite de conexiones por usuario**:
- Map `connectionCountByUserId` que cuenta conexiones activas por `userId`.
- Se incrementa en el middleware de autenticacion tras validacion exitosa.
- Se decrementa en el handler `disconnect`.
- Limite configurable via `SOCKET_MAX_CONNECTIONS_PER_USER` (default: 5).
- Al superar el limite: se rechaza la conexion con error `Limite de conexiones alcanzado` y se registra evento de seguridad `WS_CONNECTION_LIMIT`.

**Fixes de Sentry y error de comando**:
- Sentry usa `socket.data.userId` y `socket.data.userRole` correctamente.
- El error generico incluye `code: 'COMMAND_ERROR'` y `event: eventName` para diagnostico.

### Alternativas Consideradas (ADR-022)

1. **Persistir RFID state solo en Redis (sin Map)**: Rechazada. Introduciria latencia de red en cada lectura de modo RFID, que ocurre en el path critico de cada scan.

2. **Persistir todas las caches en Redis** (auth, ownership): Rechazada. Estas caches son de TTL muy corto (5-30s) y se repoblan naturalmente tras reinicio. El coste de persistencia supera el beneficio.

3. **Limite de conexiones via Redis** (distribuido): No necesario en la escala actual (single server). El Map local es suficiente y no introduce dependencia de Redis para la gestion de conexiones.

### Consecuencias (ADR-022)

**Positivas:**
- Tras reinicio del servidor, el modo RFID se recupera automaticamente al primer acceso — sin intervencion del profesor
- Proteccion contra DoS via apertura masiva de conexiones WebSocket
- Reportes de Sentry incluyen contexto de usuario para diagnostico efectivo
- Errores de comando distinguibles por el frontend (codigo + evento)

**Negativas:**
- `getRfidModeState` pasa de sincrono a async (requiere `await` en los call sites)
- Dependencia adicional de Redis para estado RFID (mitigado por fallback transparente)

### Relacion con otros ADRs

- **ADR-010** (Checkpoints de partida): Mismo patron de persistencia en Redis para recuperacion ante crash
- **ADR-011** (Redis Adapter): Reutiliza la infraestructura de Redis ya configurada para Socket.IO
- **ADR-016** (Rate limiting Redis store): Complementario — rate limiting protege throughput, este ADR protege recursos de conexion
- **ADR-020** (Cache Redis): Mismo patron fire-and-forget con fallback transparente

## ADR-023: Unicidad cross-deck de tarjetas RFID por profesor [Full-stack]

### Contexto (ADR-023)

ADR-012 elimino el modelo Card y trato las tarjetas RFID como tokens fungibles. Una consecuencia aceptada (punto 3 de "Negativas") fue que el mismo UID podia existir en multiples mazos activos del mismo profesor sin advertencia. En la practica, esto causaba confusion cuando un profesor reutilizaba una tarjeta fisica en un nuevo mazo sin darse cuenta de que ya estaba en otro, produciendo comportamiento inesperado al crear sesiones de juego.

### Decision (ADR-023)

Se implementa unicidad cross-deck de UIDs dentro de los mazos **activos** de un mismo profesor. El mismo UID puede existir en mazos de distintos profesores (compartir tarjetas entre aulas) y en mazos archivados.

**Resolucion automatica de conflictos:**
- Al crear o actualizar un mazo, si un UID ya existe en otro mazo activo del profesor, se elimina automaticamente del mazo anterior.
- Si el mazo anterior queda con menos de `MIN_DECK_CARDS` (2), se archiva automaticamente.
- La operacion es atomica (transaccion MongoDB via `withTransaction`).

**Feedback al profesor (doble capa):**
- `GET /api/decks/check-card?uid=X` — endpoint read-only para verificacion durante escaneo. El frontend muestra un toast informativo no bloqueante: "Esta tarjeta esta en el mazo X, se movera automaticamente."
- Al crear/actualizar, la respuesta incluye campo opcional `affectedDecks` con resumen de tarjetas movidas y mazos archivados.

**Service Layer para CardDeck:**
- Se introduce `cardDeckService.js` con dos funciones:
  - `checkCardInOtherDecks(uid, teacherId, excludeDeckId?)` — lectura para feedback inmediato
  - `resolveCardConflicts(uids, teacherId, session, excludeDeckId?)` — resolucion atomica dentro de transaccion
- El servicio no maneja transacciones; el controller orquesta `withTransaction` y pasa el session.

**Indice compuesto:**
- `{ createdBy: 1, status: 1, 'cardMappings.uid': 1 }` en CardDeck para busqueda eficiente de UIDs cross-deck.

### Alternativas Consideradas (ADR-023)

1. **Validacion sin auto-move (bloquear y avisar):** Rechazada. Obliga al profesor a ir manualmente al otro mazo, eliminar la tarjeta, volver al wizard y re-escanear. Demasiada friccion para un flujo comun.

2. **Move inmediato al escanear (sin transaccion):** Rechazada. Si el profesor cancela el wizard despues de escanear, las tarjetas ya se habrian movido de los mazos originales — estado inconsistente.

3. **Todo en el momento de crear (sin check previo):** Viable pero inferior. El profesor no recibe feedback hasta el final, cuando el mazo ya esta creado. El check al escanear da visibilidad inmediata.

### Consecuencias (ADR-023)

**Positivas:**
1. Elimina confusion por tarjetas duplicadas entre mazos activos del mismo profesor
2. Flujo no-destructivo hasta confirmar: si el profesor cancela, nada cambia
3. Introduce Service Layer para CardDeck (alineado con ADR-021)
4. Operacion atomica con transacciones MongoDB (alineado con ADR-015)
5. UX no intrusiva: toast informativo durante escaneo, resolucion automatica al guardar

**Negativas:**
1. Creacion/actualizacion de mazos ahora puede modificar otros mazos del mismo profesor como efecto secundario
2. El auto-archivado puede sorprender al profesor si no lee los toasts informativos
3. Latencia adicional en creacion/actualizacion por la transaccion multi-documento (despreciable en la escala actual)

### Relacion con otros ADRs

- **ADR-012** (Tarjetas como tokens fungibles): Este ADR refina ADR-012 anadiendo unicidad cross-deck por profesor, manteniendo la fungibilidad cross-profesor
- **ADR-015** (Repository pattern y transacciones): Reutiliza `withTransaction` y `createWithSession` en el repository
- **ADR-021** (Service Layer): Sigue el patron establecido de Service Layer para logica de negocio compleja

## ADR-024: Mejoras del Sistema de Assets — Sharpening, LQIP y AudioMiniPlayer [Full-stack]

**Estado**: Aprobado
**Fecha**: 30-03-2026

### Contexto

Los assets multimedia (imágenes y audio) de la plataforma funcionaban correctamente pero presentaban áreas de mejora en rendimiento percibido, claridad visual e integración con la UI. Las imágenes redimensionadas perdían definición, los placeholders de carga eran genéricos, el reproductor de audio era básico, y los assets se sentían "pegados" visualmente en las tarjetas y pantallas de juego.

### Decisiones

#### 1. Sharpening post-resize con Sharp (sigma 0.5)

Tras el redimensionado de imágenes (`768x768` y `256x256`), se aplica `sharp().sharpen({ sigma: 0.5 })`. Este valor es conservador: restaura la definición de bordes sin crear artefactos de halo visibles.

**Alternativas descartadas:**
- Sigma más alto (1.0+): riesgo de artefactos, especialmente en imágenes con gradientes suaves
- No aplicar sharpening: las imágenes redimensionadas mantienen el blur de downscale

#### 2. Extracción de color dominante via Sharp `stats()`

Se usa `sharp(buffer).stats()` para extraer el `{ dominant: { r, g, b } }` y almacenarlo como hex `#RRGGBB` en el campo `dominantColor` del asset.

**Alternativas descartadas:**
- `node-vibrant` / `color-thief`: dependencia externa, más lento, devuelve paletas completas innecesarias
- Computación lazy (calcular en frontend): requeriría descargar la imagen completa antes de mostrar el placeholder

**Decisión de backfill**: se creó `scripts/backfill-dominant-colors.js` para poblar assets existentes. NO se re-procesan imágenes existentes para sharpening (cambiaría URLs en Supabase, requiriendo actualizar documentos en cascada).

#### 3. AudioMiniPlayer como componente standalone

Se extrajo el reproductor de audio a `AudioMiniPlayer.jsx`, siguiendo el mismo patrón que `CardAssetPreview` (componente reutilizable para rendering de assets).

**Alternativas descartadas:**
- Audio inline en cada componente: duplicación, inconsistencia visual
- Librería de audio (howler.js, react-player): sobre-ingeniería para clips de ≤45s

#### 4. Thumbnail quality 80% → 85%

La diferencia de tamaño entre 80% y 85% WebP es ~5-10%, pero la claridad visual mejora notablemente en thumbnails con detalles finos (texto, bordes definidos).

### Consecuencias

- **Positivas**: imágenes más nítidas, carga percibida más rápida (LQIP), UI más cohesiva, audio con mejor UX
- **Negativas**: campo `dominantColor` requiere backfill para datos existentes; imágenes procesadas son ~2-5% más grandes por sharpening
- **Retrocompatibilidad**: `dominantColor` es opcional (`|| null` en DTOs); `getBestAssetImageUrl` se mantiene como alias

## ADR-025: Vinculación de Audio a Assets Existentes [Full-stack]

**Estado**: Aprobado
**Fecha**: 30-03-2026

### Contexto

El sistema trataba imagen y audio como assets independientes: `uploadImage` creaba un subdocumento con `imageUrl`, `uploadAudio` creaba otro con `audioUrl`. El schema permitía ambos campos en un mismo subdocumento, pero la API nunca los vinculaba. Además, `deleteAudio` eliminaba el asset completo del array, no solo el audio.

### Decisiones

#### 1. Audio como complemento del asset visual

Se añadió `PATCH /contexts/:id/assets/:assetKey/audio` para adjuntar o reemplazar audio en un asset existente (identificado por key). El flujo natural es: crear asset con imagen, luego opcionalmente añadir audio.

**Alternativa descartada**: Modal unificado donde imagen y audio se suben en un solo paso. Descartado porque el audio es opcional y frecuentemente se añade después de la imagen.

#### 2. Smart delete para audio

`deleteAudio` ahora solo elimina el `audioUrl` si el asset tiene imagen (conserva el asset). Si el asset solo tiene audio, elimina el asset completo.

**Alternativa descartada**: Siempre eliminar solo el campo `audioUrl`. Descartado porque dejaría assets vacíos sin utilidad visual.

#### 3. AudioPlayBadge vs AudioMiniPlayer en vistas de consulta

Para vistas de consulta (mazos, sesiones, wizard), se usa un badge compacto (`AudioPlayBadge`, 20px) con play rápido en lugar del `AudioMiniPlayer` completo. Este último se reserva para `ContextDetailPage` (gestión) y `ChallengeDisplay` (gameplay).

**Razón**: Las vistas de consulta muestran muchos assets en grids compactos. Un mini-player por cada card ocuparía demasiado espacio y añadiría ruido visual.

#### 4. Limpieza de audio en deleteImage

`deleteImage` ahora también elimina el archivo de audio de Supabase si el asset lo tiene, previniendo archivos huérfanos en Storage.

### Consecuencias

- **Positivas**: Audio vinculado al asset, gestión individual (añadir/reemplazar/eliminar), indicadores de audio cross-app, sin archivos huérfanos
- **Negativas**: Pestaña "Audio" eliminada del UploadAssetModal (ya no se pueden crear assets solo-audio desde la UI)
- **Retrocompatibilidad**: Assets solo-audio existentes siguen funcionando; el smart delete los elimina correctamente

---

## ADR-026: Descomposición modular del servicio de Analytics [Backend]

**Estado**: Aprobado
**Fecha**: 03-04-2026

### Contexto (ADR-026)

El servicio `analyticsService.js` alcanzó 1092 líneas con 11 funciones tras la implementación de ADR-017 (endpoints de analytics para dashboard). El Sprint 5 requiere añadir 19 nuevos endpoints analíticos que cubren trayectorias de aprendizaje, análisis de sesiones, engagement, efectividad de contenido, alertas inteligentes y datos de exportación.

Añadir estas funciones al servicio monolítico lo llevaría a ~3000+ líneas, con problemas de:
- **Mantenibilidad**: funciones de dominios distintos (alertas, engagement, contenido) en un solo archivo
- **Testabilidad**: dificultad para testear un dominio sin cargar todo el servicio
- **Code review**: un archivo de 3000 líneas es difícil de revisar en PRs
- **Paralelismo de trabajo**: dos desarrolladores no pueden trabajar simultáneamente en engagement y alertas sin conflictos

### Decisión (ADR-026)

Se descompone la funcionalidad **nueva** en sub-servicios temáticos bajo `services/analytics/`, preservando el servicio existente intacto:

```
services/
  analyticsService.js              ← INTACTO (11 funciones, 1092 líneas)
  analytics/
    analyticsHelpers.js            ← Utilidades compartidas
    studentTrajectoryService.js    ← 4 funciones (trajectory, velocity, plateaus, evolution)
    sessionAnalysisService.js      ← 4 funciones (rounds, cardAnalysis, struggles, fatigue)
    engagementService.js           ← 3 funciones (student, classroom, playPatterns)
    contentEffectivenessService.js ← 3 funciones (effectiveness, cardDifficulty, learningCurves)
    alertsService.js               ← 2 funciones (alerts, alertsSummary)
    reportDataService.js           ← 3 funciones (studentReport, classroomReport, exportData)
    index.js                       ← Re-exporta todos los sub-servicios
```

**Principios clave:**

1. **No se modifica `analyticsService.js`**: Las 11 funciones existentes permanecen idénticas. Zero riesgo de regresión en los endpoints actuales.
2. **Controller separado**: Los nuevos handlers van en `analyticsAdvancedController.js`, no en el controller existente.
3. **Helpers compartidos**: Las utilidades que usan múltiples sub-servicios (cálculo de date ranges, clasificación de tiers, constantes de performance) se extraen a `analyticsHelpers.js`.
4. **Mismos patrones**: Los sub-servicios usan los mismos repositories, cacheHelper, ownershipHelpers y logger que el servicio original.

### Alternativas Consideradas (ADR-026)

1. **Ampliar el servicio monolítico**: Simplemente añadir funciones a `analyticsService.js`. Rechazado por los problemas de mantenibilidad descritos.

2. **Refactorizar todo (mover funciones existentes)**: Mover las 11 funciones existentes a sub-servicios y dejar `analyticsService.js` como orquestador. Rechazado porque:
   - Introduce riesgo de regresión innecesario en endpoints que funcionan correctamente
   - Requiere actualizar todos los imports del controller existente
   - No aporta beneficio inmediato (las 11 funciones existentes son un conjunto cohesivo)

3. **Patrón Strategy por tipo de analytics**: Crear una interfaz `AnalyticsStrategy` con implementaciones por dominio. Rechazado porque:
   - Sobre-ingeniería para un servicio de lectura (no hay polimorfismo real en las queries)
   - El patrón de funciones exportadas de Node.js es más simple y directo

### Consecuencias (ADR-026)

**Positivas:**
- Cada sub-servicio tiene 250-400 líneas → fácil de entender y revisar
- Tests unitarios aislados por dominio
- Nuevo controller dedicado evita saturar el existente (165 líneas → ~450 sería el nuevo)
- Los imports son explícitos: `require('../services/analytics/alertsService')`
- El servicio original sigue funcionando sin cambios para el frontend actual

**Negativas:**
- Duplicación conceptual de imports (cacheHelper, logger, repositories) en cada sub-servicio
- 8 archivos nuevos en vez de 1
- Si en el futuro se quiere unificar, requiere consolidación

### Relación con otros ADRs

- **ADR-017**: Los 11 endpoints existentes y sus funciones en `analyticsService.js` no se modifican
- **ADR-014**: Los nuevos handlers usan `sendSuccess` de responseHelper
- **ADR-013**: Los nuevos handlers usan `asyncHandler` del flujo de errores centralizado
- **ADR-020**: Los nuevos endpoints usan `cacheGet` de cacheHelper con la misma estrategia de TTL

### Documento de Diseño

La justificación pedagógica y de Business Intelligence detallada (por qué cada endpoint, qué pregunta responde al profesor, justificación de umbrales) se documenta en `backend/docs/Analytics_Design_Rationale.md`.

---

## ADR-027: Arquitectura Frontend de Analytics — Suite de 4 Páginas [Frontend]

### Contexto (ADR-027)

El backend (ADR-017, ADR-026) dispone de 26 endpoints de analytics con framework KPI completo (RAG, narrativas What/So What/Now What, 10 KPIs con umbrales). Sin embargo, el frontend solo consumía 6 de esos 26 endpoints. El dashboard mostraba datos mock en `StudentsList`, la distribución recibía `null`, y los trends eran strings hardcodeados. Los profesores no tenían forma de hacer seguimiento individual de alumnos ni de analizar la efectividad del contenido por la dimensión mecánica × contexto.

### Decisión (ADR-027)

Construir una suite completa de analytics frontend con **4 páginas** y un lenguaje visual RAG uniforme:

1. **Dashboard mejorado** (`/dashboard`): 8 KPIs con datos reales y trends calculados, alertas inteligentes del backend (7 tipos, 3 severidades), heatmap de actividad semanal (día × hora), timeline de actividad reciente, distribución real de rendimiento.

2. **Perfil Individual de Estudiante** (`/students/:studentId`): KPIs con indicador RAG y comparativa con clase, trayectoria de aprendizaje con overlay de promedio de clase e indicador de tendencia (mejorando/estable/declinando), narrativa BI auto-generada (Qué pasó / Por qué importa / Qué hacer), rendimiento por contexto temático Y por mecánica de juego con barras coloreadas RAG, engagement score, historial de partidas, fortalezas y debilidades derivadas automáticamente.

3. **Vista Comparativa** (`/analytics/students`): Tabla interactiva ordenable/filtrable con métricas, búsqueda por nombre, filtro por tier, indicadores de actividad coloreados, resumen con distribución, y exportación CSV client-side.

4. **Insights y Reportes** (`/analytics/insights`): Matriz de efectividad mecánica × contexto con colores RAG, curvas de aprendizaje por contenido, hub centralizado de alertas con filtros, y generación de informes (clase/individual) con exportación.

### Alternativas descartadas

1. **Dashboard único con todo**: Descartado porque la sobrecarga cognitiva para profesores no técnicos es excesiva. Los profesores necesitan diferentes niveles de profundidad para diferentes tareas (visión rápida vs. seguimiento individual vs. análisis profundo).

2. **Tablas sin visualización**: Descartado porque los profesores de infantil/primaria necesitan patrones visuales intuitivos (semáforos, barras de colores), no números crudos.

3. **5+ páginas separadas**: Descartado para evitar fragmentación de la navegación. Los 3 aspectos de Insights (efectividad, alertas, informes) comparten contexto temporal y se resuelven mejor con tabs.

### Justificación pedagógica

- **Sistema RAG (semáforo)**: Lenguaje visual universal en educación — verde/ámbar/rojo se interpreta intuitivamente sin formación.
- **Narrativas What/So What/Now What**: Framework BI que traduce datos en acciones pedagógicas concretas, reduciendo carga cognitiva del profesor.
- **Dimensión mecánica × contexto**: Cada juego combina una mecánica (Asociación, Memoria) con un contexto temático (Animales, Números, Banderas). Sin cruzar ambas dimensiones, los promedios ocultan patrones críticos (ej: alumno domina memoria con animales pero falla en asociación con números).
- **Comparativa con clase**: Los números aislados no tienen significado para un profesor. "82%" no dice nada; "82% (vs clase: 71%)" da contexto.

### Componentes reutilizables creados

| Componente | Propósito | Ubicación |
|------------|-----------|-----------|
| `StudentKPICard` | KPI con RAG 4 capas (valor, semáforo, comparativa, narrativa) | `components/analytics/` |
| `TrajectoryChart` | LineChart con tendencia + overlay clase | `components/analytics/` |
| `NarrativeCard` | What/So What/Now What | `components/analytics/` |
| `PerformanceByDimension` | BarChart horizontal (contexto O mecánica) | `components/analytics/` |
| `GameHistoryTable` | Tabla de historial con badge RAG | `components/analytics/` |
| `StrengthsWeaknesses` | Fortalezas/debilidades derivadas | `components/analytics/` |
| `ActivityHeatmap` | Grid día × hora de actividad | `components/analytics/` |
| `ContentEffectivenessMatrix` | Grid mecánica × contexto RAG | `components/analytics/` |
| `AlertsHub` | Hub completo de alertas con filtros | `components/analytics/` |
| `ReportGenerator` | Interfaz de generación de informes | `components/analytics/` |

### Estrategia de rendimiento

- **Fetching sin waterfalls**: `Promise.all` para datos independientes. Datos secundarios (trajectory, engagement) como `.catch(() => null)` para no bloquear.
- **Bundle optimization**: Páginas lazy-loaded con `React.lazy`. Recharts (~390KB) en chunk separado.
- **Re-render optimization**: `memo()` en componentes de chart, `useMemo()` para derivaciones, `useCallback()` para handlers.
- **Animaciones**: Solo donde aceleran comprensión. `prefers-reduced-motion` respetado via `useReducedMotion`.

### Relación con otros ADRs

- **ADR-017** y **ADR-026**: Los 26 endpoints del backend son consumidos completos por esta suite frontend
- **ADR-003**: Los DTOs del backend se mapean directamente a props de componentes
- **ADR-012**: Las tarjetas RFID se referencian por UID en el análisis de dificultad de tarjetas

---

## ADR-028: Estrategia de Composición de Componentes de Analytics [Frontend]

### Contexto (ADR-028)

La suite de analytics requiere 10+ componentes nuevos con patrones compartidos (RAG colors, comparativa con clase, animaciones condicionales). Sin una estrategia de composición clara, se arriesga duplicación de lógica y boolean prop proliferation.

### Decisión (ADR-028)

1. **Patrón RAG como elemento firma**: Cada métrica en cada página sigue el patrón de 4 capas: valor numérico + indicador RAG (borde/dot) + comparativa contextual + micro-narrativa. Implementado en `StudentKPICard` con props explícitos (`ragStatus`, `comparison`, `comparisonPositive`).

2. **Explicit variants en vez de boolean props**: `PerformanceByDimension` acepta `dimension="context"` o `dimension="mechanic"` en vez de `isContext={true}`. Cada variante tiene su comportamiento explícito.

3. **Datos derivados durante render**: Alertas, filtros, y fortalezas/debilidades se derivan con `useMemo` durante render, no en `useEffect`. Evita efectos secundarios innecesarios y re-renders extra.

4. **Fetch strategy por página**: Cada página hace su propio fetch con `Promise.all` y `AbortController`. No hay store global de analytics — cada vista es autosuficiente.

5. **Tokens RAG del design system existente**: Se reutilizan `--color-success-base`, `--color-warning-base`, `--color-error-base` de los tokens OKLCH ya definidos en `index.css`. No se crea una segunda paleta.

### Consecuencias

**Positivas:**
- Componentes autocontenidos: cada uno es testeable y reutilizable
- Sin prop drilling complejo: datos pasan directo del fetch al componente
- Lenguaje visual consistente en toda la suite gracias al patrón RAG

**Negativas:**
- Múltiples fetches pueden hacer más peticiones al backend (mitigado por caché Redis server-side)
- Sin store global, cambiar de página pierde el estado (comportamiento esperado — cada vista es independiente)

## ADR-029: Consolidación de umbrales RAG y filtrado híbrido en Dashboard [Full-stack]

**Fecha:** 2026-04-06
**Estado:** Aceptado
**Contexto:** ADR-026, ADR-027, ADR-028

### Situación

Dos problemas identificados durante la revisión de la suite de analytics:

1. **Umbrales RAG duplicados**: Los mismos magic numbers de clasificación (score ≥70 → green, ≥50 → amber; score ≥90 → excellent, ≥70 → good, ≥50 → average) estaban definidos como funciones inline en 6 archivos frontend diferentes. Riesgo de divergencia y violación DRY.

2. **Filtros de contenido en Dashboard**: T-604 requería filtros de contexto temático y mecánica de juego, pero `analyticsService.js` no puede modificarse (ADR-026).

### Decisiones

**1. Módulo compartido de umbrales:**
- Crear `frontend/src/constants/analyticsThresholds.js` como fuente única de verdad frontend
- Exportar funciones de clasificación: `scoreToTier()`, `scoreToRAG()`, `getRAGCSSColor()`, `scoreToRAGWithNull()`
- Exportar constantes: `PERFORMANCE_TIERS`, `TIER_CONFIG`, `TIER_BADGE`
- Refactorizar 5 componentes para importar desde este módulo

**2. Filtrado híbrido:**
- **Server-side** en `analyticsController.js` para `getClassroomStudents`: pre-filtra por sessionIds que coincidan con contexto/mecánica, luego filtra los estudiantes que jugaron en esas sesiones
- **KPIs y trends sin filtrar**: muestran datos globales de clase (pedagógicamente correcto, el profesor necesita la visión general)
- El filtrado granular por contenido permanece en `/analytics/insights` con la `ContentEffectivenessMatrix`

**3. Cache ligero en Dashboard:**
- `useRef` con timestamp de último fetch y clave de filtros
- TTL de 60 segundos para evitar re-fetches en tab-focus
- Reduce las 8 peticiones paralelas a solo cuando los datos están realmente obsoletos

### Alternativas descartadas

- **Modificar `analyticsService.js`**: Descartada por ADR-026 (zero regresión)
- **Filtrado 100% client-side por contenido**: Los datos de estudiantes son agregados (avgScore) y no contienen desglose por contexto, por lo que filtrar no tendría sentido semántico
- **Store global (Redux/Zustand)**: Sobreingeniería para el caso de uso — cada página es independiente

### Consecuencias

**Positivas:**
- Fuente única de verdad para umbrales → eliminación de divergencia
- Filtros funcionales sin romper ADR-026
- Reducción de peticiones redundantes al backend

**Negativas:**
- Los umbrales frontend deben actualizarse manualmente si cambian en el backend (documentado en el header del archivo)
- El filtro de contenido no afecta a KPIs/trends (mitigado: la página de Insights cubre este caso)

## ADR-030: Protección de datos de menores — Minimización, consentimiento y ciclo de vida [Full-stack]

### Contexto (ADR-030)

La plataforma trata datos personales de menores de 4-8 años (colectivo especialmente protegido bajo el Considerando 38 del RGPD). La auditoría del código (T-701) identificó carencias significativas en materia de gobernanza de datos:

1. Se almacenaba `profile.birthdate` (fecha de nacimiento completa) cuando solo se necesita `profile.age`, violando el principio de minimización (Art. 5.1.c RGPD).
2. No existía mecanismo de consentimiento parental verificable, incumpliendo el Art. 8 RGPD y el Art. 7 LOPDGDD (edad mínima de 14 años en España).
3. El borrado de estudiantes era solo soft delete (`status: 'inactive'`), insuficiente para el derecho de supresión del Art. 17 RGPD.
4. No existía política de retención con plazos definidos (Art. 5.1.e RGPD).
5. No existían RAT (Art. 30) ni EIPD (Art. 35) obligatorios para tratamiento de datos de menores.

### Decisión (ADR-030)

Se implementan tres ejes de protección:

**Eje 1 — Minimización de datos (Art. 5.1.c RGPD):**
- Eliminación de `profile.birthdate` del modelo User para estudiantes. Se conserva únicamente `profile.age`.
- Eliminación de `lastLoginAt` para estudiantes (dato innecesario — los alumnos no inician sesión).
- Validación en pre-save que rechaza birthdate para role `student`.
- Script de migración `migrateBirthdate.js` para datos existentes.
- DTOs actualizados para no exponer birthdate.

**Eje 2 — Consentimiento parental (Art. 8 RGPD + Art. 7 LOPDGDD):**
- Campo `consent` en el modelo User con: `granted`, `grantedBy`, `grantedAt`, `purposes`, `policyVersion`, `withdrawnAt`.
- Bloqueo de creación de estudiante sin `consent.granted=true` y `consent.grantedBy`.
- Endpoint `PATCH /api/users/:id/consent` para otorgar/revocar consentimiento.
- La revocación desactiva automáticamente al estudiante (`status: 'inactive'`).
- Frontend: formulario de creación con checkbox de consentimiento obligatorio y campo de nombre del tutor.
- Evento de seguridad `DATA_CONSENT_CHANGE` para trazabilidad.

**Eje 3 — Ciclo de vida de datos (Arts. 17 + 5.1.e RGPD):**
- Endpoint `DELETE /api/users/:id/data` para borrado efectivo (hard delete) con cascada completa: User + GamePlays + tokens Redis + WebSocket.
- Requiere `confirmDeletion: true` como confirmación explícita.
- Solo accesible por profesor propietario (`createdBy`) o `super_admin`.
- Script `dataRetention.js` con política de retención automática:
  - GamePlays > 12 meses: anonimización (eliminar `playerId`, `cardUid`).
  - Estudiantes inactivos > 24 meses: borrado efectivo.
  - Flag `--dry-run` para previsualización.
- Configuración centralizada en `config/dataRetention.js`.

**Documentación normativa:**
- RAT (Registro de Actividades de Tratamiento) — Art. 30 RGPD.
- EIPD (Evaluación de Impacto en Protección de Datos) — Art. 35 RGPD.
- Script `dataAudit.js` para auditoría automática de campos PII.

### Alternativas Consideradas (ADR-030)

1. **Cifrar birthdate en vez de eliminar**: Descartada. El dato no es necesario para la función educativa; cifrarlo mantendría un dato innecesario (violación de minimización) y añadiría complejidad sin beneficio.

2. **Soft delete como único mecanismo de supresión**: Descartada. El soft delete no satisface el Art. 17 RGPD — los datos siguen existiendo en la base de datos. Se mantiene como mecanismo de «desactivación» (operación reversible), complementado por el hard delete como operación de supresión definitiva.

3. **Consentimiento implícito por uso del sistema**: Descartada. El Art. 8 RGPD exige consentimiento explícito del titular de la patria potestad para menores, y el Art. 7.1 exige que el responsable pueda demostrar que se obtuvo. Un consentimiento implícito no cumple ninguno de los dos requisitos.

4. **Separación física de PII en colección MongoDB separada**: Descartada para esta fase. Se opta por separación a nivel de DTOs (más pragmática, menor impacto en código existente). La separación física se puede implementar en fases posteriores si el análisis de riesgos lo justifica.

### Consecuencias (ADR-030)

**Positivas:**
- Cumplimiento demostrable del RGPD (Arts. 5, 8, 17, 25, 30, 35) y LOPDGDD (Arts. 7, 83, 92).
- Reducción de la superficie de datos: menos datos almacenados = menor impacto en caso de brecha.
- Consentimiento verificable: el registro es prueba ante una inspección de la AEPD.
- Datos más limpios: la retención evita acumulación indefinida de datos obsoletos.
- Diferenciación académica: demuestra madurez profesional en el TFG.

**Negativas:**
- Mayor fricción en la creación de estudiantes (formulario requiere datos del tutor).
- El borrado efectivo es irreversible — requiere confirmación explícita y comunicación clara.
- Los tests existentes que crean estudiantes necesitan actualización (incluir `consent`).

**Relaciones:**
- **ADR-015** (Repository pattern): Los nuevos endpoints usan `userRepository` y `gamePlayRepository`.
- **ADR-014** (responseHelper): Los nuevos handlers usan `sendSuccess` y `sendCreated`.
- **ADR-016** (Rate limiting): Los nuevos endpoints heredan rate limiting existente.
- **ADR-021** (Service Layer): Las funciones `updateConsent` y `hardDeleteStudent` residen en `userService`.

## ADR-031: Endurecimiento del consentimiento parental — Autorización, trazabilidad y defense in depth [Full-stack]

### Contexto (ADR-031)

Una revisión de seguridad exhaustiva del flujo de consentimiento parental (implementado en ADR-030) identificó varias vulnerabilidades y limitaciones:

1. **Falta de verificación de ownership** (SEC-01, CRÍTICO): La función `updateConsent` en `userService.js` no verificaba que el solicitante fuese el profesor creador (`createdBy`) del estudiante o `super_admin`. Cualquier teacher autenticado podía modificar el consentimiento de cualquier estudiante del sistema. Comparación directa con `hardDeleteStudent` que sí verificaba ownership, evidenciando un oversight.

2. **Tokens no revocados al retirar consentimiento** (SEC-02, ALTO): Al revocar el consentimiento, se desconectaba el WebSocket pero no se revocaban los tokens JWT en Redis. Inconsistencia con `hardDeleteUser` que sí revocaba tokens. Si la revocación se completaba pero la revocación de tokens fallaba, existía una ventana de acceso indebido.

3. **Sin historial de consentimiento** (SEC-03, ALTO): Al re-otorgar consentimiento, se reemplazaba todo el objeto `consent`, perdiendo la fecha de revocación anterior (`withdrawnAt`), el tutor anterior, y la cadena de otorgamiento-revocación-re-otorgamiento. El Art. 7.1 RGPD exige poder demostrar que se obtuvo consentimiento válido.

4. **Sin check de consentimiento en gameplay** (SEC-04, MEDIO): El sistema dependía exclusivamente de `status: 'inactive'` para impedir partidas sin consentimiento. No existía verificación directa de `consent.granted` al crear un GamePlay.

5. **Sin metadata de canal** (SEC-05, MEDIO): El registro de consentimiento no capturaba IP, user-agent ni canal de recogida en MongoDB. Esta información solo existía en los logs de Pino, dificultando la correlación en caso de disputa.

6. **`classroom` no redactado en logs** (SEC-06, BAJO): El campo `classroom` combinado con edad constituye un quasi-identificador (según la propia evaluación T-714), pero no se incluía en `SENSITIVE_KEYS` del security logger.

7. **Exportación incompleta** (SEC-08, BAJO): El endpoint de portabilidad (Art. 20 RGPD) omitía `totalTimeouts` y `totalAbandonedGames` del studentMetrics.

### Decisión (ADR-031)

Se implementan 7 mejoras para endurecer el flujo de consentimiento:

**1. Verificación de ownership en `updateConsent` (SEC-01):**
- La función recibe ahora el objeto `requestingUser` completo (antes solo el ID).
- Se verifica `student.createdBy === requestingUser._id` o `requestingUser.role === 'super_admin'`.
- Patrón idéntico al usado en `hardDeleteStudent` para consistencia.
- Archivo: `services/userService.js`.

**2. Revocación de tokens al retirar consentimiento (SEC-02):**
- Se añade `revokeAllUserTokens(id, 'consent_withdrawn', requestContext)` en el controller antes de desconectar WebSocket.
- Patrón idéntico a `hardDeleteUser`.
- Archivo: `controllers/userController.js`.

**3. Historial de consentimiento (SEC-03):**
- Nuevo campo `consentHistory: [{ action, grantedBy, timestamp, policyVersion, purposes }]` en el schema User.
- Cada otorgamiento o revocación genera un `$push` atómico al array.
- El historial se incluye en el DTO de estudiante y en la exportación de datos (Art. 20 RGPD).
- Archivos: `models/User.js`, `services/userService.js`, `utils/dtos.js`, `services/dataExportService.js`.

**4. Check de consentimiento en gameplay (SEC-04):**
- Se añade verificación `player.consent?.granted === true` en `validatePlayer()` de `gamePlayService.js`.
- Complementa la verificación implícita vía `status: 'inactive'` con un check directo (defense in depth).
- Archivo: `services/gamePlayService.js`.

**5. Metadata de canal en consentimiento (SEC-05):**
- Nuevos campos opcionales en el subdocumento `consent`: `channel`, `ipAddress`, `userAgent`.
- El controller inyecta estos datos desde `req.ip` y `req.get('user-agent')` antes de pasar al service.
- Archivos: `models/User.js`, `controllers/userController.js`, `services/userService.js`.

**6. Redacción de `classroom` en logs (SEC-06):**
- Se añade `'classroom'` a `SENSITIVE_KEYS` en `securityLogger.js`.
- Archivo: `utils/securityLogger.js`.

**7. Exportación completa de métricas (SEC-08):**
- Se añaden `totalTimeouts` y `totalAbandonedGames` al bloque de métricas de `dataExportService.js`.
- Archivo: `services/dataExportService.js`.

### Alternativas Consideradas (ADR-031)

1. **Colección separada `ConsentEvents` para historial**: Descartada. Más limpia pero añade complejidad de queries y joins. El array embebido `consentHistory` es suficiente para la escala del proyecto (un estudiante tendrá típicamente 1-3 cambios de consentimiento en su vida útil).

2. **Verificación de ownership en middleware en vez de service**: Descartada. El patrón del proyecto (ADR-021) ubica las validaciones de negocio en el service layer, no en middleware. Mantener consistencia con `hardDeleteStudent`.

3. **Almacenar IP hasheada en vez de en claro**: Considerada y descartada para esta fase. La IP del profesor se almacena para demostrar accountability (Art. 5.2 RGPD). Si se requiere mayor protección, se puede hashear en una fase posterior.

### Consecuencias (ADR-031)

**Positivas:**
- Eliminación de vulnerabilidad crítica de autorización (SEC-01).
- Coherencia total entre operaciones de consentimiento y borrado (mismos patrones de ownership + token revocation).
- Trazabilidad completa del ciclo de vida del consentimiento (Art. 7.1 RGPD).
- Defense in depth: el check de consentimiento en gameplay previene fallos en cascada si `status` no se actualiza correctamente.
- Metadata de canal proporciona evidencia vinculada al registro de consentimiento, no solo a logs.

**Negativas:**
- El array `consentHistory` crece con cada operación (impacto negligible a la escala del proyecto).
- La metadata de canal incluye IP en claro (aceptable para el contexto de un TFG educativo).

**Relaciones:**
- **ADR-030** (Protección de datos base): Esta ADR endurece y completa las medidas implementadas en ADR-030.
- **ADR-021** (Service Layer): Los ownership checks siguen el patrón establecido en el service layer.
- **ADR-016** (Rate limiting): Los endpoints afectados mantienen el rate limiting existente.

## ADR-032: Centralización de operaciones RGPD en el rol Super Admin [Full-stack]

### Contexto (ADR-032)

La plataforma gestiona datos de menores de 4-8 años en centros educativos. Tras implementar las capacidades de consentimiento parental (ADR-030) y su endurecimiento (ADR-031), se identificó que tres endpoints RGPD permitían acceso a `teacher` además de `super_admin`:

- `PATCH /api/users/:id/consent` — Otorgar/revocar consentimiento parental
- `DELETE /api/users/:id/data` — Borrado efectivo de datos (Art. 17 RGPD)
- `GET /api/users/:id/export-data` — Exportación de datos portables (Art. 20 RGPD)

En el flujo real de un centro educativo, estas operaciones no corresponden al profesor individual sino a la **dirección del centro** (jefe de estudios, director, secretaría), que es quien:

1. Recibe las solicitudes de los tutores legales (matrícula, revocación, ejercicio de derechos ARCO).
2. Actúa como punto de contacto ante la AEPD.
3. Es el **Responsable del Tratamiento** según el Art. 4.7 RGPD (no el profesor individual).

### Decisión (ADR-032)

Centralizar todas las operaciones RGPD sobre datos de estudiantes en el rol `super_admin`, dejando al `teacher` exclusivamente las funciones pedagógicas:

**Rol Super Admin (dirección del centro):**
- Crear estudiantes con consentimiento parental obligatorio (ya era así)
- Actualizar/transferir estudiantes (ya era así)
- Otorgar y revocar consentimiento parental
- Ejecutar borrado efectivo de datos (Art. 17)
- Exportar datos portables de estudiantes (Art. 20)
- Acceder a la futura página de información de privacidad (T-710)

**Rol Teacher (profesor):**
- Gestionar contextos educativos, mazos de tarjetas y sesiones de juego
- Lanzar y supervisar partidas en tiempo real
- Consultar analytics y estadísticas de sus alumnos (filtrados por `createdBy`)
- Sin acceso a operaciones de consentimiento, borrado ni exportación

**Cambios técnicos realizados:**
- `routes/users.js`: Los tres endpoints cambian `requireRole('teacher', 'super_admin')` a `requireRole('super_admin')`.
- Los ownership checks en `userService.js` y `dataExportService.js` se mantienen como defense in depth (si en el futuro se amplía el acceso, la protección ya existe).
- Los JSDoc de las rutas se actualizan para reflejar el nuevo nivel de acceso.

### Alternativas Consideradas (ADR-032)

1. **Mantener acceso de teacher con ownership check**: Descartada. Aunque técnicamente seguro (con el fix de SEC-01 en ADR-031), no refleja la realidad organizativa de un centro educativo. Los profesores no gestionan consentimiento ni ejercen derechos ARCO — eso es responsabilidad de la dirección.

2. **Crear rol intermedio `data_officer`**: Descartada. Añadir un tercer rol con login para una plataforma de alcance limitado (un centro educativo) introduce complejidad sin beneficio. El `super_admin` ya cumple esta función.

3. **Permitir a teachers solo exportar, no borrar ni revocar**: Descartada. La separación parcial crea ambigüedad sobre responsabilidades y dificulta explicar el modelo de acceso en la documentación de privacidad.

### Consecuencias (ADR-032)

**Positivas:**
- **Principio de mínimo privilegio**: Los profesores solo acceden a lo que necesitan para enseñar.
- **Alineación con la realidad organizativa**: Las operaciones RGPD las gestiona quien legalmente responde por ellas (la dirección del centro).
- **Simplicidad de auditoría**: Todas las acciones sobre datos de menores las ejecuta un único rol centralizado, facilitando el audit trail.
- **Menor superficie de ataque**: Menos usuarios con permisos sensibles = menor riesgo de uso indebido (accidental o malintencionado).
- **Claridad para la memoria del TFG**: El modelo de roles es limpio y fácil de justificar académicamente.

**Negativas:**
- Si el super_admin no está disponible, no se puede revocar consentimiento ni exportar datos hasta que vuelva. Mitigación: en un centro real habría más de un super_admin.
- Requiere que el centro tenga al menos una persona con rol super_admin permanentemente accesible.

**Relaciones:**
- **ADR-030** (Protección de datos base): Esta ADR restringe quién ejecuta las operaciones definidas en ADR-030.
- **ADR-031** (Endurecimiento del consentimiento): Los ownership checks de ADR-031 se mantienen como defense in depth.
- **ADR-008** (Gobierno de identidades centrado en Super Admin): Esta ADR extiende el principio de ADR-008 a las operaciones RGPD.

## ADR-033: Derecho de oposición a analytics comportamentales (Art. 21 RGPD) [Full-stack]

### Contexto (ADR-033)

La plataforma procesa datos de rendimiento educativo de menores de 4-8 años con dos finalidades distintas: **seguimiento educativo** (permitir al alumno jugar y registrar partidas) y **analytics de rendimiento** (agregar métricas, generar tendencias, rankings y comparativas). El Art. 21 del RGPD otorga al interesado (el tutor legal, en este caso) el derecho a oponerse al tratamiento de sus datos con fines de análisis sin que ello impida el uso básico del servicio.

Hasta ahora, el modelo de consentimiento (`consent.purposes: ['educational_tracking', 'performance_analytics']`) definía estos dos propósitos, pero no existía mecanismo para revocar uno sin revocar el otro. Al revocar el consentimiento completo (`consent.granted = false`), el alumno quedaba inactivo y no podía jugar.

### Decisión (ADR-033)

Implementar la revocación granular del propósito `performance_analytics` sin afectar al propósito `educational_tracking`:

**En la capa de agregación de métricas (gameEngine + gamePlayService):**
- Antes de llamar a `player.updateStudentMetrics()`, verificar si `consent.purposes` incluye `performance_analytics`.
- Si el propósito no está activo, la partida se completa normalmente pero las métricas agregadas del alumno (`studentMetrics`) no se actualizan.
- Se registra un log informativo para trazabilidad.

**En la capa de analytics (analyticsService + analyticsController):**
- Todas las queries que consultan estudiantes directamente (User model) añaden el filtro `{ 'consent.granted': true, 'consent.purposes': 'performance_analytics' }`.
- Las queries basadas en GamePlay (aggregation pipelines) excluyen los `playerId` de estudiantes sin consentimiento de analytics mediante `$nin`.
- Los endpoints de student individual verifican el consentimiento antes de servir datos y devuelven 403 con mensaje explicativo si el propósito no está activo.
- El helper `getAnalyticsExcludedPlayerIds(teacherId)` pre-obtiene los IDs a excluir para minimizar el impacto en las pipelines existentes.

**En la API de consentimiento (userService):**
- La función `updateConsent()` ya soporta enviar `purposes` parciales. Para revocar solo analytics: `{ granted: true, grantedBy: "...", purposes: ["educational_tracking"] }`.
- No se necesitan cambios en el validador (`updateConsentSchema` ya acepta `purposes` como array opcional).

**En el frontend (ConsentDetailPanel):**
- Sección de "Propósitos del tratamiento" con checkboxes individuales.
- `educational_tracking` es obligatorio y no se puede desmarcar sin revocar todo el consentimiento.
- `performance_analytics` es revocable individualmente con advertencia visual.
- `StudentProfile` muestra un banner informativo cuando el tutor ha ejercido el derecho de oposición.

### Alternativas Consideradas (ADR-033)

1. **Filtrar solo en el frontend (ocultar datos)**: Descartada. Viola el principio de que el tratamiento debe cesar en la fuente (Art. 5.1.b RGPD — limitación de la finalidad). Los datos seguirían agregándose en el backend.

2. **Crear un flag `analyticsOptOut` separado del consent**: Descartada. Duplicar la semántica de los purposes en un campo distinto introduce inconsistencia. El array `consent.purposes` ya modela exactamente este caso.

3. **Dejar de registrar GamePlay para alumnos sin analytics**: Descartada. El GamePlay es necesario para el seguimiento educativo básico (saber que el alumno jugó, su puntuación). Solo la agregación en `studentMetrics` y la inclusión en analytics deben cesar.

### Consecuencias (ADR-033)

**Positivas:**
- **Cumplimiento Art. 21 RGPD**: Los tutores pueden oponerse a analytics sin impedir la participación del alumno.
- **Granularidad**: Dos propósitos separados permiten control fino sobre el tratamiento.
- **Consistencia**: Usa el modelo de consent existente sin añadir campos nuevos.
- **Transparencia**: El frontend informa claramente sobre las implicaciones de la oposición.
- **Audit trail**: El historial de consentimiento registra los cambios de propósitos.

**Negativas:**
- Las analytics de aula excluyen a alumnos sin consent, lo que puede sesgar los promedios si una proporción significativa opta out.
- Cada consulta de analytics tiene una query adicional para obtener IDs excluidos. Impacto negligible en escala de aula (<50 estudiantes).

**Relaciones:**
- **ADR-030** (Protección de datos base): Esta ADR materializa el derecho de oposición mencionado en ADR-030.
- **ADR-031** (Endurecimiento del consentimiento): Los purposes se registran en `consentHistory` para trazabilidad.
- **ADR-032** (Centralización RGPD en super_admin): Solo super_admin puede modificar propósitos de consentimiento.

## ADR-034: Centralización de verificación de consentimiento RGPD [Backend]

### Contexto (ADR-034)

La verificación de consentimiento estaba dispersa en 3 ubicaciones (User model, analyticsController, analyticsAdvancedController) con implementaciones duplicadas. Cada una tenía su propia función `verifyAnalyticsConsent` con lógica idéntica: comprobar que el usuario tuviese `consent.granted === true` y que `consent.purposes` incluyese el propósito requerido. Esta dispersión implicaba que cualquier cambio en la lógica de verificación (por ejemplo, añadir la comprobación de `withdrawnAt`) debía replicarse manualmente en cada ubicación, con el consiguiente riesgo de inconsistencia.

### Decisión (ADR-034)

Crear `consentService.js` centralizado con los siguientes métodos:

- **`canTrackPerformance(user)`**: Verifica si el usuario tiene consentimiento activo para `performance_analytics`. Comprueba `consent.granted`, presencia del propósito en `consent.purposes`, y ausencia de `withdrawnAt` posterior al último `grantedAt`.
- **`canTrackEducational(user)`**: Verifica si el usuario tiene consentimiento activo para `educational_tracking`. Misma lógica de verificación que `canTrackPerformance` pero para el propósito educativo.
- **`requireConsent(user, purpose)`**: Lanza `AppError` con código 403 si el consentimiento para el propósito indicado no está activo. Uso en controllers como guard clause.
- **`getConsentStatus(user)`**: Devuelve un objeto resumen con el estado de cada propósito, útil para DTOs y el frontend.

Se eliminan las funciones `verifyAnalyticsConsent` duplicadas en `analyticsController.js` y `analyticsAdvancedController.js`, sustituyéndolas por llamadas al servicio centralizado.

### Alternativas Consideradas (ADR-034)

1. **Middleware de consentimiento por ruta**: Descartada. No todas las rutas requieren el mismo propósito, y la granularidad necesaria (educational vs. performance) haría el middleware demasiado complejo.

2. **Método estático en el modelo User**: Descartada. Viola la separación de responsabilidades del proyecto (ADR-021) donde la lógica de negocio reside en el service layer, no en los modelos.

3. **Mantener las funciones locales y sincronizarlas manualmente**: Descartada. Exactamente el problema que motivó esta ADR: la sincronización manual es propensa a errores y dificulta la auditoría.

### Consecuencias (ADR-034)

**Positivas:**
- Punto único de auditoría para compliance RGPD: toda verificación de consentimiento pasa por un solo servicio.
- Bug fix: `hasConsentFor()` ahora verifica `withdrawnAt` (Art. 7.3 RGPD — el consentimiento puede retirarse en cualquier momento y la retirada debe ser efectiva).
- Menor superficie de error al modificar la lógica de consentimiento.
- Facilita la adición de nuevos propósitos de tratamiento en el futuro.

**Negativas:**
- Añade una dependencia de servicio adicional en controllers que antes eran autónomos.

**Relaciones:**
- **ADR-030** (Protección de datos base): Centraliza la verificación de consentimiento introducida en ADR-030.
- **ADR-031** (Endurecimiento del consentimiento): El bug fix de `withdrawnAt` completa el endurecimiento de ADR-031.
- **ADR-033** (Derecho de oposición): La verificación granular por propósito soporta directamente el mecanismo de oposición de ADR-033.

## ADR-035: Serialización de operaciones RFID mode con mutex por usuario [Backend]

### Contexto (ADR-035)

Las funciones de gestión de modo RFID (`setRfidModeState`, `clearRfidModeState`, `setRfidSensorBinding`) operan sobre Maps en memoria sin protección contra interleaving. Aunque Node.js es single-threaded y el event loop garantiza la atomicidad de operaciones síncronas, se añade defensa en profundidad por dos motivos:

1. Si en el futuro se introduce lógica asíncrona (e.g., persistencia en Redis del estado RFID, como se menciona en ADR-022), las operaciones dejarían de ser atómicas y podrían intercalarse.
2. El patrón ya existe en el proyecto (`executeWithPlayLock` en GameEngine) y su adopción es consistente con la arquitectura establecida.

### Decisión (ADR-035)

Implementar `executeWithRfidLock(userId, operation)` como mutex basado en Promise chaining, siguiendo el mismo patrón que `executeWithPlayLock` en GameEngine:

- Se mantiene un `Map<userId, Promise>` donde cada nueva operación se encadena a la Promise anterior del mismo usuario.
- Los helpers expuestos a socket commands (`setRfidModeState`, `clearRfidModeState`, `setRfidSensorBinding`) wrappean internamente sus operaciones con el lock.
- El lock se libera automáticamente al completarse la operación (tanto en éxito como en error).
- Usuarios distintos no se bloquean entre sí (el lock es per-user, no global).

### Alternativas Consideradas (ADR-035)

1. **No añadir lock (confiar en single-thread)**: Descartada. Correcta para el estado actual, pero frágil ante cambios futuros. El coste del lock es negligible y la protección es preventiva.

2. **Lock global para todas las operaciones RFID**: Descartada. Serializaría operaciones de usuarios independientes, introduciendo latencia innecesaria en escenarios de múltiples profesores simultáneos.

3. **Mutex con semáforo explícito (`async-mutex`)**: Descartada. Añade una dependencia externa para un patrón que ya se resuelve con Promise chaining nativo en el proyecto.

### Consecuencias (ADR-035)

**Positivas:**
- Previene race conditions si se añade lógica async en el futuro (defensa en profundidad).
- Operaciones RFID del mismo usuario se serializan, garantizando consistencia del estado.
- Overhead mínimo (~0ms) para operaciones síncronas actuales, ya que las Promises se resuelven inmediatamente.
- Patrón consistente con `executeWithPlayLock` del GameEngine.

**Negativas:**
- Complejidad añadida para un escenario que actualmente no presenta problemas reales de concurrencia.
- El Map de locks crece con cada usuario activo (se limpia automáticamente al completarse las operaciones).

**Relaciones:**
- **ADR-022** (Hardening WebSocket — RFID en Redis): Si se implementa persistencia RFID en Redis, el lock protegerá las operaciones async resultantes.
- **ADR-010** (Checkpoints y resiliencia): Sigue el mismo patrón de Promise-based mutex establecido en GameEngine.

## ADR-036: Endpoint de métricas del sistema (/api/health/metrics) [Backend]

### Contexto (ADR-036)

El endpoint `/health` solo devolvía estado básico (`status: 'ok'`, timestamp). No había visibilidad sobre el estado interno de la plataforma: partidas activas, estado de conexión a Redis y MongoDB, métricas del GameEngine, o número de clientes WebSocket conectados. Para diagnóstico y monitorización en producción, era necesario conectarse directamente al servidor o consultar logs.

Las métricas del GameEngine (`activePlays`, `totalPlaysStarted`, `totalPlaysFinished`, etc.) existían como código implementado pero no expuesto — se calculaban internamente pero no había forma de consultarlas externamente.

### Decisión (ADR-036)

Añadir `GET /api/health/metrics` protegido por `requireRole('super_admin')` que expone métricas agregadas de los subsistemas principales:

- **GameEngine**: `activePlays`, `totalPlaysStarted`, `totalPlaysFinished`, `totalErrors`, locks activos y colas pendientes.
- **Redis**: latencia medida via `PING` (ms), estado de conexión.
- **MongoDB**: `readyState` del driver Mongoose (0=disconnected, 1=connected, 2=connecting, 3=disconnecting).
- **Sockets**: `clientsCount` (conexiones WebSocket activas).
- **Runtime**: `uptime` del proceso, uso de memoria (`process.memoryUsage()`), versión de Node.js.

El endpoint requiere autenticación JWT y rol `super_admin`. Devuelve 403 para cualquier otro rol.

### Alternativas Consideradas (ADR-036)

1. **Exponer métricas en formato Prometheus**: Descartada para esta fase. Requiere una dependencia adicional (`prom-client`) y un stack de monitorización (Prometheus + Grafana) que excede el alcance del TFG. Se puede añadir en el futuro reutilizando los mismos datos.

2. **Endpoint público sin autenticación**: Descartada. Las métricas del sistema (partidas activas, estado de BD, memoria) son información sensible que podría facilitar ataques de timing o reconocimiento.

3. **Logs estructurados periódicos en vez de endpoint**: Descartada. Los logs ya existen (Pino), pero no permiten consulta bajo demanda. El endpoint complementa los logs, no los sustituye.

### Consecuencias (ADR-036)

**Positivas:**
- Visibilidad operacional sin herramientas externas: un super_admin puede diagnosticar problemas desde el navegador o con `curl`.
- Solo accesible por `super_admin`, manteniendo el principio de mínimo privilegio.
- Métricas del GameEngine que antes eran código muerto ahora se exponen y son útiles.
- Base para futura integración con sistemas de monitorización (Prometheus, Grafana).

**Negativas:**
- El `PING` a Redis añade ~1ms de latencia al endpoint. Aceptable para un endpoint de diagnóstico que no se consulta con alta frecuencia.
- Las métricas son un snapshot puntual, no series temporales. Para tendencias históricas se necesitaría un sistema de monitorización completo.

**Relaciones:**
- **ADR-010** (Checkpoints y resiliencia): Las métricas del GameEngine expuestas aquí incluyen los contadores de partidas gestionados por el sistema de checkpoints.
- **ADR-016** (Rate limiting Redis): El estado de Redis verificado aquí es el mismo store usado para rate limiting.
- **ADR-011** (Socket.IO Redis Adapter): El `clientsCount` refleja las conexiones gestionadas por el adapter.

---

## ADR-037: Protección de estabilidad del proceso (unhandledRejection/uncaughtException) [Backend]

### Contexto (ADR-037)

El servidor no disponía de handlers para `process.on('unhandledRejection')` ni `process.on('uncaughtException')`. En Node.js >=15, las promesas rechazadas sin handler crashean el proceso sin logging ni cleanup. Las excepciones síncronas fuera de try/catch tienen el mismo efecto.

### Decisión (ADR-037)

Se han añadido ambos handlers en `server.js` que:
1. Loguean el error con nivel `fatal` via Pino.
2. Reportan a Sentry con tag de origen (`unhandledRejection` / `uncaughtException`).
3. Ejecutan `gracefulShutdown()` para cerrar conexiones ordenadamente.

Adicionalmente, los timers del proceso (`setInterval` del GameEngine, `setTimeout` del shutdown) ahora llaman `.unref()` para no impedir la terminación del event loop si el shutdown handler falla.

### Consecuencias (ADR-037)

- Un error no capturado ya no produce un crash silencioso — siempre hay log y reporte.
- El proceso se cierra de forma controlada incluso ante errores fatales.
- Los timers no bloquean el apagado del proceso.

---

## ADR-038: Límite duro de partidas activas simultáneas [Backend]

### Contexto (ADR-038)

ADR-001 eliminó el límite duro de partidas, manteniendo solo un umbral de warning. Sin embargo, sin límite duro, una acumulación de partidas (por bug, abuso, o cleanup fallido) puede provocar OOM y crash del proceso.

### Decisión (ADR-038)

Se ha añadido `ACTIVE_PLAYS_HARD_LIMIT` (configurable via env, default 2000) que rechaza nuevas partidas cuando se alcanza. El umbral de warning existente (default 1000) se mantiene como alerta temprana. Esto complementa ADR-001 con una red de seguridad sin afectar al uso normal.

### Consecuencias (ADR-038)

- Protección contra OOM: el proceso nunca acumula más de `HARD_LIMIT` partidas en memoria.
- En uso normal del aula (decenas de partidas), el límite es inalcanzable.
- El error se comunica al cliente via Socket.IO para que el profesor pueda reintentar.

---

## ADR-039: Timeout de queries aggregate (maxTimeMS) [Backend]

### Contexto (ADR-039)

Las aggregation pipelines de MongoDB (analytics, stats) no tenían `maxTimeMS`. Un pipeline mal optimizado o sobre un dataset grande podría ejecutarse indefinidamente, bloqueando el pool de conexiones.

### Decisión (ADR-039)

Se ha centralizado `maxTimeMS` en los repositories (`gamePlayRepository`, `gameSessionRepository`, `userRepository`) con un default de 15 segundos (configurable via `AGGREGATE_TIMEOUT_MS`). Todos los callers heredan el timeout automáticamente, con posibilidad de override por llamada.

### Consecuencias (ADR-039)

- Ninguna aggregation puede bloquear el pool de conexiones indefinidamente.
- El timeout de 15s es generoso para el volumen de datos esperado (decenas de usuarios).
- Si un pipeline legítimo necesita más tiempo, puede pasar `{ maxTimeMS: 30000 }` como segundo argumento.

---

## ADR-040: Observabilidad del circuit breaker y health check mejorado [Backend]

### Contexto (ADR-040)

El `CircuitBreaker` (usado por Redis y Supabase Storage) cambiaba de estado sin emitir logs. El health check de Redis solo verificaba conexión, no consultaba el estado del circuit breaker.

### Decisión (ADR-040)

1. El `CircuitBreaker` ahora logea cada transición de estado (`closed→open`, `open→half_open`, `half_open→closed`) con nivel `warn`.
2. El health check de Redis (`/health`) reporta el estado del circuit breaker como campo adicional.
3. Si el circuit breaker está `open`, Redis se reporta como `degraded` en vez de `healthy`.

### Consecuencias (ADR-040)

- Los operadores saben inmediatamente cuándo Redis entra en degradación.
- El health check refleja el estado real del servicio, no solo la conexión TCP.
- No hay impacto en rendimiento (el log solo se emite en transiciones, no en cada operación).

---

## ADR-041: Recovery de card locks tras reconexión Redis [Backend]

### Contexto (ADR-041)

Si Redis se desconecta temporalmente durante partidas activas, las card locks (con TTL) expiran. Cuando Redis reconecta, las partidas siguen en memoria pero sus tarjetas ya no están reservadas, permitiendo conflictos.

### Decisión (ADR-041)

Se ha añadido un mecanismo de recovery que:
1. `redis.js` emite un callback cuando el evento `ready` se dispara tras una desconexión.
2. El `GameEngine` registra un callback en `onReconnect()` al inicializarse.
3. Al reconectar, re-ejecuta `reserveDistributedCardMappings` para cada partida activa.

### Consecuencias (ADR-041)

- Las partidas activas mantienen sus reservas de tarjetas incluso tras interrupciones de Redis.
- Si una reserva falla (conflicto con otra instancia), se logea pero la partida continúa.
- El recovery es automático y no requiere intervención del operador.

---

## ADR-042: Multer memory storage como diseño aceptado [Backend]

### Contexto (ADR-042)

Multer usa `memoryStorage()` para almacenar uploads (imágenes ≤8MB, audio ≤5MB) en RAM antes de procesarlas con Sharp/music-metadata. Se evaluó migrar a `diskStorage` o streaming para reducir presión de memoria.

### Decisión (ADR-042)

**Se mantiene `memoryStorage()`.** Razones:
1. Los límites de tamaño (8MB/5MB) protegen contra uploads abusivos.
2. Sharp procesa buffers de forma eficiente con streaming interno.
3. El rate limiter de uploads (20/hora por usuario) limita concurrencia.
4. Para el caso de uso (decenas de profesores), incluso 10 uploads simultáneos = ~80MB temporal, aceptable.
5. Migrar a disk storage requeriría cambiar el pipeline de procesamiento en `imageProcessingService` y `audioValidationService`.

### Consecuencias (ADR-042)

- Sin cambios de código. El pipeline actual (multer buffer → Sharp → Supabase) se mantiene.
- Si en el futuro se necesita manejar cientos de uploads concurrentes, se debería migrar a streaming.

---

## ADR-043: Invalidación inmediata de auth cache vía eventos internos [Backend]

### Contexto (ADR-043)

El `authRevalidationCache` en Socket.IO cacheaba resultados de auth por 30 segundos. Un token revocado (logout, detección de robo) seguía siendo válido para operaciones socket durante esa ventana.

### Decisión (ADR-043)

Se implementó un `authEventBus` (EventEmitter interno en `utils/authEvents.js`) que comunica revocaciones de tokens del middleware de auth al layer de sockets:
- `revokeAllUserTokens()` emite `all_tokens_revoked` → purga todas las entradas del cache de ese userId
- `revokeToken()` emite `token_revoked` → caso individual, impacto mínimo por el TTL corto

### Consecuencias (ADR-043)

- La ventana de revocación para `revokeAllUserTokens` baja de 30s a ~0s.
- Para revocación individual, se mantiene la expiración por TTL (30s) — el impacto es una sola entrada.
- El EventEmitter es síncrono y no añade latencia al flujo de revocación.

---

## ADR-044: Migración a Socket.IO namespaces (/game) [Full-stack]

### Contexto (ADR-044)

Todos los eventos Socket.IO (sistema, gameplay, RFID) usaban el namespace por defecto `/`. Esto impedía aplicar middleware, rate limiting y auth de forma granular.

### Decisión (ADR-044)

Se crearon dos namespaces:
- **`/`** (default): Eventos de sistema — `connect`, `disconnect`, `session_invalidated`, `rfid_mode_changed`. Auth middleware con conteo de conexiones.
- **`/game`**: Eventos de gameplay — todos los comandos de partida, RFID scans, card assignment. Auth middleware sin conteo (reutiliza la conexión del namespace default). Rate limiting y payload validation solo aquí.

El `GameEngine` recibe la referencia al namespace `/game` y emite gameplay events directamente. Los eventos de sistema (como `rfid_mode_changed`) se emiten en el namespace default.

### Cambios (ADR-044)

**Backend**: `server.js` (creación namespace), `socketHandlers.js` (auth middleware extraído, dos handlers de conexión), `gameEngine` (recibe namespace `/game`).

**Frontend**: `socket.js` (dos sockets multiplexados), métodos `onGame`/`emitGame` para gameplay, `on`/`emit` para sistema. `useGameSocket.js`, `webSerialService.js` y tests actualizados.

### Consecuencias (ADR-044)

- Mejor separación de concerns: middleware y rate limiting solo afectan al namespace relevante.
- El conteo de conexiones solo ocurre en el namespace default (evita doble conteo por multiplexación).
- Los eventos de gameplay están aislados de los de sistema.
- Socket.IO multiplexa ambos namespaces sobre la misma conexión WebSocket — sin overhead de red adicional.

---

## ADR-045: Decomposición modular del GameEngine [Backend]

### Contexto (ADR-045)

El `GameEngine` era un archivo monolítico de 2080 líneas con 48 métodos que gestionaba: lifecycle de partidas, escaneo RFID, timers, cleanup, locks distribuidos, recovery, métricas y estrategias de juego. Difícil de testear y mantener.

### Decisión (ADR-045)

Se descompuso en una estructura de directorio con 3 módulos extraídos:

```
services/gameEngine/
├── index.js          — Re-exporta la clase (mismo require path para consumidores)
├── GameEngine.js     — Clase principal (~1560 líneas, core gameplay)
├── recovery.js       — Recovery al startup y cleanup de huérfanos (~280 líneas)
├── timerManager.js   — Timers: cleanup, heartbeat, transient (~230 líneas)
└── stateHelpers.js   — Getters de estado, cálculos de tiempo (~260 líneas)
```

Cada módulo exporta funciones que reciben `engine` (instancia de GameEngine) como parámetro. La clase mantiene métodos-puente de una línea que delegan al módulo. Los consumidores siguen haciendo `require('./services/gameEngine')` sin cambios.

### Consecuencias (ADR-045)

- El archivo principal bajó de 2080 a 1560 líneas (~25% reducción).
- Los módulos extraídos son testeables de forma independiente con un mock de `engine`.
- La API pública del GameEngine no cambió — transparente para los 13 archivos consumidores.
- Los imports internos se ajustaron al nuevo path relativo (un nivel más profundo).

---

## ADR-046: Feedback explícito para escaneos RFID ignorados (scan_ignored) [Full-stack]

### Contexto (ADR-046)

El `GameEngine.handleCardScan()` ignoraba silenciosamente escaneos RFID en varios escenarios: partida pausada, entre rondas, tarjeta no reconocida. El profesor no recibía ningún feedback — simplemente no pasaba nada. Para usuarios no técnicos en un aula, esto es inaceptable.

### Decisión (ADR-046)

1. **Backend**: El GameEngine emite `scan_ignored` al play room con `{ uid, reason }` en 3 escenarios donde el `playId` es conocido: `play_paused`, `not_awaiting_response`, `card_not_in_play`.
2. **Frontend**: `useGameSocket` escucha `scan_ignored` y muestra un toast informativo con mensaje en español adaptado al `reason` code. El toast usa `id: 'scan-ignored'` para deduplicar escaneos rápidos.
3. **Timeout client-side**: Si el frontend emite un scan pero no recibe ninguna respuesta del servidor en 3 segundos, muestra un toast warning "Tarjeta no reconocida". Esto cubre el caso donde el UID no está en ninguna partida activa (el backend no puede emitir porque no conoce el playId).

### Consecuencias (ADR-046)

- El profesor siempre recibe feedback visible cuando un escaneo no produce efecto.
- El volumen de `scan_ignored` está limitado por el dedup del frontend (1200ms) y el rate limiter del backend (2/3s).
- El toast usa `toast.info` (no error) para no alarmar — indica que el sistema funciona pero el escaneo no aplica.

---

## ADR-047: Política de bloqueo RFID relajada para entorno educativo [Backend]

### Contexto (ADR-047)

La política de bloqueo temporal de Socket.IO bloqueaba un socket tras 3 violaciones de rate limit durante 60 segundos. En un entorno de aula, un profesor que accidentalmente doble-escanea una tarjeta 3 veces rápidamente quedaba bloqueado durante 1 minuto completo — frustrante e incomprensible para un usuario no técnico.

### Decisión (ADR-047)

Se ajustó `socketBlockConfig`:
- `violationThreshold`: 3 → **5** (más margen para errores accidentales)
- `blockDurationMs`: 60s → **15s** (recuperación rápida si se alcanza)

### Consecuencias (ADR-047)

- Un profesor necesita 5 violaciones consecutivas (no 3) para ser bloqueado.
- Si se bloquea, se recupera en 15 segundos (no 60).
- La protección contra abuso deliberado sigue activa — 5 violaciones seguidas no es comportamiento normal.
- Test actualizado en `socketRateLimiter.test.js`.

## ADR-048: Selección de Librería de Visualización (Recharts) [Frontend]

### Contexto

El dashboard requiere múltiples tipos de gráficos (áreas, mapas de calor, barras) para visualizar datos complejos de rendimiento. Necesitamos una librería que sea:

1.  **React-Nativa**: Para evitar wrappers y problemas de ciclo de vida.
2.  **Flexible**: Personalizable para adaptarse al sistema de diseño (Temas oscuros, gradientes).
3.  **Ligera**: Para no impactar negativamente en el tiempo de carga (LCP).

### Decisión

Se ha seleccionado **Recharts** sobre alternativas como Chart.js o Victory.

### Justificación

- **Composición**: Recharts usa un modelo de composición de componentes (`<AreaChart>`, `<XAxis>`, `<Tooltip>`) que encaja perfectamente con la filosofía de React, haciendo el código más legible y mantenible.
- **SVG**: Renderiza SVG, lo que garantiza nitidez en cualquier resolución (crucial para pantallas de retina en tablets) y facilita la animación con CSS/Framer Motion.
- **Payload**: Es Modular, permitiendo tree-shaking efectivo (solo importamos lo que usamos).

### Consecuencias

- **Curva de aprendizaje**: Requiere entender el modelo de composición en lugar de pasar un gran objeto de configuración.
- **Rendimiento**: Excelente para datasets medianos (<1000 puntos), que es nuestro caso de uso (clases de ~30 alumnos). Para Big Data habría que considerar Canvas, pero no aplica aquí.

---

## ADR-049: Patrón de Diseño de Dashboard (Jerarquía "F") [Frontend]

### Contexto

El dashboard es una herramienta de trabajo diaria para el profesor. La carga cognitiva debe ser mínima; el profesor debe poder entender el estado de la clase en segundos.

### Decisión

Se implementa un layout siguiendo el **Patrón de Lectura en F** y principios de Jerarquía Visual.

### Detalles de Implementación

1.  **Nivel Superior (Encabezado)**: Filtros globales (Contexto temporal). Afectan a toda la página.
2.  **Nivel 1 (Izquierda Superior)**: KPIs Críticos (Estudiantes en Riesgo). Es el primer punto donde se posa la vista. Usamos colores semánticos (Rojo = Alerta).
3.  **Nivel 2 (Centro)**: Gráfico de Tendencia. Proporciona contexto histórico inmediato.
4.  **Nivel 3 (Inferior/Derecha)**: Detalles y listas. Información para análisis profundo, accesible tras el escaneo inicial.

### Consecuencias

- **Usabilidad**: Reduce el tiempo de análisis del profesor.
- **Escalabilidad**: El layout permite añadir más "filas" de análisis verticalmente sin romper la jerarquía.

---

## ADR-050: Estrategia de Fetching de Datos (On-Mount + Polling Sincronizado) [Frontend]

### Contexto

Los datos de analíticas cambian cuando los alumnos terminan partidas. No es un sistema de trading (ms), pero tampoco puede ser estático.

### Decisión

Se opta por **Fetch en Paralelo al Montar** (`Promise.all`) para la carga inicial.

### Justificación

- **UX**: Evita el "efecto cascada" donde los gráficos van apareciendo uno a uno. El dashboard carga sus esqueletos y luego muestra todo el contenido de golpe (o con transiciones coordinadas).
- **Separación de Responsabilidades**:
  - `analyticsService.js`: Abstrae la lógica de llamadas HTTP.
  - `Dashboard.jsx`: Gestiona el estado y la presentación.
- **Simplicidad**: En esta fase, no se usan WebSockets para analíticas (solo para juego en tiempo real). La complejidad de mantener sockets para un dashboard que se consulta periódicamente no compensa el beneficio.

### Futuras Mejoras

- Implementar `SWR` o `TanStack Query` para revalidación automática en foco y caché inteligente, reduciendo llamadas innecesarias.

---

## ADR-051: Sistema de Alertas Basado en Reglas (Frontend) [Frontend]

### Contexto

El backend devuelve datos crudos o agregados, pero la "interpretación" pedagógica (¿es esto bueno o malo?) a veces depende del contexto del frontend o preferencias del usuario (futuro).

### Decisión

Se implementa un motor de reglas ligero en el cliente (`Dashboard.jsx` -> `alerts` logic) que consume los KPIs del backend.

### Justificación

- **Inmediatez**: Permite generar feedback visual instantáneo sin ida y vuelta al servidor para cada validación de UI.
- **Flexibilidad**: Podemos cambiar los umbrales de "Riesgo" (ej. subir de nota 50 a 60) en el frontend rápidamente según feedback de usabilidad, sin redeploy de backend.

### Consecuencias

- Lógica de negocio en cliente: Debe mantenerse sincronizada con cualquier lógica crítica de backend (ej. si el backend envía emails de alerta, debe usar los mismos criterios). Para visualización, es aceptable.


---

## ADR-052: Mecánicas de juego inmutables en API [Backend]

### Contexto

Hasta v0.5.0 los endpoints `POST/PUT/DELETE /api/mechanics` permitían a cualquier teacher autenticado crear, modificar y desactivar mecánicas. Las mecánicas son un primitivo del producto: el modelo de juego (Asociación, Memoria, Secuencia) lo decide el equipo de desarrollo, no los profesores.

### Decisión

Se eliminan las operaciones de escritura en `/api/mechanics`. Los handlers POST/PUT/PATCH/DELETE devuelven 405 Method Not Allowed con `Allow: GET` y un mensaje explicando que las mecánicas se gestionan vía seeders/migraciones.

### Justificación

- **Integridad del producto**: las mecánicas tienen comportamiento implementado en el backend (state machines, scoring); permitir CREATE arbitrario sin código que las soporte es un footgun.
- **Seguridad**: cierra una superficie de escritura innecesaria.
- **Honestidad de la API**: si algo no debe modificarse en runtime, la API no debe exponerlo.

### Consecuencias

- Los tests del módulo (`validationEndpoints.test.js`) se actualizan para esperar 405 en POST/PUT/DELETE.
- Frontend ya no consumía esos endpoints; no hay impacto cliente.
- Si en el futuro se quiere "configuración fina" de una mecánica (ej. cambiar `defaults.timeLimit`), se hará vía seeders versionados o un endpoint dedicado distinto.

---

## ADR-053: Política de ownership en assets de contextos [Full-stack]

### Contexto

Los contextos temáticos (`game_contexts`) son recursos compartidos: cualquier teacher ve todos. El subdocumento `assets[]` permitía hasta v0.5.0 que cualquier teacher subiera assets, pero también que cualquier teacher eliminara assets de otros, sin trazabilidad.

A nivel de producto se distinguen dos tipos de "propiedad":

- **El contexto** (la "carpeta") es responsabilidad del super_admin: él lo crea, lo renombra y lo elimina (junto con todo su contenido) desde `/admin/contexts`.
- **Los assets** dentro de un contexto son responsabilidad de los profesores: cada profesor sube los suyos para sus sesiones y solo él puede eliminarlos. El super_admin **no** tiene UI para gestionar assets individuales y **no** debe tenerla: su rol es estructural (gestión de carpetas), no editorial (contenido).

### Decisión

Se añade el campo `uploadedBy: ObjectId<User>` al subdocumento de asset. La política de gestión es:

- **teacher**: puede gestionar (eliminar / reemplazar audio) **solo los assets que él mismo subió** (`asset.uploadedBy === user._id`).
- **assets sin `uploadedBy`** (`null`): son "del sistema" — provienen de los seeders y forman la base del producto. No pueden eliminarse individualmente desde la UI por nadie. Se eliminan únicamente al borrar el contexto entero (acción exclusiva del super_admin desde `/admin/contexts`).
- **super_admin**: NO tiene override sobre assets individuales. Si necesita borrar un asset seedeado, debe eliminar el contexto entero o realizar una migración/script de mantenimiento.

Backend valida en `assetController.deleteImage`, `deleteAudio` y `attachAudio` mediante el helper `assertCanManageAsset`. Frontend muestra "Subido por X" / "Subido por ti" / "Asset del sistema" en cada card y deshabilita los botones con tooltip explicativo cuando el usuario no es el propietario.

Para datos existentes se publica `migrate-assets-uploadedby.js` que normaliza los assets seedeados (cuya `key` está en la lista canónica del seeder) a `uploadedBy = null`. Es idempotente y respeta a los assets subidos por profesores.

### Justificación

- **Justicia**: refleja "el contexto es de todos, el asset es del autor".
- **Separación de responsabilidades**: el super_admin no debe entrar en la edición de contenido ajeno; su rol es estructural.
- **Trazabilidad**: cada asset subido por un profesor tiene autor identificable.
- **Inmutabilidad de la base**: los assets seed son la base del producto y no se eliminan ad-hoc por error.

### Consecuencias

- DTO `toAssetDTOV1` normaliza `uploadedBy` a `{id, name}` cuando viene poblado, o `null` si es del sistema.
- `getContextById` y `getContextAssets` añaden `populate({ path: 'assets.uploadedBy', select: 'name email' })`.
- Los endpoints DELETE devuelven `403 ForbiddenError` con mensaje claro: para assets ajenos `"Solo el profesor que subió este asset puede eliminarlo o reemplazar su audio"`; para assets seed `"Este asset es parte de la base del contexto y no puede eliminarse individualmente"`.
- `ContextDetailPage` ya no recibe `isSuperAdmin` (la ruta `/contexts/:id` está restringida a `roles="teacher"`); las modales obsoletas de Editar/Eliminar contexto se han retirado del componente para concentrar esa gestión en `/admin/contexts`.

---

## ADR-054: UI admin para CRUD de contextos con limpieza de Storage [Full-stack]

### Contexto

El backend permitía a super_admin crear/modificar/eliminar contextos enteros vía `/api/contexts`, pero no había UI: los contextos solo se creaban vía seeders. Esto convertía esos endpoints en *zombie code* y limitaba al admin a operar contra la BD directamente.

### Decisión

Se añade la página `/admin/contexts` (componente `AdminContexts.jsx`) con:

- Listado con tarjetas (KPI de assets/imagenes/audios + estado).
- Modal de creación (validación de slug `^[a-z0-9-]+$`).
- Modal de edición (bloquea cambio de `contextId` si ya hay assets en Storage).
- Modal de eliminación con doble confirmación que advierte explícitamente sobre la limpieza de Supabase Storage (carpeta `ctx-{contextId}/{image,thumbnail,audio}`).

El controlador `deleteContext` ya invocaba `storageService.deleteFolder(context.contextId)` con política hard-fail (si Storage falla, no se borra de MongoDB para preservar consistencia). Se documenta y se confirma este comportamiento.

### Justificación

- Cierra el gap funcional: el super_admin tenía endpoints sin UI.
- Coordina BD + Storage explícitamente, evitando assets huérfanos en Supabase.
- La advertencia visual sobre Storage en el modal de eliminación previene errores no informados.

### Consecuencias

- Nueva ruta protegida `/admin/contexts` (rol super_admin) y nuevo item en `ADMIN_NAV_ROUTES`.
- Sin cambios en backend (los endpoints ya existían).
- El admin puede eliminar contextos siempre que no tengan dependencias activas (decks/sesiones/plays activas), respetando la regla de integridad referencial existente.

---

## ADR-055: Enum `difficulty` ampliado con `custom` y marker de sesion en cliente [Full-stack]

**Fecha:** 2026-04-18
**Estado:** Aprobado
**Contexto QA:** Sesion de QA intensiva pre-release v0.5.0 (18/04/2026).

### Contexto

Durante la QA del 18/04 se detectaron dos bugs de impacto cliente-servidor:

1. **`difficulty: 'custom'` rechazado al cargar partida.** El wizard de creacion de sesion envia `difficulty: 'custom'` cuando el profesor ajusta los sliders al margen de los presets. El validador Zod (`gameSessionValidator`) aceptaba el valor, el controller hacia `session.save({ validateBeforeSave: false })` y lo persistia. Al intentar cargar la partida despues, Mongoose validaba el documento (lectura/populate en otras rutas) y fallaba con `Error de validación: custom is not a valid enum value for path difficulty`.
2. **Ruido `401 Unauthorized` al entrar a `/login` en navegadores sin sesion.** `AuthContext.checkExistingSession` llamaba a `/api/auth/refresh` incondicionalmente al montar la app, generando 401 ruidosos en la consola del usuario y trabajo inutil en backend.

### Decision

- **Backend:** ampliar el enum de `GameSession.difficulty` a `['easy', 'medium', 'hard', 'custom']` para que el modelo Mongoose sea coherente con el validador Zod. `custom` se usa como etiqueta semantica para "el profesor salio del preset" y se renderiza como "Personalizada" en el frontend.
- **Frontend:** introducir un **session marker** en `localStorage` (`eduplay:hasSession`) que se fija al hacer login exitoso y se limpia al logout, expiracion o invalidacion de sesion. `checkExistingSession` solo dispara `/auth/refresh` si el marker esta presente. Asi los landing/login/register limpios no generan 401s.

### Consecuencias

- No hay migracion de datos; documentos nuevos pueden tener `difficulty: 'custom'` sin romper validaciones.
- La UI (`SessionDetail`) ya mapea `custom → 'Personalizada'`.
- El marker no es un canal de seguridad (solo presencia boolean), los tokens siguen siendo cookies httpOnly. El marker solo evita el request preventivo.
- Tests backend (927) y frontend (214) pasan en verde tras el cambio.

### Referencias

- `backend/src/models/GameSession.js`
- `backend/src/validators/gameSessionValidator.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/pages/SessionDetail.jsx`

---

## ADR-056: AnimatePresence `mode="popLayout"` para transiciones de ruta en React 19 [Frontend]

**Fecha:** 2026-04-18
**Estado:** Aprobado
**Contexto QA:** Sesion de QA intensiva pre-release v0.5.0 (18/04/2026).

### Contexto

En AppLayout, las transiciones entre paginas usaban `<AnimatePresence mode="wait">` con `key={location.pathname}`. Al navegar de `/analytics/students` a `/students/:id` clicando una fila de la tabla, el `motion.div` de la nueva ruta quedaba atascado en el estado `exit` (`opacity: 0; transform: translateY(-6px)`), dejando la pantalla en blanco salvo por el sidebar. Se trata de una incompatibilidad conocida entre `mode="wait"` y el doble-mount que introduce React 19 en StrictMode.

### Decision

Cambiar a `<AnimatePresence mode="popLayout" initial={false}>`:

- `mode="popLayout"` permite que el nuevo hijo comience su enter antes de que el viejo complete su exit. El hijo entrante nunca depende del estado final del saliente, lo que rompe el bloqueo observado.
- `initial={false}` evita que la primera hidratacion de la app anime desde el estado `initial` (`opacity: 0`) a `animate`, reduciendo flash en carga directa.

### Consecuencias

- Durante SPA nav pueden coexistir dos paginas brevemente (ambas motion.div). En produccion sin StrictMode no hay duplicados. En dev StrictMode crea dos copias pero al menos una renderiza con `opacity: 1`.
- Documentar en PROP-18 la auditoria pendiente para otros `AnimatePresence` dispersos en la app (Contextos, FallbackTouchPanel) que exhiben sintomas similares.
- Tests existentes (17 archivos, 214 tests) no se veian afectados ya que la logica es puramente visual.

### Referencias

- `frontend/src/components/layout/AppLayout.jsx:263`
- Propuesta relacionada: PROP-18 (auditoria global de AnimatePresence).

---

## ADR-057: Integridad de scores — `maxScore` obligatorio y clamp defensivo en 3 capas [Full-stack]

**Fecha:** 2026-04-18
**Estado:** Aprobado
**Contexto:** Implementacion de propuesta PROP-19 tras hallazgo en QA 18/04.

### Contexto

En la QA intensiva pre-release v0.5.0 se detecto que el historial de partidas del alumno exponia scores 110 y 120 ("Formas Basicas 110%", "Memoria 110%" en Fortalezas), imposibles en un sistema que se supone 0-100%. Origen: el seeder y el motor de puntuacion acumulaban `score += pointsAwarded` sin cota, y no existia un campo que documentara el maximo teorico de la partida.

### Decision

Introducir un modelo explicito de integridad para el score en tres capas:

1. **Modelo** (`backend/src/models/GamePlay.js`): nuevo campo `maxScore: Number, min: 1` obligatorio para partidas nuevas + pre-save hook que clampa `score ≤ maxScore` (con `console.warn` si se clampa) y evita `score < 0`.
2. **Creacion** (`backend/src/services/gamePlayService.js`, `backend/seeders/07-gameplays.js`): `maxScore = numberOfRounds * pointsPerCorrect` se calcula y persiste en el momento de crear/seedear la partida. El seeder ademas clampa `score` antes de insertar.
3. **Lectura defensiva** (`backend/src/services/analytics/contentEffectivenessService.js`): la pipeline envuelve `avgScore`/`avgAccuracy` en `$min: 100` para que, aunque datos historicos previos a la migracion esten sucios, la UI nunca reciba valores >100%.
4. **UI defensiva** (`frontend/src/components/analytics/StrengthsWeaknesses.jsx`): los porcentajes se clampan con `Math.min(100, Math.max(0, Math.round(x)))`.

Se provee script one-shot `npm run migrate:clamp-scores [--dry-run]` que recorre GamePlays legacy: establece `maxScore` inferido de la sesion cuando falta y clampa scores historicos que lo superen.

### Consecuencias

- No mas scores >100% en la UI.
- El modelo ahora documenta el maximo teorico por partida (util para analytics futuras).
- Migracion idempotente: si todo esta OK, el script es noop.
- Tests backend (927) y frontend (214) en verde tras los cambios.

### Referencias

- `backend/src/models/GamePlay.js`
- `backend/src/services/gamePlayService.js`
- `backend/seeders/07-gameplays.js`
- `backend/scripts/migrate-clamp-scores.js`
- Propuesta relacionada: PROP-19.

---

## ADR-058: `HoverLiftCard` primitive — micro-interaccion unificada en listados [Frontend]

**Fecha:** 2026-04-18
**Estado:** Aprobado
**Contexto:** Implementacion de propuesta PROP-14 tras hallazgo en QA 18/04.

### Contexto

Los tres listados principales del profesor (Sesiones, Mazos, Contextos) tenian tres comportamientos de hover distintos: `{ y: -4, scale: 1.01 }` en Sesiones, `{ z: 20 }` (3D rotation) en Mazos, y ninguno en Contextos. Esto rompia la sensacion de "todas las cards son tactiles y reaccionan igual", un polish importante para la percepcion de calidad.

### Decision

Crear el primitive `frontend/src/components/ui/HoverLiftCard.jsx`: un wrapper `motion.div` con `whileHover={{ y: -4, scale: 1.01 }}` + `whileTap={{ scale: 0.99 }}` + glow contextual via prop `glowTint` (brand/indigo/cyan/success/warning/error/pink). Respeta `prefers-reduced-motion`.

- SessionCard: tint derivado de `difficulty` (easy=success, medium=cyan, hard=error, active=brand).
- ContextCard: tint `indigo` (color sistema del area de contextos).
- DeckCard: **no se migra** — mantiene su animacion 3D propia (rotateX/rotateY con mouse + perspective 1000) como signature de area. La consistencia que buscamos es "todas las cards tienen hover, no una sola forma visual" — DeckCard ya la tiene, y mas sofisticada.

El diseño evita boolean-prop proliferation (siguiendo vercel-composition-patterns): `HoverLiftCard` acepta solo `glowTint` y compone, no toma `shadow`/`lift`/`scale`/`rotate`/`ripple` como booleans independientes.

### Consecuencias

- Consistencia visual entre Sesiones y Contextos (mas glow contextual por tipo).
- DeckCard preservada — ningun cambio en su animacion premium.
- Facil de extender (nuevo glowTint o nuevo componente que use el primitive).

### Referencias

- `frontend/src/components/ui/HoverLiftCard.jsx`
- `frontend/src/pages/SessionsPage.jsx` (SessionCard migrada)
- `frontend/src/pages/ContextsPage.jsx` (ContextCard migrada)
- Propuesta relacionada: PROP-14.

---

## ADR-059: Propagación explícita de variants Framer cuando hay wrapper intermedio [Frontend]

### Contexto

En la sesión de QA intensiva del 18/04/2026 (tarde) se detectaron dos listas que aparecían completamente vacías en DOM pese a tener datos:

1. **Widget "Mejores Estudiantes"** (`StudentsList.jsx`) — los 5 `<li>` existían con `style="opacity:0; transform:translateY(20px)"`.
2. **Grid de contextos del profesor** (`ContextsPage.jsx`) — los 5 `<div>` de contextos existían con `style="opacity:0; transform:translateY(16px)"`.

En ambos casos los items usaban `variants={staggerItem}` (o equivalente) pero no había un `motion.container` padre con `initial` + `animate` que disparase el estado `visible`. Los variants sin orchestrator se quedan en su estado `hidden` indefinidamente.

En `ContextsPage` además había un `<AnimatePresence>` intermedio entre el `motion.div` grid y los items, que corta la propagación automática de variants por el árbol (comportamiento documentado de Framer Motion — `AnimatePresence` gestiona su propio ciclo initial/animate/exit para el enter de los hijos, y los variants heredados del parent NO se aplican).

### Decisión

**Regla del proyecto:** todo `motion.div` con `variants={...}` debe recibir explícitamente `initial` y `animate` (o `initial="hidden" animate="visible"` si se alimenta del variant) en uno de estos dos escenarios:

1. **El padre no es un motion component** (es un `<ol>`, `<div>` o wrapper JSX normal). → el hijo debe tener init/animate directos.
2. **Hay un `<AnimatePresence>` entre el padre y el hijo.** → el hijo debe tener init/animate directos. No confiar en la propagación del orchestrator por encima del AnimatePresence.

Cuando el padre ES un `motion.div` directo con `variants` + init/animate y NO hay AnimatePresence intermedio, la propagación automática de variants por nombre sí funciona y no hace falta duplicar.

### Implementación

- `StudentsList.jsx`: `<ol>` → `motion.ol` con `variants={staggerContainer}` + `initial="hidden"` + `animate="show"`.
- `ContextsPage.jsx`: se eliminó el `<AnimatePresence>` (no había animaciones de exit) y los `motion.div` hijos recibieron `initial="hidden" animate="visible"` directos para ser robustos a cualquier cambio futuro de wrapping.

### Consecuencias

**Positivas**
- Ambos widgets aparecen correctamente y son resilientes a remontados.
- Patrón aplicable y copiable a futuras listas con stagger.

**Negativas**
- Ligera duplicación entre parent.variants y child.initial/animate. Es un trade-off aceptable a cambio de robustez frente a refactorizaciones.

### Referencias

- `frontend/src/components/dashboard/StudentsList.jsx` (motion.ol + staggerContainer)
- `frontend/src/pages/ContextsPage.jsx` (AnimatePresence removido)
- Propuestas relacionadas: PROP-30, PROP-31.

---

## ADR-060: `pointer-events: none` durante exit de AnimatePresence de ruta [Frontend]

### Contexto

El ADR-056 estableció `AnimatePresence mode="popLayout" + initial={false}` en `AppLayout.jsx` para evitar que la transición de pagina dejase el `motion.div` atascado en estado exit. Sin embargo, en la sesión de QA del 18/04/2026 (tarde) se observó que bajo React 19 + StrictMode en dev, el wrapper saliente puede convivir en el DOM durante unos ms con el entrante, ambos con tamaño completo.

El wrapper saliente con `style="opacity:0; transform:translateY(-6px)"` sigue recibiendo clicks del usuario porque, pese a ser invisible, `pointer-events` sigue en `auto`. Esto impedía hacer clic en el botón "Volver a jugar" de `SessionDetail` al entrar desde el listado.

### Decisión

Ampliar el variant del motion.div de ruta para que **exit** incluya `pointerEvents: 'none'` y **animate** reinstaure `pointerEvents: 'auto'`. Con esto, aunque el wrapper saliente quede montado durante la transición (o por StrictMode en dev), no intercepta clicks.

```jsx
animate={{ opacity: 1, y: 0, pointerEvents: 'auto' }}
exit={shouldReduceMotion ? { pointerEvents: 'none' } : { opacity: 0, y: -6, pointerEvents: 'none' }}
```

### Consecuencias

**Positivas**
- Los clicks siempre llegan a la ruta activa, incluso si el wrapper anterior persiste.
- Cero impacto visual (solo propiedad CSS que no afecta la animación de opacity/transform).
- Compatible con `shouldReduceMotion` (variante reducida mantiene la protección de pointer-events sin animar nada más).

**Negativas**
- Añade una propiedad al variant que Framer debe animar (trivial en rendimiento).

### Referencias

- `frontend/src/components/layout/AppLayout.jsx` (Outlet wrapper)
- ADR-056 (decisión base que este ADR complementa).
- Propuesta relacionada: PROP-32.

---

## ADR-061: Tema visual por contexto de juego (signature cross-pantalla) [Frontend]

### Contexto

Tras una segunda pasada de QA centrada exclusivamente en UI/UX, craft y diferenciación (18/04/2026 tarde) se detectó que la app se sentía como una plantilla SaaS dashboard genérica: todos los mazos compartían el mismo icono `Layers` en gradient morado, las cards eran idénticas en cada listado, y las pantallas no reflejaban la naturaleza del producto (tarjetas físicas RFID para juegos educativos infantiles con distintos contextos temáticos — geografía, animales, colores, números, formas).

El sistema de tokens ya definía paletas OKLCH por tema en `index.css` (`--color-theme-geography`, `-animals`, `-colors`, `-numbers`) pero solo se consumían en `GameBackdrop.jsx` (fondo de partida). El resto de la aplicación era ciega al contexto de los datos que mostraba.

### Decisión

Introducir un **helper único de tematización** que mapea un contexto (por slug o por name) a una paleta OKLCH y devuelve clases Tailwind listas para consumir en iconos, bordes y fondos sutiles.

```js
// frontend/src/lib/contextTheme.js
export function getContextTheme(input) { /* returns { gradientClass, ringClass, textClass, glowClass } */ }
```

Aplicación inicial en `DeckCard.jsx` (icon header + subtítulo). Puede extenderse a `SessionCard`, `ContextCard`, `StudentProfile` (badges de contexto favorito), etc. sin duplicar el mapping.

Paletas soportadas: `default`, `geography`, `animals`, `colors`, `numbers`, `shapes`. Resolución por prefijo del slug (`geography-europe` → `geography`) o por alias explícito en `SLUG_ALIASES`.

### Consecuencias

**Positivas**
- **Diferenciación visible**: cada contexto se reconoce de un vistazo por color, sin leer el texto. Un profesor con 6 mazos distingue "Animales de Granja" de "Colores Básicos" sin esfuerzo.
- **Consistencia cross-producto**: el tema del contexto viaja del `GameBackdrop` (durante la partida) a los listados (fuera de partida). Los niños y profesores construyen memoria espacial por color.
- **Zero duplicación**: los tokens OKLCH ya existían; el helper solo los cablea.
- **Extensible**: añadir un contexto nuevo = añadir vars a `index.css` + entrada al helper.

**Negativas / trade-offs**
- El consumidor del helper debe usar clases Tailwind arbitrarias (`from-[var(--color-theme-...)]`) — no falla pero obliga a Tailwind JIT a generar las clases a build. Alternativa sería un `<div style={{ background: theme.primaryVar }}>` puro CSS vars; se mantuvo el approach de clases por consistencia con el resto del proyecto.
- `shapes` no tenía paleta dedicada en `index.css` y se mapea a `accent-cyan` / `accent-indigo` (fallback sensato). Revisar si se quiere crear `--color-theme-shapes` dedicado.

### Referencias

- `frontend/src/lib/contextTheme.js` (helper nuevo)
- `frontend/src/components/ui/DeckCard.jsx` (primer consumidor)
- `frontend/src/index.css` (paletas OKLCH preexistentes)
- `frontend/src/components/game/GameBackdrop.jsx` (consumidor histórico)
- Propuesta relacionada: PROP-16 (atmósferas dinámicas por contexto) y PROP-40A.
