# Auditoría Integral de Gameplay — Sprint 4

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Fecha de auditoría:** Marzo 2026  
**Versión base auditada:** 0.4.0-dev (rama `feature/gameplay`)  
**Alcance:** Motor de juego (`gameEngine`), estrategias de mecánica (Association, Memory), wizard de creación de sesiones, métricas de partida, sistema de animaciones, accesibilidad, rendimiento y deuda técnica.  
**Última actualización:** 05-03-2026

---

## 1. Introducción y motivación

La Tarea T-054 del Sprint 4 (_"Gameplay Real Asociación + Memoria E2E"_) cerró la integración frontend-backend para partidas en tiempo real. Tras su finalización, se identificó la necesidad de una **auditoría integral de calidad** que cubriese no solo la corrección funcional, sino también la robustez ante edge cases, la experiencia de usuario, la accesibilidad (WCAG 2.1), el rendimiento percibido y la deuda técnica acumulada durante la iteración rápida del sprint.

### 1.1 Objetivos de la auditoría

1. **Corrección funcional**: Detectar bugs que bloquean o degradan la experiencia real de juego.
2. **Robustez de edge cases**: Verificar el comportamiento del sistema ante estados límite (pausa durante feedback, abandono inesperado, reinicio de servidor, race conditions).
3. **Coherencia de dominio**: Asegurar que validación (Zod), persistencia (Mongoose) y lógica de negocio estén alineadas en sus restricciones.
4. **Experiencia de usuario**: Evaluar la calidad percibida de las interacciones, animaciones, feedback visual y flujos de navegación.
5. **Accesibilidad**: Verificar cumplimiento básico de WCAG 2.1 AA en componentes interactivos de gameplay.
6. **Rendimiento**: Identificar renders innecesarios y oportunidades de optimización en componentes con alta frecuencia de actualización.
7. **Deuda técnica**: Localizar código muerto, abstracciones abandonadas y barrel exports incoherentes.

### 1.2 Metodología

La auditoría se ejecutó en cuatro fases:

1. **Exploración automatizada**: Análisis estático del código fuente mediante búsquedas dirigidas en backend (`gameEngine`, strategies, controllers, validators, models) y frontend (`GameSession`, `CreateSession`, `GameOverScreen`, `api.js`, `index.css`).
2. **Verificación cruzada**: Contraste de cada hallazgo sospechoso contra el código real, tests existentes y documentación de arquitectura (ADRs, `RFID_Runtime_Flows.md`).
3. **Clasificación por severidad**: Asignación de nivel de impacto (Crítico, Lógico, UX, Deuda, Accesibilidad, Rendimiento) y priorización.
4. **Implementación y verificación**: Corrección de todos los hallazgos confirmados, ejecución de suite de tests (254 tests, 32 suites) y validación de lint (ESLint + Prettier).

---

## 2. Resumen cuantitativo de hallazgos

| Categoría | Detectados | Corregidos | Sin acción (ya OK) |
|-----------|:----------:|:----------:|:-------------------:|
| Bugs críticos (B1-B7) | 7 | 7 | 0 |
| Bugs lógicos (B8-B14) | 7 | 5 | 2 |
| Mejoras UX (U1-U5) | 5 | 4 | 1 |
| Código muerto (D1-D3) | 3 | 3 | 0 |
| Accesibilidad (A1-A5) | 5 | 3 | 2 |
| Rendimiento (P1-P4) | 4 | 3 | 1 |
| **Total** | **31** | **25** | **6** |

Los 6 items "sin acción" fueron analizados a fondo y se determinó que la implementación existente era correcta o ya estaba cubierta.

---

## 3. Bugs críticos (B1-B7)

Bugs que bloqueaban funcionalidad core o provocaban errores visibles en flujos normales de uso.

### B1: Incoherencia de validación en `penaltyPerError`

**Severidad:** Crítica — impedía crear sesiones con penalización cero  
**Archivos afectados:** `backend/src/validators/gameSessionValidator.js`, `backend/src/models/GameSession.js`

**Descripción del problema:**  
El campo `penaltyPerError` representa la penalización por respuesta incorrecta. Por diseño de dominio, este valor puede ser 0 (sin penalización), -2 (deducción), -5, etc. Sin embargo, la validación Zod usaba `.negative()` (estrictamente menor que 0) y el esquema Mongoose definía `max: -1`, lo que rechazaba consistentemente el valor 0.

Esta era una **incoherencia triple**: el dominio permitía 0, pero tanto la capa de validación (Zod) como la de persistencia (Mongoose) lo rechazaban. Un docente que intentase crear una sesión "sin penalización" recibiría un error 400 sin explicación clara.

**Análisis de la causa raíz:**  
Durante la implementación inicial del schema en Sprint 3, se confundió "penalización" con "valor negativo". El contrato semántico correcto es: la penalización es **no-positiva** (≤ 0), donde 0 significa "sin castigo".

**Corrección aplicada:**

| Capa | Antes | Después | Justificación |
|------|-------|---------|---------------|
| Zod | `.negative()` | `.nonpositive()` | Permite 0 y negativos |
| Mongoose | `max: -1` | `max: 0` | Alineado con Zod |

