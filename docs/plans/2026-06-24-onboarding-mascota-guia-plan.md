# Onboarding Mascota-Guía — Implementation Plan

> **For agentic workers:** usar `superpowers:executing-plans` (inline) o `subagent-driven-development`. Pasos con checkbox `- [ ]`.

**Goal:** Convertir a Otto en el guía-narrador del onboarding (presente en todos los pasos, con voz, señalando elementos reales, sin tapar nada), en ambos tracks, añadiendo un gesto nuevo de saludo.

**Architecture:** Un mood nuevo `greeting` (saludo con ala) en el rig SVG; un componente compartido `MascotGuide` (Otto + bocadillo) usado por los dos tipos de paso del overlay; reescritura de `mascotForStep` a `{mood, line}`; datos de voz por paso en `onboardingTracks.js`.

**Tech Stack:** React 19, framer-motion (`m`/`AnimatePresence`), Tailwind v4, Vitest. Spec: `docs/plans/2026-06-24-onboarding-mascota-guia-design.md`.

## Global Constraints

- JavaScript, NO TypeScript. Identificadores en inglés; comentarios/strings de usuario en español.
- Lint debe quedar 0/0 (`npm --prefix frontend run lint`). Ojo `sonarjs/todo-tag`: no usar la palabra «todo» suelta en comentarios.
- La IA **no hace commit** (humano-only, CLAUDE.md). Cada tarea acaba en verificación (lint+tests); el humano commitea al final.
- NO romper el rig persistente (ADR-209/211): `greeting` reusa los slots; la cara nunca se desmonta.
- Mascota + bocadillo `aria-hidden`; animaciones gated por `animate`/`reduce` (reduced-motion + viewport).
- Frases de bocadillo ≤~32 caracteres, cálidas, distintas de la descripción.

---

### Task 1: Mood `greeting` + variante de ala `wave` (rig)

**Files:**
- Modify: `frontend/src/components/game/mascot/owlExpressions.js`
- Modify: `frontend/src/components/game/mascot/owlParts.jsx`
- Modify: `frontend/src/components/game/CharacterMascot.jsx`
- Test: `frontend/src/components/game/__tests__/CharacterMascot.persistence.test.jsx`

**Interfaces:**
- Produces: `EXPRESSIONS.greeting` (mood); `OWL_MOODS` incluye `'greeting'`; `CharacterMascot` acepta `mood="greeting"`.

- [ ] **Step 1: Test que falla** — añadir a `CharacterMascot.persistence.test.jsx` un caso de `greeting` en el bucle de "no blank-out" y un assert de la variante `wave`:

```jsx
it('greeting: cara persiste, saludo con ala (variante wave = 3 elipses)', () => {
  const { container } = render(<CharacterMascot mood="greeting" />);
  expect(container.querySelector('[data-otto-slot="eyes"]')).not.toBeNull();
  expect(container.querySelector('[data-otto-slot="beak"]')).not.toBeNull();
  // ala izquierda en reposo (1) + ala derecha levantada (main+brillo = 2) = 3
  const wings = container.querySelector('[data-otto-slot="wings"]');
  expect(wings.querySelectorAll('ellipse').length).toBe(3);
});
```
Y añadir `'greeting'` al array del test `'ojos, cejas y pico NUNCA quedan a cero…'`.

- [ ] **Step 2: Verificar que falla** — `npm --prefix frontend test -- --run CharacterMascot` → FAIL (greeting no existe / wings ≠ 3).

- [ ] **Step 3: owlExpressions.js** — añadir a `EXPRESSIONS` (después de `idle`) y a `OWL_MOODS`:

```js
greeting: {
  eyes: 'open', pupil: { x: 0, y: 0 }, brows: 'soft', beak: 'openSmileSmall',
  cheeks: true, wings: 'wave', props: [], body: 'sway', glow: 'brand'
},
```
`OWL_MOODS`: añadir `'greeting'` (tras `'idle'`).

