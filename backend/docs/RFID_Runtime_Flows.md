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
- Emite comandos socket de intención (`join_card_registration`, `join_card_assignment`, `join_play`, etc.).
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

- `mode`: `idle | gameplay | card_registration | card_assignment`
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
   - card_assignment: room de asignación del usuario,
   - card_registration: room de registro del usuario.
6. En gameplay, GameEngine consume scan y emite eventos de juego.

---

## 6. Flujos por modo

## 6.1 Idle

Estado de reposo.

- No permite lecturas operativas para procesos de negocio.
- Un scan en este estado se rechaza (`RFID_MODE_INVALID`).

Uso típico: sin operación RFID activa, o tras `leave_*` / cierre de contexto.

## 6.2 Card Registration

Inicio:

1. Frontend emite `join_card_registration`.
2. Backend valida rol profesor/admin.
3. Backend une socket a `card_registration_<userId>`.
4. Backend fija modo `card_registration` y emite `rfid_mode_changed`.

Operación:

- Scan válido se ingesta y reenvía como `rfid_event` al room de registro del usuario.

Salida:

- `leave_card_registration` limpia estado y retorna a `idle`.

## 6.3 Card Assignment

Inicio:

1. Frontend emite `join_card_assignment`.
2. Backend valida rol profesor/admin.
3. Backend une socket a `card_assignment_<userId>`.
4. Backend fija modo `card_assignment` y emite `rfid_mode_changed`.

Operación:

- Scan válido se ingesta y se enruta a room de asignación.

Salida:

- `leave_card_assignment` limpia estado y retorna a `idle`.

## 6.4 Gameplay

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
| Entrar registro | Frontend profesor | rol + auth | `card_registration` | `rfid_mode_changed` | UI modo registro |
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
