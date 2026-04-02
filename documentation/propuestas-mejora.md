# Propuestas de Mejora - EduPlay RFID

> Documento generado durante la sesion de testing del 31 de marzo de 2026.
> Estas propuestas han sido identificadas pero **no aprobadas** para implementacion inmediata.
> Requieren evaluacion del equipo antes de proceder.

---

# Seccion A: Bugs y hallazgos — Creacion de sesiones y Gameplay

> Hallazgos del testing exhaustivo de los flujos de creacion de sesion (wizard 4 pasos)
> y partidas jugadas con ambas mecanicas (Asociacion y Memoria).

---

## BUG-F1 [FIXED]: GameSession.jsx envia `limit` no aceptado por backend

**Severidad:** Critica (bloqueante)
**Archivo:** `frontend/src/pages/GameSession.jsx` linea 428
**Descripcion:** La llamada a `getStudentsByTeacher(teacherId, { limit: 1, sortBy: 'createdAt', order: 'asc' })` falla con 400 porque el schema Zod del backend (`teacherStudentsQuerySchema`) usa `.strict()` y no acepta `limit`.
**Impacto:** La pagina `/game/{sessionId}` mostraba "No se pudo cargar la sesion — Parametros de consulta invalidos" e impedia jugar CUALQUIER partida.
**Fix aplicado:** Se elimino `limit: 1` del objeto de parametros. El endpoint devuelve todos los estudiantes y el frontend toma el primero.

---

## BUG-F2: Boton "Volver a jugar" en sesiones nuevas (Borrador)

**Severidad:** Alta (confusa para el usuario)
**Archivo:** `frontend/src/pages/SessionDetail.jsx`
**Descripcion:** En una sesion recien creada en estado "Borrador" que nunca se ha jugado, el boton principal dice "Volver a jugar" y abre un modal de "Clonar sesion" en vez de iniciar la partida. No existe un boton "Jugar" o "Iniciar partida" visible.
**Impacto:** El profesor no puede iniciar la primera partida desde el detalle de la sesion.
**Solucion propuesta:** Mostrar "Jugar" (navegar a `/game/{id}`) cuando la sesion esta en Borrador o Activa sin partidas, y "Volver a jugar" solo cuando ya tiene partidas completadas.

---

## BUG-F3: Dificultad muestra "Media" cuando se selecciono "Facil"

**Severidad:** Baja (cosmetic)
**Archivo:** `frontend/src/pages/SessionDetail.jsx` y/o backend DTO
**Descripcion:** Al crear una sesion con preset "Facil" (3 rondas, 20s, 0 penalizacion), el SessionDetail muestra "Dificultad: Media". Los valores numericos son correctos, pero la etiqueta es incorrecta.
**Causa probable:** El backend calcula la dificultad a partir de los valores en vez de almacenar el preset seleccionado, y la logica de clasificacion no coincide.

---

## BUG-F4: Resumen de sesion Memoria muestra "5 rondas"

**Severidad:** Media (datos incorrectos)
**Archivo:** `frontend/src/pages/CreateSession.jsx` (paso 4 review)
**Descripcion:** En el paso de revision al crear una sesion de Memoria, el resumen muestra "5 rondas" aunque la mecanica de Memoria no usa rondas — usa tiempo total de partida.
**Causa probable:** El campo `numberOfRounds` tiene un valor por defecto (5) que se muestra en el resumen sin filtrar por mecanica.

---

## BUG-F5: Tiempo default de Memoria (15s) es insuficiente — partida termina antes de cargar

**Severidad:** Critica (bloqueante funcional)
**Descripcion:** El tiempo total por defecto para una partida de Memoria con 6 pares es 15 segundos. El timer comienza en el servidor al crear el play, no cuando el alumno ve el tablero. El resultado es que la partida termina durante la carga de la pagina y el alumno nunca llega a jugar.
**Impacto:** Todas las partidas de Memoria con config default terminan en timeout inmediato.
**Solucion propuesta:**
1. Aumentar el default a 60-90 segundos minimo para 6 pares
2. Iniciar el timer DESPUES de que el frontend confirme que el tablero esta renderizado (emitir un evento `board_ready` via Socket.IO)

---

## BUG-F6: Header del juego Memoria muestra "Ronda 1 de 6"

**Severidad:** Media (datos incorrectos)
**Archivo:** `frontend/src/pages/GameSession.jsx` (header component)
**Descripcion:** El juego de Memoria muestra "Ronda 1 de 6" en la cabecera, pero Memoria no usa rondas. Deberia mostrar pares encontrados (ej: "Parejas: 0/6").