Adicionalmente, el `max` de `numberOfCards` en Mongoose era 30 pero Zod lo limitaba a 20ectable. Se alineó a 20 para mantener coherencia (registrado como B14).

**Principio aplicado:** _Single Source of Truth_ — cuando múltiples capas validan el mismo campo, los rangos deben ser idénticos. La validación Zod en la frontera HTTP es la referencia; Mongoose actúa como guardia redundante.

---

### B2: Aggregate `$match` con string en lugar de ObjectId

**Severidad:** Crítica — `getSessionStats` devolvía estadísticas vacías  
**Archivo afectado:** `backend/src/services/gameSessionService.js`

**Descripción del problema:**  
El método `getSessionStats` utiliza un pipeline de agregación de MongoDB para calcular estadísticas de una sesión. El parámetro `sessionId` llegaba como `string` desde el controller, pero el campo `sessionId` en la colección `gameplays` está almacenado como `ObjectId`.

En MongoDB, un `$match` con `{ sessionId: "6789..." }` **no coincide** con documentos donde `sessionId` es `ObjectId("6789...")`. A diferencia de `find()`, donde Mongoose realiza autocasting de tipos, los pipelines de `aggregate` operan directamente contra el driver nativo **sin casting automático**.

**Análisis de la causa raíz:**  
El patrón `find({ sessionId })` funciona transparentemente porque Mongoose aplica schema casting. Al migrar a `aggregate()` para cálculos más eficientes (media, mejor puntuación, conteo), se perdió esta conversión implícita.

**Corrección aplicada:**  
Se añadió cast explícito `new mongoose.Types.ObjectId(sessionId)` en el stage `$match` del pipeline.

**Alternativa descartada:**  
Se consideró usar `mongoose.Types.ObjectId.createFromHexString()` (más explícito), pero `new mongoose.Types.ObjectId()` es el patrón dominante en el codebase y la documentación oficial de Mongoose 9.x.

**Lección aprendida:** Todo pipeline `aggregate` que reciba IDs desde capas superiores debe castear explícitamente a `ObjectId`. Esto se documenta como pauta para futuras agregaciones.

---

### B3: `abandonPlay` no limpiaba estado del engine

**Severidad:** Crítica — recursos (timers, bloqueos Redis, tarjetas RFID) no se liberaban  
**Archivo afectado:** `backend/src/controllers/gamePlayController.js`

**Descripción del problema:**  
El endpoint `abandonPlay` marcaba el estado del documento `GamePlay` como `abandoned` en base de datos, pero **no notificaba al `gameEngine`** para que liberase los recursos en memoria:

- **Timers activos** (`roundTimer`, `nextRoundTimer`, `playTimer`): seguían ejecutándose y podían emitir eventos a un juego ya finalizado.
- **Bloqueo de tarjetas RFID** (`cardUidToPlayId`): las tarjetas físicas permanecían "reservadas" por la partida abandonada, impidiendo su uso en nuevas partidas.
- **Estado Redis**: la entrada de estado distribuido permanecía, consumiendo memoria y confundiendo la recuperación tras reinicio.

**Impacto real:**  
En un aula con un sensor RFID compartido, si un alumno abandona una partida y otro intenta iniciar una nueva con las mismas tarjetas, el sistema rechazaría el inicio con el error _"La tarjeta ya está en uso en otra partida"_.

**Corrección aplicada:**  
Se añadió una llamada a `gameEngine.endPlay(id)` envuelta en `try/catch` previo al guardado en BD. El `try/catch` es necesario porque `endPlay` puede fallar si la partida no existía en memoria (por ejemplo, si el servidor se reinició entre medias), y el abandono en BD debe completarse igualmente.

**Alternativa descartada:**  
Se evaluó emitir un evento socket `play_abandoned` y dejar que el engine lo capture. Se descartó porque introduce acoplamiento indirecto y el controller ya tiene acceso directo al servicio `gameEngine`. El patrón establecido en el codebase es que los controllers llaman a services/engine directamente.

---

### B4: Auto-inicio de sesiones completadas

**Severidad:** Crítica — bucle infinito de ejecución de partidas  
**Archivo afectado:** `frontend/src/pages/GameSession.jsx`

**Descripción del problema:**  
El componente `GameSession` tiene una lógica de bootstrap que, al montar, verifica el estado de la sesión y auto-inicia una partida si la sesión está en un estado "jugable". La condición original incluía `'completed'` en la lista de estados que disparaban el auto-start.

Cuando un alumno entraba a una sesión ya completada (por ejemplo, desde un enlace guardado o navegación directa), el sistema:
1. Creaba una nueva partida via API.
2. La conectaba por socket.
3. Al finalizar (si la sesión tenía límite), la propia lógica de `game_over` podía marcar la sesión como `completed`.
4. Si el alumno refrescaba, se repetía el ciclo.

**Corrección aplicada:**  
Se eliminó `'completed'` de la condición de auto-start. Las sesiones completadas muestran directamente las estadísticas históricas, sin crear nuevas partidas.

---

### B5: Utilidades CSS de gameplay no definidas

