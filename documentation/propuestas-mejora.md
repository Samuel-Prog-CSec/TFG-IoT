# Propuestas de Mejora Pendientes - EduPlay RFID

> Propuestas pendientes de implementacion para versiones futuras.
> Las propuestas implementadas en sesiones anteriores fueron eliminadas de este
> documento — su trazabilidad queda en el historial de Git y en los memory files
> de cada sesion (`memory/project_*.md`).
>
> **PROP-60 y PROP-63 (Redis):** se mantuvieron en el documento aunque el paquete
> pre-v1.0.0 del 23/04/2026 (ADR-080) decidió diferirlas a Sprint 7. La
> infraestructura habilitadora (feature flags ADR-073, helpers Redis, BullMQ
> scaffolding ADR-077) está lista para cuando aterricen.

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

## PROP-6: Export/Import de sesiones y mazos

**Descripcion:** Permitir exportar sesiones y mazos como archivo JSON descargable, e importarlos en otra cuenta o instancia de la plataforma.

**Justificacion:** Facilita la colaboracion entre profesores y la reutilizacion de contenido educativo. Un profesor que ya configuro un mazo de "Banderas de Europa" con 30 tarjetas no deberia tener que recrearlo desde cero en otra cuenta.

**Alcance estimado:**
- Backend: endpoints `GET /api/decks/:id/export` y `POST /api/decks/import`
- Frontend: boton "Exportar" en deck detail, boton "Importar" en decks list
- Validacion de formato al importar
- Resolucion de conflictos (contextos/assets referenciados)

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

# Hallazgos diferidos QA 2026-04-22 (post-release v0.5.0)

Estas dos propuestas surgen de la sesion de QA intensiva del 22/04/2026 pero
quedaron fuera de la release porque el cambio es demasiado invasivo para el
ciclo v0.5.0. Todos los demas findings de esa auditoria (unos 32) fueron
abordados en la propia sesion — ver `memory/project_qa_2026_04_22.md`.

---

## PROP-77: Refactor del scroll arquitectonico del AppLayout

**Descripcion:** El contenedor `<main>` de `AppLayout.jsx` tiene
`className="flex-1 overflow-auto relative custom-scrollbar pb-16"`. Todo el
contenido de las paginas scrollea dentro de ese `main` en lugar del scroll
natural de `<html>/<body>`. Provoca:

- Scroll anidado: en Dashboard el `main` tiene `scrollHeight=2800px` mientras
  `body=991px`. Rompe el scroll natural y puede atrapar la rueda del raton
  sobre un `<ResponsiveContainer>` de Recharts.
- `window.scrollTo(0, y)` no funciona — requiere targeteo explicito al
  `<main>` en codigo QA/analytics.
- Playwright `page.screenshot({fullPage:true})` NO captura el contenido
  completo (se quedo fuera del viewport durante la auditoria).
- Screenshot tools externos (html2canvas, html-to-image) capturan solo el
  viewport visible del `main` — no la pagina entera.

**Justificacion:** El scroll natural del body es el patron esperado en SaaS
modernos (Linear, Vercel, Supabase). Arreglarlo desbloquea:
- Screenshots automatizados correctos
- Analytics de scroll depth si se quieren en el futuro
- Position `sticky` en la pagina sin hacks
- Scroll-linked animations de fondo (ver PROP-73) funcionan mejor

**Alcance estimado:**
- Quitar `overflow-auto` del `<main>` y dejar el overflow en `<body>`.
- Convertir `<aside>` a `fixed left-0 top-0 h-screen` con `margin-left` en el
  main equivalente al ancho del sidebar.
- Verificar que mobile sidebar (overlay + backdrop) sigue funcionando sin
  bloquear el scroll del body con `position: fixed` o `overflow: hidden`
  temporal en `<html>`.
- Revisar paginas con scroll interno propio (GameSession con pausa overlay,
  BoardSetup con DndContext) para que no colisionen con el nuevo scroll del
  body.
- Tests: verificar en mobile / tablet / desktop que la navegacion y scroll
  funcionan identicos.

**Esfuerzo:** M (3-4 dias). Cambio arquitectonico pero acotado a AppLayout.

**ADR tentativo:** "Eliminacion del scroll anidado en AppLayout y adopcion
del scroll natural del body"

---

## PROP-78: Persistencia real de alertas inteligentes con createdAt historico

**Descripcion:** Hoy las alertas que muestra `AlertsHub.jsx` y
`AlertsPanel.jsx` provienen de `getClassroomAlerts` en
`backend/src/services/analyticsService.js`. Se generan **on-the-fly** cada
peticion: el servicio recorre partidas recientes y deriva alertas
(`declining_performance`, `inactivity`, `sudden_score_drop`,
`consistent_timeout`, etc.) pero no las persiste. Como consecuencia:

