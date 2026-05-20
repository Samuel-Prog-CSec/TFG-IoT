# RFID Runtime Flows (Autoridad, Secuencias y Errores Esperados)

## 1. Objetivo

Este documento describe **cómo funciona en runtime** el subsistema RFID tras la alineación frontend-backend de Sprint 4:

- Qué actor inicia cada acción.
- Quién tiene la autoridad final en cada estado.
- Cómo se enrutan los scans según modo.
- Qué validaciones se aplican y por qué.
- Qué errores de control son esperables en operación normal.

No sustituye al contrato de eventos, sino que lo complementa con una vista operacional.

---

## 2. Principio arquitectónico clave

### 2.1 Backend-authoritative mode state

El **backend** es la fuente de verdad del modo RFID por usuario.

- El frontend expresa intención (`join_*`, `leave_*`, `start_play`, etc.).
- El backend decide y publica estado canónico con `rfid_mode_changed`.
- El frontend consume ese estado y lo representa en UI.

Esto evita desalineaciones por inferencia local de ruta o por condiciones de carrera entre pestañas.

### 2.2 Single-owner por usuario/socket

Solo un socket activo por usuario puede operar lecturas RFID.

- Si otro socket toma control del modo, el anterior deja de ser owner.
- Cualquier scan desde socket no owner se rechaza con `RFID_SOCKET_NOT_ACTIVE`.

Objetivo: eliminar conflictos multi-tab y lecturas duplicadas o inconsistentes.

---

## 3. Actores y responsabilidades

## 3.1 Frontend (navegador del profesor)

- Lee datos del sensor vía Web Serial.
- Emite comandos socket de intención (`join_card_assignment`, `join_play`, etc.).
- Envía scans con `rfid_scan_from_client`.
- Escucha `rfid_mode_changed` y actualiza UI global de modo.

## 3.2 Capa Socket Backend

- Revalida auth y rol para eventos sensibles.
- Gestiona estado de modo por usuario y ownership por socket.
- Valida room, modo, ownership de play y consistencia de sensor.
- Ingiere evento en `RFIDService` solo si supera todas las validaciones.

## 3.3 RFIDService

- Bufferiza y metrifica eventos RFID.
- Reemite `rfid_event` interno para enrutado por rooms.
- No decide permisos, solo ingesta/propagación de evento ya validado.

## 3.4 GameEngine

- Procesa scans únicamente en modo `gameplay` y contexto de partida válido.
- Emite efectos de juego (`validation_result`, `new_round`, `game_over`, etc.).

---

## 4. Estado canónico de modo RFID

Evento servidor → cliente:

`rfid_mode_changed`

Payload:

- `mode`: `idle | gameplay | card_assignment`
- `sensorId`: sensor ligado al modo actual (o `null`)
- `metadata`: contexto adicional (por ejemplo `playId` en gameplay)
- `socketId`: socket owner activo
- `updatedAt`: timestamp servidor

Semántica:

- Se emite al conectar socket (estado inicial).
- Se emite en cada transición de modo.
- Se emite al ligar sensor por primera lectura válida.
- Se emite al limpiar estado y volver a `idle`.

---

## 5. Flujo general de un scan RFID

1. Frontend captura lectura física y envía `rfid_scan_from_client`.
2. Backend valida:
   - auth y rol del socket,
   - modo activo y room coherente,
   - ownership activo del socket,
   - autorización/consistencia de sensor,
   - ownership de partida (si aplica).
3. Si valida, backend llama `rfidService.ingestEvent({ event: 'card_detected', mode, ...payload })`.
4. `RFIDService` emite `rfid_event` interno.
5. Socket layer enruta por modo:
   - gameplay: room de play,
   - card_assignment: room de asignación del usuario.
6. En gameplay, GameEngine consume scan y emite eventos de juego.

---

## 6. Flujos por modo

## 6.1 Idle

Estado de reposo.

- No permite lecturas operativas para procesos de negocio.
- Un scan en este estado se rechaza (`RFID_MODE_INVALID`).

