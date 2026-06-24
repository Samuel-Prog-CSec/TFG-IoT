# Diseño: Mascota búho con rig SVG paramétrico

> Documento de diseño (brainstorming) · 2026-06-09
> Estado: **aprobado**, pendiente de plan de implementación.
> Geometría canónica de los 9 estados: [`mascota-owl-model-sheet.html`](./mascota-owl-model-sheet.html) (abrir en navegador).

---

## 1. Problema

La mascota actual (`CharacterMascot.jsx`) usa el **emoji 🦉** como base y superpone accesorios SVG por mood. Limitaciones para un estándar profesional:

1. **Render inconsistente entre plataformas**: el emoji del búho se dibuja distinto en cada SO/navegador (Windows, Apple, Android…). Un personaje de marca no puede depender de la fuente de emojis del sistema.
2. **La cara nunca cambia**: la expresividad se finge con accesorios "pegados" encima (gota, gafas, gorro). El búho no emociona de verdad (ojos, cejas, párpados, pico).
3. **Techo de calidad bajo**: solo se puede mover/escalar/rotar el bloque del emoji; no hay rig real.

El **"cerebro"** del sistema (selección de mood y frase por mecánica × evento × tier en `useGameFeedback` + `mascotDialog.js`, bocadillo, sonidos, gating por viewport/`reduced-motion`) está bien y **se conserva**. Lo que se sustituye es la **capa de identidad y render**.

## 2. Objetivo

Sustituir el emoji por un **personaje a medida**, dibujado **100% en código (SVG por capas, rig paramétrico)**, con render idéntico en todos los navegadores y **expresión facial real** en los 9 moods existentes. Entregable end-to-end sin ilustrador ni herramientas externas.

## 3. Decisiones cerradas en brainstorming

| Decisión | Resultado |
|---|---|
| **Producción** | SVG a medida en el repo, rig por capas. (Descartado: Rive / Lottie). |
| **Alcance** | Gameplay + GameOver + **presencia en la app** (onboarding, empty states, micro-celebraciones de hito) — recoge PROP-74. |
| **Dirección de arte** | Render "suave ilustrado" (degradados, sombra, ojos con brillo) + **orejas de pico** triangulares. |
| **Temperamento** | **Mentor sereno** (sabio, calmado, premium; no cansa en partidas largas). |
| **Hoja de expresiones** | 9/9 estados validados visualmente (ver hoja de modelo). |
| **Arquitectura** | Rig **paramétrico** (tabla declarativa de expresiones). Descartado: un componente-pose por mood. |
| **Accesorios por mecánica** | **Retirados**. La identidad de mecánica se mantiene con el halo tintado + las frases del diccionario. |
| **Identidad cromática** | Cuerpo **índigo fijo** = identidad del personaje; el acento de mecánica vive solo en el halo (como hoy). |

## 4. El personaje

Búho de cuerpo redondeado (squircle) sobre `viewBox 0 0 200 215`. Anatomía por capas (de fondo a frente):

- **Sombra** de suelo (elipse, opacidad baja).
- **Orejas de pico** (2 triángulos).
- **Alas** de reposo (2 elipses laterales).
- **Cuerpo** (`rect` redondeado, degradado vertical claro→oscuro).
- **Brillo de cabeza** (elipse blanca, opacidad ~10%).
- **Barriga** (elipse, degradado radial claro).
- **Cara**: ojos (blanco + iris con degradado radial + brillo), **párpados** (cuando aplica), **cejas**, **pico** (con sombra), **mejillas** (cuando aplica).
- **Patas** (2 grupos de garras ámbar).
- **Props por estado** (ver tabla).

### 4.1 Los 9 estados (tabla de expresión)

| Mood | Disparador (hook) | Cómo emota (cara + props) |
|---|---|---|
| `idle` | reposo / greeting | Mirada serena, cejas calmadas, pico cerrado. |
| `happy` | acierto normal | Ojos cerrados sonrientes (∪), mejillas, **un** pico, chispa. |
| `celebrating` | racha ≥3 / logro | Ojos brillantes muy abiertos, pico abierto, mejillas, **estrellas**. |
| `thinking` | reposo activo | Mirada arriba, una ceja alzada, **rastro de 3 burbujas crecientes → nube de cómic con "?"**. |
| `encouraging` | error puntual | **Dos pompones** en alto sujetados por las alas levantadas (finas), cara cálida, mejillas. |
| `pointing` | destacar elemento UI | Mirada al objetivo + **ala extendida** + **flecha grande** ámbar. |
| `surprised` | racha rota | Ojos enormes, pupilas mínimas, cejas muy altas, **"!"** marcado + chispas. |
| `worried` | 5+ errores, racha 0 | Ojos abiertos, cejas en tensión (interior arriba), **gota de sudor** visible. |
| `sad` | timeout | **Párpados caídos** (clipPath), cejas tristes marcadas, **lágrima** acentuada. |

