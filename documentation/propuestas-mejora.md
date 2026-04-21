# Propuestas de Mejora Pendientes - EduPlay RFID

> Propuestas pendientes de implementacion para versiones futuras (Sprint 6 y posteriores).
> Las propuestas marcadas como ✅ IMPLEMENTADA en sesiones anteriores fueron eliminadas de este documento — su trazabilidad queda en el historial de Git y en los memory files de cada sesion (`memory/project_qa_session_*.md`, `memory/project_implementation_*.md`).
>
> **En el pase de verificacion + limpieza del 19/04/2026 (tarde) se eliminaron las propuestas verificadas al 100% en browser tras rebuild de Docker:** PROP-26, PROP-38, PROP-39, PROP-40, PROP-45, PROP-48, PROP-50, PROP-56, PROP-57, PROP-58 (todas confirmadas funcionando con screenshots).

---

## PROP-1: Sistema de notificaciones en tiempo real

**Descripcion:** Implementar un sistema de notificaciones push que informe al profesor cuando un estudiante completa una partida, cuando se aprueba una solicitud de registro, o cuando ocurre algun evento relevante en sus sesiones activas.

**Justificacion:** Actualmente no hay forma de saber que algo cambio sin refrescar la pagina. La infraestructura Socket.IO ya esta desplegada y lista para soportar este tipo de comunicacion.

**Alcance estimado:**
- Componente `NotificationBell` en el header del sidebar
- Backend: emitir eventos Socket.IO para cada accion relevante
- Persistencia de notificaciones en MongoDB (leidas/no leidas)
- Panel dropdown con historial de notificaciones

---

## PROP-2: Vista previa / modo demo de juego para el profesor

**Descripcion:** Permitir al profesor simular una partida completa desde el detalle de una sesion sin necesitar hardware RFID fisico. Un modo demo con tarjetas virtuales que se pueden "escanear" haciendo clic.

**Justificacion:** Facilita la validacion del contenido educativo antes de usarlo con estudiantes reales. Elimina la dependencia de hardware para verificar que las configuraciones de sesion (tiempo, puntos, penalizacion) funcionan correctamente.

**Alcance estimado:**
- Boton "Modo Demo" en SessionDetail
- Reutilizar componentes de GameSession con un mock de WebSerialService
- Tarjetas virtuales clicables que simulan un escaneo RFID

---

## PROP-4: Modo claro / selector de tema

**Descripcion:** Agregar un toggle dark/light mode accesible desde la barra lateral. La app actualmente solo ofrece tema oscuro.

**Justificacion:** Muchas aulas tienen buena iluminacion ambiental donde un tema claro seria mas legible y menos cansado para la vista. Tambien es una mejora de accesibilidad (WCAG) ya que algunos usuarios prefieren o necesitan alto contraste en modo claro.

**Alcance estimado:**
- Variables CSS para tema claro en `index.css` (ya usa OKLCH, solo cambiar valores)
- ThemeContext con persistencia en localStorage
- Toggle en el sidebar donde ahora esta "Configuracion"
- Transicion suave entre temas

---

## PROP-5: Mejora de tarjetas de sesion en listado

**Descripcion:** Enriquecer las cards de sesiones en `/sessions` con mas informacion visual: fecha de ultima partida, mini-chart sparkline de rendimiento directamente en la card, y codigo de colores segun dificultad (verde=facil, amarillo=normal, rojo=dificil).

**Justificacion:** Actualmente todas las cards muestran la misma informacion estatica (tarjetas, rondas, tiempo, puntos). Un profesor con muchas sesiones necesita poder identificar rapidamente cuales requieren atencion sin entrar al detalle de cada una.

**Alcance estimado:**
- Componente `SessionSparkline` reutilizando Recharts en mini formato
- Mostrar "Ultima actividad: hace 2 dias" debajo del titulo
- Badge de color en el borde izquierdo de la card segun dificultad configurada
- Endpoint backend para stats resumidas por sesion (si no existe)

---

## PROP-6: Export/Import de sesiones y mazos

**Descripcion:** Permitir exportar sesiones y mazos como archivo JSON descargable, e importarlos en otra cuenta o instancia de la plataforma.

**Justificacion:** Facilita la colaboracion entre profesores y la reutilizacion de contenido educativo. Un profesor que ya configuro un mazo de "Banderas de Europa" con 30 tarjetas no deberia tener que recrearlo desde cero en otra cuenta.

**Alcance estimado:**
- Backend: endpoints `GET /api/decks/:id/export` y `POST /api/decks/import`
- Frontend: boton "Exportar" en deck detail, boton "Importar" en decks list
- Validacion de formato al importar
- Resolucion de conflictos (contextos/assets referenciados)

