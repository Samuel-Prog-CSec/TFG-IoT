# Propuestas de Mejora Pendientes - EduPlay RFID

> Propuestas pendientes de implementacion para versiones futuras.
> Las propuestas implementadas en sesiones anteriores fueron eliminadas de este
> documento — su trazabilidad queda en el historial de Git y en los memory files
> de cada sesion (`memory/project_*.md`).
>
> **PROP-60 y PROP-63 (Redis):** se mantuvieron en el documento aunque el paquete
> pre-v1.0.0 del 23/04/2026 (ADR-080) decidió diferirlas a Sprint 7. La
> infraestructura habilitadora (helpers Redis, BullMQ scaffolding ADR-077) está
> lista para cuando aterricen.

---

## Clasificacion de propuestas abiertas (planificacion 2026-04-26)

Las **65 propuestas abiertas + 3 descartadas** (PROP-2, PROP-6,
PROP-11 — cerradas con T-956 el 2026-05-13) se reparten en dos
categorias segun el momento en que se abordaran. Esta seccion es el
indice maestro; los headings individuales se mantienen sin etiqueta
para no saturar el formato. **Consultar esta tabla antes de atacar
cualquier PROP.**

> **Cierre de Sprint 5 (2026-04-26)**: las 15 propuestas `[MANT]` que
> figuraban aquí (PROP-21, 27, 47, 70, 77, 79, 80, 81, 83, 84, 87, 88,
> 89, 90, 92) se cerraron en la sesión de mantenimiento del 26/04/2026.
> Ver ADR-089, ADR-090, ADR-092 y ADR-093 en
> `documentation/Architecture_Decisions.md` para los cambios
> arquitectónicos derivados. Los memos quedan en el historial de Git.

- **[SP6] Sprint 6 — Release v1.0.0 (25)** — bloqueantes o
  habilitadoras de la release cloud. Todas son **PROP-95 a PROP-133**
  (propuestas nuevas de la planificacion 2026-04-24). Ninguna
  pre-Sprint-6 entra en esta lista: las importantes se absorbieron
  durante las sesiones QA de 2026-04-21..24 y las restantes son
  features grandes o refactors amplios que no bloquean la release.
- **[FUT] Futuro — backlog post-v1.0.0 (40)** — features grandes
  (mascots, dashboards admin, leaderboards ZSET, OpenAPI, release
  automation), refactors amplios, y mejoras "nice-to-have" que pueden o
  no implementarse tras la entrega TFG segun tiempo disponible. **Para
  la planificacion actual se tratan como si no fueran a hacerse.**

> **Equivalencia con etiquetas internas de Sprint 6:** en los headings
> PROP-95..133 figura `[BLOQUEANTE v1.0.0]`, `[ALTA]` o `[MEDIA]`.
> Mapping: `BLOQUEANTE` y `ALTA` → categoria **[SP6]** en este indice.
> `MEDIA` → categoria **[FUT]**. Este mapping es definitivo aunque el
> heading no se renombre.

---

### [SP6] Sprint 6 — Release v1.0.0 (25)

Todas son PROP-95 a PROP-133 (nuevas de la planificacion 2026-04-24).

**BLOQUEANTES v1.0.0 (18, orden de ataque recomendado):**

| Bloque | PROP IDs |
|---|---|
| A. Deploy infra | 95, 96, 97, 98 |
| B. Hardening pre-deploy | 100, 101, 102, 103 |
| C. CD pipeline | 104, 105 |
| D. Observabilidad | 110, 111 |
| E. Seguridad | 113 |
| F. Backup | 117 |
| I. Docs | 127 |
| J. Housekeeping | 131, 132, 133 |

**ALTAS dentro del sprint (7, si el tiempo da margen):**

| Bloque | PROP IDs | Nota |
|---|---|---|
| A. Deploy infra | 99 | Staging vs produccion separados |
| C. CD | 106 | Auto-rollback post-deploy |
| G. Performance | 120, 122, 123 | Cloudflare rules / Socket.IO multi-instance / Upstash budget |
| H. Testing | 124, 125 | E2E Playwright + load test k6 |

**Esfuerzo total estimado:** ~25-30 dias de trabajo (Sprint 6 completo).

---

### [FUT] Futuro — backlog post-v1.0.0 (40)

No se planifican. Se documentan para trazabilidad. Pueden graduar a
Sprint 7+ tras la release si el proyecto continua post-entrega TFG.

**Pre-Sprint-6 (26):**

PROP-1 (notificaciones tiempo real), 4 (tema claro), 9 (tema claro
revision), 10 (vista cruzada mecanica × contexto), 13 (onboarding
interactivo), 16 (atmosferas dinamicas contexto), 17 (atajos teclado),
18 (audit AnimatePresence), 60 (leaderboards ZSET), 63 (studentMetrics
Redis Hash), 65 (paginacion/virtualizacion listados), 66 (charts paleta
marca), 67 (GameOver emocional + mascot), 68 (atajos teclado
ampliacion), 69 (inline editing listados), 71 (hero transition
DeckCard), 72 (navegacion direccional), 73 (scroll parallax), 74
(mascota extendida), 75 (atmosferas reapertura), 76 (inline success
badges), 78 (persistencia alertas con lifecycle), 82 (dashboard admin
global), 91 (Informes como zona funcional), 93 (logout undo), 94
(campaña cobertura SonarCloud 80%).

**Descartadas con T-956 (2026-05-13) — 3:** PROP-2 (modo demo
profesor), PROP-6 (export/import sesiones), PROP-11 (modo demo sin
RFID revision). Detalle en `documentation/sprints/Sprint6_Tareas.md`
(sección T-956). PROP-6 reabrible post-v1.0.0 si se solicita
explícitamente.

**Nuevas Sprint 6 deferidas (14):**

PROP-107 (release-please), 108 (preview deploys PR), 109 (Sentry
Performance), 112 (dashboard operativo), 114 (rate limits recalibrar),
115 (OWASP ZAP), 116 (MFA super_admin), 118 (runbook DR), 119
(restore-e2e automatizado), 121 (bundle analysis), 126 (chaos testing),
128 (runbook operacional), 129 (OpenAPI 3.1), 130 (CHANGELOG
automatizado).

---

**Revision:** este reparto se revisa tras la release v1.0.0. Las
propuestas [MANT] y [SP6] son compromiso firme; las [FUT] son
opcionales.

**Total:** 25 + 40 = 65 propuestas abiertas (+ 3 descartadas con
T-956: PROP-2, PROP-6, PROP-11).

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

**Estado:** ❌ Descartada con cierre de T-956 (2026-05-13). El `FallbackTouchPanel` ya cubre el flujo sin sensor (pulido en QAs recientes: cooldown, feedback `CheckCircle2/XCircle`, target size, latencia 1500ms) y `window.__rfidSim` cubre simulación en QA. Detalle en `documentation/sprints/Sprint6_Tareas.md` (sección T-956).

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

**Estado:** ❌ Descartada con cierre de T-956 (2026-05-13) para v1.0.0. Feature de productividad real pero independiente y no bloqueante. **Reabrible post-v1.0.0** como tarea aislada (no en rama UI/UX) si se solicita explícitamente para colaboración entre profesores. Detalle en `documentation/sprints/Sprint6_Tareas.md` (sección T-956).

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

**Estado:** ❌ Descartada con cierre de T-956 (2026-05-13). El motivo original (bug del FallbackTouchPanel) fue corregido en QAs posteriores; el panel táctil es ahora estable y constituye la vía oficial para jugar sin sensor. Detalle en `documentation/sprints/Sprint6_Tareas.md` (sección T-956).

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

## PROP-78: Persistencia real de alertas inteligentes con createdAt historico ✅ IMPLEMENTADA (T-941, ADR-161)

**Estado:** Cerrada en Sprint 6 vía T-941 con ampliación profunda. Implementación entrega no solo la persistencia básica (`SmartAlert` con lifecycle active/resolved/dismissed/snoozed) sino también:

- 7 detectores nuevos (incluye `plateau_detected` que arrastraba TODO, `sequence_stagnation`/`sequence_order_errors` que cerraron criterio pendiente de T-923, y un detector cross-mecánica único en el proyecto).
- Pinning, audit log endpoint, dashboard interno de eficacia, hard-delete cron, auto-reapertura de dismissed.
- Notificación realtime al docente cuando aparece critical.
- Fix de seguridad RGPD (filtro `consent.withdrawnAt`) + fix de bug crítico (divide-by-zero en `decliningPerformance`).
- Eliminación completa del código legacy (no fachada, no flag).

