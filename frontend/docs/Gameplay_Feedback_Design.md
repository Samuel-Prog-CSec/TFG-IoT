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
