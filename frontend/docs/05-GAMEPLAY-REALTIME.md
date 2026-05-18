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