Principio rector (heredado): el error (`sad`/`worried`/`surprised`) se resuelve en clave **amable, nunca punitiva**. Público objetivo: **niños 4–8 años** → cada gesto debe leerse sin texto.

## 5. Arquitectura técnica

### 5.1 Componente y módulos

Se **reescribe el interior** de `CharacterMascot` manteniendo su **nombre y API pública** → cero churn en los call sites (GameSession, GameOverScreen, OnboardingOverlay, EmptyState).

```
frontend/src/components/game/
├── CharacterMascot.jsx        # (reescrito) orquesta: bocadillo + halo + <OwlCharacter> + gating
├── mascot/
│   ├── owlParts.jsx           # (nuevo) capas SVG: <OwlBody>, <OwlEyes>, <OwlBrows>,
│   │                          #   <OwlBeak>, <OwlWings>, props (<ThoughtCloud>, <PomPoms>,
│   │                          #   <Arrow>, <SweatDrop>, <Tear>, <Stars>, <Exclaim>)
│   └── owlExpressions.js      # (nuevo) tabla declarativa EXPRESSIONS[mood]
└── MascotAccessory.jsx        # (ELIMINADO)
```

### 5.2 Modelo de datos declarativo

`owlExpressions.js` expone una tabla pura (estilo `mascotDialog.js` / `mechanicTheme.js`): cada mood es **datos**, no JSX.

```js
// Forma de cada entrada (ilustrativa, no final):
EXPRESSIONS[mood] = {
  brows:      { left: <pathData>, right: <pathData>, width },
  eyes:       'open' | 'closedSmile' | 'wide' | 'droopy',  // selector de variante
  pupilOffset:{ x, y },                 // desplazamiento de mirada
  beak:       'closed' | 'openSmile' | 'openO',
  cheeks:     boolean,
  props:      ['thoughtCloud'] | ['pomPoms'] | ['arrow'] | ['sweatDrop'] | …,
  wings:      'rest' | 'pointing' | 'pompom',  // las alas cambian solo en 2 estados
  bodyAnim:   'float' | 'bounce' | 'jump' | 'nod' | 'tilt' | 'sway' | 'wobble' | 'pop',
}
```

`owlParts.jsx` consume esos datos y dibuja cada capa. La geometría exacta sale de la **hoja de modelo canónica**.

### 5.3 Reutilización del "cerebro" (sin cambios)

- `useGameFeedback` sigue calculando `mascotMood` + `mascotMessage` (incluida la lógica de racha/worried/cooldown/micro-celebración) **tal cual**.
- `mascotDialog.js`, el **bocadillo** (speech bubble), los **sonidos** (`playMascotChirp`, `playStreakSparkle`, `playGameOverFanfare`) y el **halo tintado por mecánica** (`getMechanicTheme().accentVar`) no se tocan.
- `<OwlCharacter>` solo recibe `mood`, `mechanicType` y flags de animación; es **presentacional puro**.

### 5.4 API pública (estable)

`CharacterMascot` mantiene props: `mood`, `message`, `position`, `mechanicType`, `isFirstAppearance`, `noBubble`, `className`. **Se añade** `size` (p. ej. `'sm'` esquina de partida ~64px · `'lg'` héroe de GameOver ~1.4× · decorativa en empty states). El SVG es vectorial → nítido a cualquier escala.

## 6. Paleta → tokens OKLCH

El mockup usa hex provisionales. Mapeo a tokens del design system (`frontend/src/index.css`, con paridad light/dark):

