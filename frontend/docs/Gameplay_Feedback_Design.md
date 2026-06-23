# Diseño: Feedback Visual Mejorado en Gameplay

> Documento de diseño para la mejora del sistema de feedback visual durante las partidas.
> Fecha: 2026-03-11

## Problema

El sistema de feedback actual presenta las siguientes limitaciones:

1. **Overlay genérico full-screen** (`FeedbackOverlay`) que tapa toda la pantalla y hace que el niño pierda contexto visual de lo que acaba de hacer.
2. **Feedback idéntico para ambas mecánicas**: Association y Memory usan el mismo overlay con los mismos emojis/mensajes, sin aprovechar las diferencias de cada modo de juego.
3. **Mensajes estáticos sin variedad**: siempre "¡Genial!" para aciertos y "¡Sigue intentando!" para fallos, independientemente del contexto (racha, tiempo, ronda final).
4. **Mascota puramente decorativa**: el búho cambia de emoji (🦉→🥳→🤔) pero no aporta información útil ni tiene personalidad visual diferenciada.
5. **Diferenciación solo por color**: rojo/verde como único indicador de error/acierto, problemático para daltonismo.

## Decisiones de diseño

### 1. Feedback diferenciado por mecánica

Se elimina el overlay full-screen global. Cada mecánica gestiona su propio feedback de forma contextual:

- **Association**: El `ChallengeDisplay` (la card grande del reto) reacciona directamente con cambio de borde/glow, shake en fallo, y un badge pill flotante compacto con puntos y mensaje. El confetti se dispara desde el centro de la card (no pantalla completa) usando `canvas-confetti`.
- **Memory**: El feedback se integra en el tablero. Las cartas emparejadas pulsan y brillan; las no-match shaken y se ocultan. Un badge flotante aparece sobre las cartas emparejadas. La barra de stats reacciona con flashes de color.

### 2. Mascota híbrida emoji + SVG

El búho (🦉) se mantiene siempre como base para consistencia de identidad. La expresividad se logra con accesorios SVG superpuestos:

| Mood | Accesorio SVG |
|------|--------------|
| `idle` | Ninguno |
| `happy` | Sparkle-eyes |
| `encouraging` | Pompón animador |
| `celebrating` | Gorro de fiesta con estrella |
| `thinking` | Gafas redondas |
| `sad` | Tirita/bandita |

Los accesorios son SVGs inline simples (30-40px, 3-5 paths) con animaciones de entrada/salida via Framer Motion.

### 3. Mensajes contextuales inteligentes

Se reemplaza el sistema de mensajes estáticos por un selector que elige del pool apropiado según el estado del juego:

- **Rachas**: mensajes específicos para 3, 5 y 10 aciertos seguidos
- **Racha rota**: mensajes de ánimo diferenciados
- **Último reto**: frases de cierre
- **Presión de tiempo**: mensajes de urgencia
- **Fallos múltiples**: orientación pedagógica suave
- **Memory**: mensajes específicos de parejas y memoria

El selector evita repetir los últimos 3 mensajes mostrados.

## Arquitectura

### Flujo de datos

```
Socket Event (validation_result / memory_turn_state)
  │
  ▼
GameSession.jsx → useGameFeedback hook
  │── Selecciona mensaje contextual (feedbackMessages.js)
  │── Actualiza: feedbackState, points, message, mascotMood
  │── Dispara canvas-confetti (Association success)
  │
  ▼ Props flow
  ├── ChallengeDisplay (feedbackState, points, message)
  ├── MemoryBoard (feedbackPhase, points, message)
  └── CharacterMascot (mood, message contextual)
```

### Componentes nuevos

| Componente | Responsabilidad |
|-----------|----------------|
| `feedbackMessages.js` | Pools de mensajes + función selectora |
| `useGameFeedback.js` | Hook: estado de feedback, rachas, selección de mensajes |
| `FloatingPointsBadge.jsx` | Badge pill flotante reutilizable |
| `MascotAccessory.jsx` | Accesorios SVG para la mascota |

