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

## Métricas en partida veraces y animación de puntos bidireccional (ADR-210)

**Barra de métricas inferior (`CurrentPlayMetrics`) — un dato, una etiqueta, sin duplicar la cabecera.** La cabecera ya muestra puntuación (marcador) y progreso (Ronda X/N o Parejas X/Y + dots). El footer mostraba el mismo `correctAnswers` en dos pills y, en Secuencia, lo etiquetaba **"Ronda"** (de ahí que "Ronda" subiera con los aciertos: era la misma variable). Rediseño a tres métricas de rendimiento **distintas por mecánica**, con la etiqueta siempre coherente con su valor:

| Mecánica | Pill 1 | Pill 2 | Pill 3 |
|---|---|---|---|
| Secuencia | Cartas correctas (`correctAnswers`) | Fallos (`totalErrors`) | Racha (`streak`) |
| Asociación | Aciertos (`correctAnswers`) | Fallos (`totalErrors`) | Racha (`streak`) |
| Memoria | Parejas (`correctAnswers`) | Intentos (`memoryStats.attempts`) | Fallos (`totalErrors`) |

Se elimina el pill "Puntos" (lo lleva el marcador de la cabecera). `Fallos` = `totalErrors` agrega respuestas incorrectas + sin responder (timeout); el desglose preciso vive en el GameOver (Incorrectas / Sin responder).

**Animación de puntos bidireccional (`ScoreDisplayCompact`).** El delta del marcador solo animaba sumas (`delta > 0`), así que una penalización bajaba la cifra **sin animación de resta**. Ahora se anima cualquier `delta ≠ 0`: acierto → verde, `+N`, flota hacia arriba; **penalización → rojo (`text-error-base`), `−N`, flota hacia abajo** (refuerza la pérdida). Se mantiene el clamp del marcador a 0 (QA 04/05) y se respeta `prefers-reduced-motion`. Coherencia: `MemoryBoard` muestra el badge flotante también en error (antes solo en acierto) y `FloatingPointsBadge` formatea el signo de resta de forma inequívoca (`−N`; sin número si `points === 0`, p. ej. timeout o sin penalización configurada).

**Etiquetas de GameOver.** Pequeño ajuste de claridad: Secuencia "Incompletas" → "Parciales". Los tooltips siguen aportando la definición exacta. Además se elimina el **fallback legacy de 3 columnas** de `GameOverStatsAssociation` (rama `errors == null`): `normalizeFinalSummary` siempre produce un `errors` finito, así que esa rama era inalcanzable. El bloque de Asociación muestra siempre las 4 columnas (Incorrectas / Sin responder / T. medio / Tiempo).

**Limpieza.** Se borra `FeedbackOverlay.jsx` (el antiguo overlay de feedback a pantalla completa, ya sustituido por el feedback en sitio de `ChallengeDisplay`/`MemoryBoard` + `useGameFeedback`): no se importaba ni renderizaba en ningún sitio (solo quedaba un `vi.mock` obsoleto, también retirado).

## Otto — transiciones del rig sin hueco y ala de señalar (ADR-211)

ADR-209 hizo la cara **persistente** (los slots ya no se desmontan), pero la calidad **en movimiento** seguía rota: tres defectos que se percibían como "los accesorios desaparecen al cambiar de mood". El test de persistencia (estructura) era ciego a esto — en jsdom el `exit` no completa, así que un slot puede pasar por opacidad ~0 en la app real y el test seguir en verde. Se diagnosticó con **muestreo de frames** (opacidad/alto por slot a ~60 fps) sobre un harness temporal.

**1. Crossfade asimétrico (anti-hueco).** Los timings del crossfade de pico/alas/mejillas estaban **invertidos**: el entrante subía lento (`SLOT_FADE_IN` 0.2 s) y el saliente bajaba rápido (`SLOT_FADE_OUT` 0.14 s), así que al cruzarse el elemento más visible caía a ~0.45 de opacidad → parpadeo. Ahora **entrante rápido (≈0.12 s) / saliente lento (≈0.28 s)**: siempre hay una forma casi sólida presente (peor-caso ~0.66). Regla: en un cross-dissolve entre dos estados del MISMO rasgo, el objetivo es no-dip → enter-rápido/exit-lento (a diferencia de un elemento que simplemente entra o sale).