---

## PROP-8: Refactorizacion del sistema de iconos

**Descripcion:** Reemplazar el patron `import * as LucideIcons` por un IconRegistry centralizado que solo incluya los iconos realmente usados en la aplicacion. Aprovechar para unificar tamanos, colores y spacing de iconos en toda la app.

**Justificacion:** Ademas del beneficio de rendimiento ya implementado (reduccion de ~500KB en el bundle), un registry centralizado asegura consistencia visual y facilita auditar que iconos usa la plataforma. Actualmente cada componente importa iconos con tamanos y colores ligeramente diferentes.

**Alcance estimado:**
- Crear `src/components/ui/Icon.jsx` como wrapper con tamanos estandarizados (sm/md/lg)
- Migrar componentes a usar el wrapper en lugar de imports directos
- Documentar el catalogo de iconos disponibles

---

## PROP-9: Tema claro / selector de tema (revision)

**Descripcion:** Reapertura formal de PROP-4 con alcance ampliado: ademas del toggle de tema oscuro/claro, evaluar variantes de alto contraste y modo "infantil" con colores mas saturados.

**Justificacion:** Detectado en QA del 17/04/2026 que el dark mode actual, aunque consistente, cansa la vista en aulas con iluminacion ambiental fuerte. Los iconos verdes/amarillos sobre fondo muy oscuro pierden contraste perceptible.

**Alcance estimado:** Variables CSS en `index.css`, ThemeContext, toggle dedicado en sidebar (junto al de animaciones), documentar pares de colores accesibles para cada tema.

---

## PROP-10: Vista grafica cruzada Mecanica × Contexto

**Descripcion:** Expandir la efectividad para mostrar una matriz cruzada real (mecanica × contexto) con puntuacion media por celda. La vista actual (tras la refactorizacion del 17/04/2026) muestra dos charts independientes (uno por dimension), pero no permite ver "que tal funciona Asociacion en Geografia frente a Memoria en Geografia".

**Justificacion:** La matriz cruzada es muy potente pedagogicamente porque permite identificar combinaciones que generan mucho aprendizaje. Requiere refactorizar el endpoint `/api/analytics/classroom/content-effectiveness` para devolver agregados por par {mechanicId, contextId} en lugar de uno solo.

**Alcance estimado:**
- Backend: nuevo `groupBy: 'cross'` con pipeline que agrupa por `{mechanicId, contextId}`
- Frontend: nuevo componente `CrossMatrix` con tabla con scroll, celdas RAG y drill-down
- Permitir filtros (solo mecanica X, solo contexto Y) sobre la matriz

---

## PROP-11: Modo demo / vista previa de partida sin RFID (revision PROP-2)

**Descripcion:** Reapertura formal de PROP-2 con prioridad alta tras detectar en QA del 17/04 que el bug del FallbackTouchPanel (imagenes que desaparecen + duplicados) hace que la unica forma de probar el flujo de partida sin hardware RFID sea fragil.

**Justificacion:** Los profesores que aun no han recibido el lector fisico no pueden validar las sesiones que crean. Un "modo demo oficial" (no fallback) con UI distinta y pensada para preview, en lugar de reusar el panel tactil de emergencia, mejora la experiencia.

---

## PROP-12: Pseudo-cache invalidation post-write para contextos

**Descripcion:** Tras D2 (UI admin de contextos del 17/04/2026), las operaciones CREATE/UPDATE/DELETE invalidan correctamente el cache Redis del contexto editado, pero la lista global (`getContexts`) no esta cacheada. Si en el futuro se anaden mas listas cacheadas, valdria la pena un patron unificado de invalidacion.

**Alcance estimado:** Service helper `invalidateContextCaches(contextId)` que centralice las llamadas. Aplicarlo en createContext/updateContext/deleteContext.

---

## PROP-13: Mejorar el onboarding actual del profesor

**Descripcion:** El proyecto ya tiene un modal de bienvenida (4 pasos, "¡Bienvenido a EduPlay!") que aparece la primera vez. Sin embargo es informativo, no interactivo: explica conceptos sin guiar al usuario hacia acciones concretas (crear primer mazo, primer contexto, primera sesion).

**Justificacion:** Convertirlo en un tour interactivo (highlights sobre la UI real, "siguiente paso" enlazando a la accion) eleva la activacion y reduce la curva de descubrimiento.

**Alcance estimado:** Reusar el modal existente como step 0; añadir tour superpuesto con `react-joyride` (o equivalente) para los pasos 1-3 (visitar Sesiones, crear primera sesion, ver analytics). Persistir progreso en localStorage + backend (`profile.onboardingProgress`).

---

## PROP-16: Atmosferas dinamicas por contexto

