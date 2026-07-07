# Changelog

Todas las notas notables de cambios en este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - Sprint 6

### Motion signature ampliada (T-954) + Notificaciones tiempo real (T-955)

Cierre del paquete UI/UX iniciado en T-951…T-953. Dos pilares para v1.0.0:

#### Añadido

- **Atmósferas dinámicas por contexto:** el aurora del fondo, el gradient primary de `ButtonPremium` y el glow de las cards se tintan al contexto pedagógico activo (Geografía, Animales, Colores, Números, Formas). Funciona via CSS vars + atributo `[data-atmosphere]` en `<html>`. Crossfade 400ms entre rutas. Light mode usa variantes soft mezcladas con marfil para no romper el blend `multiply`.
- **Hero transitions** en las 3 parejas `DeckCard ↔ CardDeckDetailPage`, `SessionCard ↔ SessionDetail`, `ContextCard ↔ ContextDetailPage` con `useSharedLayoutTransition` (respeta reduced-motion).
- **Scroll parallax aurora** en AppLayout: los 3 orbes se desplazan a velocidades distintas (`useScroll + useTransform`) cuando el usuario hace scroll. Reduced-motion lo desactiva.
- **Sistema de notificaciones tiempo real persistidas** con 5 tipos canónicos (`play_completed`, `registration_pending`, `student_at_risk`, `context_shared`, `system_announcement`). Backend completo: modelo Mongoose con TTL 90d, dedup window 60s en Redis, service + controller + routes (`/api/notifications`), DTO V1, emisión Socket.IO al room `user_<id>`. Triggers reales desde `gamePlayService.completePlay`, `authController.register` y `gameContextController.createContext`.
- **NotificationBell + Panel** en la sidebar con badge contador, pulse subtle on unread, micro-celebración (scale+rotate) al recibir `play_completed` con 3⭐, panel popover con focus trap, infinite scroll cursor, empty state signature (sobre de papel cerrado SVG inline). Atajo `Shift+B`.
- **InlineSuccessBadge** + hook `useInlineSuccess` para confirmaciones de éxito (✓ Guardado) adyacentes al botón Save. Integrado en `CreateSession`, `SessionEdit`, `DeckCreationWizard`, `DeckEditPage`, `AdminContexts`, `ContextsPage`. Sonner toast queda reservado para errores y destructivos.
- **Atmósfera + mecánica en GameSession:** el fondo de la partida combina `mechanicTheme.backdropTintClass` con la atmósfera del contexto, generando un fondo único por cada combinación.

#### Cambiado

- `ButtonPremium` variant primary lee `--color-atmosphere-primary` / `--color-atmosphere-primary-alt` / `--color-atmosphere-glow` con fallback al brand cuando no hay atmósfera activa.
- AppLayout aurora consume `--color-atmosphere-aurora-{1,2,3}` en lugar de `--color-aurora-*` directos.
- `socket.join('user_'+userId)` confirmado en el authMiddleware de Socket.IO para que las notificaciones lleguen al cliente correcto.

#### ADRs

- ADR-130 — Atmósferas dinámicas por contexto + scroll parallax aurora.
- ADR-131 — Sistema de notificaciones tiempo real persistidas.
- ADR-132 — InlineSuccessBadge como complemento de Sonner toast.
- ADR-133 — Divergencia formal Light / Dark (aurora, atmósferas, sombras).
- ADR-134 — Hero transitions reusables (`useSharedLayoutTransition`).

### Mecánica Secuencia (T-921 + T-922 + T-923)

Tercera y última mecánica del proyecto. El alumno memoriza una secuencia ordenada de N cartas (3 a 7 según configuración) durante unos segundos definidos por el profesor; tras un flip de "vuelta a boca abajo" debe reproducirla escaneando las tarjetas en el mismo orden. Tres dificultades (fácil con pistas progresivas, medio con segundo intento, difícil one-shot) y un sistema de bloqueo de carta que **avanza el cursor sin reiniciar la secuencia** — decisión pedagógica para evitar frustración acumulativa.

#### Añadido