Ver detalles completos en `documentation/Architecture_Decisions.md` ADR-161.

---

### Descripción original (histórica)

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

# Propuestas QA final pre-release v0.5.0 (2026-04-24)

Propuestas surgidas de la sesión QA final del 2026-04-24 que quedan fuera
del corte por ser demasiado invasivas. Ver `memory/project_qa_final_2026_04_24.md`.

---

## PROP-91: Dashboard Informes como zona funcional y no un form suelto

**Descripcion:** La tab "Informes" de Insights muestra solo un form de 3
dropdowns + botón "Generar Informe" en una card de ~350px sobre un viewport
de 1080px. La zona inferior del viewport (70% del espacio) queda vacía.
Cuando un profesor entra a "Informes" sin hacer nada más, percibe la página
como incompleta o rota.

**Justificacion:** aprovechar el espacio con contenido útil mejora la
percepción del producto. Además, los profesores raramente generan un
informe por primera vez sin contexto: saber qué informes hay, ver
ejemplos y guardar plantillas son features naturales.

**Alcance estimado:**
- Sección "Informes recientes" con lista de informes generados en las
  últimas 2 semanas (persistidos en Mongo con `generatedAt`, `reportType`,
  `period`).
- Ilustración o mini-preview del tipo de informe seleccionado que se
  actualiza según los dropdowns.
- CTA "Ver ejemplo" que abre un informe seed del mazo actual.
- Opcional: plantillas predefinidas ("Fin de trimestre", "Padres",
  "Claustro") que rellenan los 3 dropdowns de una.

**Esfuerzo:** M (3-4 dias, frontend + persistencia ligera).

---

## PROP-93: Confirmación al hacer click accidental en "Cerrar Sesión" sin modal

**Descripcion:** Refinamiento de **PROP-85**. Aparte del modal, la UX
moderna permite "undo" — el click cierra sesión inmediatamente pero en
un toast persistente durante 5s aparece "Sesión cerrada. [Deshacer]". Si
el usuario pulsa deshacer antes de 5s, se re-autoentica con el refresh
token que todavía está válido.

**Justificacion:** una llamada rápida a `/auth/refresh` puede reactivar
la sesión sin modal. Más fluido que el modal pero requiere que el backend
no invalide el refresh token hasta pasados los 5s (o el usuario cerrar
pestaña).

**Alcance estimado:**
- `toast.success` persistente con action `Deshacer`.
- Logout diferido: borrar access token en memoria pero guardar refresh
  5s más antes de invalidarlo; si el usuario pulsa deshacer, re-crear
  sesión desde refresh token.
- Test concurrency: refrescar pestaña durante los 5s no debe desloguear.

**Esfuerzo:** S-M (2-3 dias, incluye coordinación FE/BE).

---

## PROP-94: Campaña de cobertura para Quality Gate SonarCloud

**Descripcion:** La cobertura actual del proyecto es **28.9%** (backend ~30%,
frontend ~25%) frente al threshold del Quality Gate SonarCloud de 80% en new
code. El ADR-086 dejó explícita esta deuda como fuera de scope de la sesión
de limpieza SonarCloud (abril 2026) por tamaño. Las otras dos condiciones
del QG ya se cerraron en esa sesión (reliability + hotspots_reviewed).

**Justificacion:** la cobertura baja permite que regresiones se cuelen en PRs
sin signal temprana. El proyecto tiene 1034 tests backend + 257 tests frontend
— base sólida pero no uniforme. Áreas críticas sin cobertura completa: gameEngine
(parcial), mecánicas de juego (memory, association), flujos de auth/refresh
token rotation, hooks custom frontend (`useGameSocket`, `useGamePlaySync`).

**Alcance estimado:**
- **Backend:** tests para gameEngine restantes, mecánicas individuales,
  authService (refresh rotation + blacklist), endpoints analytics menos cubiertos.
- **Frontend:** tests para hooks críticos, páginas principales (GameSession,
  Dashboard), componentes de juego (ChallengeDisplay, RFIDHandler).
- **Excluir explícitamente** en `sonar-project.properties` (ya parcialmente
  hecho): bootstrapping (server.js, main.jsx), CLIs (`scripts/*`), efectos
  visuales puros (Confetti, ScanlineOverlay), barrel files.

**Esfuerzo:** XL (1-2 sprints dedicados). Objetivo realista: subir a 60%
primero, luego 80% incremental. Alternativa pragmática: bajar el threshold
del QG a 50% en new code hasta que la campaña avance, evitando bloquear
merges por una métrica que no va a moverse en un PR pequeño.

---

# Propuestas Sprint 6 — Release v1.0.0 cloud (planificacion 2026-04-24)

Con Sprint 5 cerrado (paquete pre-v1.0.0 del 2026-04-23, QA final 2026-04-24 y
limpieza SonarCloud — ADR-086), **Sprint 6 tiene como objetivo la release
v1.0.0 con deploy real a cloud** y dar el proyecto por entregado.

**Stack cloud acordado (100% free tier, sin tarjeta de credito):**

- Backend + Worker BullMQ → **Koyeb** (Nixpacks, sin Dockerfile en repo)
- Frontend estatico Vite → **Cloudflare Pages** (CDN edge incluido)
- MongoDB → **Atlas M0** (512 MB shared, forever-free)
- Redis → **Upstash** (256 MB, 10K cmd/dia)
- Storage assets → **Supabase** (ya en uso, sin cambios)
- Uptime monitoring → **UptimeRobot** (50 monitors free, ping cada 5 min)
- Log shipping → **BetterStack Logtail** o **Axiom** (a decidir en PROP-110)

**Decisiones estrategicas previas:**

- **Fly.io descartado**: dejo de tener free tier real a finales de 2024
  (ahora pay-as-you-go con tarjeta obligatoria).
- **Docker queda relegado a dev/testing local**. Los assets Docker
  orientados a produccion (`docker-compose.prod.yml`, Dockerfiles de prod)
  se archivan — ver PROP-132.
- Se **mantienen Redis + BullMQ** pese al deploy. Son los
  componentes que mejor escalan en cloud multi-instancia y su eliminacion
  reintroduciria problemas que ya estan resueltos (WS rate-limit en
  multi-replica, retention jobs atomicos, idempotencia de startPlay).
- **PROP-60** (leaderboards ZSET) y **PROP-63** (studentMetrics
  materializados) siguen diferidas a Sprint 7; no son bloqueantes para
  v1.0.0 y el volumen de datos esperado en demo cabe holgadamente en
  Atlas M0.

**Convencion de prioridad:**

- **[BLOQUEANTE v1.0.0]** — imprescindible para cortar la release.
- **[ALTA]** — high-ROI, deseable antes de v1.0.0; diferible a v1.1.0 si
  el sprint va corto.
- **[MEDIA]** — backlog explicito post-release.

Total: 39 propuestas (PROP-95 a PROP-133), 18 marcadas bloqueantes.

---

## A. Deploy infraestructura cloud (Koyeb + Cloudflare + Atlas + Upstash)

---

## PROP-95 [BLOQUEANTE v1.0.0]: Scaffolding Koyeb para backend y worker

**Descripcion:** Crear la configuracion de despliegue para Koyeb usando
Nixpacks (auto-deteccion Node sin Dockerfile) con el backend API y el
worker BullMQ como **dos apps Koyeb independientes** de la misma
organizacion, con GitHub integration para auto-deploy en push.

**Justificacion:** Koyeb Free ofrece 1 web service + 1 worker always-on
gratis. Nixpacks detecta `package.json` y aplica buildpack Node nativo,
de modo que el repo no tiene Dockerfiles ni referencias a Docker en
produccion. Cold starts se mitigan con PROP-133.

**Alcance estimado:**
- Config declarativa en `.koyeb/api.yaml` y `.koyeb/worker.yaml`
  (o panel UI): region `fra`/`ams` (eu-central/eu-west), puerto 5000 en
  api, worker sin puerto publico, escala minima 1 en ambos.
- Healthcheck de la app API apuntando a `/health/ready` (PROP-100).
- Variables de entorno referenciando Koyeb Secrets (PROP-98).
- Script `npm run start:prod` que verifique conectividad a Atlas y Upstash
  antes de levantar HTTP; ayuda a diagnosticar misconfig de secrets.
