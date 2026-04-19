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
