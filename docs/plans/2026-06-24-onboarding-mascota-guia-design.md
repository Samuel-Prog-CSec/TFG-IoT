# Diseño: Otto como guía-narrador del onboarding (2026-06-24)

> Brainstorming. **Aprobado**: el rol ("guía que habla") y la maqueta de los pasos
> modal ("presentador en cabecera"). Pendiente: revisión de este spec antes del plan.
> Aplica a **ambos tracks** (profesor y dirección).

---

## 1. Problema

El onboarding (`OnboardingOverlay.jsx`) usa a Otto de tres formas que restan en vez de sumar:

1. **Tapa el contenido.** La mascota va `absolute -left-2 -bottom-4 sm:-left-6 sm:-bottom-8` en la esquina inferior izquierda del card, justo **encima del botón "Atrás"** y de la nota inferior ("Puedes volver a ver el tutorial…").
2. **Aparece de forma intermitente.** Otto **solo se renderiza en los pasos `modal`**; los pasos `spotlight` (recortan un elemento real de la UI) no lo llevan. En el track del profesor eso es: paso 1 (modal, con Otto) → 2-4 (spotlight, **sin Otto**) → 5-6 (modal, con Otto) → 7 (spotlight, **sin Otto**). Aparece y desaparece.
3. **Mudo y sin sentido.** Se le pasa `noBubble`, así que el `message` que `mascotForStep` calcula **nunca se muestra** (código muerto). Queda en `pointing` apuntando al vacío, sin contexto → confunde ("de repente un búho señala algo sin decir nada").

## 2. Objetivo

Otto como **guía-narrador** del tour: presente **desde el paso 1 y en todos los pasos**, con **voz** (bocadillo corto y cálido por paso), **señalando elementos reales** en los pasos spotlight, y **sin tapar** botones ni texto. Se añade un **gesto nuevo de saludo** para la bienvenida. Todo en los **dos tracks**.

## 3. Diseño

### 3.1 `MascotGuide` (componente nuevo, en `OnboardingOverlay.jsx`)

Unidad presentacional reutilizable que usan los dos tipos de paso → Otto consistente y un solo sitio que mantener. Props: `mood`, `line` (texto del bocadillo), `flip` (voltear en horizontal para señalar a la izquierda), `isFirstAppearance`.

- El **bocadillo se dibuja A UN LADO** de Otto (no encima). `CharacterMascot` sigue con `noBubble`; la burbuja la pinta `MascotGuide` con tokens glass (`bg-glass-bg`, `border-glass-border`, `rounded-2xl`). Motivo: el bocadillo interno de `CharacterMascot` ancla arriba (`bottom-full`) y desbordaría la banda de cabecera.
- `aria-hidden` (el contenido accesible es el título/descripción del paso, ya en el `role="dialog"`).
- `flip` = `scaleX(-1)` sobre el wrapper del SVG (NO sobre el bocadillo, que quedaría con el texto al revés).

### 3.2 Pasos `modal` (ModalStep) — "presentador en cabecera"

```
+----------------------------------+
| [Otto] ( ¡Hola! Soy Otto )     X |   banda cabecera (flujo normal, NO absolute)
|                                  |
|   (•) Crea tu primer mazo        |   icono temático PEQUEÑO + título
|   Un mazo agrupa tus tarjetas... |   descripción
|                                  |
|  ---------------    Paso 2 de 7  |
|  [< Atras]         [Siguiente >] |   botones, sin solape
|   Puedes volver al tutorial...   |
+----------------------------------+
```

- **Banda de cabecera** en flujo normal: `MascotGuide` (Otto + bocadillo) a la izquierda, botón saltar `[X]` a la derecha. Nada `absolute` sobre los botones → fin del solape.
- Se retira el **icono hero grande**; en su lugar, el **icono temático pequeño** del paso (`step.icon`, ~18-20px) acompaña al **título** (decisión del usuario: conservar la pista de tema). `variant: 'warning'` (bienvenida de dirección) tiñe el halo de Otto + el iconito.
- Debajo, sin cambios de orden: título + descripción, progreso, `NavButtons`, nota.

### 3.3 Pasos `spotlight` (SpotlightStep) — Otto que SÍ señala

- El tooltip incorpora la misma banda de cabecera con `MascotGuide`, mood `pointing`, **orientado hacia el elemento resaltado** según `tooltip.side` (que ya calcula `calculateTooltipPosition`):
  - `side === 'left'` (target a la derecha de Otto) → sin voltear (brazo apunta a la derecha).
  - `side === 'right'` (target a la izquierda) → `flip` (Otto volteado, brazo apuntando a la izquierda).
  - `side === 'bottom'` (target arriba, caso raro) → mood `thinking` mirando arriba (el brazo lateral no aplica).
- El **anillo de resalte** (ya existe) + **Otto señalando** + el texto del tooltip = "esto de aquí" inequívoco. Aquí el gesto de señalar por fin apunta a algo real.

### 3.4 Gesto nuevo: `greeting` (saludo con el ala) — extensión del rig

Mood nuevo para la bienvenida de ambos tracks. `happy` es "contento", no "hola"; el saludo aporta el gesto de recibimiento.

`owlExpressions.js`:
```js
greeting: {
  eyes: 'open', pupil: { x: 0, y: 0 }, brows: 'soft', beak: 'openSmileSmall',
  cheeks: true, wings: 'wave', props: [], body: 'sway', glow: 'brand'
}
```