- Entry point del worker: `backend/worker.js` (ya existente, ADR-077).
- Documentacion nueva: `documentation/Deploy_Koyeb.md` con quickstart.

**Esfuerzo:** M (2-3 dias).

**ADR tentativo:** "ADR-087: Despliegue en Koyeb con Nixpacks, separacion
backend API vs worker BullMQ como apps distintas".

---

## PROP-96 [BLOQUEANTE v1.0.0]: Migracion MongoDB a Atlas M0

**Descripcion:** Aprovisionar cluster M0 en MongoDB Atlas (region
eu-central por RGPD), configurar acceso de red, usuario dedicado de
aplicacion con privilegios minimos (`readWrite` sobre la DB del proyecto)
y migrar la `MONGODB_URI` del backend.

**Justificacion:** Atlas M0 es forever-free (512 MB shared tier) e
incluye TLS, replica set y backups snapshot basicos. Sin este paso no
hay BD en produccion.

**Alcance estimado:**
- Crear cluster M0 en `eu-central-1` o equivalente mas cercano a Koyeb.
- Network Access: al no haber IPs fijas en Koyeb free, whitelist
  `0.0.0.0/0` mitigado con usuario/password fuerte + TLS.
- Database Access: usuario `eduplay-api` con rol
  `readWrite@eduplay-prod` y otro equivalente para staging.
- `MONGODB_URI` con formato SRV completo y `retryWrites=true&w=majority`.
- Ejecutar `npm run seed:if-empty` en el primer deploy para bootstrap.
- Auditar indices: algunos `schema.index(...)` pueden requerir creacion
  manual. Verificar con `db.collection.getIndexes()`.
- Auditar tamaño: el seed completo debe caber holgadamente en 512 MB —
  si no, PROP-131 propone alertas de budget.

**Esfuerzo:** S-M (1-2 dias).

**ADR tentativo:** "ADR-088: Migracion MongoDB Atlas M0, estrategia de
whitelist y hardening de credenciales sin IPs fijas".

---

## PROP-97 [BLOQUEANTE v1.0.0]: Migracion Redis a Upstash

**Descripcion:** Aprovisionar base Redis en Upstash (region
eu-central), actualizar el cliente `ioredis` para soportar TLS nativo
(`rediss://`) y aplicar optimizaciones para no sobrepasar el limite de
10.000 commands/dia de free tier.

**Justificacion:** Upstash Free: 256 MB, 10K comandos/dia. Cabe todo lo
que hoy usa Redis en el proyecto (`rl:*`, `session:*`, `ff:*`,
`play:init:*`, BullMQ queues, cache analytics) pero con 10K/dia el
command budget es apretado. PROP-123 audita uso real y aplica
pipelining; esta propuesta sienta la base.

**Alcance estimado:**
- Crear 2 DBs Upstash: `eduplay-prod` y `eduplay-staging`, region
  `eu-west-1`.
- Variables: `REDIS_URL` con `rediss://default:pass@...upstash.io:6379`.
- `keyPrefix: 'eduplay:'` en ioredis para separar entornos si
  comparten DB en algun edge case.
- BullMQ queues: verificar que caben en 256 MB bajo carga normal.
- Desactivar la reconciliacion nocturna de `analyticsCache` (hoy cada 15
  min) y bajar a diaria con env var `REDIS_QUOTA_MODE=free|pro` — permite
  upgrade posterior sin cambios de codigo.
- Smoke test: correr el backend local contra Upstash staging por 24h y
  verificar commands/day en el dashboard.

**Esfuerzo:** M (2-3 dias).

**ADR tentativo:** "ADR-089: Redis en Upstash free tier, estrategia de
command budget y adaptacion de jobs periodicos".

---

## PROP-98 [BLOQUEANTE v1.0.0]: Secrets management + rotacion en Koyeb

**Descripcion:** Establecer el pipeline de secrets desde `.env.example`
(repo, con placeholders) hacia **Koyeb Secrets** (prod/staging) y
**GitHub Actions secrets** (CI/CD). Documentar politica de rotacion de
cada clave critica.

**Justificacion:** Hoy los secrets viven en `.env` local. Pasar a prod
requiere un sistema gestionado con rotacion planificada, especialmente
JWT secrets que pueden comprometerse y cuya rotacion implica invalidar
todas las sesiones activas.

**Alcance estimado:**
- `.env.example` actualizado con todas las variables requeridas,
  marcando secretos vs publicas.
- Koyeb Secrets: crear todos los secretos (`JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `MONGODB_URI`, `REDIS_URL`, `SENTRY_DSN`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CSRF_SECRET`, etc.).
- Variables no-secret (`FRONTEND_URL`, `NODE_ENV`, `PORT`) via env
  normal en el panel Koyeb.
- Documento `documentation/Secrets_Rotation.md`:
  - Lista de secrets con proposito y riesgo al comprometerse.
  - Frecuencia recomendada (JWT cada 6 meses, DB cada 3, general anual).
  - Procedimiento de rotacion sin downtime usando dual-validation
    (ambos secrets validos durante ventana de transicion).

**Esfuerzo:** S (1 dia).

**ADR tentativo:** "ADR-090: Gestion de secrets con Koyeb Secrets y
politica de rotacion para v1.0.0".

---

## PROP-99 [ALTA]: Entornos separados staging vs produccion

**Descripcion:** Provisionar **dos conjuntos independientes** de apps y
recursos managed: `staging` para validar deploys antes de prod, y
`production` estable. Cada uno con su cluster Atlas M0, su DB Upstash,
y sus proyectos Cloudflare Pages y apps Koyeb separadas.

**Justificacion:** Deploy directo a prod sin paso intermedio es asumir
demasiado riesgo. Atlas y Upstash permiten multiples free tiers por
cuenta → staging tambien gratis. Sirve para validar migraciones de BD,
load test (PROP-125) y ensayos de release previos al corte.

**Alcance estimado:**
- Segundo cluster Atlas M0 `eduplay-staging`.
- Segunda DB Upstash `eduplay-staging`.
- Dos apps Koyeb por capa: `api-staging`/`worker-staging` y
  `api-prod`/`worker-prod`.
- Dos proyectos Cloudflare Pages: `main` → prod, `Maintenance` → staging.
- Variable `NODE_ENV` y `APP_ENV=staging|production` diferenciadas.
- Flag `SEED_ON_BOOT=true` solo en staging para reset rapido.
- Documentar en `documentation/Deploy_Koyeb.md` que se valida en staging
  antes de promocionar a prod (tag).

**Esfuerzo:** S-M (1-2 dias).

**ADR tentativo:** "ADR-091: Separacion staging vs produccion en free
tier, doble aprovisionamiento Atlas/Upstash/Koyeb".

---

## B. Hardening pre-deploy (readiness, shutdown, pools, timeouts)

---

## PROP-100 [BLOQUEANTE v1.0.0]: Split liveness vs readiness probes

**Descripcion:** Separar el actual `/api/health` (endpoint combinado) en
dos endpoints: `/health/live` (proceso vivo, sin chequear dependencias,
siempre 200 si Node corre) y `/health/ready` (chequea conectividad a
Atlas, Upstash y BullMQ, devuelve 503 si alguna dep esta KO).

**Justificacion:** Koyeb (como k8s) distingue liveness de readiness:
liveness fallando → reinicia proceso; readiness fallando → deja de
enviar trafico sin reiniciar. Si el mismo endpoint responde 503 cuando
Redis pestañea, Koyeb reinicia el proceso entero innecesariamente.

**Alcance estimado:**
- Refactor `healthController.js`: nuevos `healthLive()` y
  `healthReady()`.
- `GET /health/live`: siempre 200 con body minimo `{status:'ok',
  uptime, pid}`.
- `GET /health/ready`: pings paralelos Mongo + Redis con timeout 500ms
  cada uno, status 503 si alguno falla + JSON con detalle por dep.
- Mantener `/api/health` como alias de `/health/ready` por retrocompat.
- Healthcheck de Koyeb apuntando a `/health/ready`.
- UptimeRobot (PROP-133) pingando `/health/live`.
- Tests unitarios para ambos endpoints con mocks de fallo.

**Esfuerzo:** S (1 dia).

**ADR tentativo:** "ADR-092: Separacion liveness/readiness probes para
Koyeb healthchecks y UptimeRobot warming".

---

## PROP-101 [BLOQUEANTE v1.0.0]: Audit completo de graceful shutdown