**Descripcion:** Cuando un profesor entra al detalle de un contexto, el fondo de la pagina podria adoptar un sutil gradient mesh con el `dominantColor` del contexto (ej: animales-granja → tonos verdes/marrones). Misma idea para el tema visual de cada mecanica durante la partida.

**Justificacion:** Inmersion. Hoy todas las pantallas comparten el mismo fondo dark uniforme. Diferenciar visualmente por contexto/mecanica refuerza memoria espacial y hace la app menos monocorde.

---

## PROP-17: Atajos de teclado globales

**Descripcion:** Anadir atajos como `g + s` para ir a Sesiones, `g + d` para Dashboard, `?` para abrir lista de atajos, `n` para "Nueva Sesion", `/` para enfocar busqueda. Documentar en un mini-overlay accesible desde `?`.

**Justificacion:** Profesores experimentados ganan velocidad. Mejora a11y (uso sin mouse). Es un patron consolidado en SaaS modernos (Linear, Notion, GitHub).

---

## PROP-18: Auditoria y refactor de AnimatePresence / motion.div (React 19 + Framer Motion)

**Descripcion:** En la sesion QA del 18/04/2026 se detectaron multiples motion.div que quedan atascados en estado exit o initial (`opacity: 0; transform: translateY(...)`) tras transiciones SPA. Afecta a:
- AppLayout page transitions (ya mitigado con `mode="popLayout" initial={false}` en Maintenance, pero convive con duplicados en dev por React StrictMode).
- Contextos (`/contexts`): las cards quedan con opacity 0 aunque el store las tiene.
- FallbackTouchPanel: imagenes desaparecen entre rondas (ver PROP-11).

**Justificacion:** Patron comun de incompatibilidad Framer Motion + React 19 StrictMode. En produccion sin StrictMode es menos visible, pero conviene auditar todos los `<AnimatePresence>` y evitar llaves sobre elementos que se remontan en cada tick. Ademas, React 19 cambio el comportamiento de `useLayoutEffect` en doble-mount.

**Alcance estimado:**
- Auditar todas las ocurrencias de `AnimatePresence` y `motion.div` con `key` dinamica
- Probar cada una con y sin reduced-motion
- Migrar a patrones sugeridos por el equipo de Motion (modo popLayout, `LayoutGroup`, `useIsPresent`) donde aplique
- Plan de tests visuales o Playwright que detecten la regresion automaticamente

---

## PROP-21: Vistas de "Contextos" y "Gestion de Alumnos" con listado visible por defecto

**Descripcion:** La pagina de Contextos (teacher) y `/admin/students` muestran KPIs y buscador pero el listado completo no se renderiza por defecto — requiere scroll o pensar que hay que buscar. En Contextos las cards estan en DOM pero bloqueadas por un motion.div opacity:0 (ver PROP-18). En Alumnos no hay listado.

**Justificacion:** El usuario deberia ver los recursos disponibles inmediatamente. No hay razon para ocultarlos.

**Alcance estimado:** Asegurar render por defecto de todos los items con paginacion/virtualizacion si son muchos, y exponerlos visualmente en la parte superior.

---

## PROP-27: Validacion enum difficulty coherente entre Zod y Mongoose

**Descripcion:** En QA se detecto que el validador Zod aceptaba `difficulty: 'custom'` pero el modelo Mongoose de GameSession solo permitia `['easy','medium','hard']`. El fix en Maintenance del 18/04 añadio `custom` al enum Mongoose. Queda pendiente auditar el resto de enums (status, mechanic types, etc.) para evitar mismatches similares.

**Justificacion:** Single source of truth. Un enum desalineado rompe la confianza en `validateBeforeSave: false` y puede permitir datos invalidos.

**Alcance estimado:**
- Script de auditoria que extraiga todos los `z.enum(...)` y los compare con los `enum: [...]` en los schemas Mongoose correspondientes.
- Si es realista, derivar ambos de una constante unica.
- Añadir un test que falle si alguno se desincroniza.

---

## PROP-47: Timestamps relativos del backend muestran "Hace 7 min" para todas las alertas

**Descripcion:** En la pagina Insights > Alertas, las 5 alertas mostradas tienen "Hace 7 min" como timestamp. En la lista de alumnos, todos los 18 alumnos tienen "Hoy" en "Ultima Actividad". Es estadisticamente improbable que todas las alertas se generen exactamente al mismo tiempo. Hipotesis: el seeder usa `Date.now()` para todos los timestamps, o el backend genera todas las alertas con el mismo timestamp en cada peticion.

**Justificacion:** Calidad de datos visibles en demos / pre-release. Aunque es seeder data, transmite poca confianza en la veracidad de los timestamps.