- **Backend Secuencia:** nuevo `SequenceStrategy` con fases memorizing → reproducing, evento `sequence_phase_*` y `sequence_card_result` / `sequence_round_result` en Socket.IO. Ocho métricas específicas (sequencesCompleted, maxSequenceLengthAchieved, partialReproductions, hintsUsed, etc.) persistidas en `GamePlay.metrics` y agregadas en `analyticsService.getStudentSummary`.
- **Sistema de pistas progresivas (easy):** primera pista parcial con caracteres ocultos (`L?ó?`), segunda pista completa (`León`), tercer fallo bloquea la carta. El algoritmo prioriza preservar primera letra y vocales acentuadas si las hay; si no, caracteres en índices pares.
- **Animaciones signature crupier:** reparto inicial con stagger 90 ms y spring físico (entrada desde fuera de pantalla con rotación), recogida final con stagger inverso. Respeta `prefers-reduced-motion`.
- **Frontend Secuencia:** nueva familia de componentes en `components/game/sequence/` (SequenceBoard, SequenceCard, PhaseTransitionOverlay, SequenceProgressDots, FallbackTouchPanelSequence) + `SequenceGameplayPanel` orquestador. Tres SFX nuevos en `soundEffectsService` (cardDeal, cardSweep, sequenceComplete) usando Web Audio API.
- **Wizard `StepSequenceRules`:** sliders min/max longitud, displaySeconds, dificultad con descripción contextual, regenerador de plan en tiempo real.
- **GameOver per-mechanic:** refactor con compositor `GameOverStats` que delega a `GameOverStatsAssociation`/`Memory`/`Sequence`. Cada mecánica define sus métricas e iconos sin contaminar las demás. El bloque Secuencia destaca la mejor longitud alcanzada como hero metric.
- **Analytics Secuencia:** `SequenceProgressChart` (Recharts, tint ámbar) + `SequenceHighlightCard` integrados en `StudentProfile` cuando el alumno tiene partidas Secuencia. Empty state con copy útil si todavía no hay datos.
- **Single source of truth para mecánicas:** `frontend/src/constants/mechanicLabels.js` centraliza label, icono Lucide, tint y descripción. `StepMechanic` lo consume.
- **Seeders demo:** 5 templates de Secuencia (3 dificultades × varios contextos) en `06-sessions.js` + métricas Secuencia derivadas del perfil del alumno en `07-gameplays.js`.

#### Cambiado

- `frontend/src/pages/GameSession.jsx` refactorizado: el boolean `sessionIsMemory` se reemplaza por un derived `mechanicMode = 'association' | 'memory' | 'sequence'` (los aliases booleanos se mantienen como variables locales derivadas para no romper los call-sites existentes).
- `final_summary` del backend ahora incluye `mode` explícito; el frontend lo usa como source of truth en lugar de inferirlo localmente.
- `User.studentMetrics` extendido con `maxSequenceLengthAchieved` (récord histórico monótono).
- Mecánica `sequence` habilitada en seeder `03-mechanics.js` con `availability: 'available'`.

#### ADRs

- ADR-102 — Mecánica Secuencia: estado intra-ronda, validación ordenada y dificultades.
- ADR-103 — Refactor `sessionIsMemory` → `mechanicMode` y compositor `GameOverStats`.
- ADR-104 — Animaciones signature crupier (reparto + recogida) para Secuencia.

## [0.5.0] - 2026-04-24

Cierre del Sprint 5 y última versión previa a la 1.0.0. Cinco ejes principales: backend robustecido (errores unificados, capa de datos completa, limitación de tráfico distribuida), suite completa de analytics (backend y frontend), protección de datos de menores conforme a RGPD y LOPDGDD, refactor de tarjetas RFID a tokens reutilizables y un nuevo lenguaje de movimiento "táctil + papel" aplicado a toda la app. Veintiocho tareas cerradas de treinta y una, con algunas menores diferidas al siguiente sprint. Incluye además un paquete de mantenimiento final que pule gameplay, dashboards y panel de administración antes del corte v1.0.0.

### Añadido

#### Analytics y dashboards

- **Backend de analytics expandido:** decenas de nuevos endpoints para métricas de estudiantes, distribución, tendencias, mapas de calor y rankings, con un marco de indicadores y umbrales semánticos (riesgo, promedio, bueno, excelente) y comparativa entre periodos con deltas.
- **Suite completa de analytics frontend:** cuatro páginas y once componentes nuevos (Dashboard ampliado, Perfil Individual de Estudiante, Vista Comparativa, Insights & Reports) con el mismo marco semántico aplicado a tarjetas, gráficos y alertas.
- **Vista comparativa de estudiantes:** tabla ordenable con filtros, exportación a CSV y navegación cruzada al perfil individual.
- **Perfil individual de estudiante:** métricas detalladas con superposición de la media de la clase, trayectoria de aprendizaje y desglose por mecánica y contexto.
- **Dashboard con indicadores expandidos:** ocho indicadores reales del profesor autenticado, filtros interactivos, alertas accionables y mapa de calor por día y hora con leyenda y tooltips mejorados.
- **Componentes de UI reutilizables:** breadcrumbs, cabeceras de página y estados de error consistentes en todas las páginas nuevas.
- **Skeletons especializados** para gráficos y rejillas de tarjetas mientras cargan datos.

#### Tarjetas RFID como tokens reutilizables

- Las tarjetas dejan de ser entidades preregistradas por el administrador. Ahora el profesor las asigna directamente al crear o editar un mazo, mediante escaneo en vivo. La gestión administrativa de tarjetas desaparece y las páginas correspondientes se eliminan. El gameplay no cambia: el emparejamiento por identificador de tarjeta sigue funcionando idéntico.

#### Backend — fundamentos y observabilidad