---

## BUG-F7: "Plan de retos (Association)" — nombre en ingles

**Severidad:** Baja (i18n)
**Archivo:** `frontend/src/pages/CreateSession.jsx` (paso 3)
**Descripcion:** La seccion dice "Plan de retos (Association)" mezclando espanol e ingles. Deberia decir "Plan de retos (Asociacion)".

---

## BUG-F8: Contenido DOM duplicado en SessionDetail

**Severidad:** Media (rendimiento/accesibilidad)
**Archivo:** `frontend/src/pages/SessionDetail.jsx` y/o `AppLayout.jsx`
**Descripcion:** El snapshot DOM muestra dos breadcrumbs y dos secciones de contenido identicas. Probablemente causado por AnimatePresence con `mode="popLayout"` que mantiene el nodo saliente mientras entra el nuevo.
**Impacto:** Duplica el contenido en el DOM y afecta lectores de pantalla.

---

## BUG-F9: Valor de slider vs display inconsistente (tiempo Memoria)

**Severidad:** Baja
**Archivo:** `frontend/src/pages/CreateSession.jsx` (paso 3 reglas Memoria)
**Descripcion:** El slider de "Tiempo total de partida" tiene `aria-value="20"` pero muestra "15s" visualmente.

---

## BUG-F10: "Tiempo" y "T. medio" muestran "—" en Game Over

**Severidad:** Baja (datos incompletos)
**Archivo:** `frontend/src/pages/GameSession.jsx` (GameOverScreen)
**Descripcion:** En la pantalla de fin de partida, los campos "Tiempo" y "T. medio" muestran guiones en vez de valores reales, tanto para Asociacion (timeout) como para Memoria.

---

## BUG-F11: Warning "lector no configurado" en modo click-fallback

**Severidad:** Baja (UX confusa)
**Archivo:** `frontend/src/pages/GameSession.jsx`
**Descripcion:** Cuando el juego esta en modo touch/click fallback (sin sensor RFID fisico), aparece una barra amarilla: "Este lector no esta configurado para esta sesion. Avisa al profesor." El mensaje es confuso porque el alumno esta jugando con clicks, no con RFID.
**Solucion propuesta:** No mostrar este warning cuando se detecta que el modo fallback esta activo.

---

# Seccion B: Debilidades UX — Creacion de sesiones y Gameplay

---

## UX-S1: Tablero de Memoria requiere colocacion manual obligatoria de TODAS las cartas

**Impacto:** Alto
**Descripcion:** Para crear una sesion de Memoria, el profesor DEBE colocar manualmente cada una de las 12 cartas en slots individuales (click carta → click slot, x12 veces). No hay boton "Auto-rellenar" o "Mezclar aleatoriamente".
**Propuesta:** Agregar boton "Mezclar" que coloque todas las cartas en orden aleatorio. Hacer la colocacion manual OPCIONAL para quienes quieran un layout especifico.

---

## UX-S2: Doble configuracion de tablero (wizard + /board-setup)

**Impacto:** Alto
**Descripcion:** El wizard de creacion (paso 3) tiene un editor de tablero para Memoria. Pero despues de crear la sesion, se redirige a `/board-setup/{id}` que es OTRA pagina de configuracion de tablero con funcionalidad similar. La duplicacion confunde y el profesor no sabe cual es la "real".
**Propuesta:** Eliminar una de las dos. O: wizard solo preview → board-setup para edicion real. O: wizard completo → no redirigir a board-setup.

---

## UX-S3: Sin presets de dificultad para Memoria

**Impacto:** Medio
**Descripcion:** Asociacion tiene presets claros (Facil/Normal/Dificil) que ajustan todos los sliders automaticamente. Memoria solo tiene sliders manuales sin presets. Es una inconsistencia que obliga al profesor a ajustar manualmente cada parametro.
**Propuesta:** Agregar presets equivalentes para Memoria (ej: Facil=90s/+10/0, Normal=60s/+15/-2, Dificil=30s/+20/-5).

---

## UX-S4: Placeholder de consigna generico, no adaptado al contexto

**Impacto:** Bajo
**Descripcion:** En el plan de retos de Asociacion, el placeholder dice "Ej: Encuentra la tarjeta que representa un mamifero" independientemente del contexto seleccionado. Para "Colores Basicos" seria mas util: "Ej: Encuentra el color rojo".
**Propuesta:** Generar placeholders dinamicos basados en el contexto del mazo.

---

## UX-S5: UIDs tecnicos visibles para el profesor