**Alcance estimado:**
- Auditar `backend/seeders/07-gameplays.js` y `08-alerts.js` (si existe) para variar timestamps de manera realista.
- Verificar si el backend regenera timestamps al servir alertas (no deberia).

---

# Mejoras Redis Sprint 6 (propuestas tras auditoria del 2026-04-20)

Las siguientes propuestas surgen de la auditoria integral de la implementacion de Redis realizada en la sesion de mantenimiento 2026-04-20. Las mejoras de alto ROI y bajo riesgo ya se integraron en esta rama (ver ADRs 064-067). Las siguientes requieren alcance mayor y se proponen para Sprint 6.

---

## PROP-59: Rate limiting WebSocket distribuido (Redis Sorted Set + Lua)

> **Estado 2026-04-20 tarde**: la parte **HTTP** de esta propuesta queda **resuelta** vía ADR-068 (lazy promotion + shim factory + `passOnStoreError`). Las 8 instancias de `express-rate-limit` ahora usan efectivamente Redis store desde el boot, con keys `rl:*` visibles en el servidor. Lo que sigue abierto es la parte **WebSocket** descrita a continuación.

**Descripcion:** El `SocketRateLimiter` actual mantiene el sliding window en memoria (`Map<string, number[]>`) — no distribuido entre instancias. En multi-replica, un cliente puede eludir el limite conectandose a distintas instancias por round-robin. Gap documentado en `Rate_Limiting_Analysis.md` desde 2026-04-03 sin resolver.

**Estructura Redis propuesta:**
- `rl:ws:<event>:<rateKey>` → Sorted Set con timestamps como score y member
- `rl:ws:block:<rateKey>` → String con TTL (bloqueo progresivo activo)
- `rl:ws:violations:<rateKey>` → String counter con TTL corto
- `rl:ws:rfid:<rateKey>:<sensorId>` → String con TTL (dedupe UID por sensor)

**Pseudocodigo Lua (`checkSocketRateLimit.lua`):** ZREMRANGEBYSCORE (purgar expirados) → ZCARD (contar) → si excede: INCR violations + opcionalmente SET block → devolver rechazo con `retryAfterMs`; si no: ZADD timestamp → resetear violations. 1 roundtrip atomico.

**TTLs:** `windowMs * 2` en sortset (autopurga), `PX blockDurationMs` en block key, ventana corta en violations.

**Invalidacion:** solo TTL.

**Fallback:** mantener la implementacion in-memory actual como `insuranceLimiter` — si Lua falla o Redis cae, cae al Map actual sin interrupcion.

**Tests:** extender `socketRateLimiter.test.js` con casos de contencion entre dos instancias simuladas (ioredis-mock soporta sortsets).

**Esfuerzo:** M (3-5 dias). Archivos: `socketRateLimiter.js` + 1 script Lua + tests + actualizar `Rate_Limiting_Analysis.md`.

**ADR tentativo:** "Rate limiting WebSocket distribuido con Redis Sorted Set"

---

## PROP-60: Leaderboards con ZSET para rankings de contextos/mecanicas/estudiantes

**Descripcion:** `analyticsService.getTopContextsAndMechanics` ejecuta dos aggregations con `$lookup` × 2 cada una en cada request del dashboard. Con ZSETs en Redis: O(log N) actualizacion al completar play, O(log N + M) lectura del top M.

**Estructura Redis propuesta:**
- `leaderboard:context:score:<teacherId>:<timeRange>` → ZSET (score = sumScoreByContext, member = contextId)
- `leaderboard:context:plays:<teacherId>:<timeRange>` → ZSET (score = playCountByContext)
- `leaderboard:mechanic:score:<teacherId>:<timeRange>`, `leaderboard:mechanic:plays:<teacherId>:<timeRange>`
- `leaderboard:student:score:<teacherId>:<timeRange>` (futura expansion)

**Pseudocodigo:** en `endPlay`: `redis.zincrby(key, playScore, contextId)` + `redis.zincrby(playsKey, 1, contextId)`. Lectura: `ZREVRANGEBYSCORE key +inf -inf WITHSCORES LIMIT 0 N`.

**TTLs:** 8 dias por key (una ventana >7d). Para timeRanges dinamicos, pre-calcular buckets diarios y sumar al leer.

**Invalidacion:** TTL + recalculo nocturno por job BullMQ (PROP-62) para reconciliar con Mongo y corregir drift.

**Tests:** `leaderboardZset.test.js` — insertar 100 plays mock, verificar que el top coincide con la agregacion Mongo sobre los mismos datos.

**Trade-off:** perdida de consistencia inmediata (eventually consistent). Requiere tarea de reconciliacion.

