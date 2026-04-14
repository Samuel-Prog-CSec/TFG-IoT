# Propuestas de Mejora Pendientes - EduPlay RFID

> Propuestas pendientes de implementacion para el Sprint 6.
> Los bugs y mejoras UX identificados durante el testing del 31 de marzo de 2026 fueron resueltos en su totalidad durante el Sprint 5 y la fase de mantenimiento.

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