| Elemento | Hex mockup | Token |
|---|---|---|
| Cuerpo / alas / cejas / pupila (firma) | `#6366f1` `#4f46e5` `#818cf8` `#1e1b4b` | `--color-accent-indigo` (+ tintes vía `color-mix`) |
| Barriga | `#a5b4fc` `#e0e7ff` | tinte claro de `--color-accent-indigo` |
| Pico / patas / mango pompón | `#f59e0b` `#fbbf24` `#b45309` | `--color-accent-amber` / `--color-accent-orange` (sombra) |
| Mejillas / pompones | `#fb7185` `#fda4af` | `--color-accent-pink` |
| "!" / detalles de alarma | `#f43f5e` | `--color-error-base` |
| Lágrima / gota de sudor | `#38bdf8` | `--color-info-base` |
| Estrellas / chispa | `#fcd34d` | `--color-warning-base` |
| Nube de pensamiento | blanco + `#c7d2fe` | `--color-text-primary` + tinte índigo claro |

El **halo** sigue tintándose con el acento de la mecánica activa (Memoria→indigo, Asociación→cyan, Secuencia→orange). El cuerpo índigo fijo es la identidad del personaje; cuando la mecánica es Memoria, halo y cuerpo comparten familia (el halo es un glow difuso, sigue leyéndose).

## 7. Movimiento

- **Reposo**: `float` + micro "respiración" (escala sutil).
- **Parpadeo** periódico (los párpados bajan/suben cada pocos segundos) — vida sin coste.
- **Transición entre moods**: morph de cejas/ojos + `AnimatePresence` para entrada/salida de props.
- **Body anim por mood**: reutiliza las variantes existentes (`float/bounce/jump/nod/tilt/sway/wobble/pop`).
- **`prefers-reduced-motion`**: expresión **estática** del mood, sin loops.
- **Fuera de viewport** (`useInView`): se pausan los loops `repeat: Infinity` (comportamiento M3 actual).

## 8. Superficies (alcance medio)

| Superficie | Uso |
|---|---|
| `GameSession` | Mascota reactiva en partida (esquina, `size="sm"`). |
| `GameOverScreen` | Héroe tier-aware (`size="lg"`, ~1.4×), mood/frase por estrellas, backdrop tintado. |
| `OnboardingOverlay` | Guía decorativa (`noBubble`). |
| `EmptyState` | Ilustración (`noBubble`). |
| **Micro-celebraciones de hito** (PROP-74) | Primer mazo guardado, N partidas… (puntual). |

## 9. Accesibilidad y rendimiento

- SVG `aria-hidden`; el texto del bocadillo aporta la información (con `aria-live` ya existente).
- **0 KB de assets** (SVG inline). Sin peticiones de red, sin dependencias nuevas.
- Vectorial → un único activo nítido de 44px a héroe.
- Respeta `prefers-reduced-motion` y gating por viewport.

## 10. Ficheros

**Nuevos:** `mascot/owlParts.jsx`, `mascot/owlExpressions.js`, tests del componente.
**Modificados:** `CharacterMascot.jsx` (interior), `Gameplay_Feedback_Design.md` (sección nueva), `Architecture_Decisions.md` (ADR nuevo), y los sitios de micro-celebración de hito (PROP-74).
**Eliminados:** `MascotAccessory.jsx` (y su test si existe).
**Intactos:** `useGameFeedback.js`, `mascotDialog.js`, `mechanicTheme.js`, `soundEffectsService.js`, GameSession/GameOver/Onboarding/EmptyState (solo se benefician).

## 11. Verificación

- Tests FE (Vitest): render de los 9 moods, drop-in (misma API), `reduced-motion` → estático, `noBubble`.
- `npm run lint` 0/0, `npm run build` OK.
- **QA en vivo** (Docker, ambos temas light/dark) con partidas reales de las 3 mecánicas: aciertos, fallos, racha, timeout, GameOver por tier; y mascota en onboarding/empty states.

## 12. Fuera de alcance (YAGNI)

- Rive / Lottie / sprite sheets.
- Nombre propio de marca + guía de personaje (era el alcance "identidad de marca", no elegido).
- Nuevos moods más allá de los 9 actuales.
- Cambiar la lógica de selección de mood/frase (el cerebro se conserva).

---

### Apéndice · trazabilidad

Recoge y cierra **PROP-67** (GameOver emocional + mascota) y **PROP-74** (mascota extendida a más superficies), hoy en backlog `[FUT]`. La geometría aprobada vive en `mascota-owl-model-sheet.html` (mismo directorio).