- [ ] **Step 4: owlParts.jsx — variante `wave`** — en `WING_VARIANTS` añadir `wave` como FUNCIÓN `(animate, reduce) => JSX` (ala izq reposo + ala dcha levantada que saluda). Geometría inicial (afinar en QA Task 6):

```jsx
// Saludo: ala izquierda en reposo + ala derecha levantada que ondea (gated).
wave: (animate, reduce) => (
  <>
    <ellipse cx="42" cy="140" rx="15" ry="37" fill={C.wing} />
    <motion.g
      style={{ transformBox: 'fill-box', transformOrigin: '50% 90%' }}
      animate={animate && !reduce ? { rotate: [0, -16, 6, -12, 0] } : { rotate: 0 }}
      transition={animate && !reduce
        ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
        : { duration: 0 }}
    >
      <ellipse cx="168" cy="118" rx="13" ry="34" transform="rotate(30 168 118)" fill={C.wing} />
      <ellipse cx="166" cy="120" rx="5" ry="20" transform="rotate(30 168 118)" fill={C.wingHi} opacity="0.45" />
    </motion.g>
  </>
),
```
Y en `OwlWings`, resolver función vs JSX estático:

```jsx
const raw = WING_VARIANTS[v];
const content = typeof raw === 'function' ? raw(animate, reduce) : raw;
```
…y usar `{content}` dentro del `motion.g` keyed (en vez de `{WING_VARIANTS[v]}`).

- [ ] **Step 5: CharacterMascot.jsx** — añadir `'greeting'` al `propTypes.mood` oneOf y al JSDoc `@param mood`. (No hace falta tocar `GLOW_CLASS`/`bodyAnimation`: `brand` y `sway` ya existen.)

- [ ] **Step 6: Verificar verde** — `npm --prefix frontend test -- --run CharacterMascot` → PASS. `npm --prefix frontend run lint` → 0/0.

---

### Task 2: Voz por paso en `onboardingTracks.js` (ambos tracks)

**Files:**
- Modify: `frontend/src/constants/onboardingTracks.js`
- Test: `frontend/src/constants/__tests__/onboardingTracks.test.js` (crear si no existe; si el proyecto no testea constantes, fold en Task 3).

**Interfaces:**
- Produces: cada paso tiene `mascotLine: string` y (opcional) `mascotMood: string`.

- [ ] **Step 1: Test que falla** — `onboardingTracks.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TEACHER_TRACK, SUPER_ADMIN_TRACK } from '../onboardingTracks';
const OWL = new Set(['idle','greeting','happy','celebrating','thinking','encouraging','pointing','surprised','worried','sad']);
describe('onboardingTracks — voz de Otto', () => {
  for (const [name, track] of [['teacher', TEACHER_TRACK], ['admin', SUPER_ADMIN_TRACK]]) {
    it(`${name}: cada paso tiene mascotLine y mascotMood válido`, () => {
      for (const step of track) {
        expect(typeof step.mascotLine).toBe('string');
        expect(step.mascotLine.length).toBeGreaterThan(0);
        if (step.mascotMood) expect(OWL.has(step.mascotMood)).toBe(true);
      }
    });
  }
});
```

- [ ] **Step 2: Verificar falla** — `npm --prefix frontend test -- --run onboardingTracks` → FAIL.

- [ ] **Step 3: Añadir campos** — a cada paso de `TEACHER_TRACK` y `SUPER_ADMIN_TRACK` añadir `mascotMood` + `mascotLine`:

TEACHER: 1 `greeting`/"¡Hola! Soy Otto, te guío." · 2 `pointing`/"Empezamos por tus mazos." · 3 `pointing`/"Esto pinta tus juegos." · 4 `pointing`/"Aquí montas la partida." · 5 `thinking`/"Tres formas de jugar." · 6 `celebrating`/"¡Y a pasar tarjetas!" · 7 `pointing`/"Aquí ves cómo van."

SUPER_ADMIN: 1 `greeting`/"¡Hola! Te enseño tu panel." · 2 `pointing`/"Aquí decides quién entra." · 3 `pointing`/"Todo el alumnado, aquí." · 4 `pointing`/"El material común, aquí." · 5 `happy`/"Si te pierdes, vuelve aquí."