### Componentes modificados

| Componente | Cambio |
|-----------|--------|
| `ChallengeDisplay.jsx` | Acepta props de feedback, renderiza reacciones visuales |
| `CharacterMascot.jsx` | Emoji base fijo, accesorios SVG, mensajes contextuales |
| `GameSession.jsx` | Usa `useGameFeedback`, elimina `FeedbackOverlay` |

## Principios

- **Nunca punitivo**: los fallos usan tono coral suave, mensajes de ánimo, sin puntos negativos visibles en Memory
- **Contexto visual preservado**: el niño siempre ve qué acertó/falló
- **Accesible**: `aria-live` en badges, feedback no dependiente solo de color, soporte `prefers-reduced-motion`
- **Performance**: `canvas-confetti` con `disableForReducedMotion`, SVGs inline ligeros, animaciones Framer Motion existentes

## Estrategia de object-fit por contexto

| Contexto | Tamaño | Fit |
|----------|--------|-----|
| Thumbnails (≤56px) | xs-lg | `cover` |
| Cards de asset | full-width | `cover` |
| Display grande en juego (≥128px) | xl | `contain` |

## Verificación

- Build de producción sin errores
- Suite de tests GameSession.test.jsx pasa
- Partida Association: card reacciona, confetti desde card, badge flotante, mensajes variados
- Partida Memory: cartas pulsan en match, shake en mismatch, stats reactivos
- Overlay full-screen antiguo NO aparece
- Reduced motion: solo cambios de color
- Screen reader: resultado anunciado via aria-live
- Rachas 3+/5+: mensajes específicos de racha

---

## T-953 — Mascota emocional ampliada por mecánica + GameOver tier-aware (2026-05-09)

Documentado en ADR-118. Resumen de cómo la sesión 2026-05-09 amplía este sistema:

**Moods activos** (9 total, antes 6):
- Existentes: `idle`, `happy`, `encouraging`, `celebrating`, `thinking`, `sad`.
- Nuevos: `pointing` (gesto indexador), `worried` (oscilación + opacity, 5+ errores), `surprised` (pop one-shot, racha rota).
- "Greeting" se reusa de `idle` con prop `isFirstAppearance` (slide-in lateral 600ms).

**Accesorios SVG** (todos inline, ~3KB cada uno):
- Universales: PartyHat (celebrating), SparkleEyes (happy), CheerPom (encouraging), Bandage (sad), PointFinger (pointing), WorryDrop (worried), SurpriseExclaim (surprised), Glasses (thinking fallback).
- Mecánica-aware en `thinking`:
  - Memory → `BookGlasses` (gafas indigo + libro).
  - Association → `LinkPendant` (cadena cyan + eslabones).
  - Sequence → `RhythmHeadphones` (auriculares amber + notas).

**Diccionario por mecánica × evento** (`mascotDialog.js`):
- Eventos existentes: `roundStart`, `correctAnswer`, `errorAnswer`, `timeout`, `streakReached`, `gameOverHigh|Mid|Low`.
- Eventos nuevos: `streakBroken` (3 frases por mecánica), `worriedRebound` (3 frases), `greeting` (3 frases).
- Memory.timeout balanceado de 2 a 3 frases.

**Mecánicas de disparo en `useGameFeedback`**:
- Acierto + streak ≥ 3 → `celebrating` + `streakReached`.
- Acierto normal → `happy` + `correctAnswer`.
- Error con racha previa ≥ 3 → `surprised` + `streakBroken`.
- Error con totalErrors ≥ 5 y streak=0 → `worried` + `worriedRebound` (cooldown 8s).
- Error puntual → `encouraging` + `errorAnswer`.
- Timeout → `sad` + `timeout`.
- **Micro-celebración**: cada 5 aciertos consecutivos → burst tintado mecánica sin cambiar mood.