**Descripcion:** Auditar que SIGTERM dispara un shutdown ordenado:
detiene aceptacion HTTP nueva, drena BullMQ queues (`worker.close(true)`),
cierra Socket.IO notificando a clientes (para reconectar en 10s),
desconecta Mongo/Redis y hace flush de Pino/Sentry. Timeout duro de 25s
antes de que Koyeb aplique SIGKILL.

**Justificacion:** Koyeb concede ~30s de grace period en deploys/rollout.
Sin drenaje ordenado: partidas en curso perdidas, jobs BullMQ abandonados
en estado no-final, logs/eventos Sentry perdidos. Hoy existe base en
`server.js`, queues e `workers/index.js` pero sin auditoria end-to-end.

**Alcance estimado:**
- Revisar handlers SIGTERM/SIGINT en `server.js` y `worker.js`.
- Secuencia de shutdown del backend API:
  1. Marcar `readiness=false` → Koyeb deja de enviar trafico nuevo.
  2. `httpServer.close()` con timeout → esperar request in-flight.
  3. Socket.IO: emit `server_shutdown` a rooms activas, `io.close()`.
  4. BullMQ producer queues: `queue.close()`.
  5. Mongoose: `mongoose.connection.close(false)`.
  6. Redis: `redis.quit()`.
  7. Sentry flush (timeout 5s), Pino flush.
- Secuencia del worker (distinta): `worker.close(true)` drena jobs activos
  con timeout 10s antes de forzar.
- Test de integracion que envie SIGTERM a un backend real y verifique
  secuencia + ausencia de loss.

**Esfuerzo:** M (2-3 dias).

**ADR tentativo:** "ADR-093: Graceful shutdown completo con drain BullMQ
y notificacion Socket.IO para deploys sin downtime".

---

## PROP-102 [BLOQUEANTE v1.0.0]: Timeouts del proxy Koyeb para WebSocket

**Descripcion:** Ajustar los timeouts de las apps Koyeb para permitir
WebSocket de larga duracion (partidas de 15+ min) sin ser cortadas por
el proxy. Por defecto el proxy puede cortar conexiones idle a los X
segundos, lo que rompe Socket.IO si el heartbeat no esta activo o
cubre una ventana mayor.

**Justificacion:** Una partida puede durar 10-15 min con actividad
esporadica (heartbeat Socket.IO cada 25s default). Si el proxy cierra
por idle en 60s, la experiencia de juego se interrumpe. Ademas hay que
verificar que el frontend reconecta transparentemente cuando ocurre.

**Alcance estimado:**
- Verificar config Koyeb: `idle_timeout` a 120s+ (confirmar valor exacto
  segun tier free).
- Confirmar ping/pong Socket.IO en el server: `pingInterval: 25000,
  pingTimeout: 20000`.
- Frontend: asegurar `reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, reconnectionDelayMax: 5000`.
- Test end-to-end manual: partida completa de 15 min con un frontend
  apuntando a la app staging en Koyeb, monitorizar disconnects.
- Documentar comportamiento esperado en
  `backend/docs/WebSockets-ExtendedUsage.md`.

**Esfuerzo:** S (0.5-1 dia, mayormente validacion).

---

## PROP-103 [BLOQUEANTE v1.0.0]: Tuning Mongoose connection pool para Atlas

**Descripcion:** Ajustar las opciones de conexion Mongoose al salir de
Mongo local (pool generoso, latencia baja) a Atlas (pool limitado,
latencia red, conexiones compartidas): `maxPoolSize=10`,
`serverSelectionTimeoutMS`, `socketTimeoutMS`, `heartbeatFrequencyMS`,
`retryReads`/`retryWrites`.

**Justificacion:** Los defaults Mongoose estan pensados para red local.
Atlas M0 comparte 100 conexiones totales entre todos los tenants del
cluster shared. Sin tuning, en picos de carga el pool se agota o los
timeouts son demasiado agresivos y generan falsos positivos de downtime.

**Alcance estimado:**
- `backend/src/config/database.js` con opciones explicitas:
  ```
  {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 30000,
    retryReads: true,
    retryWrites: true,
    w: 'majority'
  }
  ```
- Variables `MONGO_MAX_POOL_SIZE` y `MONGO_MIN_POOL_SIZE` configurables
  por entorno.
- Circuit breaker ligero: si la primera seleccion de server falla 3 veces
  seguidas, marcar `readiness=false` hasta recuperarse.
- Documentar en `backend/docs/Performance_Notes.md` el razonamiento del
  valor elegido para cada opcion.

**Esfuerzo:** S (1 dia).

---

## C. CD Pipeline (gap total — no existe hoy)

---

## PROP-104 [BLOQUEANTE v1.0.0]: Workflow deploy automatico a staging

**Descripcion:** Nuevo workflow `.github/workflows/deploy-staging.yml`
que, tras CI verde en push a `main` o `Maintenance`, despliega
automaticamente a staging: `koyeb app deploy api-staging` +
`koyeb app deploy worker-staging` en paralelo. Cloudflare Pages ya
integra auto-deploy por branch — no requiere workflow aparte.

**Justificacion:** Sin CD, cada deploy es manual desde CLI. El riesgo de
"olvidar desplegar el worker" o "desplegar version antigua" es alto en
un monorepo. Staging auto-deploy permite validar cada merge antes de
promocionar a produccion via tag (PROP-105).

**Alcance estimado:**
- Workflow con `needs: [backend-tests, frontend-checks]` reutilizando el
  CI actual como gate.
- Steps paralelos: `koyeb service redeploy api-staging` y
  `koyeb service redeploy worker-staging` usando la CLI oficial en un
  step con `uses: koyeb-community/koyeb-actions/deploy@v2` (o curl a la
  API si no existe action estable).
- Secrets: `KOYEB_API_TOKEN_STAGING`.
- Post-deploy: curl `/health/ready` tras 60s, fail si 503.
- Notificacion email/Slack con resultado.
- Cloudflare Pages: configurado a auto-deploy rama `Maintenance` a
  staging y `main` a produccion.

**Esfuerzo:** M (2 dias).

**ADR tentativo:** "ADR-094: Pipeline CD con deploy automatico a staging
en Koyeb + Cloudflare Pages".

---

## PROP-105 [BLOQUEANTE v1.0.0]: Workflow deploy produccion via tag semver + approval

**Descripcion:** Workflow `.github/workflows/deploy-production.yml`
disparado al pushear tag `v*` (semver). Requiere aprobacion manual via
**GitHub Environment `production`** con required reviewers. Tras
aprobacion, deploy a prod y smoke test automatico.

**Justificacion:** Deploy a prod debe ser deliberado y revisado. Usar
tags como gatillo mapea 1:1 con la release en GitHub. El approval gate
evita deploys accidentales y cumple con buenas practicas de CD para
entornos criticos.

**Alcance estimado:**
- GitHub Environment `production` con `required_reviewers: [Samuel]`.
- Workflow `on: push: tags: ['v*']`.
- Steps: checkout → setup-node → validate tag semver →
  `koyeb service redeploy api-prod` + `worker-prod` → smoke test
  `/health/ready` → create GitHub Release con notas del CHANGELOG.
- Cloudflare Pages: branch `main` → production deployment.
- Secrets: `KOYEB_API_TOKEN_PROD` separado de staging.
- Si falla smoke test: trigger PROP-106 (auto-rollback) y fail build.

**Esfuerzo:** M (2 dias).

**ADR tentativo:** "ADR-095: Deploy a produccion con tag semver y
approval gate en GitHub Environments".

---

## PROP-106 [ALTA]: Auto-rollback si fallan health checks post-deploy

**Descripcion:** Tras deploy a produccion, monitorizar `/health/ready`
durante 2 min. Si status=503 de forma sostenida, ejecutar
`koyeb service rollback` automaticamente a la revision anterior.

**Justificacion:** Un deploy con bug (ej: `MONGODB_URI` mal configurada,
migracion fallida) puede tumbar el servicio. Rollback manual desde CLI
tarda minutos en contexto de alerta. Auto-rollback reduce MTTR a < 3 min
y evita que un deploy roto quede activo mientras el operador duerme.

**Alcance estimado:**
- Step post-deploy en `deploy-production.yml`.
- Polling `/health/ready` cada 15s × 8 iteraciones.
- Si 5 de 8 devuelven 503: `koyeb service rollback` a release anterior.
- Notificacion Sentry + email (marcar severidad alta).
- Test: deploy intencional con variable incorrecta en staging, verificar
  que rollback dispara.