- **Flujo de errores centralizado:** validación, rutas no encontradas y errores asíncronos pasan por un único punto y se registran de forma estructurada.
- **Acceso a datos consolidado:** nuevas operaciones de escritura, soporte para transacciones y mejor separación entre la base de datos y la lógica de negocio.
- **Respuestas y filtros uniformes:** la API comparte formato de respuesta y construcción declarativa de filtros en todos los endpoints.
- **Limitación de tráfico distribuida:** los topes por tipo de operación (autenticación, registro, creación, eventos, analytics, subidas, exportación) se aplican coherentemente entre instancias del backend gracias a Redis. Nuevos límites en pausa y reanudación de partidas.
- **Cache de analytics:** las consultas pesadas a dashboards se sirven desde caché con tiempos de vida ajustados por endpoint y se invalidan al terminar cada partida.
- **Cache de identidad de usuario:** cada petición autenticada deja de leer la base de datos repetidamente; los datos de sesión se cachean por unos segundos. Métricas de aciertos y fallos expuestas en el endpoint de métricas operativas.
- **Inicio de partida idempotente:** en despliegues con varias instancias, iniciar una misma partida no genera eventos duplicados.
- **Monitorización del rate limiter:** si Redis falla y se cae al modo en memoria, el incidente se registra en el sistema de errores y se contabiliza para alertar al equipo.
- **Worker dedicado para tareas en background:** la limpieza programada de datos de retención corre en un contenedor separado.
- **Límite de eventos en tiempo real distribuido:** los topes por segundo en el canal de juego se aplican coherentemente entre instancias.
- **Modo RFID coordinado entre instancias:** el cambio de modo (juego, asignación, idle) se propaga al instante a todos los servidores conectados.
- **Cache distribuida para mecánicas y contextos** y bloqueo atómico de tarjetas para evitar conflictos cuando varias partidas usan los mismos mazos.

#### UI/UX y motion

- **Lenguaje de movimiento "táctil + papel":** la interfaz comparte una identidad visual con efectos de escaneo, ilustraciones de papel que entran y salen con suavidad, modal destructivo con flip 3D, micro-flash al reanudar partida y logo con respiración suave en login y registro.
- **Estados vacíos ilustrados, modales más expresivos y refuerzo de accesibilidad:** anuncios para lectores de pantalla, foco automático al primer error de formulario, mapa de calor navegable por teclado, iconos diferenciados para daltonismo, sidebar con etiqueta de rol y banner para super-admin.
- **Confetti** en pantalla de fin de partida y celebración de récords con delta sobre la mejor puntuación previa.
- **Tema visual por contexto educativo:** cada mazo y elemento adopta los colores del contexto pedagógico al que pertenece, con efecto de baraja física en las tarjetas y ondas radar en el widget de RFID.
- **Sistema de assets multimedia mejorado:** audio vinculado a tarjetas, placeholders de baja calidad para imágenes y auditoría de UX completa.
- **Página de privacidad para profesores** y banner de consentimiento parental visible en el alta de estudiantes.
- **Pódium Top 5 con medallas:** el ranking de mejores alumnos se rediseña con un pódium 1-2-3 visual y degradados oro, plata y bronce, alturas escalonadas y posiciones cuatro y cinco listadas debajo.
- **Mazos con vista previa real:** las tarjetas de mazo en "Mis Mazos" muestran un mosaico con las primeras seis miniaturas reales en lugar de un placeholder genérico. Si faltan imágenes se muestra un fallback con las iniciales del nombre del mazo.
- **Indicador de scroll en Actividad Reciente:** aparece un chevron derecho cuando hay más actividad fuera de pantalla, con desplazamiento por tarjeta y desaparición automática al llegar al final.
- **Confirmación al cerrar sesión:** el botón de salida del sidebar pide confirmación antes de hacer logout, evitando salidas accidentales con trabajo a medias.
- **Mini-gráfica y última partida en cada sesión:** cada tarjeta de sesión incluye una gráfica resumida con la evolución de puntuaciones recientes y la fecha de la última partida, dando contexto rápido sin abrir el detalle.
- **Hover unificado en tarjetas:** el comportamiento al pasar el ratón y al pulsar es consistente en mazos, contextos, alumnos y sesiones, con elevación y sombra suaves que respetan la preferencia de movimiento reducido.
- **Saludo personalizado con nombre destacado:** el header del Dashboard muestra el nombre del profesor con un degradado, y se aplica una capitalización española correcta que respeta artículos y preposiciones.

#### Tests, infraestructura y CI

- **Cobertura de tests:** más de mil trescientos tests entre backend y frontend pasan en verde en CI. Suites nuevas dedicadas a caché, idempotencia, cierre robusto de modales y muchas pruebas unitarias añadidas en una sola pasada.
- **CI más estricto:** el linter detecta vulnerabilidades de seguridad, expresiones regulares peligrosas, secretos y promesas mal formadas. Cero warnings en backend y frontend tras una pasada masiva. Resuelto un cuelgue infinito de tests frontend en CI.
- **Despliegue endurecido:** contenedores con límites de memoria y filesystem solo lectura, autenticación obligatoria en Redis, tareas en background en contenedor separado y etiquetas de versión sincronizadas.

#### Mantenimiento final pre-release