**Esfuerzo:** M (3-4 dias).

**ADR tentativo:** "Leaderboards con ZSET para rankings de analytics"

---

## PROP-61: Feature flags / kill switches en Redis Hash

**Descripcion:** No existen hoy. Activar/desactivar features requiere redeploy. Util para: pausar onboarding de estudiantes en picos, desactivar WebSerial si hay bugs, limitar endpoints costosos a subconjunto de usuarios.

**Estructura Redis propuesta:** `feature:<featureName>` → Hash: `{ enabled: '1'|'0', rolloutPct: '50', whitelist: 'uid1,uid2', reason: 'text' }`

**Pseudocodigo:** `cacheGet('feature:flags', featureName, () => redis.hgetall(...), 30)`. Si `!flag?.enabled`: throw `ServiceUnavailableError(flag.reason)`. Si `rolloutPct`: determinar por hash del userId.

**TTL:** 30s de cache local en el namespace `feature:flags` — equilibra latencia vs responsividad.

**Invalidacion:** panel super_admin + endpoint `POST /api/admin/flags/:name` que ejecuta `cacheInvalidate('feature:flags', name)`.

**Tests:** `featureFlags.test.js` — toggles on/off, rollouts por porcentaje, listas blancas, invalidacion inmediata.

**Frontend:** hook `useFeatureFlag('newDashboard')` que consulta endpoint `GET /api/flags` + panel admin de super_admin para gestionar.

**Esfuerzo:** S-M (2-3 dias Full-stack).

**ADR tentativo:** "Feature flags distribuidos en Redis"

---

## PROP-62: Cola de jobs asincronos con BullMQ

**Descripcion:** Operaciones pesadas hoy son sincronas o `setInterval`: exports GDPR (bloquean request), retention jobs (se ejecutan en todas las replicas simultaneamente), notificaciones batch (no implementadas).

**Eleccion:** **BullMQ** sobre Redis Streams. Razones: API de alto nivel (job state, retries con backoff, dashboards Bull-Board), compatible con ioredis ya instalado, comunidad activa.

**Queues propuestas:**
- `gdpr-exports`: usuarios piden data export → worker genera ZIP, sube a Supabase Storage, emite email con signed URL
- `data-retention`: purgas programadas (replace `setInterval`)
- `notifications`: emails, push futuros

**Pseudocodigo (producer):** `await exportsQueue.add('export-user-data', { userId, requestId }, { attempts: 3, backoff: 'exponential' })`.

**Worker separado:** proceso `worker.js` independiente (`npm run worker`) — habilita escalado horizontal del worker por si mismo.

**TTLs:** `removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 604800 }`.

**Invalidacion:** jobs se auto-purgan por BullMQ.

**Tests:** `jobQueues.test.js` — mock redis, verificar add/process/retry/fail.

**Infraestructura:** Docker Compose añade `worker` service. Deploy scripts actualizados.

**Esfuerzo:** L (1-2 semanas). Impacta estructura del proyecto (nuevo proceso, nuevos tests, nueva pipeline CI).

**ADR tentativo:** "Cola de jobs asincronos con BullMQ"

---

## PROP-63: Materializacion de `studentMetrics` en Redis Hash

**Descripcion:** El campo `user.studentMetrics` (averageScore, totalGamesPlayed, totalCorrectAttempts) se recalcula con cada `endPlay` via `player.updateStudentMetrics(...)` que hace `.save()` sobre el doc User. Para dashboards con muchos estudiantes, la lectura masiva es costosa porque Mongo tiene que leer el doc entero.

**Estructura Redis propuesta:** `student:metrics:<studentId>` → Hash: `{ totalGamesPlayed, totalCorrectAttempts, totalAttempts, sumScores, count, lastUpdated }`

**Pseudocodigo en endPlay:** `redis.hincrby(...):totalGamesPlayed 1`, `redis.hincrby(...sumScores, score)`, etc. `avgScore` calculado en lectura.

**TTL:** sin TTL (datos persistentes). Reconciliados con Mongo en job nocturno de PROP-62.

**Invalidacion:** reconciliacion nocturna: leer GamePlay del dia, recalcular agregados, escribir en Mongo + Redis como source of truth.

**Tests:** `studentMetricsMaterialized.test.js` — 10 plays en sucesion, verificar que agregados Redis coinciden con calculo directo Mongo.

**Consideracion GDPR:** al eliminar estudiante (Art. 17), purgar la key. Integrar con `dataExportService`.

**Esfuerzo:** M-L (5-7 dias). Requiere ADR dedicado.

**ADR tentativo:** "Materializacion de studentMetrics en Redis"

---

## PROP-64: Estado RFID mode distribuido