`owlParts.jsx` — nueva variante de ala `wave`: ala izquierda en reposo + **ala derecha levantada saludando** (un `motion.g` con `transform-box: fill-box`, pivote en la base/hombro, `rotate: [0, -18, 0, -12, 0]` en bucle, gated por `animate`/`reduce`). Para soportar la animación, `WING_VARIANTS` admite valores **función `(animate) => JSX`** además de JSX estático (`rest`/`pointing`/`pompom` siguen estáticos; `OwlWings` resuelve `typeof === 'function'`).

Ampliar también: `OWL_MOODS`, `GLOW_CLASS`/`bodyAnimFor` si aplica, y `CharacterMascot.propTypes.mood` con `'greeting'`. La cara sigue siendo persistente (continuidad sobre teletransporte, ADR-209/211): `greeting` reusa los slots existentes; solo añade la variante de ala.

### 3.5 Contenido por paso (ambos tracks)

Campos nuevos opcionales en cada paso de `onboardingTracks.js`: `mascotLine` (bocadillo) y `mascotMood` (override; default derivado: paso 0 → `greeting`, `spotlight` → `pointing`, resto modal → `thinking`). Frases ≤~32 caracteres, cálidas, **distintas de la descripción** (la voz que anima, no un duplicado), alineadas con `Microcopy_Style_Guide.md`.

**TEACHER_TRACK** (7 pasos):

| # | tipo | mascotMood | mascotLine |
|---|---|---|---|
| 1 | modal | `greeting` | ¡Hola! Soy Otto, te guío. |
| 2 | spotlight | `pointing` | Empezamos por tus mazos. |
| 3 | spotlight | `pointing` | Esto pinta tus juegos. |
| 4 | spotlight | `pointing` | Aquí montas la partida. |
| 5 | modal | `thinking` | Tres formas de jugar. |
| 6 | modal | `celebrating` | ¡Y a pasar tarjetas! |
| 7 | spotlight | `pointing` | Aquí ves cómo van. |

**SUPER_ADMIN_TRACK** (5 pasos):

| # | tipo | mascotMood | mascotLine |
|---|---|---|---|
| 1 | modal | `greeting` | ¡Hola! Te enseño tu panel. |
| 2 | spotlight | `pointing` | Aquí decides quién entra. |
| 3 | spotlight | `pointing` | Todo el alumnado, aquí. |
| 4 | spotlight | `pointing` | El material común, aquí. |
| 5 | modal | `happy` | Si te pierdes, vuelve aquí. |

### 3.6 `mascotForStep` (reescrito)

Devuelve `{ mood, line, flip }` leyendo `step.mascotMood`/`step.mascotLine` con el default derivado; `flip` lo fija `SpotlightStep` desde `tooltip.side`. Se elimina la lógica muerta de la frase y el `noBubble`.

## 4. Accesibilidad y motion

- Otto + bocadillo `aria-hidden`; el contenido accesible sigue siendo título/descripción (el `role="dialog"` + `aria-label` no cambian).
- Animaciones de Otto y del saludo respetan `reduced-motion` (gating existente) y se pausan fuera de viewport. El saludo no introduce loops nuevos sin gate.

## 5. Alcance (ficheros)

- `components/onboarding/OnboardingOverlay.jsx` — `MascotGuide`, cabeceras de `ModalStep`/`SpotlightStep`, `mascotForStep`, quitar el overlay `absolute`, icono temático pequeño junto al título.
- `constants/onboardingTracks.js` — `mascotLine`/`mascotMood` en los 12 pasos.
- `components/game/mascot/owlExpressions.js` — mood `greeting` + `OWL_MOODS`.
- `components/game/mascot/owlParts.jsx` — variante `wave` + soporte de función en `WING_VARIANTS`.
- `components/game/CharacterMascot.jsx` — `propTypes.mood`, `GLOW_CLASS`/`bodyAnimation` si aplica.
- Tests: `CharacterMascot.persistence.test.jsx` (matriz con `greeting`, ala `wave`); test de onboarding (Otto presente con bocadillo por paso; sin nodo `absolute` solapando) si encaja limpio.
- Docs: `frontend/docs/Gameplay_Feedback_Design.md` (sección onboarding), nuevo ADR, `documentation/Onboarding_Tracks.md` (campos `mascotLine`/`mascotMood`), `documentation/Microcopy_Style_Guide.md` (voz de Otto en el tour).

## 6. Verificación

`npm run lint` 0/0, tests FE verdes, `npm run build` OK. **QA en vivo** (Docker, ambos temas, profesor y dirección): recorrer el tour COMPLETO paso a paso confirmando — Otto desde el paso 1, bocadillo correcto por paso, **saludo (wave) en la bienvenida**, señalado real + volteo correcto en los pasos spotlight, y **cero solapes** con botones/nota a 1366×768 y a 4K.

## 7. Alternativas descartadas

- **Maquetas B (Otto a un lado) / C (Otto protagonista)**: el usuario eligió cabecera (A).
- **Reusar el bocadillo interno de `CharacterMascot`** (va ENCIMA de Otto): desbordaría la banda de cabecera; mejor bocadillo lateral propio en `MascotGuide`.
- **No añadir gesto nuevo** (reusar `happy` para la bienvenida): `happy` no comunica "hola"; el `greeting`/wave es el recibimiento que se pidió.
- **Dos sprites de Otto para voltear**: innecesario; `scaleX(-1)` sobre el wrapper basta (sin tocar el bocadillo).
- **Derivar el mood solo por posición** (sin `mascotMood` por paso): "¡A jugar!" pediría `celebrating` y un spotlight final pediría `pointing`; el override por paso lo afina (solo 12 pasos).