- **Buscador en selectores grandes:** cuando un desplegable supera las veinte opciones aparece automáticamente un buscador con filtrado en vivo, atajo Esc para limpiar y anuncio para lectores de pantalla. Aplica a selectores de alumno en jugar, asignar estudiante, generador de informes y filtros de mazo.
- **Aviso de espera con cuenta atrás:** cuando el sistema pide esperar entre intentos aparece un banner con barra de progreso que se vacía sola hasta liberar la acción, en lugar del aviso efímero anterior. Soporta lectores de pantalla y movimiento reducido.
- **Confirmación visual de tap en panel táctil:** tras pulsar una carta, un overlay sutil de unos milisegundos confirma que el sistema ha registrado la acción, evitando dobles taps por ansiedad.
- **Métrica de rescates por ventana de gracia** en el panel de métricas para administradores: cuántos escaneos se han rescatado gracias a la nueva ventana de gracia entre rondas.

### Cambiado

- **Datos del usuario autenticado más simples y cacheables:** los flujos que antes guardaban directamente sobre el documento de base de datos se han migrado a la nueva capa de acceso a datos, con invalidación automática del cache de identidad ante cualquier cambio de credenciales o perfil.
- **Motor de juego modularizado:** el componente que orquesta las partidas se ha dividido en módulos especializados, mejorando la estabilidad y la observabilidad sin alterar el gameplay.
- **Dashboards con datos reales:** se eliminan los datos simulados; todos los indicadores reflejan al profesor autenticado.
- **Lecturas optimizadas:** consultas de listado más rápidas, índices compuestos añadidos y eliminación de efectos secundarios al servir datos.
- **Sistema de color unificado:** alrededor de doscientos colores escritos a mano se han migrado a tokens semánticos en wizard de sesiones, gameplay, login, registro y resto de páginas, permitiendo cambios de marca o tema sin tocar componentes uno a uno.
- **Pipeline RFID endurecido:** vigilante de actividad, latido de salud, ventana temporal configurable y validación estricta del origen de cada lectura.
- **Mecánica de Memoria sin estados intermedios:** el tablero solo se muestra cuando el servidor confirma que está listo, evitando flashes y posiciones extrañas al iniciar.
- **Onboarding contextual** parcialmente implementado, con el tramo final diferido al siguiente sprint.
- **Ventana de gracia entre rondas en Asociación:** en partidas con tiempos cortos (≤15 s), los escaneos justo en el límite del temporizador ya no se descartan; el servidor da unos milisegundos extra invisibles antes de cerrar la ronda. El reloj visible para el alumno sigue marcando "0 s" cuando expira.
- **Antirrebote diferenciado por fuente de escaneo:** el cooldown anti-duplicado deja de ser uniforme. El sensor físico mantiene un cooldown amplio (anti-rebote del hardware), mientras que el panel táctil de Asociación y los taps en cartas de Memoria tienen un cooldown corto. Memoria táctil deja de mostrar el aviso "Espera un momento" al encadenar toques rápidos legítimos.
- **Alertas con marca de tiempo real:** cada alerta refleja el momento exacto del incidente que la disparó (última partida del estudiante, último escaneo) en lugar de la hora actual al servir la respuesta. Se acabaron las alertas todas con la misma hora.
- **Indicadores con delta neutro cuando no hay periodo previo:** "Alumnos en Riesgo" y "Partidas Hoy" muestran un guion en lugar de una línea vacía cuando no existe periodo anterior con el que comparar, comunicando con claridad la falta de baseline.
- **Constantes del dominio centralizadas:** los valores admitidos por la API y la base de datos viven ahora en un único lugar, con un test que detecta automáticamente desincronizaciones entre capas.
- **Transiciones de página continuas:** el cambio de ruta deja de mostrar un frame con dos páginas solapadas o un hueco vacío entre ellas.
- **Deltas coloreados según semántica:** las tarjetas de indicadores del Dashboard ya no pintan siempre en verde los incrementos. Métricas como "Errores" o "Abandonos" se colorean en rojo cuando suben y en verde cuando bajan.
- **Leyenda de Curvas de Aprendizaje reubicada arriba:** ya no se solapa con el eje horizontal ni con los tooltips, dejando más espacio vertical y mejorando la lectura.
- **Indicador "Alumnos en Riesgo" coherente con la tabla:** el contador del Dashboard y la tabla detallada usan ahora la misma fuente de datos, eliminando porcentajes a 0% pese a haber alumnos en riesgo.
- **Pantalla de fin de partida correcta en modo táctil:** en partidas de Asociación sin sensor RFID, el resumen final dejaba de contar aciertos por una condición de carrera y por un guardia de coherencia demasiado estricto. Ambos problemas corregidos: el alumno ve el conteo real de su partida.
- **Porcentajes con un decimal:** los porcentajes de aciertos en perfiles y comparativas pasan de cuatro decimales a uno solo, eliminando ruido visual del estilo 42,7222 %.
- **Selección de contexto más robusta:** la creación y edición de mazos aceptan las distintas formas en que la API entrega los identificadores, evitando errores en flujos sucesivos.
- **Redirección de la ruta antigua de alumnos:** los enlaces guardados al listado de alumnos siguen funcionando y llevan al usuario a la nueva vista comparativa.