**Descripcion:** El estado "modo RFID" del usuario (normal/config/lock) esta hoy en memoria local (`socketHandlers.js` Map). En multi-replica, el mismo usuario podria tener estado inconsistente segun a que instancia se conecte. El codigo ya tiene la constante `REDIS_RFID_MODE_PREFIX = 'rfid:mode:'` declarada pero no usada.

**Estructura Redis propuesta:**
- `rfid:mode:<userId>` → String: `'normal'|'config'|'lock'` con TTL 1h
- Pub/Sub channel `rfid-mode:<userId>` para notificar cambios instantaneos entre instancias

**Pseudocodigo setMode:** `await redis.setex('rfid:mode:'+userId, 3600, mode); await redis.publish('rfid-mode:'+userId, mode)`.

**Pseudocodigo getMode:** `return (await redis.get('rfid:mode:'+userId)) || 'normal'`.

**TTL:** 1h — mayor que cualquier sesion tipica de profesor en una clase.

**Invalidacion:** TTL + pub/sub para cambios en tiempo real entre instancias.

**Tests:** `rfidModeDistributed.test.js` — dos instancias simuladas, setMode en A → B recibe el cambio via pub/sub.

**Esfuerzo:** S (1-2 dias). Usa la constante ya declarada y el adapter pub/sub existente.

**ADR tentativo:** "Estado RFID mode distribuido"

---

# Mejoras UI/UX + Accesibilidad (audit senior 2026-04-21)

Las siguientes propuestas surgen de la sesion QA de accesibilidad y UX del 2026-04-21 (ver `memory/project_a11y_ux_session_2026_04_21.md` y ADR-069). Las mejoras de alto ROI y bajo riesgo se integraron en la sesion (role=alert en errores, focus-on-first-invalid, heatmap keyboard-accesible, variantes visuales del ConfirmationModal, ilustraciones SVG en empty states, sidebar con badge de rol y banner super_admin, etc.). Las siguientes requieren mas alcance y se proponen para Sprint 6.

---

## PROP-65: Paginacion y virtualizacion en listados grandes

**Descripcion:** `SessionsPage` y `StudentManagement` cargan todos los items en DOM; con 50+ sesiones o 1000+ alumnos (super_admin) genera scroll muy largo en mobile, peor a11y por navegacion de teclado eterna, y latencia visible al renderizar.

**Justificacion:** Un centro medio tiene 100-500 alumnos. El director abre `/admin/students` y la UI "pega un salto" al pintar todos. Tambien rompe el patron de SaaS moderno que el usuario espera.

**Alcance estimado:**
- Backend: verificar que los endpoints de students/sessions soportan `page`/`limit` (sessions ya lo hace parcialmente).
- Frontend: hook `usePaginatedList` reutilizable. Opcion A paginacion clasica (numero de pagina + controles), opcion B virtualizacion con `react-window` o `@tanstack/react-virtual` para 1000+ filas.
- Integrar en `StudentManagement` (prioritario) y `SessionsPage`.

**Esfuerzo:** M-L (5-7 dias, backend + frontend).

**ADR tentativo:** "Paginacion y virtualizacion de listados para escala real de centro"

---

## PROP-66: Charts Recharts con paleta de marca (anti-AI-slop)

**Descripcion:** Los charts actuales (`StudentProgressChart`, `DifficultyHeatmap`, `ActivityHeatmap`, `StudentsDistributionChart`, `TrendsChart`, etc.) usan colores genericos: `success-base` verde y `error-base` rojo. Son indistinguibles del dashboard educativo promedio y fallan contraste para daltonismo rojo-verde.

**Justificacion:** Dos objetivos: (1) acessibilidad colorblind — suplementar color con patrones diagonales/puntos en heatmaps y con iconos en datos categoricos; (2) personalidad visual — gradients `brand→accent-indigo` en lineas positivas, `warning→error-dark` en negativas, patterns `<defs>` reutilizables, coherencia con la identidad de la app (que si tiene firma en Dashboard).

**Alcance estimado:**
- `<defs>` globales con gradients y patterns (export desde `components/analytics/ChartsTheme.jsx`).
- Wrapper `ThemedLineChart`, `ThemedBarChart`, `ThemedHeatmap` que aplican el tema.
- Migrar los 6-8 charts principales.
- Tests con snapshots que verifiquen que el `<defs>` esta presente.

**Esfuerzo:** M (3-4 dias).

**ADR tentativo:** "Sistema de tema para graficos Recharts con paleta de marca y patterns colorblind-safe"

---

## PROP-67: GameOver emocional y feedback de gameplay expresivo