**Impacto:** Medio
**Descripcion:** En multiples lugares (plan de retos, mapping de tarjetas, board setup) se muestran UIDs como "0000000C", "0000001E". Estos valores son internos y no significativos para un profesor.
**Propuesta:** Ocultar UIDs por defecto. Mostrarlos solo en un tooltip o modo avanzado para debugging.

---

## UX-S6: Texto truncado en preview de mazo "Numeros del 1 al 6"

**Impacto:** Bajo
**Descripcion:** La card del mazo "Numeros del 1 al 6" muestra "Uno Dos Tres uatr" — el texto "Cuatro" se trunca de forma inelegante.
**Propuesta:** Limitar a 3 textos con "+N mas" o reducir tamano de fuente para que quepan.

---

## UX-S7: Panel izquierdo vacio en paso 4 (revision)

**Impacto:** Bajo
**Descripcion:** El paso de revision muestra el nombre de la sesion a la izquierda y el resumen a la derecha. El panel izquierdo tiene mucho espacio vacio desperdiciado.
**Propuesta:** Mover el nombre al top y usar todo el ancho para el resumen, o agregar informacion adicional al panel izquierdo (preview del tablero para Memoria, lista de retos para Asociacion).

---

## UX-S8: Nombre de sesion no visible en header de SessionDetail

**Impacto:** Bajo
**Descripcion:** El SessionDetail muestra "Colores Basicos" (nombre del mazo) en vez de "Sesion - Colores Basicos" (nombre real de la sesion definido por el profesor).

---

## Tabla resumen de bugs por severidad

| ID | Descripcion corta | Severidad | Estado |
|----|-------------------|-----------|--------|
| BUG-F1 | `limit` param rechazado por backend | Critica | **FIXED** |
| BUG-F5 | Timer Memoria 15s — partida termina al cargar | Critica | Pendiente |
| BUG-F2 | "Volver a jugar" en sesion nueva sin "Jugar" | Alta | Pendiente |
| BUG-F3 | Dificultad "Media" cuando es "Facil" | Baja | Pendiente |
| BUG-F4 | Resumen Memoria muestra "5 rondas" | Media | Pendiente |
| BUG-F6 | Header Memoria muestra "Ronda 1 de 6" | Media | Pendiente |
| BUG-F7 | "Association" en ingles en label | Baja | Pendiente |
| BUG-F8 | DOM duplicado en SessionDetail | Media | Pendiente |
| BUG-F9 | Slider value vs display inconsistente | Baja | Pendiente |
| BUG-F10 | Game Over "Tiempo" y "T. medio" = "—" | Baja | Pendiente |
| BUG-F11 | Warning RFID en modo click-fallback | Baja | Pendiente |

---

# Seccion C: Propuestas de mejora generales

---

## PROP-1: Sistema de notificaciones en tiempo real

**Descripcion:** Implementar un sistema de notificaciones push que informe al profesor cuando un estudiante completa una partida, cuando se aprueba una solicitud de registro, o cuando ocurre algun evento relevante en sus sesiones activas.

**Justificacion:** Actualmente no hay forma de saber que algo cambio sin refrescar la pagina. La infraestructura Socket.IO ya esta desplegada y lista para soportar este tipo de comunicacion.

**Alcance estimado:**
- Componente `NotificationBell` en el header del sidebar
- Backend: emitir eventos Socket.IO para cada accion relevante
- Persistencia de notificaciones en MongoDB (leidas/no leidas)
- Panel dropdown con historial de notificaciones

**Dependencias:** Requiere que BUG-1 (CSP WebSocket) este resuelto.

---

## PROP-2: Vista previa / modo demo de juego para el profesor

**Descripcion:** Permitir al profesor simular una partida completa desde el detalle de una sesion sin necesitar hardware RFID fisico. Un modo demo con tarjetas virtuales que se pueden "escanear" haciendo clic.

**Justificacion:** Facilita la validacion del contenido educativo antes de usarlo con estudiantes reales. Elimina la dependencia de hardware para verificar que las configuraciones de sesion (tiempo, puntos, penalizacion) funcionan correctamente.

**Alcance estimado:**
- Boton "Modo Demo" en SessionDetail
- Reutilizar componentes de GameSession con un mock de WebSerialService
- Tarjetas virtuales clicables que simulan un escaneo RFID

---

## PROP-3: Dashboard de estudiante individual

**Descripcion:** Al hacer clic en un alumno (desde admin, desde dashboard, o desde el listado de alumnos), mostrar su historial completo: partidas jugadas, progreso por contexto/mecanica, tendencia de puntuacion, y areas de dificultad.