### Arreglado

- **Críticos pre-release:**
  - Las partidas con puntuación negativa (penalizaciones grandes) ya pueden guardarse correctamente; antes la base de datos las rechazaba.
  - El asistente de creación de mazos volvía a fallar mostrando una pantalla de error tras retomar un borrador; resuelto.
  - El listado de contextos ya no se rompe cuando un filtro deja la lista a cero resultados.
  - Los indicadores de Informes mostraban siempre cero por una incompatibilidad interna de datos; ahora reflejan los valores reales.
  - El eje vertical de Curvas de Aprendizaje se desbordaba en algunos casos; ahora se acota correctamente.
- **Limitación de tráfico realmente distribuida:** los topes se aplicaban en memoria local de cada instancia por un orden incorrecto al arrancar. Tras la corrección, los contadores viven en Redis desde la primera petición.
- **Resiliencia ante caídas momentáneas de Redis:** el backend ya no entra en ciclo de reinicio cuando Redis tiene un parón breve.
- **Métricas operativas completas:** el endpoint de métricas expone ahora los contadores de Redis (caché de identidad y fallbacks de rate limiter).
- **Direcciones IPv6 normalizadas** en los limiters de tráfico, agrupándolas correctamente para evitar evasiones triviales.
- **Liberación explícita del bloqueo de inicio al terminar una partida:** si el cliente reintenta, ya no encuentra un bloqueo aún caliente.
- **Limiters fail-open ante fallos transitorios** de Redis: la app sigue funcionando en lugar de devolver error 500.
- **Permisos de administración corregidos** en la edición de mecánicas y rutas de assets de la mecánica de Números.
- **Filtración de memoria en tests resuelta** y tests frontend ya no se cuelgan indefinidamente en CI.
- **Tildes correctas en sesiones de Memoria:** nombres como "Triángulo", "Murciélago" o "Plátano" se normalizan bien y el emparejamiento de pares ya no falla por mismatch de acentos. Validación reforzada tras tres pasadas masivas en QA.
- **Pulido visual general:** el contador "Total" en Mis Mazos ya muestra el número correcto cuando hay mazos activos, las previews de contextos son legibles, el slider de penalización refleja el sentido correcto, los emojis del gameplay se sustituyen por iconos consistentes, las alertas no duplican nombres y se han depurado textos y pistas.
- **Crítico — el juego era inutilizable sin sensor RFID:** el servidor rechazaba los toques en el panel táctil cuando no había un lector físico conectado, dejando la app injugable en modo escritorio. Resuelto.
- **Crítico — las tarjetas no se liberaban entre partidas:** un error en el cálculo interno de claves dejaba las reservas de tarjetas atrapadas tras cada partida, impidiendo reutilizarlas. Resuelto.
- **Caché de alertas:** cambiar el tope de elementos (de "Top 5" a "Top 10") devolvía la lista anterior; ahora se actualiza correctamente.
- **Confirmación al eliminar imágenes y audios:** el botón borraba sin preguntar; ahora pide confirmación como el resto de eliminaciones.
- **Aviso de "Borrador encontrado"** al crear un mazo: ya no vuelve a aparecer tras descartarlo en el mismo asistente.
- **Detalle de sesión** ya no carga datos por duplicado al abrirlo.
- **Aviso 401 fugaz al iniciar sesión:** se diferencian los rechazos esperados (sesión sin refrescar) de los errores reales para no asustar al usuario al arrancar la app.
- **Transición de páginas en la zona admin** sin solapamiento: la cabecera no se duplica al cambiar de pestaña.
- **El recuento y URLs de los assets de un contexto** se actualizan al instante tras subir o eliminar imágenes y audios; ya no se ven datos obsoletos.
- **Saludo del Dashboard** con la capitalización española correcta del nombre.
- **Eventos legítimos del motor de juego ya no quedan inalcanzables vía API** por una desalineación entre validador y modelo de datos.
- **Banner de espera en Memoria con auto-cierre:** ya no se queda visible aunque la ronda haya avanzado; se cierra solo cuando el cooldown termina.
- **Política de evicción de Redis ajustada para no expulsar claves bajo presión de memoria:** preserva tareas programadas (limpieza diaria), tokens revocados y bloqueos de inicio de partida que dependen de existir hasta su tiempo de vida.
- **Modales de confirmación se cierran solos al terminar la acción confirmada:** antes podían quedarse visibles bloqueando la UI tras eliminar un asset, contexto, mazo o sesión, también si la operación lanzaba un error.
- **Consigna de Asociación con género neutro:** ya no aparecen frases incorrectas como "la Cerdo" o "la Caballo" en el fallback automático. La consigna personalizada del profesor sigue teniendo prioridad cuando se define en el wizard.
- **El switch de Animaciones del sidebar** ya no puede disparar accidentalmente envíos de formulario.
- **Cara trasera de las cartas en Memoria realmente oculta a lectores de pantalla:** antes algunos lectores anunciaban el nombre de la carta antes de revelarla.
- **Fondo continuo bajo la barra lateral en páginas largas:** ya no aparece una franja de otro color al hacer scroll por debajo del primer viewport.
- **Indicadores del perfil de alumno con alturas iguales:** las tarjetas con línea comparativa ya no rompen la rejilla.
- **Trayectoria de Aprendizaje y Resumen del Alumno con alturas iguales** en su fila.
- **Sin huecos verticales en el Dashboard** entre Actividad Reciente y la columna lateral.

