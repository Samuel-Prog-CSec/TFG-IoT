# Propuestas de Mejora Pendientes - EduPlay RFID

> Propuestas pendientes de implementacion para el Sprint 6.
> Los bugs y mejoras UX identificados durante el testing del 31 de marzo de 2026 fueron resueltos en su totalidad durante el Sprint 5 y la fase de mantenimiento.
>
> Las propuestas PROP-9 a PROP-13 fueron añadidas en la sesion de QA del 17 de abril de 2026.

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

## PROP-14: Hover lift unificado y ripple en cards de listado

**Descripcion:** Las cards de Sesiones y Contextos ya tienen `whileHover={{ y: -4 }}`. Las de Mis Mazos no. Unificar el hover behavior con un primitive (`<HoverCard>` o variant en `GlassCard`) que añada lift + glow contextual del color de la mecanica/contexto/dificultad. Considerar tambien un sutil ripple al hacer click.

**Justificacion:** Polish UX: la sensacion de "tactilidad" mejora cuando todas las cards reaccionan igual de forma predecible. Detectado durante la pasada de polish del 17/04/2026 — algunas cards no tienen feedback visual al hover.

---

## PROP-15: Confetti / celebracion visual al completar partida con buen score

**Descripcion:** Cuando un alumno termina una partida con score ≥ 70%, mostrar confetti (libreria `canvas-confetti` o `react-confetti`) sobre la pantalla de resultados. Para score perfecto (100%), añadir efecto adicional (estrellas, fireworks).

**Justificacion:** Refuerza positivamente el logro del alumno. Existe la pantalla de resultados pero hoy es estatica salvo por el badge "¡Nuevo record!". Para un producto educativo infantil, la celebracion visual es importante.

---

## PROP-16: Atmosferas dinamicas por contexto

**Descripcion:** Cuando un profesor entra al detalle de un contexto, el fondo de la pagina podria adoptar un sutil gradient mesh con el `dominantColor` del contexto (ej: animales-granja → tonos verdes/marrones). Misma idea para el tema visual de cada mecanica durante la partida.

**Justificacion:** Inmersion. Hoy todas las pantallas comparten el mismo fondo dark uniforme. Diferenciar visualmente por contexto/mecanica refuerza memoria espacial y hace la app menos monocorde.

---

## PROP-17: Atajos de teclado globales

**Descripcion:** Anadir atajos como `g + s` para ir a Sesiones, `g + d` para Dashboard, `?` para abrir lista de atajos, `n` para "Nueva Sesion", `/` para enfocar busqueda. Documentar en un mini-overlay accesible desde `?`.

**Justificacion:** Profesores experimentados ganan velocidad. Mejora a11y (uso sin mouse). Es un patron consolidado en SaaS modernos (Linear, Notion, GitHub).