- `createdAt` / `detectedAt` se setean al momento de la peticion → el
  frontend siempre muestra "Ahora mismo" / "Hace 7 min" para todas las
  alertas de la misma tanda.
- No hay historial: el profesor no puede ver alertas de ayer o de la semana
  pasada.
- No hay estado: no se puede marcar una alerta como "leida" o "resuelta" —
  si el alumno mejora, la alerta desaparece silenciosamente sin dejar huella.
- La UI no puede ordenar correctamente alertas por antiguedad real.

**Justificacion:** Calidad de datos visible en demos / pre-release. Ademas,
las alertas son el canal principal que el profesor usa para priorizar
intervenciones — que "desaparezcan" sin aviso o que todas parezcan recien
detectadas es confuso e impide hacer seguimiento.

**Alcance estimado:**

1. **Modelo Mongoose nuevo `SmartAlert`:**
   - Fields: `studentId`, `teacherId`, `type`, `severity`, `description`,
     `detectedAt` (primera deteccion), `lastSeenAt` (ultima reaparicion),
     `resolvedAt`, `status` (`active|resolved|dismissed`), `gamePlayId`
     opcional.
   - Indices: `{ teacherId, status, detectedAt: -1 }`,
     `{ studentId, type, status }` (para dedupe).

2. **Servicio `alertDetectionService.js`:**
   - Recalculo periodico (BullMQ job cada 15 min — coordinar con PROP-62) que
     evalua cada alumno activo y:
     - Si detecta una alerta nueva (type + studentId no activa) → insert.
     - Si una alerta existente sigue valida → update `lastSeenAt`.
     - Si una alerta existente ya no aplica → transicion a `resolved`.
   - Dedupe por `(studentId, type, status=active)`.
   - Reemplaza el calculo on-the-fly del `analyticsService` actual.

3. **Endpoints REST:**
   - `GET /api/analytics/alerts?status=active&period=...` — listado paginado.
   - `PATCH /api/analytics/alerts/:id/dismiss` — marcar como desestimada.
   - `PATCH /api/analytics/alerts/:id/resolve` — marcar como resuelta.

4. **Frontend:**
   - AlertsHub: mostrar `detectedAt` real con `formatRelativeTime`.
   - Filtros por estado (Activas / Resueltas / Desestimadas).
   - Accion de "Dismiss" en cada alerta (con undo toast via sonner).

5. **Migracion:** script `migrate-alerts.js` que genera alertas historicas a
   partir de las partidas existentes.

**Tests:**
- Unit: dedupe de alertas (no duplicar la misma type+student en activas).
- Unit: transicion a resolved cuando desaparece la condicion.
- E2E: job corre → alertas aparecen con detectedAt correcto → profesor
  dismiss → no reaparece aunque el criterio se repita.

**Esfuerzo:** L (7-10 dias). Nuevo modelo + servicio + endpoints + frontend +
migracion. Depende idealmente de PROP-62 (BullMQ) para la task periodica —
sin ella se haria con `setInterval` y seria menos robusto en multi-replica.

**ADR tentativo:** "Persistencia de alertas inteligentes con ciclo de vida
activo/resuelto/desestimado"

---

# Propuestas QA senior pre-release v0.5.0 final (2026-04-23)

Propuestas surgidas de la sesión QA senior de diseño + auditoría UI/UX
del 2026-04-23 (ver `memory/project_qa_senior_2026_04_23.md`). Los bugs
críticos y fixes UI/UX de menor alcance se abordaron en la propia sesión;
las siguientes requieren más alcance y quedan para Sprint 6.

---

## PROP-79: Fallback táctil robusto para rondas cortas de Asociación

**Descripcion:** Durante el QA del 2026-04-23 jugando una partida de
asociación con 15s por ronda, los clicks en las cartas del panel táctil
fallback no se registraban como aciertos incluso cuando se pulsaba la
carta correcta. El log del backend mostraba solo 2 de 5 rondas con
evento (y ambas como `error`). Las otras quedaban como "sin completar"
→ score final: 0 aciertos, -4 puntos, 5 sin completar.

**Causa probable:** ventana de validacion/timing entre `round_start`,
`emit scan`, `validation_result` y el timeout del ronda. El
`isDuplicateScan` con SCAN_DEDUPE_MS=1300ms o el throttle del socket
estan dejando colgado algun scan justo cuando la ronda ya expiro.

