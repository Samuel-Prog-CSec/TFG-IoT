# Flujo funcional: Mazo → Sesión → Mecánica (TFG IoT)

## 1. Objetivo del documento

Este documento describe **cómo funciona realmente** en la implementación actual:

- creación y edición de mazos,
- creación de sesiones de juego,
- uso de `assignedValue` y `displayData`,
- lógica de validación por mecánica,
- escenarios normales y casos límite.

Se redacta como referencia técnica para memoria de TFG y mantenimiento del código.

---

## 2. Conceptos clave

### 2.1 `displayData` vs `assignedValue`

- `displayData`: información visual/multimedia (emoji, imagen, audio, etiquetas).
- `assignedValue`: significado funcional de la carta para la lógica de juego.

Regla práctica:
- **UI muestra `displayData`**.
- **Backend decide corrección y semántica con `uid` y/o `assignedValue` según la mecánica**.

---

## 3. Flujo de creación de mazo

## 3.1 Qué hace el profesor en UI

En `DeckCreationWizard` el profesor:
1. selecciona tarjetas RFID,
2. selecciona contexto,
3. asigna un asset a cada tarjeta,
4. confirma y crea el mazo.

Durante el paso de asignación se guarda un mapa `cardAssignments[cardId] = asset`.

## 3.2 Cómo se genera `assignedValue`

Al construir el payload final (`buildCardMappingsPayload`), `assignedValue` se deriva así:

1. `assignedAsset.value`
2. si no existe, `assignedAsset.display`
3. si no existe, `card.uid`

Resultado por tarjeta en `cardMappings`:

```json
{
  "cardId": "...",
  "uid": "AA000001",
  "assignedValue": "España",
  "displayData": {
    "key": "spain",
    "value": "España",
    "display": "🇪🇸",
    "imageUrl": "...",
    "thumbnailUrl": "...",
    "audioUrl": "..."
  }
}
```

## 3.3 Qué valida el backend y por qué

Al crear/editar mazo se comprueba:

- número de tarjetas en rango permitido,
- `uid`, `cardId` y `assignedValue` no vacíos,
- unicidad de `uid`, `cardId` y `assignedValue` dentro del mazo,
- `assignedValue` debe existir en los assets del contexto,
- tarjetas referenciadas existen y están activas,
- consistencia `uid` declarado vs `Card.uid` en BD.

Motivo: evitar ambigüedad semántica, errores de juego y corrupción de mapeos.

---

## 4. Flujo de creación de sesión

## 4.1 Principio central

La sesión **no define manualmente** `cardMappings`: los sincroniza desde el mazo (`deckId`).

Esto garantiza que el significado de las cartas (`assignedValue`) sea consistente entre:
- creación de sesión,
- inicio de sesión,
- runtime de juego.

## 4.2 Datos que sí define la sesión

- `mechanicId` (en Sprint 4: asociación/memoria),
- `deckId`,
- `config` (tiempo, rondas, puntuación),
- `sensorId` (opcional),
- `boardLayout` (obligatorio en memoria).

## 4.3 Validaciones en create/update/start

- mecánica debe existir y estar activa,
- disponibilidad de mecánica controlada por feature flag (`SESSION_ENABLED_MECHANICS`) y por `rules.behavior.availability`,
- mecánicas marcadas `coming_soon` (ej. `sequence`) se rechazan en creación,
- `deckId` obligatorio,
- sincronización obligatoria desde mazo,
- `numberOfCards` queda ligado al tamaño del mapping real,
- `boardLayout` se valida contra tarjetas del mazo,
- en memoria, `boardLayout` debe cubrir todas las tarjetas y mantener grupos de matching válidos,
- antes de iniciar, la sesión vuelve a sincronizarse con el mazo.

Motivo: evitar bypass de frontend y mantener un contrato de sesión determinista.

---

## 5. Arquitectura de mecánicas y estrategias (lo implementado en Sprint 4)

## 5.1 Patrón Strategy usado por el motor

El backend usa un patrón Strategy para desacoplar la lógica por mecánica del `gameEngine`.

Contrato base (resumen):

- `initialize({ sessionDoc, playDoc, playState })`: estado inicial por partida.
- `selectChallenge(...)`: desafío de la ronda (o modo de juego).
- `isTurnBasedRound()`: si usa rondas clásicas (asociación) o flujo continuo (memoria).
- `getRoundDurationMs()` / `getPlayDurationMs()`: semántica de tiempo.
- `processScan(...)`: evaluación de escaneos cuando la mecánica lo requiere.

Beneficio de diseño: el engine conserva un flujo común de ciclo de vida, y cada mecánica implementa solo su comportamiento específico.

## 5.2 Flujo técnico de Asociación

### a) Inicialización

- La estrategia de asociación mantiene estado mínimo (`lastUid`) para reducir repetición inmediata.

### b) Selección de desafío

- Se elige una carta de `session.cardMappings`.
- Se evita repetir la misma carta consecutivamente cuando hay más de una opción.

### c) Evaluación de respuesta

- Condición de acierto principal: `uidEscaneado === uidEsperado`.
- Si acierta: suma `pointsPerCorrect`.
- Si falla: aplica `penaltyPerError`.

### d) Papel de `assignedValue`