**Esfuerzo:** S (1 dia).

---

## PROP-107 [MEDIA]: Release automation con release-please

**Descripcion:** Integrar `googleapis/release-please-action` que analiza
conventional commits desde el ultimo tag y abre PR automaticamente con:
`CHANGELOG.md` actualizado, version bumped en `package.json`, PR body
auto-generado. Merge del PR → dispara tag `v*` → dispara PROP-105.

**Justificacion:** Ya hay conventional commits validados por commitlint
+ husky. Esto automatiza el cambio de version y CHANGELOG sin trabajo
manual, y cierra el circuito con PROP-105 (tag → deploy).

**Alcance estimado:**
- `.github/workflows/release-please.yml`.
- `release-please-config.json` con definicion de monorepo (root,
  backend, frontend como packages separados o single-package root).
- `.release-please-manifest.json` con version inicial `0.5.0`.
- Primer release-please PR generara CHANGELOG.md retroactivo desde
  conventional commits historicos (subset).
- Documentar flujo en `CONTRIBUTING.md` y README.

**Esfuerzo:** S-M (1-2 dias).

---

## PROP-108 [MEDIA]: Preview deploys efimeros por PR

**Descripcion:** Cada PR abierto crea una app Koyeb efimera
`api-pr-<number>` y una preview de Cloudflare Pages (nativo). Al cerrar
o mergear el PR se destruye. Permite validar cambios en entorno real
sin tocar staging.