**Severidad:** Crítica — componentes renderizaban sin estilos (fondo, botones, tarjetas)  
**Archivo afectado:** `frontend/src/index.css`

**Descripción del problema:**  
El componente `GameSession.jsx` referenciaba las clases `game-bg`, `btn-game` y `glass-card-gradient` que nunca fueron definidas como `@utility` en el sistema de diseño Tailwind v4. En Tailwind v4, las clases que no están en el design system ni definidas como `@utility` son simplemente **ignoradas sin error**, produciendo componentes visualmente rotos sin ningún aviso en consola.

**Corrección aplicada:**  
Se definieron las tres utilidades en `index.css`:

- `game-bg`: Gradiente de fondo oscuro-púrpura con malla visual.
- `btn-game`: Botón con gradiente indigo/púrpura, hover y transiciones.
- `glass-card-gradient`: Tarjeta con efecto glassmorphism y borde sutil.

Se siguió el patrón existente de `@utility` ya establecido en el archivo para `btn-primary`, `glass-card`, etc.

---

### B6: `bestScore` siempre mostraba 0

**Severidad:** Crítica — métrica de gameplay engañosa  
**Archivos afectados:** `frontend/src/pages/GameSession.jsx`, `frontend/src/services/api.js`

**Descripción del problema:**  
El componente `CurrentPlayMetrics` mostraba una métrica _"Mejor puntuación"_ que siempre era 0. El estado `bestScore` se inicializaba en 0 y **nunca se actualizaba** porque no existía llamada API para obtener la mejor puntuación histórica del jugador.

**Análisis de la causa raíz:**  
Durante la implementación rápida del HUD de métricas en la tarea T-054, se dejó un placeholder con intención de conectar la API posteriormente, pero no se creó un TODO ni se registró como deuda técnica.

**Corrección aplicada (dos partes):**

1. **Backend (API client):** Se añadió `getPlayerStats(playerId, params)` al objeto `playsAPI` en `api.js`, que llama al endpoint `GET /api/plays/player/:playerId/stats` ya existente en el backend.
2. **Frontend (fetch):** Durante la fase de bootstrap de la partida, tras resolver la play y el playerId, se lanza una petición asíncrona no bloqueante a `getPlayerStats`. Si responde con un `stats.bestScore` válido (`Number.isFinite`), se actualiza el estado. Si falla, se silencia con un catch vacío para no bloquear el gameplay.

**Decisión de diseño:**  
La llamada es **fire-and-forget** (no bloqueante) deliberadamente: la mejor puntuación histórica es información complementaria, no crítica para el juego. Si la API tarda o falla, el juego funciona igualmente con `bestScore = 0`. Se consideró usar un `useEffect` separado, pero se integró en el bootstrap existente para evitar un render adicional.

---

### B7: Redirección incorrecta post-creación de sesión Memory

**Severidad:** Crítica — configuración del tablero se saltaba  
**Archivo afectado:** `frontend/src/pages/CreateSession.jsx`

**Descripción del problema:**  
Al completar el wizard de 4 pasos para crear una sesión, la redirección siempre llevaba a `SessionDetail`, independientemente de la mecánica seleccionada. Para sesiones de tipo **Memory**, este flujo omitía la pantalla de `BoardSetup` donde el docente configura el layout del tablero (disposición de cartas en la cuadrícula).

Sin pasar por `BoardSetup`, la sesión Memory se creaba sin `boardLayout`, y al intentar iniciar una partida, el `gameEngine` encontraba un array vacío de slots, produciendo un tablero sin cartas.

**Corrección aplicada:**  
Se implementó routing condicional post-creación:

- **Memory** → `ROUTES.BOARD_SETUP_WITH_ID(newSession.id)` (configurar tablero)
- **Association / otros** → `ROUTES.SESSION_DETAIL(newSession.id)` (detalle directo)

El mensaje del toast también se diferencia para informar al usuario de que se le redirige a configurar el tablero.

---

## 4. Bugs lógicos (B8-B14)

Edge cases que no bloqueaban el flujo principal pero producían comportamiento incorrecto en escenarios específicos.

### B8: Pausa durante delay de feedback dejaba partida atascada

**Severidad:** Alta — la partida quedaba en estado irrecuperable  
**Archivo afectado:** `backend/src/services/gameEngine.js`

**Descripción del problema:**  
En mecánicas de tipo Association, tras cada respuesta (correcta o incorrecta) hay un **delay de feedback** (~1.5s) gestionado con `nextRoundTimer` en el que:
- `awaitingResponse = false` (ya se respondió)
- El timer de ronda (`roundTimer`) está cancelado
- El timer de siguiente ronda (`nextRoundTimer`) está programado

Si el docente pausaba la partida durante este breve intervalo, la lógica de pausa:
1. Cancelaba todos los timers (correcto).
2. Detectaba `awaitingResponse = false` y no calculaba `remainingTimeMs` (correcto).
3. Al reanudar, intentaba rearmar el timer de ronda con `remainingTimeMs = null`, lo que no armaba nada.
4. Tampoco avanzaba a la siguiente ronda, porque la lógica asumía que la reanudación siempre vuelve al estado "esperando respuesta".