**2. Morph de ojos en la familia redonda.** `open/wide/narrow` comparten estructura → sus **radios animan** (`EYE_MORPH`) sin pestañeo (la mayoría de transiciones en partida). El **parpadeo-swap se reserva** para `closedSmile` (happy) y `droopy` (sad), formas realmente distintas, donde además es un gesto de búho con carácter. Antes el ojo se cerraba a 1–6 px en cada cambio (leído como "ojos que desaparecen"); ahora se mantiene ~43–45 px salvo el pestañeo intencional de happy/sad.

**3. Ala de señalar (recuperada de la hoja de modelo).** El estado `pointing` debía dibujar un **ala/brazo índigo extendido** hacia la flecha; el rig sólo tenía el ala de reposo y la flecha ámbar flotaba suelta (la queja recurrente "el ala que desaparece al señalar"). Ahora el brazo extendido + la flecha se dibujan juntos en el prop `arrow` (sobre el cuerpo, co-animados): Otto adelanta el ala y señala. Test de regresión estructural en `CharacterMascot.persistence.test.jsx` para que no vuelva a perderse.

**Menor.** `propIn` (entrada de props) lleva `transform-box: fill-box` → los accesorios crecen desde su propio centro, no desde el origen del viewBox.

## Integridad del feedback de partida (ADR-221)

Auditoría de las tres mecánicas; correcciones del feedback en juego:

- **"Fallos" contaba el DOBLE en Memoria.** El backend emite por pareja TANTO `validation_result` COMO `memory_turn_state`; el frontend incrementaba racha/errores en AMBOS caminos (`processValidationResult` y `signalMemoryResult`) sobre los mismos refs → el footer "Fallos" mostraba el doble y la mascota escalaba a la mitad de aciertos. En Memoria, `signalMemoryResult` es ahora el dueño ÚNICO de racha/errores/mascota; `processValidationResult` se corta tras fijar el feedback de tablero. (El comentario que afirmaba que Memoria NO emite `validation_result` era falso y causaba el doble conteo.)
- **Estrellas ≠ badge ≠ backend.** Las estrellas del GameOver se calculaban por accuracy (`correctAnswers/totalRounds`), divergiendo del badge de puntuación y del backend (`score/maxScore`); con penalización por error podían aparecer 3⭐ junto a un badge "52%". Se unifican a `score/maxScore` (estrellas, badge, sonido de victoria y notificación al docente: un único número).
- **Hero del GameOver con unidades mezcladas en Secuencia.** Mostraba `correctAnswers` (cartas) sobre `totalRounds` (rondas) → "7 / 3". Ahora "Secuencias / Total" de rondas.

Ver ADR-221 para el resto del pase (fuga del orden en el tablero táctil de Secuencia, paneles táctiles sin recorte a 12 cartas, reanudaciones de Secuencia/Memoria, anuncios de lector de pantalla por mecánica).

## Otto como guía-narrador del onboarding (ADR-212)

Antes la mascota en el onboarding (`OnboardingOverlay.jsx`) iba `absolute` en la esquina inferior izquierda → **tapaba "Atrás" y la nota**; solo aparecía en los pasos `modal` (no en los `spotlight`) → **intermitente**; y con `noBubble` + `pointing` era un **búho mudo señalando al vacío**. Rediseño a guía-narrador:

- **`MascotGuide`** (componente compartido): Otto (`sm`) + bocadillo A SU LADO + mood. Lo usan los pasos modal y spotlight → Otto presente y consistente en TODO el tour. El bocadillo lo dibuja `MascotGuide` (no el interno de `CharacterMascot`, que ancla arriba). `aria-hidden`.
- **Modal**: banda de cabecera (Otto + bocadillo / saltar) EN FLUJO → sin solape. Icono temático **pequeño** junto al título (el hero grande se retira; Otto es el ancla visual).
- **Spotlight**: la cabecera-guía en el tooltip, `pointing` **orientado al elemento resaltado** (`flip` cuando el target queda a la izquierda; `thinking` si el tooltip cae debajo). El señalar por fin apunta a algo real.
- **Voz**: `mascotLine` + `mascotMood` por paso (ambos tracks) en `onboardingTracks.js`; default derivado en `onboarding/mascotForStep.js` (paso 0 → `greeting`, último → `celebrating`, spotlight → `pointing`, resto modal → `thinking`).
- **Gesto nuevo `greeting`** (saludo con el ala): mood de bienvenida (variante de ala `wave` animada). `happy` es "contento", no "hola".