**Descripcion:** La pantalla de fin de partida funciona (confetti si >= 2 estrellas, record display) pero es funcional, no emocional. Feedback acierto/error en gameplay es consistente (FeedbackOverlay) pero generico.

**Justificacion:** Es la pantalla mas memorable para el alumno. Debe transmitir logro: una mascota (diseño pendiente) reacciona al score, particle burst direccionado desde la tarjeta al score, escalera emocional:
- 1 estrella: "Buen intento" + mascota animando "pulgar arriba pequeno"
- 2 estrellas: "Muy bien" + confetti breve + mascota saltando
- 3 estrellas: "Eres un crack" + confetti + fireworks + mascota dando vueltas

Feedback acierto: mascota reacciona (animacion de ojitos brillantes), particles brotan de la tarjeta hacia el score. Feedback error: mascota inclina cabeza pensativa, barra de progreso "retrocede" un frame como rewind.

**Alcance estimado:**
- Diseno de mascota SVG (idealmente con el autor del TFG o un illustrator): 4-6 estados de animacion.
- Componente `<Mascot state="idle|happy|thinking|dancing" />`.
- Refactor de GameOverScreen para integrar mascota + escalera.
- Refactor de FeedbackOverlay con particle burst direccionado.

**Esfuerzo:** L (6-10 dias con diseno de mascota). Si se usa una illustracion abstracta en lugar de mascota, baja a M (3-4 dias).

**ADR tentativo:** "Sistema de mascota y feedback emocional en gameplay"

---

## PROP-68: Atajos de teclado globales (ampliacion de PROP-17)

Ya existe como PROP-17 arriba. Se reabre aqui para marcar prioridad alta tras audit 2026-04-21: el sidebar con el nuevo badge DIRECCION / DOCENTE y banner super_admin, junto con el heatmap keyboard-accesible, dejan al descubierto que no hay `g+s` (ir a sesiones), `g+d` (dashboard), `?` (help overlay) ni `/` (search). Documentado.

---

## PROP-69: Inline editing en listados (name de sesion / mazo)

**Descripcion:** Editar el nombre de una sesion o mazo requiere ir al detalle y al form. Patron moderno: click en el name muestra lapiz on-hover, click al lapiz abre input inline, on-blur guarda con debounce + spinner.

**Justificacion:** Fluidez. Ahorra 4-5 clicks por edicion de nombre. Airtable / Linear / Notion usan este patron.

**Alcance estimado:**
- Hook `useInlineEdit({ value, onSave, validate })`.
- Componente `<InlineEditableText>` que acepta trigger ("click text" o "click pencil").
- Integrar en `DeckCard.name` y `SessionCard.name`.
- Autosave debounced a 800ms con toast de confirmacion.

**Esfuerzo:** M (3-4 dias).

---

## PROP-70: Search-ahead en SelectPremium para listas >20 items

**Descripcion:** Cuando un profesor con 50+ alumnos abre el selector de alumno para iniciar una partida (SessionDetail), ve una lista larga sin busqueda. Lo mismo para mazos/contextos.

**Justificacion:** Eficiencia. Un super_admin con 500 alumnos en dropdown es impracticable.

**Alcance estimado:**
- Prop opcional `searchable` en SelectPremium.
- Input arriba del dropdown que filtra opciones por `label` (case-insensitive, match parcial).
- Sticky al scroll del dropdown.
- Aria-live con "X resultados" al escribir.

**Esfuerzo:** S (1-2 dias).

---

# Mejoras motion signature diferidas (post ADR-070, 2026-04-21 noche)

Propuestas surgidas del pase de motion signature "Tactile RFID + Paper" (ADR-070).
Demasiado grandes para esa sesion; cada una merece su propio ADR.

---

## PROP-71: Shared element transition DeckCard → CardDeckDetailPage (hero)

**Descripcion:** Usar `layoutId` de Framer Motion para que la tarjeta de mazo
seleccionada "se expanda" al entrar en su detalle, como una hero transition
clasica de apps nativas.

**Justificacion:** Hoy la navegacion DeckCard → DeckDetailPage es un corte seco.
Una hero transition refuerza la sensacion de que la app "piensa" y que los
objetos son continuos. Signature fuerte que diferencia frente a SaaS genericos.

**Alcance estimado:**
- Plumbing del router para no desmontar el DOM durante la transicion.
- Coordinar `layoutId="deck-<id>"` entre grid (DeckCard) y pagina de detalle.
- Evaluar rendimiento con 50+ decks (AnimatePresence `mode="popLayout"` en la
  ruta, tests aparte porque hay incompatibilidad conocida con jsdom).

**Esfuerzo:** M (2-3 dias).

---

## PROP-72: Navegacion direccional (back vs forward)