**Resultado:** La partida quedaba en un estado _"dead"_ donde no había timer activo ni transición de ronda posible. El alumno veía el feedback del último resultado indefinidamente.

**Corrección aplicada:**  
Se introdujo un flag `pausedDuringFeedback` en el estado de la partida:

```
// En executePause():
const pausedDuringFeedback = !isMemoryPlay && !awaitingResponse && remainingTimeMs === null;
playState.pausedDuringFeedback = pausedDuringFeedback;

// En resumePlayInternal():
if (wasPausedDuringFeedback && !isMemoryPlay) {
    await this.sendNextRound(playId);
}
```

**Decisión técnica crítica — `sendNextRound` vs `advanceToNextRound`:**  
Se usa `sendNextRound` (método interno sin lock) en lugar de `advanceToNextRound` (método público con lock). Esto es deliberado: `resumePlayInternal` ya se ejecuta **dentro** de `executeWithPlayLock`. Llamar a `advanceToNextRound` desde dentro del lock provocaría un **deadlock** (reentrant lock no soportado), bloqueando la partida permanentemente. Se documentó esta decisión en el código con un comentario.

**Alternativa descartada:**  
Se consideró hacer el lock reentrante, pero esto añadiría complejidad significativa al sistema de locks distribuidos (Redis SETNX) para resolver un único caso de uso. No merece la pena.

---

### B9: Partidas huérfanas en BD no se recuperaban tras reinicio

**Severidad:** Alta — partidas "fantasma" bloqueaban recursos  
**Archivo afectado:** `backend/src/services/gameEngine.js`

**Descripción del problema:**  
El `gameEngine` almacena el estado activo de cada partida en dos lugares:

1. **Memoria del proceso Node.js** (`this.activePlays` Map)
2. **Redis** (estado serializado para resiliencia ante reinicio)

Al arrancar, `recoverActivePlays()` escaneaba las claves de Redis para reconstruir partidas activas en memoria. Sin embargo, existía un escenario no cubierto: si **Redis se reiniciaba** (o se vaciaba por mantenimiento) pero MongoDB aún tenía documentos `GamePlay` con `status: 'in-progress'` o `status: 'paused'`, estas partidas quedaban en un limbo:

- No estaban en Redis → no se recuperaban en memoria.
- Su estado en BD seguía activo → bloqueaban tarjetas y aparecían como "en curso" en dashboards.
- Nadie las finalizaba → acumulación progresiva de partidas zombi.

**Corrección aplicada:**  
Se añadió un segundo paso en `recoverActivePlays()` que llama a `recoverOrphanedPlaysFromDB()`:

1. Consulta todos los `GamePlay` con `status: { $in: ['in-progress', 'paused'] }`.
2. Para cada uno, verifica si existe entrada correspondiente en Redis (`hgetall`).
3. Si **no existe en Redis** (huérfana), la marca como `abandoned` mediante `markPlayAbandonedIfNeeded()`.

El flujo completo de recuperación queda:

```
recoverActivePlays()
├── Paso 1: Escanear claves Redis → reconstruir partidas en memoria
└── Paso 2: Consultar BD por activas/pausadas → si no están en Redis → abandonar
```

**Impacto en el arranque:**  
El paso 2 añade una consulta `find` a MongoDB al arrancar. En el contexto educativo (decenas de partidas, no miles), el coste es negligible (~10ms). Si escalase, debería paginarse o usar un índice con hint.

---

### B10: Race condition en `startPlay`

**Severidad:** Alta — doble inicio de partida posible  
**Archivo afectado:** `backend/src/services/gameEngine.js`

**Descripción del problema:**  
Todos los métodos mutantes del engine (`pausePlayInternal`, `resumePlayInternal`, `processRFIDScan`) usan `executeWithPlayLock` para serializar operaciones concurrentes sobre la misma partida. Sin embargo, `startPlay` no estaba protegido por este lock.

Si dos peticiones `start_play` para la misma partida llegaban en paralelo (por ejemplo, doble-click en la UI, o reconexión socket con retry automático), ambas ejecutaban la inicialización completa: reservar tarjetas, construir challenges, emitir `new_round`. Esto producía estado duplicado en memoria y comportamiento impredecible.

El método tenía un check de idempotencia (`if (this.activePlays.has(playId)) return`), pero sin lock, ambas ejecuciones podían pasar este check **antes** de que ninguna se registrase.

**Corrección aplicada:**  
Se envolvió todo el cuerpo de `startPlay` en `executeWithPlayLock(playId, 'startPlay', async () => { ... })`. El check de idempotencia se mantiene como guardia rápida dentro del lock.

**Decisión de diseño:**  
Se usa `'startPlay'` como etiqueta de operación en el lock (segundo parámetro), consistente con el patrón de las demás operaciones (`'pause_play'`, `'resume_play'`, `'rfid_scan'`). Esto facilita el debugging en logs cuando se detecta contención.

---

### B11: MemoryStrategy hardcoded para parejas (groupSize=2)

