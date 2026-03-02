# Gameplay Realtime - Association y Memory

## Objetivo

Documentar el comportamiento funcional de la pantalla de partida (`GameSession`) en modo productivo, conectada por Socket.IO al backend y sin flujos simulados.

## Principios de diseño aplicados

1. **Socket-first en gameplay**: las acciones de partida (`join/start/pause/resume`) se ejecutan por eventos realtime.
2. **Sin fallback REST en runtime de juego**: pausa/reanudación requiere canal socket activo.
3. **UI por mecánica**: Association y Memory comparten layout general, pero renderizan bloques de juego distintos.
4. **Métricas visibles + persistencia backend**: se muestran métricas de partida actual y resumen final, manteniendo el registro completo para dashboards.

## Eventos de juego consumidos

### Comunes

- `new_round`
- `validation_result`
- `play_paused`
- `play_resumed`
- `game_over`
- `play_state`
- `error`

### Específico de Memory

- `memory_turn_state`

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

## Verificación local

```bash
npm run test
npx eslint src/pages/GameSession.jsx src/pages/__tests__/GameSession.test.jsx vitest.config.js src/test/setup.js
```