Uso típico: sin operación RFID activa, o tras `leave_*` / cierre de contexto.

## 6.2 Card Assignment

Inicio:

1. Frontend emite `join_card_assignment`.
2. Backend valida rol profesor/admin.
3. Backend une socket a `card_assignment_<userId>`.
4. Backend fija modo `card_assignment` y emite `rfid_mode_changed`.

Operación:

- Scan válido se ingesta y se enruta a room de asignación.

Salida:

- `leave_card_assignment` limpia estado y retorna a `idle`.

## 6.3 Gameplay

Inicio:

1. Frontend bootstrappea sesión/play real.
2. Frontend emite `join_play` + `start_play`.
3. Backend fija modo `gameplay` con metadata de `playId`.

Operación:

- Cada scan requiere coherencia de play y sensor autorizado para la sesión.
- Si pasa validaciones, GameEngine procesa y emite `validation_result` y avance de ronda.

Pausa/Reanudación:

- `pause_play` mantiene contexto.
- `resume_play` restaura modo gameplay preservando `metadata.playId`.

Salida:

- `leave_play`, cierre de partida o limpieza de contexto devuelven estado a `idle`.

---

## 7. Gestión de sensor (binding y consistencia)

Regla principal:

- El sensor se liga al modo/usuario en la primera lectura válida (`sensorId`).

Durante el mismo contexto:

- Si llega otro `sensorId` distinto, se rechaza para evitar drift de hardware no controlado.

En gameplay además:

- El sensor debe coincidir con el `sensorId` autorizado en runtime de la sesión.

Objetivo:

- Prevenir que un profesor altere accidentalmente la fuente física durante una ejecución activa.

---

## 8. Errores esperados (guardrails, no bugs)