**Severidad:** Media — limitaba extensibilidad futura  
**Archivo afectado:** `backend/src/strategies/mechanics/MemoryStrategy.js`

**Descripción del problema:**  
El método `processScan` de `MemoryStrategy` estaba diseñado exclusivamente para emparejar **dos** cartas. La lógica usaba un schema de selección directa: `firstPick` → `secondPick` → evaluar. Sin embargo, el modelo de datos (`strategyState.matchingGroupSize`) ya soportaba valores arbitrarios de tamaño de grupo, y la documentación de mecánicas contemplaba variantes de memoria con tríos o cuartetos.

**Corrección aplicada:**  
Se refactorizó `processScan` para trabajar con un **array dinámico de selecciones** y un `groupSize` configurable:

1. Se lee `groupSize` de `strategyState.matchingGroupSize` (default: 2).
2. Las selecciones se acumulan en `strategyState.selectedUids[]` en lugar de `firstPick`/`secondPick`.
3. Si `selected.length < groupSize`, se retorna `first_pick` (primera carta) o `intermediate_pick` (cartas 2..N-1).
4. Al alcanzar `groupSize`, se evalúa: todas las cartas seleccionadas deben tener el mismo `assignedValue` y UIDs distintos.

**Detalles de implementación de la evaluación N-ary:**

```javascript
const allSameValue = selectedCards.length === groupSize &&
    selectedCards.every(card => card.assignedValue === selectedCards[0].assignedValue);
const allDistinctUids = new Set(selected).size === selected.length;
const isCorrect = allSameValue && allDistinctUids;
```

**Nota sobre frontend:**  
Actualmente solo se usa `matchingGroupSize = 2` en producción. El tipo de evento `intermediate_pick` no tiene tratamiento visual en el frontend (sólo `first_pick` y `resolved`). Si se habilitan grupos mayores, será necesario añadir feedback visual de selección intermedia. Se registra como deuda técnica documentada.

---

### B12: `endSession` no verificaba partidas activas

**Severidad:** Media — posible pérdida de datos de partidas en curso  
**Archivo afectado:** `backend/src/controllers/gameSessionController.js`

**Descripción del problema:**  
El endpoint `endSession` permitía que un docente finalizase una sesión aunque hubiese alumnos jugando activamente. Al cambiar el estado de la sesión a `completed`, las partidas en curso no se finalizaban ni se notificaban, quedando en un estado inconsistente: la sesión está acabada pero hay plays en `in-progress`.

**Corrección aplicada:**  
Se añadió una verificación previa con `gamePlayRepository.count()`:

```javascript
const activePlays = await gamePlayRepository.count({
    sessionId: session._id,
    status: { $in: ['in-progress', 'paused'] }
});

if (activePlays > 0) {
    throw new ConflictError(
        `No se puede finalizar la sesión: hay ${activePlays} partida(s) activa(s)`
    );
}
```

Se usa HTTP 409 Conflict (`ConflictError`) siguiendo la semántica REST: el estado actual del recurso (sesión con partidas activas) impide la operación solicitada.

**Alternativa descartada:**  
Se evaluó forzar el cierre de todas las partidas activas (cascade end). Se descartó porque:
1. Implica lógica de negocio compleja (contabilizar puntuaciones parciales, notificar alumnos).
2. El docente debería decidir conscientemente qué hacer con las partidas activas.
3. La responsabilidad del cascade correspondería al service, no al controller.

Si en el futuro se desea cascade, debería implementarse como un flag explícito (`?force=true`) con lógica en `gameSessionService`.

---

### B13: Sincronización de timer frontend/backend (sin acción)

**Severidad:** Informativa  

**Análisis:**  
Se investigó si existía drift entre el timer visual del frontend y el timer autoritativo del backend. Conclusión: **la arquitectura ya es _server-authoritative_**. El frontend muestra un countdown cosmético basado en `remainingTimeMs` enviado por el servidor, pero la decisión de timeout siempre la toma el backend (`handleTimeout`). El drift visual (±200ms típico en WebSocket) es aceptable en un contexto educativo no competitivo.

---

### B14: Desalineación `numberOfCards` Mongoose vs Zod

**Severidad:** Baja — corregido como parte de B1  

El esquema Mongoose permitía `max: 30` mientras Zod validaba `max: 20`. Se alineó a 20 (el valor de Zod) por el principio de capa de validación como referencia.

---

## 5. Mejoras de experiencia de usuario (U1-U5)

### U1: Animación de volteo 3D para tablero de memoria

**Motivación:**  
El tablero de memoria mostraba las cartas con una transición opaca: simplemente se reemplazaba el contenido `?` por el valor asignado. En un juego de memoria, el acto de **voltear la carta** es una interacción central y esperada por el usuario. La ausencia de animación de flip reducía significativamente la _sensación de juego_ y dificultaba percibir qué cartas se habían seleccionado recientemente.

**Implementación técnica:**  
Se implementó un flip 3D puro con CSS utilizando `@utility` de Tailwind v4:

