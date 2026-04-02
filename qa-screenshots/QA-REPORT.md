# Informe de QA — EduPlay RFID
**Fecha:** 1 de abril de 2026  
**Tester:** Claude (Opus 4.6)  
**Entorno:** Docker Compose (nginx + backend + MongoDB + Redis)  
**Credenciales:** maria@test.com (Teacher 1)

---

## Resumen Ejecutivo

Se evaluaron todas las funcionalidades principales de la plataforma: login, dashboard, creación de sesiones (wizard 4 pasos), partida de **memorización**, partida de **asociación**, y páginas de gestión (sesiones, contextos, mazos). Se encontraron **4 bugs funcionales**, **6 problemas de UX**, y **3 mejoras de diseño** recomendadas.

---

## BUGS FUNCIONALES

### BUG-F1: Dificultad "custom" no aceptada por backend [CRÍTICO]
- **Ruta:** Crear Sesión → Paso 3 (Reglas) → Mover slider manualmente → Paso 4 → Crear
- **Síntoma:** Error 400: `"difficulty": "Invalid option: expected one of easy|medium|hard"`
- **Causa raíz:** `CreateSession.jsx:483-491` — Al mover sliders manualmente, `handleConfigChange` establece `difficulty: 'custom'`. El backend (`gameSessionValidator.js`) solo acepta `easy|medium|hard`.
- **Fix sugerido:** Dos opciones:
  1. Aceptar `'custom'` en el validador backend
  2. Mantener el último preset seleccionado cuando se ajustan sliders manualmente
- **Archivos:** `frontend/src/pages/CreateSession.jsx`, `backend/src/validators/gameSessionValidator.js`

### BUG-F2: Contador PAREJAS muestra cartas en vez de parejas [MEDIO]
- **Ruta:** Partida de Memoria → Esquina superior izquierda
- **Síntoma:** Al encontrar 1 pareja, el círculo muestra "2 de 6" en vez de "1 de 6"
- **Causa raíz:** `GameSession.jsx:1051-1058` — El header circle muestra `matchedCount` directamente (cartas individuales), mientras que `MemoryGameplayPanel` (línea 1475-1476) divide correctamente por 2.
- **Fix:** Dividir `matchedCount` por 2 en el display del header circle
- **Archivo:** `frontend/src/pages/GameSession.jsx`

### BUG-F3: Timer arranca en "agotado" antes de interacción [MEDIO]
- **Ruta:** Partida de Memoria → Inicio de juego
- **Síntoma:** El status aria anuncia "Tiempo agotado" y el progressbar muestra 0% antes de que el jugador toque la primera carta. Al hacer click, el timer se reactiva normalmente.
- **Causa:** El timer empieza a contar inmediatamente al cargar la página, pero el snapshot capturó el estado justo cuando `timeLeft` llegó a 0 durante la carga/transición. Parece un race condition entre la carga del componente y la recepción del evento `NEW_ROUND` via Socket.IO.
- **Archivo:** `frontend/src/pages/GameSession.jsx:118, 738-740`

### BUG-F4: Heatmap trunca etiqueta "association" [BAJO]
- **Ruta:** Dashboard → Mapa de Calor de Dificultad
- **Síntoma:** La etiqueta del eje X muestra "associati..." truncado
- **Causa raíz:** `DifficultyHeatmap.jsx:50-58` — El `<XAxis>` no tiene `width` ni `angle` definidos, las etiquetas largas se truncan.
- **Fix:** Añadir `angle={-20}` o aumentar `bottom` margin, o usar `tickFormatter` para capitalizar/abreviar
- **Archivo:** `frontend/src/components/dashboard/DifficultyHeatmap.jsx`

---

## PROBLEMAS DE UX

### UX-1: Preset de dificultad se deselecciona sin feedback
- **Dónde:** Crear Sesión → Paso 3
- **Problema:** Al mover cualquier slider, el preset (Fácil/Normal/Difícil) pierde la selección visual sin explicar por qué. No hay indicador "Personalizado".
- **Sugerencia:** Mostrar un 4to preset "Personalizado" que se active automáticamente al modificar sliders.

### UX-2: "Fallos" en Game Over es ambiguo
- **Dónde:** Pantalla Game Over (ambas mecánicas)
- **Problema:** "Fallos: 5" se calcula como `totalRounds - correctAnswers`. Para memorización, parece significar "parejas no encontradas". Para el usuario, "Fallos" sugiere "respuestas incorrectas".
- **Sugerencia:** Renombrar a "No completadas" o "Pendientes", o separar "Errores" (intentos incorrectos) de "Sin responder" (timeout).

### UX-3: KPIs sin valor de comparación
- **Dónde:** Dashboard → KPI cards
- **Problema:** Todos los KPIs muestran "↗ vs semana pasada" con flechas verdes pero sin valor numérico de cambio (ej: "+12%", "-3").
- **Sugerencia:** Añadir el porcentaje/valor de cambio junto a la flecha.