**Justificacion:** Los endpoints de analytics ya existen en el backend (student summary, trends, rankings) pero no hay vista frontend que los consuma de forma individual. Esta es la informacion mas valiosa para un profesor que quiere hacer seguimiento personalizado.

**Alcance estimado:**
- Nueva pagina `/students/:studentId` con graficos de Recharts
- Tabs: Resumen, Historial de partidas, Progreso por contexto, Comparativa
- Reutilizar componentes de graficos del dashboard adaptados al nivel individual

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

## PROP-8: Refactorizacion del sistema de iconos

**Descripcion:** Reemplazar el patron `import * as LucideIcons` por un IconRegistry centralizado que solo incluya los iconos realmente usados en la aplicacion. Aprovechar para unificar tamanos, colores y spacing de iconos en toda la app.

**Justificacion:** Ademas del beneficio de rendimiento ya implementado (reduccion de ~500KB en el bundle), un registry centralizado asegura consistencia visual y facilita auditar que iconos usa la plataforma. Actualmente cada componente importa iconos con tamanos y colores ligeramente diferentes.

**Alcance estimado:**
- Crear `src/components/ui/Icon.jsx` como wrapper con tamanos estandarizados (sm/md/lg)
- Migrar componentes a usar el wrapper en lugar de imports directos
- Documentar el catalogo de iconos disponibles

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

## PROP-7: Duplicar/clonar sesion rapidamente

**Descripcion:** Agregar un boton "Duplicar" en cada sesion completada para crear una nueva sesion con la misma configuracion (mazo, mecanica, reglas, plan de retos) pero en estado borrador.

**Justificacion:** Los profesores frecuentemente repiten la misma sesion con diferentes grupos de alumnos o en diferentes dias. Actualmente deben recrear toda la configuracion desde cero pasando por el wizard de 4 pasos, lo cual es tedioso e innecesario.

**Alcance estimado:**
- Backend: endpoint `POST /api/sessions/:id/clone` que copie la configuracion
- Frontend: boton "Duplicar" en SessionDetail y en la card de sesiones
- La sesion clonada se abre en modo edicion para ajustes rapidos antes de confirmar

---

## PROP-9: Panel de actividad reciente en dashboard

**Descripcion:** Agregar una seccion "Actividad Reciente" al dashboard mostrando un feed cronologico de las ultimas acciones: partidas jugadas, sesiones creadas, nuevos alumnos registrados, etc.

**Justificacion:** Actualmente hay mucho espacio vacio bajo el heatmap de dificultad. El dashboard solo muestra KPIs agregados pero no hay una forma rapida de ver que paso recientemente sin navegar a cada seccion individual.

**Alcance estimado:**
- Componente `RecentActivity` con timeline/feed vertical
- Backend: endpoint `/api/analytics/activity` que agregue eventos recientes
- Limitar a ultimas 10-15 actividades con "ver mas" paginado
- Iconos por tipo de actividad (partida, sesion, alumno)

---

## PROP-10: Reemplazar heatmap por visualizacion mas util

**Descripcion:** El "Mapa de Calor de Dificultad" actual muestra puntos dispersos tipo scatter plot que con pocos datos es casi vacio e ilegible. Reemplazarlo por una visualizacion mas informativa: radar chart por contexto, tabla de rankings top 5, o grafico de barras horizontales comparativo.

**Justificacion:** Durante la auditoria, el heatmap mostraba 4 puntos en un area grande con ejes "association"/"memory" sin suficiente granularidad para ser util. Un radar chart o tabla de rankings daria al profesor informacion accionable inmediata.

**Alcance estimado:**
- Evaluar 2-3 alternativas visuales con datos reales
- Implementar la opcion elegida usando Recharts (RadarChart o composicion de BarChart)
- Mantener la explicacion contextual ("Que combinaciones generan mas errores")
- Considerar toggle entre vistas si se quiere mantener el heatmap como opcion

---

## PROP-11: Alertas accionables en dashboard

**Descripcion:** La seccion "Alertas y Avisos" muestra "10 alumnos en riesgo" como texto estatico sin posibilidad de accion. Convertirla en enlaces clicables que lleven a un listado filtrado con acciones rapidas (ver historial, asignar sesion de refuerzo).

**Justificacion:** Una alerta que no permite actuar es solo informacion pasiva. El profesor necesita poder ir directamente del aviso a la accion correctiva.

**Alcance estimado:**
- Hacer cada alerta un enlace a la vista filtrada correspondiente
- Agregar mas tipos de alertas: sesiones sin actividad reciente, mazos sin usar, mejoras notables de alumnos
- Boton "Ver todos" que lleve a un panel de alertas expandido