- `memory-card-flip`: Establece `perspective: 1000px` en el contenedor para profundidad 3D.
- `memory-card-inner`: Configura `transform-style: preserve-3d` y `transition: transform 0.5s` para la animación.
- `memory-card-flipped`: Aplica `rotateY(180deg)` cuando la carta está revelada.
- `memory-card-face`: Cara frontal (oculta) con `backface-visibility: hidden`.
- `memory-card-back`: Cara trasera (contenido) con `rotateY(180deg)` y `backface-visibility: hidden`.

**Decisión sobre la librería de animación:**  
El proyecto usa Framer Motion para animaciones complejas. Se optó por CSS puro para el flip porque:
1. Es una animación simple (rotación en un eje) que no requiere spring physics.
2. El tablero puede tener hasta 20 cartas; 20 instancias de Framer Motion AnimatePresence consumirían más memoria que CSS nativo.
3. Permite usar `prefers-reduced-motion` directamente via media query (Tailwind lo soporta con `motion-reduce:`).

---

### U2: Skeleton de carga en sustitución de texto plano

**Motivación:**  
Mientras la sesión y la partida se bootstrappean (~500ms-2s dependiendo de la red), el usuario veía un texto _"Cargando sesión..."_ centrado en pantalla. Esto rompe la percepción de _aplicación nativa_ y no proporciona feedback de progreso.

**Implementación:**  
Se sustituyó por un skeleton animado con la misma estructura visual que el layout final (header, panel central, sidebar de métricas), usando `animate-pulse` sobre bloques de color `bg-slate-700/40`. El skeleton desaparece instantáneamente al completar el bootstrap gracias a la transición de estado React.

---

### U3: Resumen de métricas integrado en pantalla de fin de juego

**Motivación:**  
El componente `PlaySummaryCard` existía como elemento inline dentro del flujo condicional de `GameSession.jsx`. Al finalizar la partida, el usuario veía la pantalla `GameOverScreen` con confetti y puntuación, **pero sin las métricas de detalle** (errores, tiempo medio de respuesta, tiempo total jugado). Estas métricas quedaban detrás del modal celebratorio.

**Implementación:**  
Se añadió una prop `summary` a `GameOverScreen` que acepta un objeto `{ errors, avgResponseTime, totalTimePlayed }`. El componente renderiza una grid de 3 columnas con:
- Errores (con icono visual).
- Tiempo medio por respuesta (formateado en segundos).
- Duración total (formateado en min:seg o seg).

El componente `PlaySummaryCard` inline se eliminó (ver D3), consolidando toda la información de fin de juego en un único punto.

---

### U4: Columnas dinámicas del tablero por cantidad de cartas (sin acción)

**Análisis:**  
Se verificó que la función `resolveMemoryColumns(total)` ya implementaba una tabla de columnas óptimas según el número de cartas (4→2col, 6→3col, 8→4col, 12→4col, 16→4col, 20→5col). No se requirió intervención.

---

### U5: ErrorBoundary para contenido de juego

**Motivación:**  
El componente `GameSession.jsx` (~1460 líneas) es el más complejo del frontend. Integra state machine de conexión, múltiples handlers de socket, renderizado condicional por mecánica, y manejo de timers. Un error en cualquiera de estas áreas provocaba un _white screen_ sin opción de recuperación, obligando al usuario a recargar manualmente.

**Implementación:**  
Se envolvió el contenido de `GameSession` en un `<ErrorBoundary>` de React con un fallback visual temático:
- Icono expresivo (😵) para transmitir el error de forma no técnica.
- Mensaje en español: _"Algo salió mal en el juego"_.
- Descripción breve y botón para volver al Dashboard.
- Background consistente con el `game-bg` del resto del juego.

**Decisión de diseño:**  
El boundary se coloca a nivel de página (no de componente individual) porque:
1. Un error en el handler de socket típicamente corrompe todo el estado del juego.
2. La recuperación parcial (solo re-renderizar el tablero) es inviable sin reconectar el socket.
3. La acción más segura es ofrecer al usuario volver al dashboard y reiniciar la partida.

---

## 6. Eliminación de código muerto (D1-D3)

La deuda técnica en forma de módulos no utilizados debe eliminarse proactivamente en un TFG porque:
- Confunde a futuros revisores/lectores del código.
- Los barrel exports de módulos muertos aumentan el tamaño de bundle innecesariamente.
- Los tests de coverage marcan estos módulos como no cubiertos, distorsionando las métricas.

### D1: `GameContext.jsx` — Context + useReducer abandonado

**Localización:** `frontend/src/context/GameContext.jsx`

**Análisis:**  
Este módulo implementaba un Context de React con `useReducer` para gestionar estado de juego (score, currentRound, etc.). Se creó en fases tempranas del Sprint 4 como aproximación al estado de gameplay, pero fue **completamente sustituido** por la state machine basada en `useState` directamente en `GameSession.jsx`, que se alimenta de eventos Socket.IO.

Ningún componente importaba `GameProvider` ni `useGame`. La verificación se realizó con búsquedas exhaustivas de `useGame`, `GameProvider`, y `GameContext` en todo el tree de `src/`.

**Acción:** Archivo eliminado. Re-exportaciones eliminadas de `frontend/src/context/index.js`.