**Fix QA crítico**: `mechanicType` se lee vía `mechanicTypeRef.current` dentro del callback. Antes los listeners de socket Secuencia capturaban el `mechanicType: 'association'` inicial.

**GameOver tier-aware**: la mascota se renderiza grande (escala 1.4x) en bottom-left del overlay con mood + frase derivados del tier de estrellas. El backdrop `glowB` se tinta con el accent de la mecánica (excepción: Sequence + 3⭐ usa `accent-orange` para no chocar con warning-amber del Trophy).

**FeedbackOverlay per-mecánica**: copy ("¡Pareja!", "¡Conexión!", "¡Ritmo!"), iconos Lucide hero (Brain/Link2/ListOrdered), particles tintados con `accentHexFallback`. Floating elements migrados de emojis Unicode a iconos Lucide.

**Sound effects** (Web Audio nativo, 0KB extra):
- `playMascotChirp()` — pajarito greeting (E6/G6).
- `playStreakSparkle()` — arpegio C6→C7.
- `playGameOverFanfare(stars)` — escalado 0⭐ silencio / 1⭐ pop / 2⭐ arpegio / 3⭐ fanfare 1.5s.

## Sprint 0 pre-v1.0.0 — Mascota gated por viewport (ADR-164, M3)

`CharacterMascot.jsx` ahora combina `useReducedMotion()` con `useInView(containerRef)` de Framer Motion para decidir si las animaciones `repeat: Infinity` están activas. Sin esto, el alumno terminaba la partida, navegaba a GameOver y la mascota seguía floateando en background gastando CPU/rAF aunque no se viera.

**Comportamiento:**
- Mascota visible + sin reduced-motion → loop normal según `mood` (float / bounce / jump / nod / tilt / sway / pointRight / wobble).
- Mascota fuera de viewport O reduced-motion activo → estado estático `{x:0, y:0, scale:1, rotate:0}`. Sin rAF, sin recálculo.
- Las decoraciones `celebrating` (Star/Sparkles) solo se renderizan cuando `animationsActive`. Antes condicionaban solo en `!shouldReduceMotion`.

**Leitmotiv "Tactile RFID + Paper" preservado:** la mascota sigue siendo expresiva y reactiva (mood cambia con resultados de ronda); solo se detiene cuando el alumno no la ve. La integración con `useGameFeedback` (mensajes contextualizados por mecánica) no cambia.

**Mensaje sin bocadillo (`noBubble`):** Onboarding y otros sitios donde la mascota se usa como ilustración decorativa siguen pasando `noBubble={true}` para suprimir el speech bubble sin perder la animación facial expresiva del mood. Mantenido desde ADR-163.

## Otto — rig SVG paramétrico + biblia de personaje (ADR-204)

La mascota es ahora **Otto** (de *Otus*, género de búho): un personaje **100% SVG paramétrico** que sustituye al emoji 🦉 + accesorios. Render idéntico en cualquier navegador y **expresión facial real** (ojos/párpados/cejas/pico que cambian) en los 9 moods. Geometría canónica aprobada en `docs/plans/mascota-owl-model-sheet.html`.

**Arquitectura.** `components/game/mascot/owlParts.jsx` (capas SVG) + `owlExpressions.js` (tabla declarativa `EXPRESSIONS[mood]` → ojos/cejas/pico/mejillas/alas/props/animación). `CharacterMascot.jsx` orquesta bocadillo + halo + `<OwlCharacter>` + gating; **API pública estable** + prop `size` (sm/md/lg, **ancho fluido `clamp()` por viewport** → vectorial, nítido y proporcionado de 720p a 4K). Identidad índigo fija (constantes OKLCH); props temáticos `var(--color-*)` (adaptan light/dark); gradientes namespaced con `useId` (varios Ottos coexisten). `MascotAccessory.jsx` eliminado.