> **Catálogo completo de códigos de error**: Ver [WebSockets-ExtendedUsage.md §6.2](WebSockets-ExtendedUsage.md#62-códigos-de-error) para la lista consolidada de todos los códigos de error WebSocket.

Estos códigos representan **rechazos de control intencionales** del contrato:

- `RFID_MODE_INVALID`: scan fuera de modo/room permitidos.
- `RFID_SOCKET_NOT_ACTIVE`: socket no owner activo del modo RFID.
- `RFID_MODE_TAKEN_OVER`: otro socket del mismo usuario tomó ownership.
- `RFID_SENSOR_MISMATCH`: cambia `sensorId` durante el contexto activo.
- `RFID_SENSOR_UNAUTHORIZED`: sensor no autorizado para esa sesión gameplay.
- `PLAY_NOT_ACTIVE`: el play no está activo en runtime.
- `FORBIDDEN`: rol/ownership insuficiente.
- `AUTH_REQUIRED`: sesión no válida.

Interpretación operativa:

- Si aparecen de forma puntual durante pruebas negativas, el sistema está protegiendo correctamente.
- Si aparecen de forma repetida en flujo “feliz”, revisar secuencia de comandos cliente y sincronización de estado UI.

---

## 9. Matriz de inicio de acción (quién dispara qué)

| Acción | Actor que inicia | Backend valida | Backend decide estado | Backend emite | Frontend reacciona |
| --- | --- | --- | --- | --- | --- |
| Entrar asignación | Frontend profesor | rol + auth | `card_assignment` | `rfid_mode_changed` | UI modo asignación |
| Entrar gameplay | Frontend juego | ownership + auth | `gameplay` + `playId` | `rfid_mode_changed` | UI en juego activo |
| Enviar scan | Frontend profesor | modo/room/owner/sensor | aceptar/rechazar | `rfid_event` o `error` | feedback/flujo |
| Salir modo | Frontend profesor | auth + room | `idle` | `rfid_mode_changed` | UI modo inactivo |

---

## 10. Referencias de implementación

- Socket handlers y validaciones: `backend/src/realtime/socketHandlers.js`
- Comandos socket (`join/leave`, `resume_play`, etc.): `backend/src/commands/socket/`
- Servicio RFID runtime: `backend/src/services/rfidService.js`
- Estados RFID: `backend/src/states/rfid/`
- Contexto frontend de modo: `frontend/src/context/RfidModeContext.jsx`
- Indicador UI de modo: `frontend/src/components/game/RFIDModeHandler.jsx`
- Flujo realtime de juego: `frontend/src/pages/GameSession.jsx`

---

## 11. Checklist rápido de depuración

1. Verificar recepción de `rfid_mode_changed` en cliente.
2. Confirmar que el socket que escanea es owner activo (`socketId`).
3. Validar que el cliente está unido al room correcto para el modo.
4. Comprobar consistencia/autorización de `sensorId`.
5. En gameplay, verificar `metadata.playId` y runtime activo del play.
6. Revisar código de error recibido antes de asumir bug de infraestructura.

---

## 12. Watchdog del modo RFID y heartbeat (auto-cleanup)

### 12.1 Motivación

Antes del watchdog, si un profesor cerraba el navegador sin disparar `leave_*`, el modo RFID quedaba "stuck" en memoria + Redis hasta el TTL de 1 h. Cualquier otro socket del mismo usuario recibía `RFID_MODE_TAKEN_OVER` en cadena durante todo ese tiempo.

### 12.2 Funcionamiento

- Constante: `RFID_MODE_IDLE_TIMEOUT_MS` (env, default 300000 ms = 5 min).
- Estructura: `Map<userId, NodeJS.Timeout>` (`rfidModeTimers` en `socketHandlers.js`).
- Refresco: `refreshRfidModeActivity(userId, socketId)` actualiza `updatedAt` en memoria y reprograma el timer. Se invoca desde:
  - `handleRfidScanFromClient` tras pasar todas las validaciones.
  - Handler `rfid_mode_heartbeat` (emitido por el cliente cada 60 s en `/game`).
- Cancelación: `clearRfidModeTimer(userId)` se llama en `clearRfidModeState` y al cambiar el modo a IDLE.
- Disparo: tras `RFID_MODE_IDLE_TIMEOUT_MS` sin actividad, el callback ejecuta `clearRfidModeState` y emite `rfid_mode_changed { mode: 'idle' }`. Log estructurado:
  ```
  WARN  Modo RFID auto-limpiado por inactividad { userId, mode, socketId, idleMs: 300000 }
  ```

### 12.3 Heartbeat cliente → servidor

Frontend (`socket.js`): tras conectar el namespace `/game`, arranca `setInterval(() => gameSocket.volatile.emit('rfid_mode_heartbeat'), 60_000)`. `volatile` evita encolar si el socket cae justo entre intervals.

---

## 13. Disconnect del namespace por defecto y leak de connectionCountByUserId

El middleware de auth (default namespace) incrementa `connectionCountByUserId[userId]` para enforcement de `MAX_CONNECTIONS_PER_USER`. El listener de `disconnect` decrementa de forma correlativa.

**Cambio crítico (2026-04-20)**: el listener de `disconnect` se registra ANTES de cualquier `await` en el handler de `connection`. Si la inicialización (`await getRfidModeState`) lanzase, el listener no se registraría y el contador quedaría huérfano (leak → bloqueo del usuario tras MAX reconexiones rápidas). El init del modo va dentro de `try/catch` con captura Sentry para evitar promesas no manejadas.

Helpers expuestos para tests:

- `incrementConnectionCount(userId)` / `decrementConnectionCount(userId)` / `getConnectionCount(userId)`
- `resetConnectionCountsForTests()`

Ver `backend/tests/realtime/connectionLifecycle.test.js`.

---

## 14. Path `play_interrupted` por error fatal

Cuando un escaneo encuentra un error irrecuperable durante la persistencia (`addEvent`/`addEventAtomic`), `GameEngine._emitFatalScanError` se encarga de:

1. Loguear con `logger.error` (contexto: playId, path, stack).
2. Capturar la excepción en Sentry (`tags: { module: 'gameEngine', path }`).
3. Emitir al cliente:
   ```json
   {
     "playId": "...",
     "reason": "internal_error",
     "message": "Error interno procesando el escaneo. La partida se ha interrumpido.",
     "finalScore": <score actual>
   }
   ```
4. Llamar `this.endPlay(playId)` graceful (capturando errores propios para no escalar).

Llamadores:

- `processResponse` (modo asociación) — fallo de `addEventAtomic`.
- `processMemoryScan` (modo memoria) — fallo de `addEvent` o `addEventAtomic`.
- `handleTimeout` — fallo de `addEventAtomic` al registrar el timeout.

Tests: `backend/tests/services/gameEngineRfidErrorPaths.test.js`.

---

## Ventana de gracia en transición de ronda (Asociación) — PROP-79 / ADR-089

### Problema

En partidas de Asociación con `timeLimit ≤ 15s` los scans del jugador llegaban al backend justo después de que el `setTimeout(handleTimeout, timeLimit*1000)` se hubiera disparado. El servidor marcaba la ronda como timeout y rechazaba el scan como `not_awaiting_response`, generando rondas "sin completar" pese a que el alumno había tocado la carta correcta dentro del tiempo visible.

### Solución

El `setTimeout` que arma el timer de timeout suma **`ROUND_GRACE_PERIOD_MS = 150`** al `timeLimit * 1000`. El cliente sigue mostrando "0 s" cuando expira el contador visible, pero el servidor concede 150 ms extra invisibles para absorber la latencia.

```
ronda inicia → cliente pinta timer (timeLimit s) → reloj llega a 0
                                                 │
                                  +150 ms grace ─┤ el server acepta scans
                                                 │
                                                 ▼
                                       handleTimeout dispara → ronda cerrada
```

### Métrica

`metrics.scansSavedByGracePeriod` cuenta los scans que llegaron en el buffer (entre `timeLimit` y `timeLimit + 150ms`) y por tanto habrían sido descartados sin la ventana. Visible vía `/api/admin/metrics`. Un crecimiento desproporcionado indica problema de latencia (red lenta) o de timing UI.

### Configuración

Variable de entorno `ROUND_GRACE_PERIOD_MS` (default `150`).

### Tests

`backend/tests/services/gameEngineObservability.test.js` — 3 cases (inicialización, incremento dentro del grace, NO incremento dentro del límite).

### Frontend complementario

`FallbackTouchPanel` muestra un overlay sutil "Procesando…" durante 200 ms tras cada tap del jugador para confirmar visualmente que el scan se ha registrado, evitando dobles taps por ansiedad.

## Graceful shutdown e impacto en partidas RFID (ADR-142)

Cuando Koyeb manda `SIGTERM` (rolling deploy, scale down, restart) el backend ejecuta una secuencia ordenada en `gracefulShutdown` (`backend/src/server.js`). Para partidas RFID en curso:

1. **`isReady = false` inmediato** — `/health/ready` empieza a devolver 503 y Koyeb deja de enrutar conexiones nuevas a esta instancia. Los clientes ya conectados siguen.
2. **`server_shutdown` emit por Socket.IO** — todos los sockets (default y `/game`) reciben el evento con razón y timestamp. El frontend lo recibe pero no lo trata explícitamente (TODO mejora futura: mostrar UI "Conectando con nueva versión…").
3. **Drain de 5s** — Tiempo para que los requests HTTP en vuelo terminen y los eventos Socket.IO se entreguen.
4. **`gameEngine.shutdown()`** — Cancela timers de ronda, persiste `GamePlay` con `status='paused'` para los plays activos (recovery posterior en el próximo boot).
5. **`rfidService.stop()`** — Cierra la conexión Web Serial (en el navegador cliente esto se traduce en pérdida del puerto; el frontend abrirá un nuevo prompt al reconectar).
6. **`rfidModeSubscriber` stop + BullMQ queues close**.
7. **`io.close()`** — Espera a que todos los sockets cierren.
8. **Mongo + Redis disconnect**.
9. **Sentry flush 2s** — para no perder eventos del último minuto.

Si la secuencia tarda más de 25s (`SHUTDOWN_TIMEOUT_MS`), un timeout duro fuerza `exit(1)` antes de que Koyeb envíe SIGKILL a los 30s.

**Impacto observable para el jugador:**
- Una partida activa pasa a `paused` automáticamente.
- Tras el deploy (~30-60s en Koyeb), el frontend reconecta y emite `play_state_sync`.
- `gameEngine.recoverActivePlays()` en el boot del nuevo proceso restaura los plays pausados.
- El docente ve "Partida reanudada" sin pérdida de progreso (excepto el último scan in-flight).

## 14. RFID mode lock con timeout duro (ADR-164, Sprint 0 pre-v1.0.0)

`executeWithRfidLock(userId, operation)` en `realtime/socketHandlers.js` ya serializaba operaciones RFID por usuario para evitar race conditions, pero sin timeout una operación colgada bloqueaba la cola del usuario indefinidamente.

**Pipeline actualizado:**

```
operation = setRfidModeState(userId, 'gameplay', socketId, metadata)
           ▼
     prevLock (Promise de la operación anterior, si existe)
           ▼
     await prevLock
           ▼
     Promise.race([
       operation(),                              // → resolución normal
       timeoutPromise(RFID_OPERATION_TIMEOUT_MS) // → reject con sentinel
     ])
           │
           ├─ resolved → emit rfid_mode_changed + libera lock
           │
           └─ rejected (sentinel) →
                runtimeMetrics.recordRfidLockTimeout()
                logger.error({alert:true, userId, timeoutMs}, 'lock timeout')
                logSecurityEvent('RFID_LOCK_TIMEOUT', {userId, timeoutMs})
                socketServerRef.to(`user_${userId}`).emit('rfid_mode_error', {
                  code: 'RFID_LOCK_TIMEOUT',
                  message: 'La operación RFID tardó demasiado y se ha cancelado. Vuelve a intentarlo.'
                })
                throw Error{code:'RFID_LOCK_TIMEOUT'}
                libera lock (siguiente operación arranca)
```

**Calibración:**
- `RFID_OPERATION_TIMEOUT_MS=10000` por defecto. Cubre con holgura la operación realista más cara: write Mongo (`gameSessionRepository.updateOne`) + Redis SET con TTL (`rfid:mode:<userId>`) + emit a room. Suele tardar <500ms en local con Atlas + Upstash.
- En QA permite simular timeouts más cortos (`RFID_OPERATION_TIMEOUT_MS=200`) para validar el flujo de error sin esperar 10s.

**Observabilidad:**
- Métrica `runtimeMetrics.websocket.rfidLockTimeouts` (snapshot vía `GET /api/metrics`).
- Evento `RFID_LOCK_TIMEOUT` en `securityLogger` con Sentry threshold 3/min (`SECURITY_EVENTS.RFID_LOCK_TIMEOUT.sentry`). Si la espiga es genuina (Mongo/Redis lentos), Sentry alerta tras 3 incidentes en una ventana de 60s.

**Sentinel pattern:**
La promise de timeout rechaza con un `Symbol` (`RFID_LOCK_TIMEOUT_SENTINEL`) en lugar de un `Error` con mensaje. Esto evita falsos positivos en el `catch` interno si la propia `operation()` lanza un `Error` cuyo mensaje contenga la palabra "timeout". Solo distingue por identidad exacta del símbolo.

**Tests E2E (QA Sprint 0):**
Para verificar el camino feliz vs el camino de timeout en el simulador RFID, inyectar `__rfidSim.delayMs=15000` antes de un `__rfidSim.detect()` y verificar:
1. `rfid_mode_error` llega al cliente con `code='RFID_LOCK_TIMEOUT'` y mensaje en español.
2. `GET /api/metrics` muestra `runtimeMetrics.websocket.rfidLockTimeouts >= 1`.
3. Una siguiente operación normal del mismo usuario no queda bloqueada por la fallida.