### Seguridad

- **Protección de datos de menores (cumplimiento RGPD y LOPDGDD):**
  - Auditoría completa de datos personales, registro de actividades de tratamiento y evaluación de impacto documentada.
  - Minimización de datos: la fecha de nacimiento ya no se almacena para los estudiantes.
  - Consentimiento parental obligatorio al crear un estudiante, gestionado y reflejado en la UI.
  - Seudonimización en analytics y separación de datos identificativos; los logs no contienen datos personales de menores.
  - Borrado efectivo y política de retención con plazos concretos.
  - Endpoints para portabilidad, rectificación con audit trail y derecho de oposición a analytics comportamentales.
  - Audit trail de acceso a datos y página de privacidad para profesores.
  - Evaluación de riesgo de re-identificación en aulas pequeñas.
  - Protocolo documentado de notificación de brechas.
  - Sentry documentado como procesador internacional; cifrado en cliente planificado para producción.
  - Centralización de operaciones de privacidad en el rol de super-admin.
- **Endurecimiento de infraestructura:** autenticación por contraseña en Redis, filesystem solo lectura y límites de memoria en contenedores.
- **Vulnerabilidades resueltas** en varias dependencias de backend y frontend. Dependencias actualizadas vía Dependabot.

### Documentación

- Decisiones de arquitectura del sprint registradas en el documento interno de decisiones: caché de analytics, caché de identidad, idempotencia de inicio de partida, observabilidad del rate limiter, accesibilidad keyboard-first, lenguaje de movimiento "táctil + papel", tarjetas como tokens reutilizables, ventana de gracia, antirrebote por fuente, política de evicción Redis y layout, entre otras.
- Documento unificado de protección de datos de menores (auditoría, registro de tratamiento, brechas y k-anonimidad).
- Sprint 5 cerrado con tareas y propuestas trazadas; tareas diferidas marcadas para el siguiente sprint.
- Nuevas propuestas catalogadas tras los hallazgos de QA y planificadas para el siguiente sprint.
- Guías técnicas actualizadas en backend (arquitectura Redis, optimizaciones, rate limiting, flujos en tiempo real, performance, seguridad, logging, analytics) y frontend (gameplay en tiempo real, antirrebote en cliente, banner de espera). Documentación de despliegue actualizada con la nueva política de evicción y el worker de tareas.
- Memoria académica del TFG (LaTeX) en redacción paralela.

## [0.4.0] - 2026-03-22

### Añadido