Actualizar el JSDoc de cabecera del fichero documentando los dos campos nuevos.

- [ ] **Step 4: Verificar verde** — `npm --prefix frontend test -- --run onboardingTracks` → PASS.

---

### Task 3: `mascotForStep` → `{mood, line}` (lógica pura, TDD)

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingOverlay.jsx` (función `mascotForStep` + export para test)
- Test: `frontend/src/components/onboarding/__tests__/OnboardingOverlay.mascot.test.jsx` (crear)

**Interfaces:**
- Produces: `mascotForStep(step, currentStep, totalSteps) → { mood: string, line: string }`. Exportada con nombre para testear.

- [ ] **Step 1: Test que falla:**

```jsx
import { describe, it, expect } from 'vitest';
import { mascotForStep } from '../OnboardingOverlay';
describe('mascotForStep', () => {
  it('usa mascotMood/mascotLine del paso si existen', () => {
    expect(mascotForStep({ mascotMood: 'pointing', mascotLine: 'X' }, 2, 7)).toEqual({ mood: 'pointing', line: 'X' });
  });
  it('default: paso 0 → greeting', () => {
    expect(mascotForStep({ mascotLine: 'Hola' }, 0, 7).mood).toBe('greeting');
  });
  it('default: último → celebrating', () => {
    expect(mascotForStep({ mascotLine: 'Fin' }, 6, 7).mood).toBe('celebrating');
  });
  it('default: spotlight intermedio → pointing', () => {
    expect(mascotForStep({ type: 'spotlight', mascotLine: 'P' }, 2, 7).mood).toBe('pointing');
  });
  it('default: modal intermedio → thinking', () => {
    expect(mascotForStep({ type: 'modal', mascotLine: 'M' }, 3, 7).mood).toBe('thinking');
  });
});
```

- [ ] **Step 2: Verificar falla** — `npm --prefix frontend test -- --run OnboardingOverlay.mascot` → FAIL (no exportada / lógica vieja).

- [ ] **Step 3: Reescribir `mascotForStep` y exportarla:**

```js
export function mascotForStep(step, currentStep, totalSteps) {
  const line = step?.mascotLine || '';
  if (step?.mascotMood) return { mood: step.mascotMood, line };
  if (currentStep === 0) return { mood: 'greeting', line };
  if (currentStep === totalSteps - 1) return { mood: 'celebrating', line };
  if (step?.type === 'spotlight') return { mood: 'pointing', line };
  return { mood: 'thinking', line };
}
```

- [ ] **Step 4: Verificar verde** — `npm --prefix frontend test -- --run OnboardingOverlay.mascot` → PASS.

---

### Task 4: Componente `MascotGuide` (Otto + bocadillo lateral)

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingOverlay.jsx` (nuevo componente + import `EASING`)
- Test: `frontend/src/components/onboarding/__tests__/OnboardingOverlay.mascot.test.jsx` (ampliar)

**Interfaces:**
- Consumes: `CharacterMascot`, `EASING` (de `lib/utils`).
- Produces: `<MascotGuide mood line flip isFirstAppearance />` — renderiza Otto (`svg[data-otto-size]`) + bocadillo con `line`.

- [ ] **Step 1: Test que falla** — añadir al test del onboarding (stub de IntersectionObserver como en el persistence test):

```jsx
import { render } from '@testing-library/react';
import { MascotGuide } from '../OnboardingOverlay';
beforeAll(() => { globalThis.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} takeRecords(){return[]} }; });
it('MascotGuide: muestra Otto y el bocadillo con la frase', () => {
  const { container, getByText } = render(<MascotGuide mood="greeting" line="¡Hola!" />);
  expect(container.querySelector('svg[data-otto-size]')).not.toBeNull();
  expect(getByText('¡Hola!')).not.toBeNull();
});
it('MascotGuide: flip voltea el contenedor de Otto', () => {
  const { container } = render(<MascotGuide mood="pointing" line="X" flip />);
  const flipped = container.querySelector('[data-otto-flip="true"]');
  expect(flipped).not.toBeNull();
});
```