**Adenda 1 — Otto invisible en superficies `isFirstAppearance` + centrado.** Otto no se veía (solo el bocadillo) en login, registro y el **paso 1** del tour (las que pasan `isFirstAppearance`). Causa: el `motion.div` del cuerpo conflaba **entrada y bucle corporal en un solo `animate`**; el `initial` fija `{x:±60, opacity:0}` pero `bodyAnimation[bodyAnim]` (float/sway) no declara `x`/`opacity` → Framer las congela en el inicial → Otto invisible y a la izquierda. **Regla:** un `initial` con `opacity`/`x` exige que TODO `animate` posterior las declare, o se congelan. **Fix:** dos wrappers — externo = entrada (siempre resuelve a `{x:0, opacity:1}`), interno = bucle corporal (y/scale/rotate, nunca opacity). En la cabecera modal, además, Otto se **centra**: saltar `[X]` pasa a `absolute` (esquina sup-dcha) y `MascotGuide` gana modo `stacked` (`flex-col-reverse`: **bocadillo arriba, Otto debajo**, centrados, pico hacia abajo).

**Adenda 2 — pulido de la mascota.** (1) **Pico del bocadillo siempre a la IZQUIERDA** (convención de cómic): en `stacked` pasó de centrado a `left-5`. (2) **El Otto del login SALUDA**: `idle`→`greeting` (ala `wave` + "¡Hola!"); `rotatingMessage` habilitado para `greeting`; `wave` con `repeatDelay:2` (periódico). (3) **Login/registro: Otto se asoma hacia el formulario** (se ancla al borde del hero del lado del form). (4) **El gesto de los pompones (`encouraging`) se lee como "alas extendidas sujetando los pompones"**: las DOS alas levantadas hacia arriba y hacia fuera —como el ala del saludo, pero ambas, mayormente fuera de la silueta del cuerpo para que se vean bien— con un pompón posado en cada PUNTA. **Nota:** los pompones son del mood **`encouraging`** (no `celebrating`, que usa estrellas). Validado en navegador real (jsdom no detecta el congelado de opacity).

## Pulido "producto premium" — Otto en auth, ala con pivote real, objetivo/pistas sin filtrar la respuesta (ADR-227)

Cierre de pulido UI/UX. Cambios de feedback/mascota:

- **Otto en login/registro → `AuthMascotPeek`** (reemplaza el "Otto anclado al borde del hero" de ADR-212 adenda 2). Otto vive DETRÁS de la tarjeta (z-0) y **se asoma al enfocar un campo**: `peek` (cara + bocadillo contextual por campo) o `duck` (al enfocar contraseña se agacha, solo orejas, "no miro"). Asoma por la esquina **opuesta al obstáculo** (login izquierda ↔ toggle de tema; registro derecha ↔ enlace "Volver") y el bocadillo sale hacia el lado libre; la colita siempre apunta a Otto. Respeta reduced-motion.
- **Ala del saludo con pivote fijo REAL.** El giro se aplica como **atributo SVG `transform="rotate(θ 153 146)"`** escrito a mano desde un `MotionValue` (`.on('change')` + `setAttribute`), NO con `transform-box`/`transform-origin`. Motivo: `fill-box` recalcula el origen (bounding box) al rotar → la articulación "flotaba"; `view-box` no anima con Framer. Con `(cx,cy)` absoluto del viewBox el punto de giro es 100% estable. **Gotcha:** Framer aplica un `MotionValue` en `transform` de `motion.g` como CSS `style.transform`, no como atributo SVG, y `rotate(θ cx cy)` no es CSS válido.
- **El objetivo de Asociación NO revela la respuesta.** `ChallengeDisplay` deja de pintar la imagen del asset correcto y muestra un **"?" estilizado y animado** (carta boca abajo); la consigna/nombre de abajo es la pista legítima.
- **Pistas de Secuencia sobre la carta, fijas.** El valor esperado ofuscado (`L?ó?`) deja de ser un toast efímero de esquina: viaja al `SequenceBoard` y se pinta FIJO sobre la carta de la posición actual (cursor), con `?`→`_`; se retira solo al avanzar de posición o cambiar de ronda (sin temporizador).
- **Bocadillo de partida fijo.** Se retira el `bubbleTimeout` de 3.6s en `GameSession`: el bocadillo persiste y cambia únicamente cuando `useGameFeedback` actualiza el mensaje por evento.
- **La carta es la tarjeta física (blanca).** `CardAssetPreview` usa `--color-card-surface` (blanco en ambos temas, es un objeto físico MIFARE) en vez del `dominantColor`; el texto de respaldo usa `--color-card-ink` (tinta oscura fija, legible sobre blanco en dark).

Verificado en vivo (Playwright, dark 1366×768) con medición de posiciones (bocadillo vs "Volver") y de la animación del ala (ángulo variable, pivote constante `153 146`). Vitest 674/674.