### D2: `useGameTimer.js` — Hook de timer no utilizado

**Localización:** `frontend/src/hooks/useGameTimer.js`

**Análisis:**  
Hook personalizado que encapsulaba un `setInterval` para countdown. Fue diseñado para usarse con `GameContext`, pero `GameSession.jsx` implementa su propia lógica de timer inline (alimentada por `remainingTimeMs` del socket). El hook nunca se integró en el flujo productivo.

**Acción:** Archivo eliminado. Re-exportación eliminada de `frontend/src/hooks/index.js`.

### D3: `PlaySummaryCard` inline — Funcionalidad duplicada

**Análisis:**  
Existía un componente `PlaySummaryCard` definido inline dentro de `GameSession.jsx` que renderizaba métricas de fin de partida. Con la integración de la prop `summary` en `GameOverScreen` (U3), esta funcionalidad quedó duplicada.

**Acción:** Componente inline eliminado. Las métricas se renderizan ahora exclusivamente dentro de `GameOverScreen`.

---

## 7. Mejoras de accesibilidad (A1-A5)

La accesibilidad en aplicaciones educativas es un requisito funcional, no un _nice-to-have_. El marco normativo español (Real Decreto 1112/2018) y las directrices WCAG 2.1 AA exigen que interfaces web educativas sean percibibles, operables, comprensibles y robustas.

### A1: Semántica ARIA en tablero de memoria

**Problema:** El tablero de memoria era un `<div>` con `<div>` hijos sin roles semánticos. Un lector de pantalla no podía transmitir la estructura de cuadrícula ni el estado de cada carta (oculta, revelada, emparejada).

**Corrección:**
- Contenedor: `role="grid"` + `aria-label="Tablero de memoria"`.
- Cada celda: `role="gridcell"` + `aria-label` dinámico según estado:
  - Carta oculta → `"Carta oculta"`.
  - Carta revelada → `"Carta [valor]"`.
  - Carta emparejada → `"Carta [valor] — emparejada"`.

Estos roles siguen la especificación WAI-ARIA 1.2 para grids interactivos. Se eligió `grid/gridcell` sobre `table/cell` porque el tablero permite interacción directa (selección de cartas), no es solo presentacional.

### A2: Indicador de progreso de rondas con `aria-label`

**Problema:** Los dots de progreso de ronda eran spans decorativos sin `aria-label`. Un usuario de lector de pantalla no sabía en qué ronda estaba.

**Corrección:** Se añadió `aria-label` al contenedor con texto descriptivo: _"Progreso: ronda X de Y"_.

### A3: FallbackTouchPanel con semántica de formulario

**Problema:** El panel de selección manual de tarjetas (fallback cuando no hay sensor RFID) era una lista de `<div>` con `onClick`. No era navegable por teclado ni semánticamente interpretable.

**Corrección:**
- Envuelto en `<fieldset>` con `<legend>` descriptivo.
- Cada "tarjeta" touchable tiene `aria-label` con su valor asignado.
- Se añadió `focus-visible:ring-2 focus-visible:ring-indigo-400` para indicador de foco visible.

### A4-A5: Sin acción necesaria

- **A4:** `GameOverScreen` ya implementaba `role="dialog"`, `aria-modal="true"` y labels adecuados.
- **A5:** Los anuncios para lectores de pantalla (timer, ronda, pausa/resume) ya se emitían via `<output aria-live="polite">` con `srAnnouncement`.

---

## 8. Mejoras de rendimiento (P1-P4)

### P1: Memoización de paneles de gameplay

**Problema:**  
Los componentes `AssociationGameplayPanel`, `MemoryGameplayPanel` y `CurrentPlayMetrics` se re-renderizan en cada actualización del estado padre (`GameSession`). Como el estado padre incluye `realtimeStatus`, `srAnnouncement` y otros valores frecuentemente cambiantes, estos paneles se recalculaban innecesariamente aunque sus props no cambiasen.

**Corrección:**  
Se envolvieron los tres componentes con `React.memo()`. Con `memo()`, React solo re-renderiza el componente si alguna de sus props cambió (comparación superficial). Dado que las props de estos paneles son objetos estables (game state, score, round) o callbacks memorizados, el impacto esperado es una **reducción significativa de renders** durante el flujo de juego activo.

**Medición:**  
No se implementó profiling formal (React DevTools Profiler) en esta iteración. Se recomienda como verificación futura para cuantificar la mejora real.

### P2: Pipeline de agregación (sin acción)

Se verificó que `recalculateSessionStatusFromPlays` ya usa un pipeline `aggregate` optimizado en lugar de N consultas `find`. No se requirió intervención.

### P3: Reducción de complejidad cognitiva en `pausePlayInternal`

**Problema:**  
SonarCloud reportaba complejidad cognitiva 16 (umbral: 15) para `pausePlayInternal`. La función contenía validación de permisos, check de estado, cálculo de tiempo restante, detección de pausa durante feedback, persistencia y emisión de evento en un único bloque monolítico.