**Biblia de personaje (voz de Otto).**
- **Rol:** mentor cálido y juguetón. Acompaña, anima, celebra el esfuerzo. NUNCA regaña, asusta ni culpa: el error es siempre "casi" / "otra vez" / "mira de nuevo".
- **Voz:** frases cortas (≤5 palabras), español, vocabulario 4-8 años; mayúsculas solo para celebración grande; sin emojis en el texto.
- **Gestos firma:** parpadeo periódico, micro-respiración, salto de celebración, pompones de ánimo, gota de sudor *tierna* al preocuparse (por el niño, no para reprochar).

**Capa de vida — momentos curados** (amplía el "cerebro" del ADR-D por petición; cooldown para no saturar). Matriz disparador → mood → pool de frases (fuente de verdad):

| Disparador | Mood | Pool (`mascotDialog.js`) |
|---|---|---|
| Inicio 1ª ronda | idle | `roundStart` |
| Primer acierto de la partida | happy | `firstCorrect` |
| Acierto normal | happy | `correctAnswer` |
| Racha ≥3 | celebrating | `streakReached` |
| Racha rota (venía ≥3) | surprised | `streakBroken` |
| 5+ errores y racha 0 | worried | `worriedRebound` |
| Error puntual | encouraging | `errorAnswer` |
| Timeout | sad | `timeout` |
| Última ronda | encouraging | `nearWin` |
| Secuencia · memorizar | thinking | `memorizing` |
| Secuencia · reproducir | pointing | `reproducing` |
| Inactividad ~8s (turno del alumno) | pointing | `idleNudge` (cooldown 12s) |
| GameOver por tier (0/1/2/3⭐) | worried/encouraging/happy/celebrating | `gameOverLow/Mid/High` |

Implementación: métodos señal en `useGameFeedback` (`signalSequencePhase`, `signalRoundStart`, `signalIdleNudge`) + `firstCorrect` dentro de `processValidationResult`, cableados en los handlers de socket de `GameSession`. Frases contextuales por mecánica en `mascotDialog.js`.

## Otto — continuidad del rig, reacción en Memoria y bocadillo efímero (ADR-209)

**Continuidad sobre teletransporte.** El rig facial dejó de envolverse en `<AnimatePresence mode="wait">` keyed por `mood` (que borraba ojos/cejas/pico ~0.22-0.44 s en cada cambio y desincronizaba el ala/prop). Ahora la base + cara + props quedan **montados permanentemente** y cada slot transiciona en el sitio: pupila por muelle (`cx/cy`), ojos por **parpadeo-swap**, cejas por morph de `d`, pico/mejillas/alas por crossfade (`AnimatePresence` por variante, sin `mode="wait"`), props con su propio `AnimatePresence` solapado. La cara NUNCA se borra.

**Reacción en Memoria (disparador que faltaba).** El backend emite `memory_turn_state` (no `validation_result`), por lo que la mascota no reaccionaba a las parejas. Nueva señal `signalMemoryResult(isMatch)` (mascot-only, no toca el feedback de tablero) cableada en `handleMemoryTurnState`:

| Disparador | Mood | Evento |
|---|---|---|
| Memoria · pareja correcta (`match`) | happy / celebrating (racha) | `correctAnswer` / `streakReached` |
| Memoria · fallo de pareja (`mismatch`) | encouraging / surprised (racha rota) | `errorAnswer` / `streakBroken` |

**Bocadillo efímero.** Prop `bubbleTimeout` en `CharacterMascot`: en partida la frase se auto-oculta (~3,6 s) manteniendo el mood facial → ninguna frase queda "fuera de lugar". Ambiental (login/empty) la omite.

**Mirada ambiental.** `useAmbientGaze` desliza la pupila en moods de reposo (idle/thinking), baja frecuencia aleatorizada, pausada fuera de viewport y en reduced-motion.

**Presencia ampliada.** Reusando la API de `CharacterMascot`: estados vacíos (slot `mascot` de `EmptyState`), Login/Register, errores (NotFound, `ErrorBoundary`, slot `mascot` de `ErrorState`) y previa de partida (`StepReview`).