**Justificacion:** la asociacion es una de las dos mecanicas principales
y la usabilidad queda rota si en partidas cortas el jugador no recibe
credito por aciertos reales. Con 15s por ronda muchos profes van a
configurar tiempos tan ajustados.

**Alcance estimado:**
- Buffer de scans entrantes durante la transicion de ronda (100-200ms de
  gracia) para atribuir el scan a la ronda pendiente si llega justo al
  borde.
- Telemetria: contar `scan_on_closed_round` y exponerlo en
  `/api/health`.
- Tests de carrera con tiempos simulados en ASSOCIATION_DURATION <= 15s.
- Considerar un pequeño indicador visual "procesando..." durante la
  ventana para que el jugador sepa que el scan se esta contabilizando.

**ADR tentativo:** "Ventana de gracia en transiciones de ronda para
evitar perdida de scans en Asociacion con tiempos cortos".

---

## PROP-80: Pódium oro/plata/bronce en Top 5 del Dashboard

**Descripcion:** El widget "Mejores Estudiantes" del Dashboard muestra
los puestos 1-5 con el mismo tratamiento violeta uniforme. En todos los
productos educativos o gamificados los 3 primeros puestos usan los
colores tradicionales oro/plata/bronce, que son lenguaje universal.

**Justificacion:** claridad inmediata ("de un vistazo sé quién va
primero") y pequeña delight que refuerza la metafora educativa/
motivacional. Es una signature visual que se ve mucho y aporta
personalidad sin ruido.

**Alcance estimado:**
- Tokens CSS `--color-podium-gold`, `--color-podium-silver`,
  `--color-podium-bronze` en `index.css` (OKLCH o hex).
- Helper `getPodiumRank(index)` que devuelve el color o fallback.
- Integrar en `TopStudentsWidget`.
- Quizas un halo sutil en el #1 ("drop-shadow-gold").

**Esfuerzo:** S (1 dia).

---

## PROP-81: Seeder inicial de feature flags en el admin

**Descripcion:** El admin entra a `/admin/flags` y ve "Aún no hay
feature flags" aunque el sistema (PROP-61, ADR-073) declara flags en
código (redis leaderboards, studentMetrics, rfid-mode-distributed,
ws-rate-limit-distributed, bullmq-worker, context-cache-invalidator,
feature-flags-ui, deck-sparkline, icon-opt-in, etc.). La UI lee Mongo
pero los flags solo estan en Redis Hash.

**Justificacion:** el admin debe poder ver y controlar las flags desde
el deploy inicial sin tener que crearlas una a una. Actualmente no tiene
forma de saber cuales flags existen y cuales estan ON/OFF.

**Alcance estimado:**
- Script `seed:feature-flags` que lea una lista canonica desde
  `config/featureFlags.js` y escriba los docs iniciales en Mongo con
  `status: inactive`.
- Integrar con los `npm run seed` existentes (condicional `--flags`).
- UI lista flags activas del catalogo aunque no existan en BD ("por
  crear") con boton "Crear y activar".

**Esfuerzo:** S (1-2 dias).

---

## PROP-82: Dashboard admin global con KPIs agregados

**Descripcion:** El super_admin entra a `/dashboard` y ve exactamente la
misma pagina que un profesor (KPIs, charts, alertas). Para su rol los
valores son 0 (no tiene "sus" alumnos), lo que da una impresion rota.

**Justificacion:** el super_admin es un rol de direccion. Necesita una
vista globalizada: alumnos totales (todas las aulas), profesores
activos, partidas agregadas, mazos totales, sesiones, alertas criticas
del centro.

**Alcance estimado:**
- Nuevo endpoint `/api/admin/analytics/overview` que agrega por tenancy
  sin filtrar por `teacherId`.
- Reusar componentes de Dashboard pero con datasets agregados cuando
  `role === 'super_admin'`.
- Considerar filtros por profesor / aula para drill-down.

**Esfuerzo:** M (3-4 dias).

---

## PROP-83: Chart "Rendimiento de Clase" — recortar eje X al rango con datos

**Descripcion:** El chart `StudentProgressChart` del Dashboard muestra
un eje X de 8 dias (16/4 → 23/4) pero solo tiene puntos en los ultimos
1-2 dias, dejando el resto de la linea "flotando al final" con aspecto
de que el sistema falla.

**Justificacion:** mejor UX si mostramos solo el rango con datos o al
menos etiquetamos explicitamente "sin partidas registradas" para los
dias vacios.

**Alcance estimado:**
- Calcular en el backend el firstPlayAt; devolver solo dias desde ahí.
- O alternativa frontend: `useMemo` que clamp el eje X al
  `first/lastValidIndex` del dataset.
- Opcion C: dejar 8 dias pero poner un patron diagonal en los dias sin
  datos.

**Esfuerzo:** S (1-2 dias).

---

## PROP-84: Search-ahead en dropdowns del modal "Jugar" y del Board Setup

**Descripcion:** Reapertura de PROP-70. En la sesion 2026-04-23 el
profe con 18 alumnos ve una lista plana sin buscador en el modal
"Seleccionar alumno" del boton "Jugar" y en el selector "Asignar
Estudiante" del board setup. Con un super_admin que ve los 36 del
centro se hace inviable.

**Justificacion:** escalabilidad real: centros con 100+ alumnos.

**Alcance estimado:** igual que PROP-70 pero aplicado explicitamente a
estos dos selects.

---

## PROP-85: Confirmacion de cierre de sesion

**Descripcion:** El boton "Cerrar Sesión" del sidebar cierra la sesion
inmediatamente sin confirmacion. Un click accidental pierde el progreso
del profe (filtros, estado de navegacion...).

**Justificacion:** prevencion de perdida de contexto. Patron standard
en SaaS (Linear, Notion, Slack...).

**Alcance estimado:**
- Modal "¿Seguro que quieres cerrar sesion?" reutilizando
  `ConfirmationModal` con variante `destructive` = false (es
  reversible).
- O toast "Sesion cerrada" con undo en 3s (patron mas moderno).

**Esfuerzo:** XS (medio dia).

---

## PROP-87: Chart "Curvas de Aprendizaje" — label del eje X no solapa la leyenda

**Descripcion:** En `InsightsReports > Efectividad > Curvas de Aprendizaje`,
el label "Partida" del eje X y la leyenda horizontal de abajo (con los
nombres de contextos) se solapan visualmente en viewports 1280-1920px.
El texto de ambos queda apilado ilegible.

**Justificacion:** es uno de los charts mas usados (curva de
aprendizaje = mejora por repeticion). La superposicion visual es un
defecto cosmetico claro.

**Alcance estimado:**
- Reservar altura explicita al `XAxis` label (`padding: { bottom: 20 }`
  en Recharts) o `margin.bottom` del chart.
- Verificar responsive en 1280/1440/1920.

**Esfuerzo:** XS (medio dia).

---

## PROP-88: KPIs del Dashboard — delta "—" cuando no hay baseline

**Descripcion:** Los KPIs del Dashboard ("Alumnos en Riesgo",
"Puntuación Media", "Partidas Hoy", etc.) tienen todos una linea
"vs semana pasada" pero solo algunos muestran el delta numerico
(+340%, -28.7%). Otros muestran la linea vacia sin delta, dando
impresion de dato faltante.

**Justificacion:** transparencia de datos. Cuando no hay baseline
(primera semana de uso, dato nuevo), deberia mostrar "—" explicito para
que el profesor no asuma que es un bug.

**Alcance estimado:**
- Helper `formatDelta(current, previous)` que devuelve `"—"` cuando
  `previous === 0 || previous === null`.
- Integrar en `StatCard` o el render del KPI.

**Esfuerzo:** XS (medio dia).

---

## PROP-89: Preview completo de mazo (6 miniaturas visibles en card)

**Descripcion:** Las cards de mazo en `/decks` muestran solo 4 de las 6
miniaturas (por ejemplo Banderas de Europa: España, Francia, Italia,
Alemania — no aparece Portugal ni Grecia). No hay indicador "+N".

**Justificacion:** coherencia con el numero real de tarjetas (los
stats dicen "12 cartas" pero solo se ven 4). El contrato visual debe
alinearse con el conteo.

**Alcance estimado:**
- Cambiar `slice(0, 4)` a `slice(0, 6)` (caben al ancho estandar de
  la card).
- O bien mantener 4 mas un badge "+N" consistente con los contextos.

**Esfuerzo:** XS (unas horas).

---

## PROP-86: Actividad Reciente con indicador visual de scroll

**Descripcion:** El carrusel horizontal "Actividad Reciente" del
Dashboard corta el último item sin dar pistas claras de que hay más
contenido a la derecha. La scrollbar nativa es muy fina.

**Justificacion:** affordance. Un gradient fade + chevron basta para
indicar "scrollea".

**Alcance estimado:**
- Gradient fade absolute en el borde derecho de
  `RecentActivityCarousel`.
- Chevron button que scroll-to por 1 item.
- Responsive a si hay o no overflow (no mostrar si cabe todo).

**Esfuerzo:** XS (medio dia).