---

## PROP-12: Onboarding y estados vacios mejorados

**Descripcion:** Para profesores nuevos sin datos, las secciones deberian mostrar estados vacios motivadores con CTAs claros: "Crea tu primer mazo", "Configura tu primera sesion", con ilustraciones y pasos guiados.

**Justificacion:** Un profesor nuevo que entra al dashboard vacio no sabe por donde empezar. Un flujo de onboarding guiado reduce drasticamente el tiempo hasta el primer uso productivo y mejora la retencion.

**Alcance estimado:**
- Componente `EmptyState` reutilizable con icono, titulo, descripcion y CTA
- Estados vacios para: Dashboard, Sesiones, Mazos, Contextos
- Opcional: wizard de bienvenida en el primer login que guie: "1. Crea un mazo → 2. Configura una sesion → 3. Juega"
- Checklist de progreso persistente hasta completar los 3 pasos

---

## PROP-13: Exportar datos a CSV/PDF

**Descripcion:** Agregar boton "Exportar" en el dashboard y en el detalle de sesion para descargar resultados como CSV o PDF (rankings, calificaciones, progreso de alumnos).

**Justificacion:** Los profesores necesitan integrar los resultados de la plataforma en sus sistemas de evaluacion institucionales. Actualmente no hay forma de extraer los datos fuera de la app.

**Alcance estimado:**
- Backend: endpoints de exportacion que generen CSV o JSON formateado
- Frontend: boton "Exportar" con dropdown (CSV, PDF)
- Para PDF: usar libreria como `jsPDF` o generacion server-side
- Templates de exportacion: "Informe de sesion", "Progreso de clase", "Alumno individual"

---

## PROP-14: Breadcrumbs consistentes en todas las paginas

**Descripcion:** El detalle de sesion tiene breadcrumbs ("Sesiones > Animales de Granja") pero otras paginas como detalle de mazo, detalle de contexto, y wizard de creacion no los tienen. Implementar breadcrumbs de forma consistente.

**Justificacion:** Los breadcrumbs ayudan al usuario a entender donde esta y navegar de vuelta sin depender del sidebar. Es especialmente importante en flujos profundos (lista → detalle → edicion).

**Alcance estimado:**
- Componente `Breadcrumbs` reutilizable que derive la jerarquia de la ruta actual
- Integrarlo en: DeckDetail, DeckEdit, ContextDetail, CreateSession, BoardSetup
- Estilo consistente con el ya existente en SessionDetail

---

## PROP-15: Thumbnails de assets en tarjetas de contextos

**Descripcion:** Las tarjetas de contextos en `/contexts` muestran nombres de assets como texto plano truncado ("Vaca Cerdo Gallina Caballo Pat"). Reemplazar por una fila de mini-thumbnails como ya se hace en las tarjetas de mazos.

**Justificacion:** Los mazos ya muestran imagenes de preview en sus cards y el resultado es mucho mas visual y claro. Los contextos deberian seguir el mismo patron para mantener consistencia y mejorar la escaneabilidad.

**Alcance estimado:**
- Reutilizar el patron de thumbnails de CardDecksPage
- Mostrar las primeras 4-5 imagenes de assets + badge "+N" si hay mas
- Fallback a texto para assets sin imagen

---

## Resumen de prioridades sugeridas

| Propuesta | Impacto UX | Esfuerzo | Prioridad sugerida |
|-----------|-----------|----------|-------------------|
| PROP-3: Dashboard estudiante | Alto | Medio | Alta |
| PROP-7: Duplicar/clonar sesion | Alto | Bajo | Alta |
| PROP-12: Onboarding y estados vacios | Alto | Medio | Alta |
| PROP-1: Notificaciones RT | Alto | Alto | Media |
| PROP-11: Alertas accionables | Alto | Bajo | Media |
| PROP-4: Modo claro | Medio | Medio | Media |
| PROP-2: Modo demo | Medio | Medio | Media |
| PROP-10: Reemplazar heatmap | Medio | Medio | Media |
| PROP-9: Actividad reciente | Medio | Medio | Media |
| PROP-5: Mejora cards sesiones | Medio | Medio | Media |
| PROP-14: Breadcrumbs consistentes | Medio | Bajo | Media |
| PROP-15: Thumbnails en contextos | Medio | Bajo | Media |
| PROP-13: Exportar CSV/PDF | Medio | Alto | Baja |
| PROP-6: Export/Import mazos | Medio | Alto | Baja |
| PROP-8: Refactor iconos | Bajo | Bajo | Baja |