- **Gameplay completo Asociación y Memoria (E2E):** Pantalla de partida real integrada con backend vía Socket.IO para ejecutar partidas completas de ambas mecánicas sin simulación local, con vistas diferenciadas por mecánica, métricas en vivo (HUD) y resumen final ampliado. (#135)
- **Wizard de sesión adaptativo:** El wizard de creación adapta fases y validaciones según la mecánica seleccionada; mecánicas no disponibles (ej. `sequence`) se muestran como "Próximamente" y quedan bloqueadas tanto en UI como en backend (`SESSION_ENABLED_MECHANICS`). (#140)
- **Clonación de sesiones:** Función "Volver a jugar" que clona sesiones existentes resincronizando `cardMappings` y `contextId` con el estado actual del mazo; reglas específicas por mecánica para `boardLayout` (Memory) y `associationChallengePlan` (Association). (#141)
- **Contrato RFID backend-authoritative:** Contrato unificado de control de modos RFID entre frontend y backend con política single-owner por usuario, validación estricta de sensor y eliminación de derivación por ruta en frontend. (#142)
- **Gestión de contextos educativos (Frontend):** Nuevas páginas de listado y detalle de contextos con soporte para subida de assets a Supabase Storage.
- **Bloqueo distribuido de tarjetas (Redis):** Scripts Lua atómicos (`reserveCards`, `releaseCards`, `renewLease`) con ejecución vía `EVALSHA` + fallback `EVAL`, lectura batch por pipeline (`existsMany`, `hgetallMany`) y métricas de ejecución. (#147)
- **Integración Sentry completa:** Monitorización de errores en frontend (ErrorBoundary, tracing de navegación, source maps vía `@sentry/vite-plugin`) y backend (scopes de identidad de usuario, captura de errores WebSocket). (#149)
- **Reconexión de juego:** Experiencia de juego mejorada con reconexión automática, recuperación de estado y manejo robusto de desconexiones y desincronización.
- **Feedback de partida:** Sistema de retroalimentación mejorado con mensajes contextuales para aciertos, fallos, combos y timeouts durante gameplay.
- **Accesibilidad `prefers-reduced-motion`:** Hook `useReducedMotion` transversal aplicado en wizard, gameplay, modales y componentes animados con degradación progresiva que mantiene usabilidad completa. (#151, #153)
- **Tests:** Nuevas suites para `GameSession` (frontend), clonación de sesiones, bloqueo Redis, mecánica Memory, persistencia atómica de eventos, disponibilidad de mecánicas y borrado de contextos con dependencias.
- **Benchmarks:** Scripts de benchmarking para operaciones Redis (`benchmark-redis-ops.js`) y lectura de sesiones (`benchmark-session-reads.js`).

### Cambiado

- **Refresh token cookie-only:** Migración completa a cookie `httpOnly` exclusiva; eliminados envío y recepción de refresh token en body y localStorage. CSRF double-submit obligatorio también en refresh. Backend rechaza payload legado con `refreshToken` en body (400). (#137)
- **Estado de GameSession centralizado:** Transiciones de estado (`created` → `active` → `completed`) centralizadas en `sessionStatusService` basadas en el estado real de partidas (`GamePlay`), integradas en flujos de inicio, pausa, reanudación, finalización y abandono. (#139)
- **Lecturas sin write-on-read:** Endpoints `GET` de sesiones ejecutan lectura `lean` sin side-effects de escritura; caché de ownership por socket para reducir consultas redundantes; contadores de juego optimizados por agregación. (#145)
- **Persistencia atómica de eventos:** `GamePlay` usa operadores `$push` + `$inc` + `$slice` para persistencia por ronda (`addEventAtomic`), reduciendo write amplification y desactivando por defecto la persistencia de `round_start`. (#146)
- **GameEngine robusto:** Serialización por `playId` para operaciones críticas, hooks por mecánica sin condicionales ad-hoc, caché TTL de auth en socket, procesamiento batch configurable en cleanup/recovery y métricas operativas ampliadas. (#136, #143)
- **UI/UX general:** Reorganización de imports y componentes, nuevos iconos, animaciones mejoradas en login/registro, unificación de estilos; clases Tailwind dinámicas reemplazadas por mapas estáticos de variantes. (#152)
- **Dependencias:** Actualizadas dependencias en backend y frontend; proceso de CI mejorado con Dependabot mensual.

### Seguridad

- **Payload guard global:** Middleware `securityPayloadGuard` para detección y bloqueo de payloads con `__proto__`, `constructor.prototype` y operadores NoSQL (`$`), aplicado en HTTP y WebSocket. (#144)
- **Validación Origin en WebSocket:** Validación explícita de `Origin` en handshake con whitelist de seguridad, como doble capa junto con CORS base. (#144)
- **RFID hardening:** Ventana temporal configurable (`RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS`), formato estricto de `sensorId` y validación de `source` en eventos RFID de cliente. (#144)
- **Integridad de dominio:** Restricción de modificación de `createdBy` en `PUT /api/users/:id`; transferencias solo por endpoint dedicado; guardas de borrado de contextos con dependencias activas. (#148)
- **Cookie httpOnly exclusiva:** Refresh token solo vía cookie segura; eliminada exposición en body de respuesta y fallback legado en logout. (#137)

### Corregido

- Incoherencias de validación entre Zod y Mongoose en campos de sesión (`penaltyPerError` rechazaba valor 0, `numberOfCards` con límites divergentes).
- Bugs visuales en múltiples páginas del frontend.
- Manejo de datos mejorado en `DeckEditPage` y `SessionsPage`.
- Pantalla de fin de partida (`GameOverScreen`) rediseñada con estadísticas de resumen detalladas.
- Soporte de `reduced-motion` añadido en animaciones que carecían de ello.

### Documentación

- Documentación técnica de seguridad de tokens JWT (`backend/docs/Seguridad_tokens_JWT.md`).
- Arquitectura Redis ampliada y corregida (`backend/docs/Arquitectura_Redis.md`).
- Análisis de optimización Redis con comparativa antes/después (`backend/docs/Redis_Optimization_Analysis.md`).
- Notas de rendimiento (`backend/docs/Performance_Notes.md`) y flujos RFID en runtime (`backend/docs/RFID_Runtime_Flows.md`).
- API actualizada a v0.4.0 (`backend/docs/API_v0.4.0.md`).
- Auditoría integral de gameplay Sprint 4 (`documentation/Sprint4_Gameplay_Mejoras_Mantenimiento.md`).

## [0.3.0] - 2026-02-13

### Añadido

- **RFID Web Serial (Frontend):** Migración del flujo de lectura RFID al cliente (navegador) con soporte para conexión/desconexión, estados y control por modo operativo.
- **Integración Frontend-Backend completa:** Conexión real de la UI con API REST y Socket.IO para auth, usuarios, sesiones, mazos y métricas.
- **Autenticación WebSocket obligatoria:** Handshake autenticado y control de acceso reforzado para eventos en tiempo real.
- **Rate limiting en Socket.IO:** Límites por tipo de evento para reducir riesgo de abuso/DoS en canales de juego.
- **Capa DTO de respuestas:** Estandarización de payloads para reducir exposición de datos y mejorar consistencia de API.
- **Multi-sensor RFID (base):** Soporte de identificación de sensor en eventos para escenarios con más de un lector.
- **Modos RFID de flujo:** Control explícito para procesar lecturas según contexto (juego, registro, asignación, idle).
- **Frontend de operación docente:**
  - Panel de aprobación de profesores.
  - Flujo de sesión única por usuario.
  - Gestión de mazos en UI.
  - Wizard de sesión mejorado.
  - Dashboard analytics ampliado.
- **Infraestructura Docker:** Dockerfiles y compose para entorno local/dev/prod con documentación asociada.

### Cambiado

- **Arquitectura RFID:** Se desprioriza la dependencia de lectura serie en backend para favorecer despliegue cloud con lectura Web Serial desde frontend.
- **Validación de API:** Hardening de esquemas y validadores con Zod en rutas críticas.
- **Flujos en tiempo real:** Endurecimiento del pipeline Socket para mejorar estabilidad y trazabilidad en sesiones activas.

### Seguridad

- **Hardening de WebSocket:** autenticación obligatoria + control de frecuencia por evento.
- **Security logging:** Mejoras de registro orientadas a auditoría y detección de eventos de riesgo.
- **Validación estricta de entrada:** Reforzada en endpoints y eventos críticos para reducir superficie OWASP (input tampering / payloads malformados).

### Corregido

- Ajustes de integración frontend/backend para eliminar inconsistencias de contrato en flujos de sesión y datos de UI.
- Mejoras de robustez en rutas y validaciones para reducir errores por datos incompletos o no normalizados.

### Documentación

- Actualización de documentación de arquitectura y uso extendido de WebSocket/Web Serial.
- Actualización de tareas y cierre de Sprint 3 con trazabilidad técnica.
- Consolidación de documentación operativa para despliegue con Docker.

## [0.2.0] - 2026-01-09

### Añadido

- **Super Admin:** Rol `super_admin` con capacidad de aprobar/rechazar nuevos profesores. Endpoint de aprobación de usuarios.
- **Sesiones:** Implementada sesión única por dispositivo (invalida sesiones anteriores automáticamente).
- **Redis:** Integración completa con Redis para:
  - Blacklist de tokens y rotación de refresh tokens (7 días).
  - Persistencia de estados de partida (GamePlay).
  - Rate limiting y caché distribuida.
- **Pausa/Reanudación:** Funcionalidad para pausar y reanudar partidas en tiempo real (congelando el timer).
- **Mazos de Cartas (CardDecks):** Sistema para que los profesores creen, guarden y reutilicen configuraciones de cartas.
- **Gestión de Assets:**
  - Nuevos servicios: `imageProcessingService` y `audioValidationService`.
  - Validación estricta por "magic bytes".
  - Conversión automática de imágenes a WebP y generación de thumbnails.
  - Soporte exclusivo para audio MP3/OGG.
- **Transferencias:** Endpoint para transferir alumnos entre profesores manteniendo sus métricas.
- **Infraestructura:**
  - Script `drop-db` para desarrollo.
  - Health checks (`/health`) y endpoint de métricas (`/api/metrics`).
  - Configuración robusta de puerto serie con detección automática.

### Cambiado

- **Seguridad:** SVG eliminado de formatos permitidos por riesgo XSS. Solo WebP para imágenes.
- **Límites:** Eliminado límite duro de partidas simultáneas (ahora es warning suave).
- **Modelos:** Actualizado modelo `User` con `accountStatus` y `currentSessionId`.
- **API:** Endpoints de assets separados en `/images` y `/audio` con validaciones específicas.

### Documentación

- **Protocolo RFID:** Documentación técnica completa con diagramas de secuencia y estados en `backend/docs/RFID_Protocol.md`.
- **Arquitectura:** Nuevos diagramas PlantUML para la arquitectura del sistema y flujos de datos.

## [0.1.0] - 2025-12-15

### Añadido

- **Autenticación:** Sistema completo JWT con Access/Refresh tokens y validación de roles.
- **Gestión de Usuarios:** CRUD para profesores y estudiantes.
- **Hardware RFID:** Integración con servicio `serialport` y simulación para desarrollo.
- **Motor de Juego:** `GameEngine` con soporte para WebSocket (Socket.IO) en tiempo real.
- **Mecánicas:** Base para mecánicas de juego, comenzando con asociación simple.
- **Tests:** Suite completa de tests e2e e integración (Auth, Flujo de Juego, Serial).
- **Documentación:** API REST documentada en `/docs/API_v0.3.0.md`.

### Corregido

- Solucionado problema de "Open Handles" en tests (timers de auth y RFID).
- Resuelto conflicto de nombres en `ValidationError` (error 500).
- Configuración de seguridad ajustada para entornos de test.