- [ ] **Step 2: Verificar falla** — FAIL (no existe `MascotGuide`).

- [ ] **Step 3: Implementar `MascotGuide`** (en OnboardingOverlay.jsx; importar `EASING` desde `../../lib/utils`):

```jsx
function MascotGuide({ mood, line, flip = false, isFirstAppearance = false }) {
  return (
    <div className="flex items-center gap-2 pointer-events-none" aria-hidden="true">
      <div
        data-otto-flip={flip ? 'true' : 'false'}
        className="shrink-0"
        style={flip ? { transform: 'scaleX(-1)' } : undefined}
      >
        <CharacterMascot mood={mood} size="sm" position="left" isFirstAppearance={isFirstAppearance} noBubble />
      </div>
      {line && (
        <motion.div
          key={line}
          initial={{ opacity: 0, scale: 0.92, x: -6 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          transition={{ duration: 0.25, ease: EASING.outQuart }}
          className="relative bg-glass-bg backdrop-blur-sm border border-glass-border rounded-2xl px-3 py-1.5 text-sm font-medium text-text-primary max-w-[12rem]"
        >
          {line}
          <span className="absolute top-1/2 -left-1.5 -translate-y-1/2 size-3 bg-glass-bg border-l border-b border-glass-border rotate-45" aria-hidden="true" />
        </motion.div>
      )}
    </div>
  );
}
MascotGuide.propTypes = {
  mood: PropTypes.string.isRequired,
  line: PropTypes.string,
  flip: PropTypes.bool,
  isFirstAppearance: PropTypes.bool,
};
export { MascotGuide };
```
Nota: el bocadillo lo dibuja `MascotGuide` (no el de `CharacterMascot`, que va ENCIMA). El `key={line}` re-anima el bocadillo al cambiar de paso.

- [ ] **Step 4: Verificar verde** — PASS. Lint 0/0.

---

### Task 5: `ModalStep` — cabecera-guía (fin del solape) + icono temático pequeño

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingOverlay.jsx` (`ModalStep`)

**Interfaces:**
- Consumes: `MascotGuide`, `mascotForStep`.

- [ ] **Step 1: Reemplazar la maqueta de `ModalStep`** — quitar el `<StepIcon>` hero y el bloque `<div absolute -left-2 -bottom-4 …mascota…>`; añadir banda de cabecera y un icono pequeño junto al título:

```jsx
const mascotConfig = mascotForStep(step, currentStep, totalSteps);
// …dentro de <GlassCard variant="solid" padding="lg" className="relative overflow-visible">
{/* Cabecera-guía: Otto + bocadillo (izq) y saltar (dcha), en flujo (sin absolute). */}
<div className="flex items-start justify-between gap-2 mb-3">
  <MascotGuide mood={mascotConfig.mood} line={mascotConfig.line} isFirstAppearance={currentStep === 0} />
  <button onClick={onSkip} aria-label="Saltar tutorial"
    className={cn('shrink-0 p-2 rounded-xl text-text-muted hover:text-text-primary',
      'bg-background-elevated/40 hover:bg-background-elevated/70 border border-border-subtle hover:border-border-default',
      'transition-colors duration-200 focus-ring')}>
    <X size={18} aria-hidden="true" />
  </button>
</div>

<div className="min-h-[220px] flex flex-col items-center justify-center text-center">
  <div className="flex flex-col items-center gap-4 px-2">
    <h2 className="flex items-center gap-2 text-2xl font-bold text-text-primary font-display leading-tight">
      {step.icon && (
        <span className={cn('inline-flex items-center justify-center size-8 rounded-lg border',
          step.variant === 'warning'
            ? 'bg-warning-base/15 border-warning-base/30 text-warning-base'
            : 'bg-brand-base/15 border-brand-base/30 text-brand-base')} aria-hidden="true">
          <step.icon size={18} strokeWidth={1.75} />
        </span>
      )}
      {step.title}
    </h2>
    <p className="text-text-secondary text-base leading-relaxed max-w-md">{step.description}</p>
  </div>