**Corrección:**  
Se extrajo la lógica en tres métodos auxiliares:
- `executePause(playId, playState)`: Coordina la lógica de pausa post-validación.
- `calculatePauseRemainingTime(playState)`: Encapsula el cálculo de tiempo según tipo de mecánica.
- `persistPauseState(playId, playState, remainingTimeMs)`: Guarda en BD y recalcula estado de sesión.

El método principal (`pausePlayInternal`) queda con responsabilidad única: validar condiciones previas y delegar.

**Principio aplicado:** Single Responsibility a nivel de método. Cada helper tiene una responsabilidad clara y es testeable de forma independiente.

### P4: Limpieza de barrel exports

Se eliminaron las re-exportaciones de `GameProvider`, `useGame` y `useGameTimer` de los barrel files (`context/index.js`, `hooks/index.js`). Esto evita que el bundler (Vite/Rollup) trace dependencias a módulos inexistentes y simplifica el tree-shaking.

---

## 9. Inventario de archivos modificados

### Backend

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/validators/gameSessionValidator.js` | Fix validación `penaltyPerError` (B1) |
| `src/models/GameSession.js` | Fix rangos Mongoose `penaltyPerError`/`numberOfCards` (B1, B14) |
| `src/services/gameSessionService.js` | Fix ObjectId casting en aggregate (B2) |
| `src/services/gameEngine.js` | Múltiple: `startPlay` lock (B10), pausa/feedback (B8), recovery huérfanas (B9), refactor complejidad (P3) |
| `src/controllers/gamePlayController.js` | Fix `abandonPlay` cleanup (B3) |
| `src/controllers/gameSessionController.js` | Fix `endSession` check activas (B12) |
| `src/strategies/mechanics/MemoryStrategy.js` | Refactor N-group matching (B11) |

### Frontend

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/pages/GameSession.jsx` | Múltiple: auto-start (B4), bestScore (B6), ErrorBoundary (U5), skeleton (U2), ARIA (A1-A3), memo (P1), summary integration (U3) |
| `src/pages/CreateSession.jsx` | Fix routing post-creación (B7) |
| `src/components/game/GameOverScreen.jsx` | Prop `summary` con métricas (U3) |
| `src/index.css` | Utilidades CSS gameplay (B5) + card flip animation (U1) |
| `src/services/api.js` | Endpoint `getPlayerStats` (B6) |
| `src/context/index.js` | Limpieza barrel exports (D1, P4) |
| `src/hooks/index.js` | Limpieza barrel exports (D2, P4) |

### Archivos eliminados

| Archivo | Motivo |
|---------|--------|
| `src/context/GameContext.jsx` | Código muerto — context no utilizado (D1) |
| `src/hooks/useGameTimer.js` | Código muerto — hook reemplazado (D2) |

---

## 10. Verificación y resultados de calidad

### Tests

Se ejecutó la suite completa de backend:
- **254 tests** en **32 suites**: todos pasaron ✅
- Tests específicos de gameplay (4 suites, 16 tests) verificados individualmente: `memoryStrategy.test.js`, `gameFlow.test.js`, `gamePlayEventPersistence.test.js`, `sessionMechanicAvailability.test.js`.

### Lint

ESLint + Prettier ejecutado sobre todos los archivos modificados:
- 0 errores.
- 1 warning preexistente (`sonarjs/pseudo-random` en MemoryStrategy por uso de `Math.random()` en el shuffle — es intencional para algoritmo Fisher-Yates, no criptográfico).

### Errores de compilación

VS Code reporta 0 errores de compilación en los archivos modificados.

---

## 11. Riesgos residuales y trabajo futuro

### Riesgos aceptados

| Riesgo | Probabilidad | Impacto | Mitigación actual |
|--------|:------------:|:-------:|-------------------|
| MemoryStrategy N-groups sin UI para `intermediate_pick` cuando `groupSize > 2` | Baja (solo se usa 2) | Bajo | Frontend solo soporta `first_pick`/`resolved`; documentado como deuda |
| Pausa exacta al milisegundo del timeout (B8) avanza ronda en resume | Negligible | Bajo | El avance de ronda es el comportamiento correcto en este caso |
| Recovery de huérfanas depende de estado BD consistente | Baja | Medio | Nuevo scan de BD mitiga el caso parcialmente |
| `GameSession.jsx` sigue siendo un componente de ~1460 líneas | — | Mantenibilidad | Se recomienda extracción de sub-componentes en sprint futuro |

### Recomendaciones para sprints futuros

1. **Cobertura de tests para nuevos caminos:** Añadir tests unitarios para `recoverOrphanedPlaysFromDB`, N-group memory scans, y `endSession` con partidas activas.
2. **Extracción de sub-componentes:** Dividir `GameSession.jsx` en módulos más pequeños (`GameBootstrap`, `GameplayRouter`, `GameHUD`, `GameFooter`).
3. **Profiling de rendimiento:** Usar React DevTools Profiler para cuantificar el impacto real de los `memo()` aplicados.
4. **UI para grupos de memoria N > 2:** Si se habilita `matchingGroupSize > 2`, implementar feedback visual intermedio de selección.
5. **Cascade end de sesión:** Evaluar implementación de `endSession` con `?force=true` para finalizar sesiones con partidas activas.