**Justificacion:** Util para QA de PRs no triviales ("quiero probar X
en entorno real antes de aprobar"). Tiene overhead de recursos pero la
DB puede compartirse con staging (las apps preview son read-mostly). El
free tier de Koyeb permite multiples apps.

**Alcance estimado:**
- Workflow `on: pull_request`:
  - `opened`/`reopened` → `koyeb app create api-pr-<num>` + deploy.
  - `synchronize` → redeploy.
  - `closed` → `koyeb app delete api-pr-<num>`.
- Cloudflare Pages: preview deploys por branch (config nativa).
- Comentario automatico en el PR con URL de preview.
- Limite: solo PRs del propio repo (no forks) para no exponer secrets.
- Evaluar si Atlas/Upstash free tier aguanta: compartir staging DB con
  warning de que los tests pueden contaminar datos.

**Esfuerzo:** M (2-3 dias).

---

## D. Observabilidad produccion

---

## PROP-109 [MEDIA]: Sentry Performance activado en prod

**Descripcion:** Habilitar `tracesSampleRate` en Sentry tanto backend
como frontend para recoger trazas de performance de requests y
transactions. Identificar endpoints con p95 > 500ms, queries lentas a
Mongo, y cuellos de botella en gameplay.

**Justificacion:** Sentry SDK ya esta integrado para errores. Activar
performance es coste cero (free tier incluye 10K transactions/mes) y
aporta instrumentacion que de otra forma requeriria APM propio.

**Alcance estimado:**
- `sentry.init({ tracesSampleRate: 0.1 })` en backend y frontend prod.
- En staging subir a 0.5 para obtener mas señal.
- Instrumentar manualmente transacciones criticas con `Sentry.startSpan`:
  `startPlay`, `endPlay`, `getClassroomAnalytics`, socket `rfid_scan`.
- Dashboard Sentry Performance revisado semanalmente durante primeras
  4 semanas post-release.
- Documentar metricas observadas en memoria TFG.

**Esfuerzo:** S (1 dia).

---

## PROP-110 [BLOQUEANTE v1.0.0]: Log shipping centralizado

**Descripcion:** Integrar servicio de log shipping (**BetterStack
Logtail** 5 GB/mes free, **Axiom** 500 MB/mes free, o **Grafana Cloud
Loki** 50 GB/mes free — el mas generoso) para exportar los logs Pino
del backend y worker a un lugar persistente y consultable.

**Justificacion:** Koyeb retiene logs ~3 dias en free tier. Ante un
incidente en produccion, sin historico no hay forensics posible.
Ademas la UI de Koyeb no ofrece query avanzada ni agregacion por campos
estructurados.

**Alcance estimado:**
- Evaluacion de proveedor: recomendado **Grafana Cloud Loki**
  (50 GB/mes free, LogQL potente) o **BetterStack** (UI mas amigable).
- Integracion: transport Pino:
  - Loki: `pino-loki` o `@grafana/logfmt-transport`.
  - BetterStack: `@logtail/pino`.
- Estructurar logs con campos consistentes: `requestId`, `userId`,
  `sessionId`, `component`, `severity`.
- Dashboard saved views: "errores por endpoint", "slow queries",
  "auth fails spike", "rate-limit hits".
- Secret `LOG_SHIPPING_TOKEN` en Koyeb Secrets.
- Alerting desde LogQL/filter query: "error rate > 5%/min".

**Esfuerzo:** M (2 dias).

**ADR tentativo:** "ADR-096: Log shipping centralizado con
[BetterStack|Grafana Cloud Loki] para persistencia y querying".

---

## PROP-111 [BLOQUEANTE v1.0.0]: Alerting externo (UptimeRobot + Sentry)

**Descripcion:** Configurar **UptimeRobot free** (50 monitors, check
cada 5 min) pingando `/health/ready` de staging y produccion, mas
Sentry Alerts para patrones de error criticos. Notificaciones a email
personal + Slack opcional + Telegram alternativo.

**Justificacion:** Sin alerting externo, una caida total del servicio
se detecta solo cuando un usuario reporta. UptimeRobot free cubre el
gap con zero coste. Sentry ya tiene sistema de alertas integrado —
solo hay que configurarlas.

**Alcance estimado:**
- 2 monitors UptimeRobot pingando `/health/ready` de staging y prod.
- 2 monitors adicionales pingando Cloudflare Pages (frontend
  disponible).
- Sentry Alerts configuradas:
  - "Error rate > 5% in 5 min on prod"
  - "New error type appeared in prod"
  - "Auth failures spike > 20/min"
  - "Rate limit fallback store counter > 0" (regresion de PROP-16)
- Notificaciones: email (canal bloqueante), Slack opcional.
- Runbook ligado: cada tipo de alerta apunta a procedimiento en
  `documentation/Runbook_DR.md` (PROP-118).

**Esfuerzo:** S (1 dia).

---

## PROP-112 [MEDIA]: Dashboard operativo consolidado

**Descripcion:** Pagina en Notion (o markdown en repo) con enlaces
consolidados a: **Atlas Charts** (slow queries, connections),
**Upstash Console** (memory, commands/day), **Koyeb metrics** (CPU,
RAM, network), **Cloudflare Analytics** (traffic, cache hit ratio),
**Sentry Performance** (p95, error rate), **UptimeRobot status page**.

**Justificacion:** Diagnostico de problemas requiere mirar 6 sistemas
distintos. Centralizar enlaces y saved queries reduce MTTR y facilita
sucesion (si alguien retoma el proyecto tras el TFG).

**Alcance estimado:**
- `documentation/Operational_Dashboard.md` con enlaces y screenshots.
- Saved queries en Atlas Charts y Sentry con filtros utiles.
- Status page publica en UptimeRobot para posibles usuarios finales.
- Screenshots de referencia incluidos en memoria TFG como evidencia.

**Esfuerzo:** S (0.5-1 dia).

---

## E. Seguridad produccion

---

## PROP-113 [BLOQUEANTE v1.0.0]: Security headers recalibrados para prod

**Descripcion:** Revisar y endurecer la config Helmet + CSP para prod:
CSP con `report-uri` al endpoint Sentry, HSTS con `preload` + submission
a hstspreload.org, eliminacion de `'unsafe-inline'` residual,
Certificate Transparency con `report-to`.

**Justificacion:** Dev permite `'unsafe-inline'` por conveniencia HMR,
pero en prod es superficie de ataque XSS. Ademas los headers deben
reflejar el dominio real (no `localhost`) y aprovechar directivas
avanzadas. Objetivo: score A+ en securityheaders.com.

**Alcance estimado:**
- Refactor `backend/src/config/security.js` con split `devHeaders` vs
  `prodHeaders`.
- CSP strict para prod:
  - `script-src 'self' https://*.sentry.io`
  - `style-src 'self' 'nonce-...'` (si hay inline style necesario)
  - `connect-src 'self' wss://api-prod.koyeb.app https://*.sentry.io`
  - `img-src 'self' data: https://supabase.co`
- HSTS: `includeSubDomains; preload; max-age=63072000`.
- Submit al hstspreload.org tras 2 semanas de staging.
- Report-uri/report-to a endpoint Sentry para violaciones CSP.
- Test con securityheaders.com post-deploy (objetivo A+).

**Esfuerzo:** S-M (1-2 dias).

**ADR tentativo:** "ADR-097: Hardening de security headers para
produccion con CSP stricto y HSTS preload".

---

## PROP-114 [MEDIA]: Rate limits recalibrados con trafico real esperado

**Descripcion:** Revisar los limits actuales (pensados para 1 profesor
en dev) y calibrarlos para carga prod esperada: 10-30 profesores
simultaneos, picos de 100 alumnos jugando. Aplica a HTTP y WebSocket
event limits.

**Justificacion:** Si los limits son demasiado estrictos, se rompe la
experiencia real. Si son demasiado laxos, abusive users tumban el free
tier. PROP-125 (load test) validara los valores nuevos.

**Alcance estimado:**
- Inventariar limits actuales en `security.js` y `realtime/`.
- Propuesta numerica por limiter:
  - `globalLimiter`: 1000 req/15min por IP (de 500)
  - `authLimiter`: 20 intentos/15min por IP (de 5, pero deja 5 para
    login y 20 para endpoints auth menos sensibles)
  - `creationLimiter`: 50/hora por user (de 20)
  - WS event scan: 60 scans/min por socket (de 30)
  - WS event pause/resume: 20/min por session
- Deploy a staging, load test con k6 (PROP-125), ajustar.

**Esfuerzo:** S (1 dia).

---

## PROP-115 [MEDIA]: OWASP ZAP scan pre-release

**Descripcion:** Antes del corte v1.0.0, ejecutar OWASP ZAP baseline
scan contra staging. Revisar findings, confirmar que ninguno es
critico/alto explotable. Incluir informe como evidencia en memoria TFG.

**Justificacion:** Auditoria externa automatizada de OWASP Top 10.
Coste cero, produce artefacto documentable para la seccion de
seguridad de la memoria.

**Alcance estimado:**
- GitHub Action `zaproxy/action-baseline@v0.13.0` disparada
  manualmente con `workflow_dispatch`.
- URL objetivo: `staging.eduplay.<dominio>`.
- Report HTML subido como artefacto GitHub.
- Triage de findings en tabla: severidad, explotable, accion.
- Capitulo en memoria TFG con screenshots del scan y mitigaciones.

**Esfuerzo:** S (1 dia para primera pasada).

---

## PROP-116 [MEDIA]: Proteccion adicional endpoints super_admin

**Descripcion:** Los endpoints `/admin/*` actualmente dependen solo
de JWT con rol `super_admin`. Añadir capa adicional: **MFA TOTP**
para acciones sensibles (delete users, purge data, transferencias) +
opcional IP allowlist via env var.

**Justificacion:** El super_admin tiene poder total; comprometer ese
JWT es ganar toda la plataforma. Defense in depth con 2FA reduce
drasticamente la ventana de exploit incluso si el token se filtra.

**Alcance estimado:**
- Middleware `requireMfa` que valide TOTP code en endpoints criticos.
- Libreria `otplib` o `speakeasy` para generacion/validacion TOTP.
- UI `/admin/mfa-setup` con QR para Google Authenticator / Authy.
- Backup codes si el admin pierde el dispositivo (8 codigos single-use,
  almacenados hash).
- Alternativa complementaria: `ADMIN_IP_ALLOWLIST` env var validando
  IPs conocidas.

**Esfuerzo:** M (3-4 dias).

**ADR tentativo:** "ADR-098: MFA TOTP para acciones super_admin en
produccion".

---

## F. Backup / DR

---

## PROP-117 [BLOQUEANTE v1.0.0]: Politica de backups + restore drill

**Descripcion:** Atlas M0 no incluye backups automaticos fiables. Crear
job BullMQ diario que ejecute `mongodump` contra Atlas, suba el archivo
a Supabase Storage y rote conservando los ultimos 7 dias. Drill mensual
de restore contra staging para validar.

**Justificacion:** Sin backups el proyecto es vulnerable a corrupcion
accidental, error humano o borrado malicioso. Un restore drill valida
que los backups son realmente utiles — no basta con que el job corra
y genere archivos.

**Alcance estimado:**
- Nuevo BullMQ job `backup-mongo-daily` en `backend/src/jobs/`.
- Ejecuta `mongodump --uri=$MONGODB_URI --archive --gzip` stream-to-
  buffer (evitar FS intermediario en Koyeb).
- Sube a bucket Supabase `backups/mongo/YYYY-MM-DD.gz`.
- Rotacion: borrar backups > 7 dias.
- Upstash: similar pero menor prioridad (cache reconstruible).
- Documento `documentation/Backup_Policy.md` con procedimiento de
  restore paso a paso.
- Calendario recurrente (mental o Github issue auto-creado) para drill
  mensual.

**Esfuerzo:** M (2-3 dias).

**ADR tentativo:** "ADR-099: Politica de backups con BullMQ +
Supabase Storage y restore drill mensual".

---

## PROP-118 [MEDIA]: Runbook DR para incidentes cloud

**Descripcion:** Documento `documentation/Runbook_DR.md` con
procedimiento paso-a-paso para cada tipo de incidente: **Atlas down,
Upstash down, Koyeb down, Cloudflare down, Supabase Storage down**.
Incluye RTO/RPO objetivos, diagnostico rapido y contactos.

**Justificacion:** En medio de un incidente no hay tiempo de
improvisar. Un runbook convierte una crisis en una checklist y evita
errores por panico.

**Alcance estimado:**
- Escenarios cubiertos:
  - Atlas M0 no responde
  - Upstash cuota commands excedida
  - Koyeb service down / crashed
  - Cloudflare DNS issue
  - Supabase Storage error
  - BullMQ worker crashed en bucle
- Por escenario: sintomas, diagnostico en 2 min, mitigacion inmediata,
  postmortem.
- Objetivos RTO 1h, RPO 24h acordes al free tier.
- Revision tras cada incidente real (meta: runbook vivo).

**Esfuerzo:** S-M (1-2 dias de escritura).

---

## PROP-119 [MEDIA]: Script restore-e2e end-to-end automatizado

**Descripcion:** Automatizar el drill de PROP-117: script
`npm run restore:test` que descarga el backup mas reciente, restaura
a un cluster Atlas temporal (o a `eduplay-staging`), y ejecuta una
suite smoke tests minima contra ella.

**Justificacion:** El drill manual mensual es facil de olvidar. Script
automatizable via cron en GitHub Actions garantiza que pasa y falla
ruidosamente cuando se rompe. Evidencia de DR real para memoria TFG.

**Alcance estimado:**
- Script `backend/scripts/restore-test.js`.
- Workflow `.github/workflows/restore-drill.yml` con schedule `0 3 1
  * *` (dia 1 del mes a las 3am UTC).
- Ejecuta contra `eduplay-staging` (destruye y recrea datos staging).
- Smoke suite minima: login teacher → list decks → create session →
  start play → verify analytics endpoint.
- Alerta email si falla.

**Esfuerzo:** M (2 dias).

---

## G. Performance / escalabilidad

---

## PROP-120 [ALTA]: Cloudflare rules (cache + WAF + DDoS + rate limit) ✅ CERRADA (T-907 / ADR-160, 2026-05-17)

**Descripcion:** Cloudflare Pages incluye proxy Cloudflare por defecto.
Configurar reglas: **cache** (estaticos con TTL largo, HTML always
fresh), **WAF managed** (OWASP Core Ruleset free), **rate limiting**
(30 req/10s por IP a `/api/*`), DDoS automatico.

**Justificacion:** El free tier de Cloudflare da mucho mas que solo
CDN. Activar WAF + rate limiting pone capa de proteccion edge delante
del backend sin coste, ahorra queries al free tier Upstash.

**Alcance estimado:**
- Dashboard Cloudflare → Page Rules o Rules Engine:
  - `*.js`, `*.css`, `*.woff2`: Cache Everything, TTL 1h.
  - `/index.html`: Bypass (SPA fresh).
  - `/api/*`: Bypass cache, forward a backend Koyeb.
- Security → WAF → Managed Rules → OWASP Core Ruleset (free).
- Security → Rate limiting: 30 req/10s por IP a `/api/*`.
- Bot Fight Mode activado.

**Esfuerzo:** S (1 dia).

---

## PROP-121 [MEDIA]: Bundle analysis + tree-shaking final frontend ✅ CERRADA (T-907 / ADR-159, 2026-05-17)

**Descripcion:** Auditar el bundle final de produccion con
`rollup-plugin-visualizer`. Identificar deps grandes (Recharts, Framer
Motion, lucide-react) y aplicar dynamic import donde aplique. Objetivo:
bundle inicial < 200 KB gzipped.

**Justificacion:** Aunque Cloudflare es rapido, un bundle grande
ralentiza la primera carga. Revisar bundle es ejercicio estandar
pre-release. Los findings son documentables en memoria TFG como
"optimizaciones aplicadas".

**Alcance estimado:**
- Integrar `rollup-plugin-visualizer` en `vite.config.js`.
- Build de prod y revisar treemap HTML resultante.
- Candidatos a lazy-load:
  - Recharts (solo en analytics) → `React.lazy` por route.
  - Pagina admin (`/admin/*`) → chunk separado.
  - FallbackTouchPanel → solo load si `rfidMode !== 'physical'`.
- Medidas antes/despues: Lighthouse score, TTI, bundle size.

**Esfuerzo:** M (2 dias).

---

## PROP-122 [ALTA]: Validar Socket.IO adapter con multiples instancias Koyeb ✅ CERRADA (T-907, 2026-05-17 — scripts `dev:multi-1/2` + `test:multi-instance` + doc en `WebSockets-ExtendedUsage.md`)

**Descripcion:** Aunque Koyeb free solo permite 1 instancia always-on
por app, validar que el **Socket.IO Redis adapter** (ya integrado)
funciona correctamente si se escala a 2+ instancias. Test manual con
dos workers locales compartiendo Upstash.

**Justificacion:** Si en el futuro se escala (tras recoger fondos o
migrar a paid), queremos saber que el adapter ya implementado funciona.
Ademas el test produce evidencia documental de escalabilidad horizontal
para la memoria TFG.

**Alcance estimado:**
- Test manual local: 2 backends en puertos distintos compartiendo la
  misma Upstash staging.
- Cliente A se conecta al backend 1, cliente B al backend 2. Ambos
  en la misma `room` (misma sesion).
- Verificar que `io.to(room).emit(...)` desde el backend 1 llega al
  cliente B (servido por backend 2) y viceversa.
- Documentar resultados en
  `backend/docs/WebSockets-ExtendedUsage.md`.

**Esfuerzo:** S (1 dia).

---

## PROP-123 [ALTA]: Optimizacion command budget Upstash ✅ CERRADA (T-907 / ADR-158, 2026-05-17 — telemetría comandos por categoría + LRU memoria slim-user / mechanic / context. Sub-tareas refactor pipeline auth y `runPipeline` adopción quedan documentadas como follow-up)

**Descripcion:** Medir commands/dia consumidos en staging durante 1
semana. Si se acercan a 10K/dia, aplicar optimizaciones: pipelining
donde se hagan N comandos secuenciales (`MULTI/EXEC` o
`pipeline()`), `MGET` en vez de N `GET`, cache en memoria corta
duracion de valores "quasi estaticos" (flags, rate limit counters).

**Justificacion:** 10K/dia es el cuello del free tier Upstash. Si se
sobrepasa, Redis se bloquea hasta medianoche UTC. Bajo uso normal TFG
no deberia pasar, pero demos al tribunal con 30-40 alumnos jugando
concurrentemente podrian forzar picos.

**Alcance estimado:**
- Dashboard Upstash con commands/day ploteado semanalmente.
- Telemetria propia en `config/redis.js` contando comandos por
  categoria (rate-limit, session, flags, cache, bullmq).
- Identificar hot paths:
  - Por cada request autenticada hay: rate-limit check + session
    validation + flag check = 3 comandos minimos.
  - 100 requests/min × 3 = 4320 commands/dia.
- Optimizaciones:
  - Pipeline en `security.js` rateLimiter (1 roundtrip no 3).
  - Cache memoria flags (TTL 30s) → no leer Redis en cada request.
  - Agrupar reads con pipeline donde sea posible.
- Objetivo: < 5K commands/dia en uso tipico prod.

**Esfuerzo:** M (2-3 dias).

**ADR tentativo:** "ADR-100: Optimizacion del command budget Upstash
con pipelining".

---

## H. Testing pre-release

---

## PROP-124 [ALTA]: Smoke tests E2E Playwright en CI

**Descripcion:** Suite minima de smoke tests Playwright que cubra el
happy path principal: login teacher → crear mazo → crear sesion →
jugar ronda (con FallbackTouchPanel) → ver analytics. Corre en cada
PR contra backend local arrancado por CI.

**Justificacion:** Los unit tests no detectan bugs de integracion
entre SPA + backend + Mongo + Redis. Smoke E2E los atrapa. En CI da
confianza de que el happy path sigue funcionando tras cualquier cambio.

**Alcance estimado:**
- Instalar `@playwright/test` en `frontend/`.
- Suite `frontend/e2e/smoke.spec.js`:
  - Login `maria@test.com`.
  - Crear mazo "Test Deck" con 6 tarjetas.
  - Crear sesion asociacion.
  - Iniciar partida con FallbackTouchPanel.
  - Completar 1 ronda acierto.
  - Verificar score en analytics.
- Workflow `.github/workflows/e2e.yml` con `services: mongodb, redis`
  (ioredis-mock no vale, necesita real).
- Subir screenshots de fallos como artifacts.

**Esfuerzo:** M-L (3-5 dias).

---

## PROP-125 [ALTA]: Load test k6 contra staging

**Descripcion:** Ejecutar load test con k6 contra staging simulando
50 profesores concurrentes + 200 estudiantes jugando. Medir p95/p99
de endpoints criticos y detectar cuellos antes de produccion.

**Justificacion:** Atlas M0 y Upstash free tienen limites duros. Sin
saber a que escala se rompe la plataforma, una demo al tribunal con
40 alumnos puede fallar imprevisiblemente. Evidencia de load test
tambien es capitulo denso para memoria TFG.

**Alcance estimado:**
- Script `tests/load/k6-classroom.js` con escenario realista
  (profesores + alumnos, mix de endpoints).
- Ramp up: 0 → 50 profes en 2 min, sostener 10 min, ramp down.
- Metrics:
  - p95 `/api/plays/start` < 300ms
  - p95 `endPlay` < 500ms
  - p95 `/api/analytics/classroom/*` < 800ms
  - Error rate < 1%
- Contra staging (nunca contra prod).
- Resultados en `documentation/Load_Test_Results.md` con graficos.

**Esfuerzo:** M (2-3 dias).

---

## PROP-126 [MEDIA]: Chaos testing basico

**Descripcion:** Scripts chaos que simulen fallos: Upstash
disconnected 30s, Atlas timeout, worker BullMQ killed. Verificar que
la app degrada controladamente (errores claros al usuario,
recuperacion automatica al volver).

**Justificacion:** La app tiene muchos patrones de resiliencia ya
implementados (fallback rate-limiters MemoryStore, circuit breaker en
queues) pero no se han probado bajo fallo real. Chaos confirma que
funcionan.

**Alcance estimado:**
- Scripts `scripts/chaos/*.sh`:
  - `kill-upstash.sh`: bloquea puerto con iptables (dev/staging).
  - `flood-atlas.sh`: satura pool con conexiones paralelas.
  - `kill-worker.sh`: `pkill worker.js`.
- Checklist comportamiento esperado por cada escenario.
- Ejecucion manual trimestral (no automatizada — demasiado invasivo).
- Documentar hallazgos en `documentation/Chaos_Results.md`.

**Esfuerzo:** M (2 dias).

---

## I. Docs v1.0.0 y versionado

---

## PROP-127 [BLOQUEANTE v1.0.0]: README raiz con quickstart produccion

**Descripcion:** Reescribir `README.md` raiz con: introduccion del
proyecto, arquitectura cloud final (diagrama), stack, requisitos,
quickstart dev, quickstart deploy a staging/prod, troubleshooting
comun, enlaces a documentacion tecnica, licencia.

**Justificacion:** Actualmente el README es minimo. Para v1.0.0 y la
memoria TFG debe ser la carta de presentacion: un desarrollador que
llegue fresco debe poder entender, instalar y desplegar sin preguntar.

**Alcance estimado:**
- Secciones: Descripcion, Arquitectura (con diagramas PNG), Stack,
  Requisitos, Quickstart Dev, Quickstart Deploy, Troubleshooting,
  Contribuir, Licencia.
- Badges: CI status, SonarCloud coverage, version actual, license.
- Diagrama arquitectura cloud (Koyeb / Cloudflare Pages / Atlas /
  Upstash / Supabase) renderizado como PNG desde PlantUML o
  Mermaid.
- Enlaces a `documentation/`, `backend/docs/`, `frontend/docs/`.

**Esfuerzo:** M (2-3 dias).

---

## PROP-128 [MEDIA]: Runbook operacional

**Descripcion:** `documentation/Runbook_Operacional.md` con
procedimientos comunes del dia a dia: desplegar, rollback, reiniciar
worker, rotar secrets, escalar, investigar usuario reportado, purgar
datos GDPR, responder a alerta UptimeRobot.

**Justificacion:** Documentar operaciones reduce dependencia del
desarrollador original y facilita sucesion post-TFG. Complementa
PROP-118 (runbook DR) con operaciones no-emergencia.

**Alcance estimado:**
- ~15 playbooks de 1 pagina cada uno, formato consistente:
  cuando aplica, comandos exactos, verificacion, rollback posible.
- Indice cruzado con PROP-118.
- Actualizacion continua a medida que se aprenden operaciones nuevas.

**Esfuerzo:** M (3 dias de escritura).

---

## PROP-129 [MEDIA]: OpenAPI 3.1 generado para v1.0.0

**Descripcion:** Generar documentacion OpenAPI 3.1 a partir del codigo
(`swagger-jsdoc` con annotations JSDoc en cada ruta) y servirla en
`/api/docs` con Swagger UI (accesible en staging, protegida por rol
admin en prod).

**Justificacion:** OpenAPI es estandar moderno y permite que clientes
consuman la API programaticamente. Evidencia documentable para memoria
TFG (capitulo "documentacion de la API").

**Alcance estimado:**
- Integrar `swagger-jsdoc` + `swagger-ui-express`.
- Anotar todas las rutas con JSDoc `@openapi` (auth, users, cards,
  mechanics, contexts, sessions, plays, decks, admin, analytics).
- Generar spec estatica `openapi.json` en build para descarga.
- Ruta `/api/docs`: publica en staging, con auth super_admin en prod.
- URL publica enlazada desde README.

**Esfuerzo:** M-L (4-5 dias — anotaciones exhaustivas).

---

## PROP-130 [MEDIA]: CHANGELOG.md automatizado + semver explicito

**Descripcion:** Generar `CHANGELOG.md` automaticamente desde
conventional commits (via PROP-107 `release-please` o alternativa
`conventional-changelog-cli`). Documentar politica semver: breaking
changes → major, features → minor, fixes → patch.

**Justificacion:** Los cambios entre versiones deben ser navegables.
Un CHANGELOG escrito a mano se desactualiza. Automatizarlo con
conventional commits que ya se usan es casi gratis.

**Alcance estimado:**
- Generar CHANGELOG retroactivo (subset) desde primer commit semver.
- Release-please mantiene actualizado automaticamente (PROP-107).
- `CONTRIBUTING.md` con politica semver + conventional commits.
- README enlaza CHANGELOG.

**Esfuerzo:** S (1 dia combinado con PROP-107, M si va independiente).

---

## J. Gestion de recursos y housekeeping

---

## PROP-131 [BLOQUEANTE v1.0.0]: Free tier budget + monitoring de limites

**Descripcion:** Documento `documentation/Free_Tier_Budget.md` que
lista: recursos por cada servicio cloud, consumo esperado, limites
duros, que pasa si se superan, señales de alerta tempranas, plan B si
es necesario migrar a paid.

**Justificacion:** Operar en free tier requiere conocer los limites y
tenerlos monitorizados. Sin este documento, se puede sobrepasar un
limite sin aviso y experimentar outage a mitad de demo.

**Alcance estimado:**
- Tabla por servicio con limites duros y soft:
  - Atlas M0: 512 MB data, 100 connections shared,
    10 GB transfer/semana.
  - Upstash: 256 MB, 10K cmd/dia, 1 GB bandwidth/mes.
  - Koyeb: 512 MB RAM, 0.1 vCPU, bandwidth ~100 GB/mes.
  - Cloudflare Pages: bandwidth ilimitado, 500 builds/mes, 100
    custom domains.
  - Supabase: 500 MB storage, 2 GB bandwidth/mes, 50K MAUs auth.
  - Sentry: 5K errors/mes, 10K transactions/mes.
  - UptimeRobot: 50 monitors, 5min min interval.
- Calculo de consumo estimado: ¿50 profes × 200 alumnos diarios entra?
- Alertas tempranas: notificar al 80% de cualquier limite (job
  BullMQ o Sentry cron).
- Plan B por servicio: tier paid minimo y coste estimado.

**Esfuerzo:** M (2 dias).

---

## PROP-132 [BLOQUEANTE v1.0.0]: Deprecar docker-compose.prod.yml y Dockerfiles prod

**Descripcion:** Archivar/renombrar `docker-compose.prod.yml` y
cualquier `Dockerfile.prod` del repo. Documentar explicitamente que
**Docker queda solo para dev/testing local**, nunca para cloud.

**Justificacion:** Con Koyeb + Nixpacks + Cloudflare Pages, los
Dockerfile y docker-compose.prod son assets muertos y confusos.
Mantenerlos genera deuda cognitiva y riesgos (alguien intenta usarlos
creyendo que son la via oficial).

**Alcance estimado:**
- Renombrar `docker-compose.prod.yml` →
  `docker-compose.local-prod-test.yml` (explicito).
- Si existe `docker/backend/Dockerfile.prod` o similar, mover a
  `docker/archive/` o eliminar si esta versionado en git history.
- Actualizar `README.md`, `backend/docs/`, `documentation/` removiendo
  referencias a "Docker produccion".
- Banner en `docker/README.md`:
  > Docker is used only for local development and pre-deploy testing.
  > Production deployment uses Koyeb (backend + worker) and
  > Cloudflare Pages (frontend). See `documentation/Deploy_Koyeb.md`.

**Esfuerzo:** S (0.5 dia).

---

## PROP-133 [BLOQUEANTE v1.0.0]: Estrategia cold-start warming UptimeRobot

**Descripcion:** Configurar UptimeRobot free pingando `/health/live`
cada 5 min en staging y produccion. Documentar la estrategia en
memoria TFG como decision de ingeneria para mitigar limitacion del
free tier Koyeb.

**Justificacion:** Koyeb free puede dormir tras periodo de inactividad
prolongada, lo que provocaria cold start de 15-60s en la siguiente
request. Un ping cada 5 min al endpoint `/health/live` (que no toca
Redis ni Mongo → 0 commands/dia Upstash) mantiene el proceso vivo sin
coste.

**Alcance estimado:**
- UptimeRobot monitor HTTP(s) cada 5 min a
  `https://api-prod.koyeb.app/health/live`.
- Segundo monitor para staging.
- Notificaciones: email solo si downtime > 15 min (evita ruido).
- Seccion en memoria TFG "decisiones operacionales":
  - Razonamiento: por que ping y no otra estrategia.
  - Alternativas descartadas: cron job propio (no rentable), keepalive
    interno (no evita Koyeb sleep).
  - Coste: 0 euros, 0 commands Upstash, carga insignificante en Koyeb.
  - Riesgo: minimo (solo un GET ligero cada 5 min a endpoint sin
    dependencias).

**Esfuerzo:** XS (0.5 dia).

---

# Notas finales del backlog Sprint 6

Las propuestas anteriores suman **18 bloqueantes** (aprox. 25-30 dias
de trabajo) y **21 altas/medias** para backlog post-v1.0.0 o si el
sprint da margen.

**Orden de ataque recomendado:**

1. Semana 1: A (deploy infra) + B (hardening) — sin esto no hay deploy.
2. Semana 2: C (CD pipeline) + inicio de D (observabilidad).
3. Semana 3: E[parcial] (security headers prod) + F[parcial] (backups)
   + J (housekeeping).
4. Semana 4: I[parcial] (README prod) + primer deploy completo a
   staging + smoke test manual + iteracion de fixes.
5. Corte v1.0.0: tag + deploy prod + monitoreo cercano primeras 48h.
6. Backlog post-release: ALTA primero, MEDIA despues.