**Descripcion:** Hook `useNavigationDirection` que detecta pop vs push del history
exponiendo `direction: 'forward' | 'backward'`. `AppLayout` lo consume para
aplicar exit animation direccional: `x: +100vw` en pop (back), `x: -100vw` en push
(forward).

**Justificacion:** Hoy toda transicion de ruta usa `routeTransition` (fade + y
sutil). Direccion espacial mejora la percepcion de donde estamos en la jerarquia.
Patron estandar en apps nativas.

**Alcance estimado:**
- Hook en `hooks/useNavigationDirection.js` con `useNavigationType()` de
  react-router 7.
- Propagar direction a AppLayout como context o prop.
- Variantes de transicion direccional en `lib/utils.js`.
- Respetar `prefers-reduced-motion` (sin direccion, solo fade).

**Esfuerzo:** S-M (1.5-2 dias).

---

## PROP-73: Scroll-linked parallax en Dashboard

**Descripcion:** `useScroll` + `useTransform` sobre el aurora background del
AppLayout para que se desplace sutilmente con el scroll del Dashboard y otras
paginas largas.

**Justificacion:** `useScroll` esta importado en `lib/utils.js` sin uso real.
Parallax en el fondo aporta profundidad sin ruido. Refuerza la sensacion de
"mesa con papeles" — el fondo se mueve ligeramente distinto al contenido, como
si miraras desde cierto angulo.

**Alcance estimado:**
- Detectar cuando el overflow del main es significativo.
- Aplicar `useTransform(scrollY, [0, 800], [0, -60])` a los orbes de aurora.
- Respetar `prefers-reduced-motion` (sin parallax).

**Esfuerzo:** S (1 dia).

---

## PROP-74: Mascota CharacterMascot extendida

**Descripcion:** Reactivar a la mascota en mas contextos que solo GameOver:
- Empty states (micro mascota sobre la ilustracion).
- Onboarding (mascota guia los pasos).
- Exitos criticos (guardar sesion/mazo por primera vez, alcanzar N partidas).

Relaciona con PROP-67 ya existente — ampliar scope.

**Justificacion:** La mascota ya esta disenada pero infrautilizada (solo
GameOver). Extenderla da consistencia emocional a la app, especialmente en
empty states donde hoy solo hay ilustraciones abstractas.

**Alcance estimado:**
- Refactor de CharacterMascot para aceptar mas states (greeting, pointing,
  celebrating, thinking).
- Integrar en EmptyState como opcional via prop `mascot`.
- Integrar en Onboarding (4 pasos actuales).
- Disenar nuevos estados SVG si faltan.

**Esfuerzo:** M (3-4 dias con diseno).

---

## PROP-75: Atmosferas dinamicas por contexto (reapertura de PROP-16)

**Descripcion:** Ya existe como PROP-16. Reabrir con prioridad media tras ver
como el `resolveContextGlow` de ADR-070 abre la puerta: cuando el profesor
entra en una sesion de "Geografia", toda la aurora del fondo adopta tintes
geography (cyan), el icono del header se tinta con `--color-theme-geography`,
los botones primarios heredan el tint.

**Justificacion:** La app es educativa y cross-contextual. Hoy todas las
pantallas comparten el mismo fondo dark con aurora brand. Atmospheric theming
por contexto refuerza memoria espacial y hace la app menos monocorde.

**Alcance estimado:**
- `ThemeContext` con scope por contexto activo.
- CSS vars scoped (ej: `--color-atmosphere-primary` que cambia segun contexto).
- Aplicar en AppLayout aurora background + PageHeader icono + ButtonPremium
  variant primary.
- Persistir el contexto activo por sesion/route.

**Esfuerzo:** M (3-5 dias).

---

## PROP-76: Inline success badges micro (complemento al toast)

**Descripcion:** Post-accion (crear, guardar, duplicar): un micro-check
"✓ Guardado" que aparece al lado del boton que disparo la accion y desaparece
en 2s. Complementario al toast Sonner existente (que sigue apareciendo para
errores y acciones destructivas).

**Justificacion:** El toast aparece lejos del punto de accion. El badge inline
es mas tactil — "tocaste aqui, pasó esto, aqui mismo". Refuerza la metafora
tactile del leitmotiv.

**Alcance estimado:**
- Hook `useInlineSuccess({ onTrigger, duration = 2000 })` que expone
  `isVisible` y handlers.
- Componente `<InlineSuccessBadge visible={...} label="Guardado" />`
  absolute-positioned al lado del boton trigger.
- Integrar en botones de "Guardar" de formularios (CreateSession, DeckEdit,
  ContextoForm...).
- No desplazar a otros toasts (mantener Sonner para errores).

**Esfuerzo:** S (1-1.5 dias).

---