### UX-4: Recharts warnings de dimensiones
- **Dónde:** Dashboard → Todos los gráficos
- **Problema:** Console warnings `width(-1) and height(-1) should be greater than 0`. Aunque los gráficos renderizan correctamente, indica un layout issue durante el montaje.
- **Sugerencia:** Añadir `minWidth` y `minHeight` a los contenedores de los gráficos.

### UX-5: Asociación no requiere asignar estudiante
- **Dónde:** Sesión de Asociación → Click "Jugar"
- **Problema:** A diferencia de Memoria (que tiene paso de board-setup con asignación de estudiante), Asociación salta directamente al juego sin pedir estudiante. El resultado es una partida sin estudiante asignado (o con jugador genérico).
- **Sugerencia:** Unificar el flujo pre-juego: ambas mecánicas deberían pedir asignar estudiante.

### UX-6: Truncamiento de texto en assets solo-texto
- **Dónde:** Selección de mazo (paso 1), página de Mazos
- **Problema:** Mazos con assets de texto (ej: "Números del 1 al 6") muestran labels truncados: "Tr...", "Cu...", "C...". Los 4 thumbnails de preview son demasiado pequeños para texto.
- **Sugerencia:** Para assets de texto, mostrar el nombre completo o usar un layout diferente (lista en vez de thumbnails).

---

## MEJORAS DE DISEÑO RECOMENDADAS

### DES-1: Stepper del wizard cortado en vista inicial
- **Dónde:** Crear Sesión → Cualquier paso
- **Problema:** El stepper horizontal de 4 pasos está parcialmente cortado en la parte superior, requiere scroll para verlo completo.
- **Sugerencia:** Reducir padding superior o hacer el stepper sticky/compacto.

### DES-2: Espacio vacío excesivo debajo del contenido del dashboard
- **Dónde:** Dashboard → Scroll al final
- **Problema:** Hay un área vacía significativa debajo del último widget (Alertas y Avisos), que no aprovecha el espacio.
- **Sugerencia:** Añadir más widgets o ajustar el layout para llenar el espacio.

### DES-3: Game Over sin diferenciación visual por resultado
- **Dónde:** Pantalla Game Over
- **Problema:** Tanto una partida con 0 puntos como una con puntos bajos muestran el mismo diseño (estrella fugaz + "¡NO TE RINDAS!"). No hay variación visual según el rendimiento.
- **Sugerencia:** Ya existe "¡NO TE RINDAS!" para mal resultado — verificar que existen mensajes y visuales diferentes para resultados medios (ej: "¡Bien hecho!") y excelentes (ej: "¡Increíble!" + confetti).

---

## LO QUE FUNCIONA BIEN

- **Login:** Flujo limpio con glassmorphism, redirect correcto, error 401 en refresh esperado
- **Dashboard:** KPIs claros, gráficos informativos, layout profesional con sidebar
- **Wizard de creación (4 pasos):** Flujo intuitivo, stepper visual, presets de dificultad, preview de cartas, resumen antes de crear
- **Board Setup (Memoria):** Drag & drop (o aleatorio), asignación de estudiante, feedback visual
- **Tablero de Memoria:** Grid 3x4, flip cards, feedback "¡Eso es!" de la mascota
- **Juego de Asociación:** Presentación de asset central + selección de carta, timer por ronda
- **Mascota:** Mensajes contextuales motivacionales
- **Fallback sin RFID:** "Sin sensor RFID — toca las cartas del tablero para jugar" es excelente
- **Gestión de sesiones:** Grid cards con métricas, badges de estado, acciones claras
- **Contextos y Mazos:** Diseño consistente, búsqueda, indicadores de capacidad
- **Widget RFID:** Siempre visible, no intrusivo
- **Diseño general:** Dark mode coherente, gradientes purple/green/blue, cards con glassmorphism sutil, tipografía legible

---

## PRIORIZACIÓN DE FIXES

| # | Bug | Severidad | Esfuerzo |
|---|-----|-----------|----------|
| BUG-F1 | Difficulty 'custom' no válida | CRÍTICO | Bajo |
| BUG-F2 | Contador parejas × 2 | MEDIO | Bajo |
| UX-1 | Preset se deselecciona sin feedback | MEDIO | Bajo |
| UX-2 | "Fallos" ambiguo | MEDIO | Bajo |
| UX-5 | Asociación sin asignar estudiante | MEDIO | Medio |
| BUG-F3 | Timer race condition | MEDIO | Medio |
| UX-3 | KPIs sin valor de cambio | BAJO | Bajo |
| BUG-F4 | Heatmap label truncado | BAJO | Bajo |
| UX-6 | Truncamiento texto assets | BAJO | Medio |
| UX-4 | Recharts warnings | BAJO | Bajo |

---

*Capturas de pantalla disponibles en `qa-screenshots/`*