- No decide el acierto en asociación (decide el `uid`).
- Sí se registra en eventos (`expectedValue`, `actualValue`) para trazabilidad semántica y analítica.

### e) Temporización

- Asociación es turn-based: cada ronda tiene timeout por `config.timeLimit`.
- Tras cada validación, el engine avanza con pequeño delay para feedback visual.

## 5.3 Flujo técnico de Memoria

### a) Inicialización de tablero

- Intenta cargar `boardLayout` persistido en `GameSession`.
- Si no es válido/completo, genera layout fallback con barajado.
- Construye estado interno: `boardLayout`, `revealedUids`, `matchedUids`, `selectedUids`, `attempts`, etc.

### b) Regla funcional de pareja

Dos cartas son pareja correcta si:

1. son cartas distintas (`uid` distintos), y
2. su `assignedValue` es igual.

Aquí `assignedValue` es el criterio semántico central del match.

### c) Ciclo de escaneo (2 pasos)

1. **Primer escaneo válido**
  - se revela una carta,
  - se emite `memory_turn_state` con fase `first_pick`.

2. **Segundo escaneo válido**
  - se resuelve match/mismatch,
  - se emite `validation_result`,
  - se emite `memory_turn_state` (`match` o `mismatch`).

3. **Si mismatch**
  - el engine espera `hideUnmatchedAfterDelayMs`,
  - vuelve a ocultar las cartas,
  - emite `memory_turn_state` con fase `concealed`.

### d) Condiciones de fin

- Fin por tiempo global de partida (no por timeout por ronda clásico).
- Fin por tablero completado (todas las parejas encontradas).

### e) Temporización y estado

- Memoria usa timer global (`playEndsAt`) en vez de timer por ronda tradicional.
- Pause/resume recalcula tiempo restante y rearma timeout global.

## 5.4 Eventos realtime relevantes de las dos mecánicas

Eventos comunes:

- `new_round`
- `validation_result`
- `game_over`
- `play_paused` / `play_resumed`

Evento específico de memoria:

- `memory_turn_state`: publica tablero parcial, cartas reveladas, parejas encontradas, intentos y tiempo restante.

---

## 6. Qué se trabajó en wizard + sesión para soportar estrategias

## 6.1 Wizard adaptativo por mecánica (T-056)

- Paso de reglas cambia según mecánica seleccionada.
- Asociación usa configuración general de rondas/tiempo/puntuación.
- Memoria añade configuración de tablero y requiere layout completo para continuar.

## 6.2 Persistencia de layout de memoria

- `CreateSession` puede enviar `boardLayout` inicial para memoria.
- `BoardSetup` persiste el layout antes de iniciar la partida.
- Reabrir setup recupera `boardLayout` guardado para continuidad.

## 6.3 Validaciones de consistencia relacionadas

- `boardLayout` sin slots duplicados.
- `boardLayout` sin tarjetas duplicadas.
- cada tarjeta de `boardLayout` debe pertenecer al mazo sincronizado.
- al resincronizar sesión con mazo, se podan entradas de `boardLayout` que queden inválidas.

---

## 7. Escenarios típicos

## 7.1 Escenario correcto (asociación)

1. Profesor crea mazo con asignaciones válidas.
2. Crea sesión con ese mazo y mecánica asociación.
3. Se inicia sesión y se sincroniza mapping del mazo.
4. Alumno escanea UID correcto.
5. Backend puntúa y persiste evento correcto.

## 7.2 Escenario correcto (memoria)

1. Profesor crea mazo con valores semánticos consistentes.
2. Crea sesión memoria con `boardLayout`.
3. Runtime compara `assignedValue` entre dos cartas escaneadas.
4. Si coinciden, se marcan como pareja; si no, se ocultan tras delay.

## 7.3 Escenarios de rechazo

- crear sesión enviando `cardMappings` manuales,
- `assignedValue` fuera del contexto,
- duplicados de `assignedValue` dentro del mazo,
- `boardLayout` con tarjetas no pertenecientes al mazo.

---

## 8. Qué se comprueba y por qué (resumen de diseño)

- **Integridad semántica**: `assignedValue` debe pertenecer al contexto.
- **Integridad estructural**: sin duplicados en mapeos y layouts.
- **Trazabilidad runtime**: eventos registran esperado/recibido y puntuación.
- **Consistencia temporal**: sesión se resincroniza con mazo en puntos críticos.
- **Seguridad funcional**: backend impone reglas aunque el frontend se manipule.

---

## 9. Implicaciones para el TFG

- El modelo de datos separa presentación (`displayData`) de lógica (`assignedValue`), lo que mejora mantenibilidad.
- La sincronización sesión←mazo reduce drift de configuración y simplifica auditoría.
- La estrategia por mecánica permite justificar decisiones de diseño (patrón Strategy + validación en borde + coherencia de dominio).

---

## 10. Checklist rápido para desarrollo futuro

Antes de introducir una nueva mecánica:

1. Definir condición de corrección (por `uid`, por `assignedValue` u otra).
2. Confirmar cómo se deriva/valida `assignedValue`.
3. Alinear wizard, contrato API y engine runtime.
4. Añadir tests de regresión de create session + runtime + socket events.
5. Actualizar esta documentación y la de API/WebSockets.
