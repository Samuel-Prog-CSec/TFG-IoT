# Gameplay Realtime - Association y Memory

## Objetivo

Documentar el comportamiento funcional de la pantalla de partida (`GameSession`) en modo productivo, conectada por Socket.IO al backend y sin flujos simulados.

> **Referencia canónica de eventos WebSocket**: Para la lista completa y actualizada de todos los eventos WebSocket, consultar [WebSockets-ExtendedUsage.md §6](../../backend/docs/WebSockets-ExtendedUsage.md#6-eventos-websocket) en la documentación del backend.

## Principios de diseño aplicados

1. **Socket-first en gameplay**: las acciones de partida (`join/start/pause/resume`) se ejecutan por eventos realtime.
2. **Sin fallback REST en runtime de juego**: pausa/reanudación requiere canal socket activo.
3. **UI por mecánica**: Association y Memory comparten layout general, pero renderizan bloques de juego distintos.
4. **Métricas visibles + persistencia backend**: se muestran métricas de partida actual y resumen final, manteniendo el registro completo para dashboards.
5. **Reconexión exacta por snapshot**: al reingresar en `join_play`, la UI rehidrata ronda, marcador, challenge/tablero y tiempo restante desde `play_state`.

## Eventos de juego consumidos

### Comunes

- `new_round`
- `validation_result`
- `play_paused`
- `play_resumed`
- `game_over`
- `play_state`
- `play_interrupted`
- `error`

### Específico de Memory

- `memory_turn_state`

### Cliente → servidor para contingencia táctil

- `rfid_scan_from_client` (modo touch fallback cuando no hay sensor)

## Estados UI de runtime

- `waiting`
- `playing`
- `paused`
- `finished`

Estado adicional de conectividad realtime:

- `connecting`
- `connected`
- `reconnecting`
- `disconnected`

## Diferencias funcionales por mecánica

## Association

- Muestra reto puntual por ronda (`ChallengeDisplay`).
- Progreso por rondas basado en `new_round`.
- Feedback de acierto/fallo por `validation_result`.

## Memory

- Muestra tablero dinámico (`MemoryBoard`) y progreso de parejas.
- Actualiza intentos/parejas mediante `memory_turn_state`.
- Mantiene feedback por `validation_result` en matchs/mismatch.
- Pausa visualmente el cronómetro durante feedback de match/mismatch (`feedbackDelayMs`) para mejorar comprensión infantil.

## Reconexión y recuperación de sesión

- `play_state` incluye snapshot de estado jugable para rehidratación:
  - estado de partida (`status`, `isPaused`, `awaitingResponse`)
  - progreso (`currentRound`, `score`, `maxRounds`)
  - tiempo (`remainingTimeMs`, `timeLimitSeconds`)
  - reto/tablero (`currentChallenge`, `memoryState`)
- `play_interrupted` fuerza cierre controlado de UX en cliente cuando el motor marca la partida interrumpida (ej. reinicio servidor).

## Contingencia sin RFID

- Si el lector RFID no está disponible, la pantalla habilita **modo táctil temporal** con selección de cartas.
- Cada tap emite `rfid_scan_from_client` con payload validado (`uid`, `type`, `sensorId`, `timestamp`, `source`).
- Se muestra aviso docente y CTA para pausar/revisar sensor sin perder control de sesión.

## Layout fit-to-viewport — sin scroll (ADR-207)

Invariante de las pantallas de partida y de fin de partida: **caben enteras en el viewport sin scroll desde 720p**, reajustando el tamaño de sus componentes para aprovechar el espacio.

- **Presupuesto vertical por reparto flex.** La columna de juego llena el alto del `main` (`h-full min-h-0`) y reparte el espacio entre la **región de referencia** (reto en Asociación / board en Memoria y Secuencia) y la **región de input táctil** como hermanas `flex-1 min-h-0` (reparto equilibrado). No se usa `justify-center` sobre contenido que pueda desbordar: el panel táctil ya **nunca empuja ni recorta** el reto, porque son hermanos con cuota de alto fija, no elementos apilados.
- **Rejillas dirigidas por ALTO, no por ancho.** Las cartas de los paneles táctiles (`FallbackTouchPanel`, `FallbackTouchPanelSequence`) y de los boards (`MemoryBoard`, `SequenceBoard`) escalan por **alto disponible**: la rejilla es `flex-1 min-h-0 auto-rows-fr content-center justify-center` y la carta `aspect-square max-h-full max-w-full mx-auto` con suelo `min-h-[2.75rem]` (44px, WCAG 2.5.8). El `max-w-full` es **imprescindible**: sin él, a viewports altos la carta se dimensiona por la fila y desborda la columna, solapándose con las vecinas.
- **Columnas adaptativas por aspect-ratio (`useSquareGridColumns`).** El nº de columnas NO es estático: el hook mide la región con `ResizeObserver` y elige el recuento que **maximiza el lado de carta** (`pickSquareColumns` en `lib/squareGrid.js`). Región ancha-baja (720p) → más columnas/menos filas (cartas ~2× mayores que con columnas fijas); región más cuadrada (4K con el cap) → menos columnas que llenan el alto. Mantiene el reparto 50/50 y da la carta máxima en toda la escalera.
- **GameOver vh-aware.** `GameOverScreen` y los `GameOverStats{Association,Memory,Sequence}` usan `clamp` con `vh` en paddings, márgenes y tamaños para comprimirse en viewports bajos; el `max-h-[98dvh] overflow-y-auto` queda solo como red de seguridad extrema. El caso más alto (Secuencia con badge de récord) cabe sin scroll a 1280×720.
- **Antipatrón a evitar.** Cartas `aspect-square` dirigidas por ancho dentro de una rejilla cuyo ancho escala con `vh`/viewport: crecen en alto al ensanchar la pantalla y desbordan el presupuesto vertical.

## Refinado visual infantil (Sprint gameplay core)

- Copy de estado realtime simplificado para niños (`Juego listo`, `Conectando`, `Sin conexión`).
- Mensajes de objetivo más directos y menos técnicos (`tarjeta amiga`).
- HUD simplificado con métricas prioritarias (puntos, aciertos, progreso) para reducir carga cognitiva.
- Animaciones de celebración estabilizadas (partículas deterministas) para mejor fluidez y menor jank en equipos modestos.
- Carga visual de assets críticos con estado de loading y prioridad alta en desafío principal.

## UX de errores realtime

Se normalizan códigos de error socket a mensajes UI específicos (ejemplos):

- `RFID_MODE_INVALID`
- `RFID_SENSOR_UNAUTHORIZED`
- `RFID_SENSOR_MISMATCH`
- `PLAY_NOT_ACTIVE`
- `ROUND_BLOCKED`
- `RFID_SOCKET_NOT_ACTIVE`
- `RFID_MODE_TAKEN_OVER`
- `FORBIDDEN`
- `AUTH_REQUIRED`
- `ENGINE_ERROR`

## Accesibilidad runtime (T-069)

- El temporizador evita anuncios por segundo y solo emite hitos críticos (`10`, `5`, `3`, `2`, `1`, `0`).
- El estado de conectividad realtime se anuncia con `role=status` y `aria-live=polite`.
- Los controles de gameplay (`sound`, `pause/resume`) exponen semántica de toggle con `aria-pressed`.
- El overlay de pausa actúa como diálogo accesible con foco inicial en acción principal y soporte `Escape`.
- En `prefers-reduced-motion`, los componentes de runtime degradan animaciones de alta intensidad (confetti, loops infinitos, shake).

## Métricas mostradas en UI

Durante partida:

- Mecánica
- Puntos
- Aciertos
- Errores/Intentos

Resumen final:

- Modo
- Aciertos
- Errores
- Intentos
- Puntos
- Tiempo medio de respuesta
- Tiempo total de partida

## Cobertura de tests frontend

Suite: `src/pages/__tests__/GameSession.test.jsx`

Escenarios cubiertos:

1. Flujo realtime Association con `new_round`.
2. Flujo realtime Memory con `memory_turn_state`.
3. Mapeo UX de errores socket.
4. Restricción de pausa/reanudación sin socket.
5. Resumen final con métricas de `game_over`.
6. Actualización de conectividad RFID por Web Serial.
7. Bootstrap de sesión y partida con APIs + socket.
8. Umbrales de anuncio SR del temporizador sin spam por tick.
9. Controles de sonido/pausa con estado ARIA correcto.
10. Gestión de foco en diálogo de pausa y reanudación por teclado.
11. Rehidratación de snapshot realtime (`play_state`) en modo Memory.
12. Gestión de evento `play_interrupted` con cierre UX seguro.
13. Emisión de `rfid_scan_from_client` en modo touch fallback.

## Verificación local

```bash
npm run test
npx eslint src/pages/GameSession.jsx src/pages/__tests__/GameSession.test.jsx vitest.config.js src/test/setup.js
```

## Modos de interacción por mecánica (PROP-57)

Cuando el lector RFID no está conectado (`!rfidConnected`), `GameSession.jsx` decide qué UI alternativa de input mostrar según la mecánica activa:

- **Asociación** (`!sessionIsMemory && !rfidConnected`): renderiza `<FallbackTouchPanel>` con las cartas del mazo en una grid 3-6 cols clicables. El alumno toca la carta correcta para responder al desafío central.
- **Memoria** (`sessionIsMemory && !rfidConnected`): **NO** renderiza `<FallbackTouchPanel>` porque el `<MemoryBoard>` ya es clicable directamente (cada celda del tablero es un botón que voltea la carta). En su lugar muestra un hint compacto en `accent-indigo`: *"Toca las cartas del tablero para jugar"*. Mostrar el FallbackTouchPanel adicional en Memoria duplicaría la interacción y confundiría al alumno (decisión documentada en QA del 19/04/2026 — PROP-57).

Razón de fondo: el FallbackTouchPanel está diseñado como *panel de selección* (responder a una consigna eligiendo entre N opciones), no como *panel de revelación* (voltear cartas). Memoria usa el modelo de revelación, así que su input nativo es el propio tablero.

## Resiliencia frente a recarga (snapshot sessionStorage)

Para que un F5 accidental durante una partida activa no produzca un flash de "ronda 1 / score 0" mientras el servidor reconcilia, persistimos un snapshot ligero del estado coordinado del juego en `sessionStorage` por `playId` (`frontend/src/lib/sessionSnapshot.js`).

- TTL: 10 min. Pasados 10 min sin actualización, preferimos pedir el estado canónico al servidor que mostrar datos obsoletos.
- Ámbito: `sessionStorage` (no `localStorage`) — aislado por pestaña, no comparte estado entre sesiones simultáneas del profesor.
- Esquema versionado: si cambia la forma del snapshot, se incrementa `SNAPSHOT_SCHEMA_VERSION` para invalidar snapshots antiguos.
- Triggers de save: cualquier transición coordinada del reducer (`gameState`, `currentRound`, `score`, `correctAnswers`, `isAwaitingResponse`) — gestionado vía `useEffect` en `GameSession.jsx`.
- Triggers de clear: `gameState === 'finished'`, unmount del componente.
- Hidratación al montar: `loadSnapshot(playId)` antes de que el servidor responda con `play_state_sync`. Pinta UI preliminar y reconcilia cuando llega el sync canónico.

Tests: `frontend/src/lib/__tests__/sessionSnapshot.test.js`.

## Persistencia de pending scans en IndexedDB

`webSerialService` mantiene una cola en memoria (`pendingScans[]`, max 200, TTL 30 s) para reenviar scans cuando el socket se reconecta. Tras esta versión, cada scan encolado se persiste **además** en IndexedDB (`frontend/src/lib/pendingScansStore.js`):

- Best-effort: si IDB no está disponible (modo incógnito, cuota agotada), seguimos operando sólo con la cola en memoria.
- TTL persistente: 10 min (`PENDING_SCAN_PERSISTENCE_TTL_MS`). Pasado ese tiempo, los scans se purgan al siguiente `connect()`.
- Hydration: al conectar (`webSerialService.connect()`), `hydratePendingScansFromStorage()` mergea los scans persistidos con la cola en memoria (deduplica por `persistedId`).
- Cleanup: cuando `flushPendingScans` envía un scan con éxito, también elimina la entrada IDB asociada.

Beneficio: un F5 o crash del navegador en mitad de un periodo de desconexión socket no pierde scans que el alumno realizó.

Tests: `frontend/src/lib/__tests__/pendingScansStore.test.js`.

## Feedback granular de errores RFID

`useGameSocket.js` mapea códigos de error RFID estables (definidos en `backend/src/constants/errorCodes.js`) a mensajes user-friendly diferenciados:

| Código backend                 | Mensaje UI                                              |
| ------------------------------ | ------------------------------------------------------- |
| `RFID_SENSOR_STALE`            | "El sensor no responde. Comprueba que esté encendido."  |
| `RFID_SENSOR_NOT_CONNECTED`    | "El sensor RFID no está conectado..."                   |
| `RFID_DISABLED`                | "El servicio RFID está desactivado..."                  |
| `RFID_SENSOR_MISMATCH`         | "Se detectó un cambio en el lector durante la partida." |
| `RFID_MODE_INVALID`            | "El lector de tarjetas no está listo. Avisa al profesor." |
| `RFID_MODE_TAKEN_OVER`         | "Otra ventana tomó el control del lector..."            |
| Razón `card_not_in_play`       | (warning) "Tarjeta fuera de esta partida."              |
| Razón `uid_unknown`            | (warning) "Tarjeta no registrada en el sistema."        |
| Razón `play_paused`            | Sin toast (banner de pausa ya cubre visualmente)        |
| Razón `not_awaiting_response`  | (info) "Escaneo fuera de turno. Espera a la siguiente ronda." |

## Dedupe en cliente — capas y propósito

Mantenemos dos capas de dedupe complementarias (NO redundantes):

1. **`webSerialService`** (`DEFAULT_DEDUPE_MS = 1200`): protege contra múltiples lecturas del MISMO UID por el sensor físico cuando una tarjeta queda apoyada sobre el lector. Aplica a la fuente serial.
2. **`useGameSocket`** (`isDuplicateScan(uid, source)` con cooldown por fuente): protege contra dobles clicks del usuario sobre los botones del FallbackTouchPanel y los taps en el `MemoryBoard`. Aplica a la fuente UI/táctil.

A partir de PROP-90 / ADR-090 el cooldown se diferencia por `source` para no penalizar las mecánicas táctiles rápidas:

| `source` enviado | Cooldown |
|---|---|
| `web_serial_hardware`, `web_serial` | 1300 ms (sensor anti-chattering) |
| `touch_fallback` | 250 ms (panel táctil Asociación) |
| `touch_memory_flip` | 250 ms (taps en Memoria) |

`emitFallbackScan` envía `source: 'touch_fallback'`; `emitMemoryCardTap` envía `source: 'touch_memory_flip'`. El backend espeja la misma política en `socketRateLimiter.checkRfidDedupe` como capa defensiva final.

## Banner `RateLimitBanner` con countdown (PROP-92 / ADR-093)

Cuando el backend devuelve un error con `retryAfterMs` (`RATE_LIMITED`, `TEMP_BLOCKED`, `DUPLICATE_RFID_EVENT`), el hook `resolveSocketError(payload)` propaga el campo en el objeto `realtimeError`. `GameSession` renderiza `<RateLimitBanner>` en lugar del toast efímero:

- Mensaje principal + texto "Vuelves a poder tocar en Xs".
- Barra de progreso CSS-only que se vacía durante `retryAfterMs` (`@keyframes rate-limit-bar`).
- Auto-dismiss tras `retryAfterMs` ms invocando `onDismiss` que limpia `realtimeError`.
- `role="status"` + `aria-live="polite"` + `progressbar` con `aria-valuenow` actualizado.
- Respeta `prefers-reduced-motion`: barra estática proporcional al tiempo restante en vez de animación CSS.

El toast legacy se mantiene para errores sin `retryAfterMs` (mensajes informativos sin countdown).

---

## Mecánica Secuencia (T-921 / T-922)

La tercera mecánica usa eventos socket dedicados en lugar del `validation_result` genérico. La razón: una ronda se compone de dos fases con timings y semántica distintas, y la lógica de scan responde con tipos compuestos (correct, incorrect, incorrect_with_hint, blocked, timedOut).

### Eventos del namespace `/game` para Secuencia

| Evento | Dirección | Payload (campos relevantes) |
|---|---|---|
| `sequence_phase_memorizing` | server → cliente | `{ playId, roundNumber, totalRounds, sequence, length, displaySeconds, score }` |
| `sequence_phase_reproducing` | server → cliente | `{ playId, roundNumber, length, timeLimitMs }` |
| `sequence_card_result` | server → cliente | `{ type, uid, expectedUid, hint?, attemptsForCurrent, cursor, length, score, points }` |
| `sequence_round_result` | server → cliente | `{ playId, roundNumber, length, results, durationMs, completed, timedOut, score }` |

`type` en `sequence_card_result` puede ser `correct`, `incorrect`, `incorrect_with_hint`, `blocked` o `timedOut`. La pista (`hint`) sólo viaja cuando `type === 'incorrect_with_hint'` y tiene la forma `{ type: 'partial' | 'full', text }`.

### Orquestación cliente (`SequenceGameplayPanel`)

- Mantiene `sequence`, `length`, `phase`, `cursor`, `cardStatuses`, `highlightIndex`, `displaySeconds` y `roundNumber` como estado local.
- Al recibir `sequence_phase_memorizing`: muestra el board, dispara la animación signature de reparto (stagger 90 ms con spring), arranca el "highlight numerado" 1, 2, 3... y reproduce SFX `cardDeal` en cada aterrizaje.
- Al recibir `sequence_phase_reproducing`: oculta los números, abre la espera de scans, muestra el `PhaseTransitionOverlay` con cuenta atrás 2 s ("Reproduce la secuencia").
- Al recibir `sequence_card_result`: actualiza `cardStatuses[uid]` (correct/blocked/timedOut), avanza el `cursor`, muestra toast de pista si `hint` viene.
- Al recibir `sequence_round_result`: aplica los status finales, dispara la animación de recogida (stagger inverso) tras 500 ms, reproduce `cardSweep`, y espera a que el backend envíe el siguiente `sequence_phase_memorizing` o `game_over`.

### FallbackTouchPanelSequence

Cuando no hay sensor RFID, el alumno ve un panel táctil con todas las cartas del mazo (no se reordenan entre rondas — la pista espacial es importante). El cooldown anti-spam es de 250 ms, alineado con `useGameSocket.DEDUPE_MS_BY_SOURCE.touch_fallback`. El feedback visual de scan correcto / fallo se muestra en el board (no en el panel) cuando llega `sequence_card_result`.

### Reduced motion

El `SequenceBoard` consulta `useReducedMotion` y reemplaza:
- Reparto crupier → fade en cascada (50 ms stagger).
- Recogida crupier → fade salida directa.
- Highlight numerado animado → cambio de borde sin scale/pulse.

Los SFX se mantienen siempre (sound y motion son ejes a11y independientes según WCAG 2.5).

---

## Alertas inteligentes en tiempo real (T-941 / ADR-161)

Hasta T-941, el docente solo se enteraba de una alerta crítica si abría `/analytics/insights → Alertas`. T-941 conecta el motor de detección con la infraestructura de notificaciones realtime existente (T-955).

### Flujo end-to-end

1. **Worker BullMQ** `alertDetectionWorker` se ejecuta cada 15 minutos (`*/15 * * * *`, env `ALERT_DETECTION_CRON`) e invoca `alertDetectionService.runForAllTeachers()`.
2. Para cada docente, el orquestador ejecuta los 13 detectores en paralelo. Cada finding se reconcilia con las `SmartAlert` activas existentes (insert / update + severity escalation / auto-resolve).
3. **Cuando aparece una alerta `critical` nueva** — o cuando una `warning` se promueve a `critical` por escalation automática (≥ 7 días activa con ≥ 3 ocurrencias) — el servicio invoca `notificationService.notify({ type: 'student_at_risk', priority: 'critical', metadata: { alertId, studentId, alertType } })`.
4. `notificationService` aplica dedup window 60 s (Redis SET NX) y emite `notification:created` al room `user_${teacherId}` con DTO V1.
5. **Frontend** (`hooks/useNotifications.js`) recibe el evento, lo añade al panel y, si `type === 'student_at_risk'`, dispara un evento DOM custom:

   ```js
   window.dispatchEvent(
     new CustomEvent('smartalert:created', {
       detail: { alertId: payload.metadata?.alertId, payload }
     })
   );
   ```

6. **Dashboard** (`pages/Dashboard.jsx`) y **AlertsHub** (`pages/InsightsReports.jsx > AlertsTabContent`) escuchan el evento y refetchan las alertas sin recarga de página.

### Política "solo critical"

`warning` e `info` NO emiten notificación realtime. Razón: evitar fatiga del docente. Se actualizan en el siguiente refresco natural de la lista (cache `cache:alerts` TTL 60 s + cualquier acción lifecycle que invalide).

### Enlace contextual

El `link` de la notificación es `/students/<studentId>?alertId=<smartAlertId>`. Click navega al perfil del alumno; el `alertId` en query queda disponible para que una futura iteración abra directamente el modal `AlertHistoryModal`.

## Sprint 0 pre-v1.0.0 — Descomposición incremental de `GameSession.jsx` (ADR-164)

Tras la auditoría pre-v1.0.0 que identificó el componente como kitchen-sink (1847 líneas, 9 hooks personalizados, 4 mecanismos de feedback, 3 mecánicas de juego), se aplicó una descomposición **incremental** en lugar del split monolítico Container/View. Razones:

1. **El render JSX ya está bien compuesto**: cada mecánica se renderiza desde su propio sub-componente (`AssociationGameplayPanel`, `MemoryGameplayPanel`, `SequenceGameplayPanel`), el GameOver vive en `GameOverScreen`, la mascota en `CharacterMascot`, el touch fallback en `FallbackTouchPanel`. No hay duplicación lógica visible que se pueda extraer trivialmente.
2. **Los tests existentes son contrato, no isolation**: 636 líneas de `GameSession.test.jsx` cubren comportamiento end-to-end con socket simulado y eventos mockeados. Pasarlos NO garantiza que el refactor sea visualmente idéntico (timings, layouts).
3. **Prioridad real para v1.0.0:** que las 3 mecánicas se jueguen sin regresión y las estadísticas se recojan correctamente. Estilo de código es secundario.

### Lo que SÍ se extrajo (testeable como unidad pura)

- **`hooks/useGameSessionState.js`**: reducer + custom hook que expone `{game, dispatch, gameStateRef}`. El `gameStateRef` permite que los callbacks de socket lean el último valor sin re-suscripción.
- **`lib/finalSummary.js`**: `normalizeFinalSummary(metrics, score, correctAnswers, mechanicMode, gameStartTime, maxScore)` puro, sin dependencias React. Tests cubren las 3 mecánicas y los edge cases.

### Lo que NO se extrajo (diferido a Sprint 1)

- División Container (orquestación + side effects) vs View (render puro memoizable).
- Extracción de sub-componentes adicionales tipo `<GameSessionHUD>`, `<GameSessionBackdrop>`, `<GameSessionMascotPanel>`. Si en Sprint 1 hay margen para QA dedicada de las 3 mecánicas tras el split, se aborda. Mientras tanto, el archivo queda con `eslint-disable cyclomatic-complexity` documentado.

### Flujos no afectados

Los eventos socket (`new_round`, `validation_result`, `game_over`, `play_state`, `play_paused`, `play_resumed`, `sequence_phase_*`, `sequence_card_result`, `sequence_round_result`) y el flujo RFID (handlers en `useGameSocket` ya extraído desde antes) NO cambian de contrato. El refactor C2 parcial es transparente para el backend y el resto del frontend.

## Fiabilidad de escaneos y arranque de ronda (Auditoría de partidas 2026-07-02, ADR-225)

Correcciones tras jugar las 3 mecánicas en vivo (táctil + sensor simulado), centradas en el requisito «ni retrasos ni escaneos perdidos»:

- **`board_ready` para las 3 mecánicas.** El efecto que emite `board_ready` en `GameSession.jsx` cubre ahora también **Asociación** (antes solo Memoria/Secuencia). Sin él, el backend armaba el `roundTimer` de la ronda 1 de Asociación en el bootstrap y el niño perdía 1-3s de reloj mientras el frontend cargaba. El backend difiere el timer hasta `confirmBoardReady` (simétrico con Memoria); el frontend emite `board_ready` al renderizar el reto (`gameState==='playing'`).
- **Toast espurio «Tarjeta no reconocida» en Secuencia eliminado.** Los wrappers `wrappedOnSequenceCardResult`/`wrappedOnSequenceRoundResult` cancelan ahora el timeout client-side de 3s (como los de Memoria/Asociación). Antes, tras la última carta de cada ronda, saltaba el toast ~3s después aunque la carta se había aceptado.
- **Timeout de escaneo no se arma si el socket está caído.** `handleLocalScan` no programa el timeout de «Tarjeta no reconocida» cuando `!isGameSocketConnected()` (la lectura se encoló, no se perdió; el feedback correcto lo dan la cola + `scan_expired`).
- **Flush de scans encolados al reconectar `/game`.** `handleGameSocketReconnected` hace `flushPendingScans()` tras re-emitir `JOIN_PLAY` (la reconexión independiente del namespace `/game` antes solo re-unía la sala, dejando los scans varados hasta el siguiente escaneo hardware). *(ADR-237 refina el timing: el reenvío se **difiere** hasta el primer `play_state` posterior a `JOIN_PLAY` —modo RFID ya restaurado—; el flush inmediato llegaba con el modo en `idle` y se rechazaba con `RFID_MODE_INVALID`. Ver sección "Estado único del lector y rehidratación de Secuencia".)*
- **Dedupe reseteado al retirar la carta** (`webSerialService.js`): un `card_removed` invalida el cooldown del UID, de modo que reacercar la misma carta rápido (Secuencia con carta repetida) no se traga como chattering.

## Overlay de reconexión y timer congelado (ADR-225)

Cuando `realtimeStatus` no es `connected` durante `playing`:
- **El timer visual se congela** (`useGameTimer` recibe `isRealtimeConnected`): la barra no se vacía sola durante la reconexión y el niño no «gasta» la ronda. Al reconectar, el backend re-sincroniza `remainingTimeMs`.
- **Un overlay suave no-modal «Reconectando…»** cubre el tablero (para que el niño no siga tocando cartas cuyas respuestas no se enviarían) sin atrapar el foco (el docente sigue pudiendo pausar/salir desde el HUD).

## Asset de la carta de Memoria: carga-en-volteo y el bug de "imagen invisible" (ADR-225)

El backend **redacta** `displayData` de las cartas de Memoria boca abajo (`MemoryStrategy`, anti-trampa): una carta oculta llega al cliente con `assignedValue`/`displayData` a `null`. La URL de la imagen aparece **en el momento del volteo** (`memory_turn_state`), y ahí monta el `<img>` de `CardAssetPreview`. El cache del navegador ya está caliente por `prefetchDeckImages` (thumbnails del mazo, precargados al entrar en la partida), así que la imagen suele estar `complete` cuando la carta se voltea.

**Bug corregido:** `CardAssetPreview` ponía `imageLoading=true` (opacity-0) al aparecer la URL, pero para una imagen ya `complete` en cache el `onLoad` NO se vuelve a disparar → la imagen quedaba **cargada pero invisible** de forma intermitente (según el timing del cache). Fix: el efecto de cambio de URL consulta el nodo `<img>` real (`imgNodeRef`) y solo muestra "cargando" si la imagen NO está ya completa. Verificado: la firma `naturalWidth>0 + opacity:0` desaparece (0 casos tras el fix, 30 antes). Afecta a todo uso de `CardAssetPreview`, pero se notaba sobre todo en Memoria por la carga-en-volteo.

## Blindaje del arranque de partida — nunca un skeleton infinito (ADR-225)

Si el arranque falla, el docente NUNCA debe quedarse ante «Preparando cartas…» sin explicación (efecto «no entiendo qué ocurre»). El hook `useStartupGuard` (común a las 3 mecánicas) vigila el arranque mientras `gameState==='playing'` y el gameplay aún no está listo:

- **Señal `gameplayReady` por mecánica**: Memoria `memoryBoard.length>0`, Secuencia `sequenceState.length>0`, Asociación `Boolean(challenge)`.
- **Error fatal del backend**: `startPlay` emite un `error` con mensaje legible (tarjeta en uso, config/plan inválido, límite de partidas). Si llega durante el arranque → se muestra de inmediato. Los códigos transitorios (`SOCKET_DISCONNECTED`, `RATE_LIMITED`, `RFID_MODE_TAKEN_OVER`…) NO cuentan como fallo de arranque.
- **Watchdog**: si no llega tablero/reto NI error en 10 s, el arranque se considera colgado → mensaje genérico.

En ambos casos se pinta un **overlay `z-30`** (patrón del overlay de reconexión) con `ErrorState` + Otto (`mood="worried"`) + «Reintentar», tapando el skeleton. «Reintentar» limpia el estado y re-emite `start_play`.

**Causa raíz (backend, `GameEngine._reclaimOrphanedPlay`)**: una partida interrumpida dejaba sus tarjetas reservadas hasta 1 h. Ahora `startPlay`, ante un conflicto de tarjetas, reclama la partida en conflicto si está **huérfana** (sin cliente conectado en su sala, superada una gracia de 10 s) → el reintento del docente arranca solo. Una partida realmente en curso (con cliente) no se reclama.

## Fallback táctil gateado por el estado del sensor (ADR-225)

Regla de las 3 mecánicas: **el fallback táctil desaparece cuando el sensor está conectado y el RFID en juego** (se escanea la carta física) y **aparece cuando se pierde el RFID** (para poder seguir jugando). La señal es `rfidConnected` (`deviceState === 'ready'`), que ya se pone a false al desconectar el sensor (`handleDisconnect`) o degradar a `stale`.

- **Asociación**: `{!rfidConnected && <FallbackTouchPanel/>}` (las cartas de respuesta táctiles solo con el sensor perdido).
- **Secuencia**: `{!rfidConnected && phase === REPRODUCING && <FallbackTouchPanelSequence/>}`. El `SequenceBoard` es siempre solo-visualización (`onCardTap={null}`) para no filtrar el orden de la secuencia.
- **Memoria**: el tablero está SIEMPRE visible (es el juego), pero su interacción se gatea: `onCardTap={rfidConnected ? undefined : handleMemoryCardTap}`. Con el sensor activo las cartas no son tappables (sin cursor/tabIndex/click); al perder el RFID el tap se reactiva como fallback. (Antes el tap era incondicional — única mecánica inconsistente.)

## Estado único del lector y rehidratación de Secuencia (ADR-237)

### Fuente única de verdad del estado del lector (`useWebSerialDeviceState`)

`rfidConnected` (`deviceState === 'ready'`) proviene ahora del hook `frontend/src/hooks/useWebSerialDeviceState.js`, que **inicializa leyendo el valor ACTUAL del singleton `webSerialService`** y luego se suscribe a `device_state_change`/`status`. Corrige el indicador de "lector desconectado" permanente cuando el sensor ya estaba conectado antes de montar el componente (el evento `device_state_change` es *edge-triggered* y no reemite el estado ya vigente). Es la fuente única para sus cuatro consumidores: `RFIDConnector`, `RFIDModeHandler`, `RFIDScannerPanel` y `useGameSocket`.

### `mergeSequenceRehydration` en la reconexión de Secuencia

El backend **redacta** el snapshot de rehidratación por anti-fuga: las cartas ya jugadas llegan sin `displayData`. Aplicarlo a secas tras una reconexión repintaba esos assets del tablero como UID crudo. `frontend/src/lib/sequenceRehydration.js` (`mergeSequenceRehydration`) fusiona el snapshot con el tablero en vivo: el snapshot manda en el progreso (cursor/estados) y el estado en vivo conserva los assets ya revelados (solo posiciones con `uid` coincidente, evitando injertos entre rondas). Complementariamente, el reenvío de escaneos encolados tras una reconexión de `/game` se difiere hasta el primer `play_state` posterior a `JOIN_PLAY` (modo RFID ya restaurado) para no chocar con `RFID_MODE_INVALID`.