</div>
{/* …StepProgress / NavButtons / nota: sin cambios… */}
```
Eliminar el `StepIcon` import si queda sin uso (lo usa solo ModalStep). Mantener `StepIcon` definido solo si lo usa algo más; si no, borrarlo.

- [ ] **Step 2: Verificar** — `npm --prefix frontend run lint` 0/0; `npm --prefix frontend test -- --run OnboardingOverlay` verde. (Lo visual va en QA, Task 7.)

---

### Task 6: `SpotlightStep` — Otto que señala el elemento real (flip por lado)

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingOverlay.jsx` (`SpotlightStep`)

- [ ] **Step 1: Calcular mood/flip y meter la cabecera-guía en el tooltip** — tras `const tooltip = calculateTooltipPosition(padded);`:

```jsx
const mascotConfig = mascotForStep(step, currentStep, totalSteps);
let mascotMood = mascotConfig.mood;
let mascotFlip = false;
if (tooltip.side === 'right') mascotFlip = true;       // target a la IZQUIERDA → Otto señala a la izquierda
else if (tooltip.side === 'bottom') mascotMood = 'thinking'; // target arriba → mirar arriba
```
En el `<GlassCard variant="solid" padding="md" className="relative">` del tooltip, justo tras el botón saltar, añadir:

```jsx
<div className="mb-2 pr-6">
  <MascotGuide mood={mascotMood} line={mascotConfig.line} flip={mascotFlip} />
</div>
```
(El icono pequeño + título del tooltip se mantienen tal cual debajo.)

- [ ] **Step 2: Verificar** — lint 0/0; tests del onboarding verdes.

---

### Task 7: Verificación integral + QA en vivo + documentación

**Files:**
- Modify: `documentation/Architecture_Decisions.md` (ADR-212), `frontend/docs/Gameplay_Feedback_Design.md`, `documentation/Onboarding_Tracks.md`, `documentation/Microcopy_Style_Guide.md`

- [ ] **Step 1: Suite completa + lint** — `npm --prefix frontend run lint` 0/0; `npm --prefix frontend test -- --run` todo verde (ajustar cualquier test de onboarding existente al nuevo markup).
- [ ] **Step 2: Rebuild Docker** — `docker compose up -d --build frontend`.
- [ ] **Step 3: QA en vivo (ambos temas, ambos roles)** — disparar el tour (login fresco o botón "Ver tutorial"); recorrer paso a paso: Otto desde el paso 1, bocadillo correcto, **saludo (wave) en bienvenida**, en spotlight Otto señala el elemento real con el flip correcto, sin solapes con botones/nota a 1366×768 y 4K. Afinar geometría del `wave` si hace falta (Task 1 Step 4).
- [ ] **Step 4: Documentación** — ADR-212 (papel de Otto en onboarding + mood `greeting`/wave), sección en `Gameplay_Feedback_Design.md`, campos `mascotLine`/`mascotMood` en `Onboarding_Tracks.md`, voz de Otto del tour en `Microcopy_Style_Guide.md`.
- [ ] **Step 5: Memoria** — añadir/actualizar entrada de memoria del proyecto.

---

## Self-Review

- **Cobertura del spec:** §3.1 MascotGuide→T4; §3.2 ModalStep→T5; §3.3 SpotlightStep+flip→T6; §3.4 greeting/wave→T1; §3.5 contenido→T2; §3.6 mascotForStep→T3; §4 a11y/motion→T4/T1; §6 verificación→T7. Sin huecos.
- **Placeholders:** ninguno; código real en cada paso.
- **Consistencia de tipos:** `mascotForStep` devuelve `{mood,line}` (T3) y lo consumen T5/T6; `MascotGuide` props `mood/line/flip/isFirstAppearance` consistentes en T4/T5/T6; `WING_VARIANTS.wave` función `(animate,reduce)` resuelta en `OwlWings` (T1).
