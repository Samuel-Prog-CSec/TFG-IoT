/**
 * @fileoverview Capas SVG de "Otto", la mascota búho con rig paramétrico.
 *
 * Reemplaza al emoji 🦉 + accesorios (render dependiente del SO) por un
 * personaje 100% dibujado en código: render idéntico en cualquier navegador y
 * EXPRESIÓN FACIAL REAL (ojos, párpados, cejas, pico que cambian de forma).
 *
 * Geometría canónica aprobada: `docs/plans/mascota-owl-model-sheet.html`.
 * viewBox unificado `0 0 200 215`. Base compartida (sombra, orejas, alas,
 * cuerpo, barriga, patas) + cara/props que cambian por mood.
 *
 * Identidad cromática: cuerpo índigo FIJO (no invierte entre temas — un
 * personaje conserva sus colores). Los props (pico, mejillas, lágrima,
 * gota, estrellas, "!") referencian tokens `var(--color-*)` para adaptarse
 * al tema. Los gradientes se namespacian con un `uid` para permitir varios
 * Ottos en la misma página sin colisión de IDs.
 *
 * @module components/game/mascot/owlParts
 */

import { m as motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { EXPRESSIONS } from './owlExpressions';
import { EASING } from '../../../lib/utils';

// ── Paleta índigo de identidad (OKLCH; mapeo de los hex del model sheet) ──
const C = {
  bodyTop: 'oklch(72% 0.13 274)', // #818cf8
  bodyBottom: 'oklch(53% 0.20 272)', // #4f46e5
  earFront: 'oklch(63% 0.18 272)', // #6366f1
  wing: 'oklch(48% 0.19 272)', // #4338ca
  wingHi: 'oklch(58% 0.16 272)', // #5b63e8
  bellyLight: 'oklch(94% 0.03 286)', // #e0e7ff
  bellyMid: 'oklch(80% 0.08 282)', // #a5b4fc
  irisTop: 'oklch(40% 0.15 280)', // #3730a3
  irisBottom: 'oklch(27% 0.10 285)', // #1e1b4b
  brow: 'oklch(36% 0.13 282)', // #312e81
  lid: 'oklch(56% 0.16 274)', // párpado (piel intermedia)
  eyeWhite: 'oklch(99% 0.004 280)', // casi blanco, tintado índigo (no #fff)
  shadow: 'oklch(27% 0.10 285)', // sombra de suelo
  beakShadow: 'oklch(58% 0.14 55)', // mitad oscura del pico (#b45309)
  cheek: 'oklch(74% 0.16 16)', // rubor rosado
  pomMain: 'oklch(70% 0.18 15)', // #fb7185
  pomLight: 'oklch(80% 0.12 12)', // #fda4af
  pomDark: 'oklch(64% 0.20 18)', // #f43f5e
  pomHandle: 'oklch(52% 0.13 55)', // #b45309
  cloudOutline: 'oklch(85% 0.06 280)' // #c7d2fe
};

// Acentos temáticos (sí adaptan light/dark vía tokens del design system).
const BEAK = 'var(--color-accent-amber)';
const FEET = 'var(--color-accent-amber)';
const TEAR = 'var(--color-info-base)';
const SPARK = 'var(--color-warning-base)';
const EXCLAIM = 'var(--color-error-base)';

/* ============================================================
   TIMINGS del rig facial — "continuidad sobre teletransporte"
   ============================================================
   Los rasgos compartidos entre moods (ojos, cejas, pico, mejillas,
   alas) NUNCA se desmontan: transicionan EN EL SITIO. Sólo los props
   entran/salen. Cada transición <300ms, ease-out fuerte, exit < enter, y sólo
   `opacity`/atributos SVG numéricos (cx,cy,d,scaleY) → GPU, sin reflow. */
// Pupila: la mirada se desliza con muelle (eye-tracking natural).
const PUPIL_SPRING = { type: 'spring', stiffness: 220, damping: 26, mass: 0.6 };
// Cejas: morph de `d` (las 7 variantes comparten estructura M..Q..).
const BROW_MORPH = { duration: 0.24, ease: EASING.outQuart };
// Crossfade solapado de slots no morfables (pico, alas, props) y mejillas.
// CLAVE anti-parpadeo: el ENTRANTE sube RÁPIDO y el SALIENTE baja LENTO. Así
// en cada instante hay una forma casi sólida presente y el "máx. opacidad" del
// slot nunca cae por debajo de ~0.85 (antes IN=0.2 lento / OUT=0.14 rápido →
// hueco al cruzarse: el accesorio "desaparecía" a media transición). El
// solape asimétrico lee como un relevo limpio, no como un fundido a medias.
const SLOT_FADE_IN = { duration: 0.12, ease: EASING.outQuart };
const SLOT_FADE_OUT = { duration: 0.28, ease: EASING.outQuart };
// Parpadeo-swap del ojo: solo se usa al cruzar a/desde formas NO morfables
// (closedSmile, droopy). Dentro de la familia redonda (open/wide/narrow) los
// radios MORFAN sin parpadeo (ver SingleEye). El dip oculta el cambio de
// estructura tras un pestañeo de búho con carácter.
const BLINK_CLOSE = { duration: 0.09, ease: 'easeIn' };
const BLINK_OPEN = { duration: 0.11, ease: 'easeOut' };
// Morph de radios del ojo dentro de la familia redonda (open/wide/narrow): el
// blanco/iris/brillo cambian de tamaño suavemente, sin pestañeo.
const EYE_MORPH = { duration: 0.22, ease: EASING.outQuart };
// Familia de ojos "redondos" intercambiables por morph (misma estructura:
// blanco + iris + brillo). closedSmile (arco) y droopy (párpado recortado) son
// estructuras distintas → esas SÍ usan parpadeo-swap para ocultar el cambio.
const ROUND_EYES = new Set(['open', 'wide', 'narrow']);
const isEyeMorphPair = (a, b) => ROUND_EYES.has(a) && ROUND_EYES.has(b);
// Limita un offset de pupila a [-lim, lim] (evita que el iris salga del blanco).
const clampPupil = (v, lim) => Math.max(-lim, Math.min(lim, v));

/* ============================================================
   DEFS — gradientes namespaced por instancia
   ============================================================ */
export function OwlDefs({ uid }) {
  return (
    <defs>
      <linearGradient id={`owlBody-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={C.bodyTop} />
        <stop offset="100%" stopColor={C.bodyBottom} />
      </linearGradient>
      <radialGradient id={`owlBelly-${uid}`} cx="50%" cy="38%" r="65%">
        <stop offset="0%" stopColor={C.bellyLight} />
        <stop offset="100%" stopColor={C.bellyMid} />
      </radialGradient>
      <radialGradient id={`owlIris-${uid}`} cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor={C.irisTop} />
        <stop offset="100%" stopColor={C.irisBottom} />
      </radialGradient>
    </defs>
  );
}
OwlDefs.propTypes = { uid: PropTypes.string.isRequired };

/* ============================================================
   BASE compartida
   ============================================================ */
export function OwlShadow() {
  return <ellipse cx="100" cy="200" rx="48" ry="9" fill={C.shadow} opacity="0.12" />;
}

export function OwlEars() {
  return (
    <>
      <path d="M58 64 L73 30 L90 60 Z" fill={C.earFront} />
      <path d="M142 64 L127 30 L110 60 Z" fill={C.earFront} />
    </>
  );
}

export function OwlBody({ uid }) {
  return (
    <>
      <rect x="36" y="48" width="128" height="146" rx="64" fill={`url(#owlBody-${uid})`} />
      {/* brillo de cabeza */}
      <ellipse cx="100" cy="70" rx="50" ry="22" fill="oklch(100% 0 0)" opacity="0.10" />
      {/* barriga */}
      <ellipse cx="100" cy="150" rx="45" ry="48" fill={`url(#owlBelly-${uid})`} />
    </>
  );
}
OwlBody.propTypes = { uid: PropTypes.string.isRequired };

export function OwlFeet() {
  return (
    <g stroke={FEET} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d="M83 191 L77 201 M83 191 L83 202 M83 191 L89 201" />
      <path d="M117 191 L111 201 M117 191 L117 202 M117 191 L123 201" />
    </g>
  );
}

/* ============================================================
   ALAS — variantes rest / pointing / pompom / wave
   ============================================================
   Geometría por variante. Antes la postura cambiaba con hard-cut (las
   alas vivían FUERA del AnimatePresence de la cara) y se desincronizaba
   del prop que sí animaba (flecha/pompones). Ahora crossfadean al ritmo
   del mismo cambio de `mood` que el prop → entran/salen sincronizadas. */
const WING_VARIANTS = {
  // Alas LEVANTADAS hacia arriba —las DOS, como el ala del saludo (`wave`)— que
  // SUJETAN un pompón en cada punta. Los brazos se extienden arriba y hacia
  // fuera desde los costados, mayormente FUERA de la silueta del cuerpo (igual
  // que el ala del wave) → se ven bien. El pompón (en la capa de props) se posa
  // en cada extremo. Antes el "puño" quedaba escondido tras el cuerpo y el gesto
  // no se leía.
  pompom: (
    <>
      <ellipse cx="34" cy="120" rx="13" ry="38" transform="rotate(-26 34 120)" fill={C.wing} />
      <ellipse cx="36" cy="122" rx="5" ry="22" transform="rotate(-26 34 120)" fill={C.wingHi} opacity="0.45" />
      <ellipse cx="166" cy="120" rx="13" ry="38" transform="rotate(26 166 120)" fill={C.wing} />
      <ellipse cx="164" cy="122" rx="5" ry="22" transform="rotate(26 166 120)" fill={C.wingHi} opacity="0.45" />
    </>
  ),
  // Solo ala izquierda en reposo; la derecha cede su sitio a la flecha.
  pointing: <ellipse cx="42" cy="140" rx="15" ry="37" fill={C.wing} />,
  rest: (
    <>
      <ellipse cx="42" cy="140" rx="15" ry="37" fill={C.wing} />
      <ellipse cx="158" cy="140" rx="15" ry="37" fill={C.wing} />
    </>
  ),
  // Saludo (bienvenida onboarding): ala izquierda en reposo + ala derecha
  // LEVANTADA que ondea como un "hola". Es FUNCIÓN `(animate, reduce)` porque
  // el ala derecha anima en bucle (pivote en su base, gated); `OwlWings` la
  // resuelve. Las demás variantes siguen siendo JSX estático.
  wave: (animate, reduce) => (
    <>
      <ellipse cx="42" cy="140" rx="15" ry="37" fill={C.wing} />
      <motion.g
        style={{ transformBox: 'fill-box', transformOrigin: '50% 92%' }}
        animate={animate && !reduce ? { rotate: [0, -16, 6, -12, 0] } : { rotate: 0 }}
        transition={
          animate && !reduce
            ? { duration: 1.5, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }
            : { duration: 0 }
        }
      >
        <ellipse cx="168" cy="118" rx="13" ry="34" transform="rotate(30 168 118)" fill={C.wing} />
        <ellipse cx="166" cy="120" rx="5" ry="20" transform="rotate(30 168 118)" fill={C.wingHi} opacity="0.45" />
      </motion.g>
    </>
  )
};

export function OwlWings({ variant, animate = true, reduce = false }) {
  const v = WING_VARIANTS[variant] ? variant : 'rest';
  const still = reduce || !animate;
  // `wave` es función `(animate, reduce) => JSX` (ala que ondea); el resto son
  // JSX estático. Se resuelve aquí para que la variante anime gated por viewport.
  const raw = WING_VARIANTS[v];
  const content = typeof raw === 'function' ? raw(animate, reduce) : raw;
  return (
    <g data-otto-slot="wings">
      <AnimatePresence initial={false} mode="sync">
        <motion.g
          key={v}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: still ? { duration: 0 } : SLOT_FADE_IN }}
          exit={still ? { opacity: 0 } : { opacity: 0, transition: SLOT_FADE_OUT }}
        >
          {content}
        </motion.g>
      </AnimatePresence>
    </g>
  );
}
OwlWings.propTypes = { variant: PropTypes.string, animate: PropTypes.bool, reduce: PropTypes.bool };

/* ============================================================
   OJOS — open / wide / narrow / closedSmile / droopy
   ============================================================ */
// Centro de cada ojo (blanco). Las pupilas parten de aquí + offset.
const EYE_L = { x: 76, y: 104 };
const EYE_R = { x: 124, y: 104 };

const EYE_RADII = {
  open: { white: 25, iris: 12, hi: 4.6 },
  wide: { white: 26, iris: 13, hi: 6 },
  narrow: { white: 26, iris: 10, hi: 4 },
  droopy: { white: 24, iris: 11, hi: 4.6 }
};

// Contenido del ojo para UNA forma concreta. closedSmile (arco) y droopy
// (párpado caído) son estáticos; open/wide/narrow llevan la pupila MÓVIL
// (`motion.circle` cx/cy con muelle → mirada que se desliza, eye-tracking
// natural) y el parpadeo ambiental (loop scaleY, gated por `animate`).
function EyeContent({ side, variant, pupil, uid, animate, clipId }) {
  const c = side === 'left' ? EYE_L : EYE_R;

  if (variant === 'closedSmile') {
    const d = side === 'left' ? 'M64 100 Q76 114 88 100' : 'M112 100 Q124 114 136 100';
    return <path d={d} stroke={C.brow} strokeWidth="5.5" fill="none" strokeLinecap="round" />;
  }

  if (variant === 'droopy') {
    const r = EYE_RADII.droopy;
    // Párpado caído via clipPath + tapa superior. clipPath dentro de <defs>
    // para render correcto en Firefox/Safari (code review F5).
    return (
      <>
        <defs>
          <clipPath id={clipId}>
            <circle cx={c.x} cy={c.y + 2} r={r.white} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <circle cx={c.x} cy={c.y + 2} r={r.white} fill={C.eyeWhite} />
          <circle cx={c.x} cy={c.y + 13} r={r.iris} fill={`url(#owlIris-${uid})`} />
          <circle cx={c.x + 4} cy={c.y + 9} r="4.6" fill={C.eyeWhite} />
          <path
            d={side === 'left' ? 'M50 80 H102 V104 Q76 113 50 104 Z' : 'M98 80 H150 V104 Q124 113 98 104 Z'}
            fill={C.lid}
          />
        </g>
      </>
    );
  }

  const radii = EYE_RADII[variant] || EYE_RADII.open;
  const irisX = c.x + pupil.x;
  const irisY = c.y + 2 + pupil.y;
  // Pupila (cx/cy) con muelle = eye-tracking natural; radios (r) con morph
  // suave = open/wide/narrow se redimensionan sin pestañeo ni salto.
  const posT = animate ? PUPIL_SPRING : { duration: 0 };
  const rT = animate ? EYE_MORPH : { duration: 0 };

  const blink = animate ? { scaleY: [1, 1, 0.12, 1, 1] } : { scaleY: 1 };
  const blinkTransition = animate
    ? { duration: 5.2, times: [0, 0.49, 0.5, 0.51, 1], repeat: Infinity, ease: 'easeInOut', delay: side === 'right' ? 0.04 : 0 }
    : { duration: 0 };

  return (
    <motion.g
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      animate={blink}
      transition={blinkTransition}
    >
      <motion.circle cx={c.x} cy={c.y} fill={C.eyeWhite} initial={false} animate={{ r: radii.white }} transition={rT} />
      <motion.circle
        fill={`url(#owlIris-${uid})`}
        initial={false}
        animate={{ cx: irisX, cy: irisY, r: radii.iris }}
        transition={{ cx: posT, cy: posT, r: rT }}
      />
      <motion.circle
        fill={C.eyeWhite}
        initial={false}
        animate={{ cx: irisX + 4, cy: irisY - 5, r: radii.hi }}
        transition={{ cx: posT, cy: posT, r: rT }}
      />
      {/* Brillo secundario propio de `wide`: SIEMPRE montado; su radio anima a 0
          cuando el mood no es wide → aparece/desaparece sin "pop". */}
      <motion.circle
        fill={C.eyeWhite}
        opacity="0.7"
        initial={false}
        animate={{ cx: irisX - 6, cy: irisY + 6, r: variant === 'wide' ? 2.6 : 0 }}
        transition={{ cx: posT, cy: posT, r: rT }}
      />
    </motion.g>
  );
}
EyeContent.propTypes = {
  side: PropTypes.oneOf(['left', 'right']).isRequired,
  variant: PropTypes.string.isRequired,
  pupil: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }).isRequired,
  uid: PropTypes.string.isRequired,
  animate: PropTypes.bool,
  clipId: PropTypes.string
};

// Transición del ojo según el tipo de cambio:
//  · open↔wide↔narrow (familia redonda, misma estructura) → MORFAN los radios
//    en EyeContent, sin pestañeo (la mayoría de cambios de mood en partida).
//  · a/desde closedSmile (arco) o droopy (párpado) → estructuras distintas:
//    parpadeo-swap (dip de scaleY) que cambia la forma en el frame cerrado, de
//    paso un gesto de búho con carácter.
// La cara NUNCA se desmonta (continuidad). En reduced-motion / fuera de
// viewport cualquier cambio es instantáneo.
function SingleEye({ side, variant, pupil, uid, animate, reduce, clipId }) {
  const [rendered, setRendered] = useState(variant);
  const swap = useAnimationControls();

  // Dos efectos para que el ojo SIEMPRE reabra, incluso en cambios rápidos
  // A→B→A más cortos que el dip (antes el `cancelled` saltaba el reopen y, si
  // la variante volvía a la ya renderizada, el guard `variant===rendered` no
  // reabría → ojo atascado cerrado). Efecto 1: cierra y cambia la forma en el
  // frame cerrado (no reabre). Efecto 2: reabre cuando `rendered` ya iguala al
  // objetivo. Si una transición es superada, la siguiente (o el reopen) converge.
  useEffect(() => {
    if (variant === rendered) return undefined;
    // Morph dentro de la familia redonda (open/wide/narrow) → SIN parpadeo: los
    // radios del ojo animan suavemente en EyeContent. También instantáneo en
    // reduce-motion / fuera de viewport.
    if (isEyeMorphPair(rendered, variant) || reduce || !animate) {
      setRendered(variant);
      return undefined;
    }
    // Cambio de ESTRUCTURA (a/desde closedSmile o droopy) → parpadeo-swap que
    // oculta el cambio de forma tras un pestañeo de búho con carácter.
    let active = true;
    (async () => {
      try {
        await swap.start({ scaleY: 0.1 }, BLINK_CLOSE);
        if (active) setRendered(variant);
      } catch {
        // animación interrumpida (re-target por otro cambio): el efecto de
        // reapertura converge igualmente cuando `rendered === variant`.
      }
    })();
    return () => {
      active = false;
    };
  }, [variant, rendered, animate, reduce, swap]);

  useEffect(() => {
    if (reduce || !animate) return undefined;
    if (rendered === variant) {
      swap.start({ scaleY: 1 }, BLINK_OPEN);
    }
    return undefined;
  }, [rendered, variant, animate, reduce, swap]);

  return (
    <motion.g
      data-otto-eye={side}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      animate={swap}
    >
      <EyeContent side={side} variant={rendered} pupil={pupil} uid={uid} animate={animate} clipId={clipId} />
    </motion.g>
  );
}
SingleEye.propTypes = {
  side: PropTypes.oneOf(['left', 'right']).isRequired,
  variant: PropTypes.string.isRequired,
  pupil: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }).isRequired,
  uid: PropTypes.string.isRequired,
  animate: PropTypes.bool,
  reduce: PropTypes.bool,
  clipId: PropTypes.string
};

export function OwlEyes({ variant, pupil, uid, animate, reduce }) {
  return (
    <g data-otto-slot="eyes">
      <SingleEye side="left" variant={variant} pupil={pupil} uid={uid} animate={animate} reduce={reduce} clipId={`owlLidL-${uid}`} />
      <SingleEye side="right" variant={variant} pupil={pupil} uid={uid} animate={animate} reduce={reduce} clipId={`owlLidR-${uid}`} />
    </g>
  );
}
OwlEyes.propTypes = {
  variant: PropTypes.string.isRequired,
  pupil: PropTypes.object.isRequired,
  uid: PropTypes.string.isRequired,
  animate: PropTypes.bool,
  reduce: PropTypes.bool
};

/* ============================================================
   CEJAS — calm / soft / raised / curious / high / tense / sad
   ============================================================ */
const BROW_PATHS = {
  calm: { l: 'M58 79 Q76 72 94 78', r: 'M106 78 Q124 72 142 79', w: 5 },
  soft: { l: 'M60 84 Q76 78 92 83', r: 'M108 83 Q124 78 140 84', w: 4.5 },
  raised: { l: 'M56 75 Q76 64 96 74', r: 'M104 74 Q124 64 144 75', w: 5 },
  curious: { l: 'M58 80 Q76 74 94 79', r: 'M106 74 Q124 62 142 71', w: 5 },
  high: { l: 'M56 70 Q76 58 96 69', r: 'M104 69 Q124 58 144 70', w: 5 },
  tense: { l: 'M58 78 Q74 70 92 73', r: 'M108 73 Q126 70 142 78', w: 5 },
  sad: { l: 'M57 86 Q73 70 93 71', r: 'M107 71 Q127 70 143 86', w: 5.5 }
};
// Las cejas SÍ se morfan: las 7 variantes comparten estructura `M..Q..`
// (mismo nº/tipo de comandos) → Framer interpola los números del `d` sin
// saltos. Es el slot de mayor lectura facial (≈80% de la expresión) a coste
// mínimo. INVARIANTE: mantener todas las variantes como `M x y Q x y x y`.
export function OwlBrows({ variant, animate = true, reduce = false }) {
  const b = BROW_PATHS[variant] || BROW_PATHS.calm;
  const t = reduce || !animate ? { duration: 0 } : BROW_MORPH;
  return (
    <g data-otto-slot="brows" stroke={C.brow} fill="none" strokeLinecap="round">
      <motion.path initial={false} animate={{ d: b.l, strokeWidth: b.w }} transition={t} />
      <motion.path initial={false} animate={{ d: b.r, strokeWidth: b.w }} transition={t} />
    </g>
  );
}
OwlBrows.propTypes = { variant: PropTypes.string, animate: PropTypes.bool, reduce: PropTypes.bool };

/* ============================================================
   PICO — closed / closedSmall / openSmile / openSmileSmall / openO
   ============================================================ */
// Geometría del pico por variante (estructuras dispares: triángulos, elipses,
// dobles paths) → NO morfables. Se crossfadean.
function BeakShape({ variant }) {
  switch (variant) {
    case 'openSmile':
      return (
        <>
          <path d="M86 117 Q100 121 114 117 Q108 134 100 134 Q92 134 86 117 Z" fill={BEAK} />
          <path d="M91 119 Q100 121 109 119 Q105 126 100 126 Q95 126 91 119 Z" fill={C.beakShadow} opacity="0.55" />
        </>
      );
    case 'openSmileSmall':
      return (
        <>
          <path d="M90 118 Q100 121 110 118 Q105 128 100 128 Q95 128 90 118 Z" fill={BEAK} />
          <path d="M94 120 Q100 121 106 120 Q103 124 100 124 Q97 124 94 120 Z" fill={C.beakShadow} opacity="0.5" />
        </>
      );
    case 'openO':
      return (
        <>
          <ellipse cx="100" cy="126" rx="7" ry="9" fill={BEAK} />
          <ellipse cx="100" cy="128" rx="3.5" ry="5" fill={C.beakShadow} opacity="0.6" />
        </>
      );
    case 'closedSmall':
      return (
        <>
          <path d="M91 117 L109 117 L100 130 Z" fill={BEAK} />
          <path d="M100 117 L109 117 L100 130 Z" fill={C.beakShadow} />
        </>
      );
    case 'closed':
    default:
      return (
        <>
          <path d="M91 120 L109 120 L100 137 Z" fill={BEAK} />
          <path d="M100 120 L109 120 L100 137 Z" fill={C.beakShadow} />
        </>
      );
  }
}
BeakShape.propTypes = { variant: PropTypes.string };

export function OwlBeak({ variant, animate = true, reduce = false }) {
  const still = reduce || !animate;
  const v = variant || 'closed';
  return (
    <g data-otto-slot="beak">
      <AnimatePresence initial={false} mode="sync">
        <motion.g
          key={v}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: still ? { duration: 0 } : SLOT_FADE_IN }}
          exit={still ? { opacity: 0 } : { opacity: 0, transition: SLOT_FADE_OUT }}
        >
          <BeakShape variant={v} />
        </motion.g>
      </AnimatePresence>
    </g>
  );
}
OwlBeak.propTypes = { variant: PropTypes.string, animate: PropTypes.bool, reduce: PropTypes.bool };

export function OwlCheeks({ show, animate = true, reduce = false }) {
  const still = reduce || !animate;
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.g
          key="cheeks"
          data-otto-slot="cheeks"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: still ? { duration: 0 } : { duration: 0.22, ease: EASING.outQuart } }}
          exit={still ? { opacity: 0 } : { opacity: 0, transition: SLOT_FADE_OUT }}
        >
          <ellipse cx="58" cy="120" rx="9" ry="5.5" fill={C.cheek} opacity="0.33" />
          <ellipse cx="142" cy="120" rx="9" ry="5.5" fill={C.cheek} opacity="0.33" />
        </motion.g>
      )}
    </AnimatePresence>
  );
}
OwlCheeks.propTypes = { show: PropTypes.bool, animate: PropTypes.bool, reduce: PropTypes.bool };

/* ============================================================
   PROPS por mood (cada uno con su entrada animada)
   ============================================================ */
const propIn = (animate) => ({
  initial: animate ? { opacity: 0, scale: 0.6 } : false,
  animate: { opacity: 1, scale: 1 },
  exit: animate ? { opacity: 0, scale: 0.6 } : { opacity: 0 },
  transition: { type: 'spring', stiffness: 460, damping: 20 },
  // `fill-box` + origen central: el prop crece desde SU PROPIO centro. Sin
  // esto el `<g>` SVG escala desde el origen del viewBox (0,0) y el accesorio
  // "entra volando" desde la esquina superior izquierda en vez de aparecer in situ.
  style: { transformBox: 'fill-box', transformOrigin: 'center' }
});

function Sparkle({ animate }) {
  return (
    <motion.g {...propIn(animate)} style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <motion.path
        d="M151 68 l2.2 6.4 l6.4 2.2 l-6.4 2.2 l-2.2 6.4 l-2.2 -6.4 l-6.4 -2.2 l6.4 -2.2 Z"
        fill={SPARK}
        animate={animate ? { scale: [1, 1.25, 1], rotate: [0, 25, 0] } : undefined}
        transition={animate ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </motion.g>
  );
}

function Stars({ animate }) {
  return (
    <motion.g {...propIn(animate)}>
      <motion.path
        d="M150 62 l2.6 6.2 l6.7 1 l-5 4.6 l1.5 6.7 l-5.8 -3.6 l-5.8 3.6 l1.5 -6.7 l-5 -4.6 l6.7 -1 Z"
        fill={SPARK}
        animate={animate ? { scale: [0.85, 1.15, 0.85], rotate: [0, 18, 0] } : undefined}
        transition={animate ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
      <motion.path
        d="M42 80 l2 5 l5.2 0.8 l-4 3.6 l1.2 5.2 l-4.4 -2.8 l-4.4 2.8 l1.2 -5.2 l-4 -3.6 l5.2 -0.8 Z"
        fill={SPARK}
        animate={animate ? { scale: [1.1, 0.8, 1.1], rotate: [0, -20, 0] } : undefined}
        transition={animate ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut', delay: 0.3 } : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    </motion.g>
  );
}

function ThoughtCloud({ animate }) {
  return (
    <motion.g {...propIn(animate)}>
      <circle cx="129" cy="84" r="2.6" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1" />
      <circle cx="138" cy="74" r="4" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1" />
      <circle cx="149" cy="62" r="6" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1.2" />
      <circle cx="145" cy="34" r="13" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1.5" />
      <circle cx="166" cy="22" r="17" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1.5" />
      <circle cx="188" cy="34" r="13" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1.5" />
      <circle cx="167" cy="46" r="14" fill={C.eyeWhite} stroke={C.cloudOutline} strokeWidth="1.5" />
      <rect x="146" y="22" width="42" height="24" fill={C.eyeWhite} />
      <motion.text
        x="167" y="42" fontSize="24" fontWeight="700" fill={C.irisTop} textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        animate={animate ? { opacity: [0.55, 1, 0.55] } : undefined}
        transition={animate ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >?</motion.text>
    </motion.g>
  );
}

function PomPom({ tx, ty, rot = 0, scale = 1 }) {
  return (
    <g transform={`translate(${tx},${ty}) rotate(${rot}) scale(${scale})`}>
      <rect x="-3" y="3" width="6" height="26" rx="3" fill={C.pomHandle} />
      <g stroke={C.pomMain} strokeWidth="3.6" strokeLinecap="round">
        <path d="M6 0 L19 0" /><path d="M5.2 3 L16.5 9.5" /><path d="M3 5.2 L9.5 16.5" />
        <path d="M0 6 L0 19" /><path d="M-3 5.2 L-9.5 16.5" /><path d="M-5.2 3 L-16.5 9.5" />
        <path d="M-6 0 L-19 0" /><path d="M-5.2 -3 L-16.5 -9.5" /><path d="M-3 -5.2 L-9.5 -16.5" />
        <path d="M0 -6 L0 -19" /><path d="M3 -5.2 L9.5 -16.5" /><path d="M5.2 -3 L16.5 -9.5" />
      </g>
      <g stroke={C.pomLight} strokeWidth="2.8" strokeLinecap="round">
        <path d="M5.8 1.6 L14 4" /><path d="M4.2 4.2 L10.5 10.5" /><path d="M1.6 5.8 L4 14" />
        <path d="M-1.6 5.8 L-4 14" /><path d="M-4.2 4.2 L-10.5 10.5" /><path d="M-5.8 1.6 L-14 4" />
        <path d="M-5.8 -1.6 L-14 -4" /><path d="M-4.2 -4.2 L-10.5 -10.5" /><path d="M-1.6 -5.8 L-4 -14" />
        <path d="M1.6 -5.8 L4 -14" /><path d="M4.2 -4.2 L10.5 -10.5" /><path d="M5.8 -1.6 L14 -4" />
      </g>
      <circle cx="0" cy="0" r="8" fill={C.pomMain} />
      <circle cx="-3" cy="-2.5" r="4.6" fill={C.pomLight} />
      <circle cx="3.2" cy="2.6" r="3.6" fill={C.pomDark} />
    </g>
  );
}
PomPom.propTypes = { tx: PropTypes.number, ty: PropTypes.number, rot: PropTypes.number, scale: PropTypes.number };

// Pompones SUJETOS en la punta de las alas levantadas (ver variante de ala
// `pompom`): se posan en el extremo de cada brazo extendido, arriba y a los
// lados, y agitan en sitio.
function PomPoms({ animate }) {
  return (
    <motion.g {...propIn(animate)}>
      <motion.g
        animate={animate ? { rotate: [0, -10, 0] } : undefined}
        transition={animate ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        <PomPom tx={17} ty={82} rot={-16} scale={0.85} />
      </motion.g>
      <motion.g
        animate={animate ? { rotate: [0, 10, 0] } : undefined}
        transition={animate ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: 0.1 } : undefined}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      >
        <PomPom tx={183} ty={82} rot={16} scale={0.85} />
      </motion.g>
    </motion.g>
  );
}

// Gesto de SEÑALAR = ala/brazo índigo extendido (parte del cuerpo de Otto) +
// flecha ámbar indicadora encima. Recupera el "ala extendida" de la hoja de
// modelo: sin ella la flecha flotaba suelta y no se leía que Otto señalara (la
// queja recurrente). Va en la capa de props → se dibuja SOBRE el cuerpo (Otto
// adelanta el ala), co-anima con la flecha (empuje hacia el objetivo) y entra/
// sale con el mood. El ala redondeada nace del costado derecho del cuerpo.
function Arrow({ animate }) {
  return (
    <motion.g
      initial={animate ? { opacity: 0, x: -10 } : false}
      animate={animate ? { opacity: 1, x: [0, 6, 0] } : { opacity: 1 }}
      exit={{ opacity: 0, x: -10 }}
      transition={animate ? { x: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.22 } } : { duration: 0.2 }}
    >
      {/* Ala/brazo extendida (índigo de identidad) saliendo del costado. */}
      <path d="M148 119 Q172 111 197 119 Q174 129 148 134 Z" fill={C.wing} />
      <path d="M153 121 Q173 116 191 121" stroke={C.wingHi} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5" />
      {/* Flecha ámbar (indicador de dirección, por encima del ala). */}
      <rect x="151" y="92" width="29" height="11" rx="5.5" fill={BEAK} stroke={C.beakShadow} strokeWidth="1.5" />
      <path d="M175 81 L199 97.5 L175 114 Z" fill={BEAK} stroke={C.beakShadow} strokeWidth="1.5" strokeLinejoin="round" />
    </motion.g>
  );
}

function SweatDrop({ animate }) {
  return (
    <motion.g
      initial={animate ? { opacity: 0, y: -4 } : false}
      animate={animate ? { opacity: 1, y: [0, 3, 0] } : { opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={animate ? { y: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }, opacity: { duration: 0.3 } } : { duration: 0.2 }}
    >
      <path d="M152 80 C143 98 143 111 152 118 C161 111 161 98 152 80 Z" fill={TEAR} />
      <ellipse cx="148.5" cy="99" rx="2" ry="4" fill={C.eyeWhite} opacity="0.65" />
    </motion.g>
  );
}

function Tear({ animate }) {
  return (
    <motion.g
      initial={animate ? { opacity: 0, scale: 0.6 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <motion.path
        d="M72 126 C66 138 66 148 73 153 C80 148 80 138 72 126 Z"
        fill={TEAR}
        animate={animate ? { y: [0, 2, 0] } : undefined}
        transition={animate ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
      <ellipse cx="70.5" cy="139" rx="1.6" ry="3.4" fill={C.eyeWhite} opacity="0.6" />
    </motion.g>
  );
}

function Exclaim({ animate }) {
  return (
    <motion.g
      initial={animate ? { opacity: 0, scale: 0, y: 6 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 16 }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      <path d="M147 36 L159 36 L156.5 62 L149.5 62 Z" fill={EXCLAIM} />
      <circle cx="153" cy="71" r="5" fill={EXCLAIM} />
      <path d="M52 50 l-7 -5 M61 41 l-3 -8" stroke={EXCLAIM} strokeWidth="3" strokeLinecap="round" />
    </motion.g>
  );
}

const PROP_COMPONENTS = {
  sparkle: Sparkle,
  stars: Stars,
  thoughtCloud: ThoughtCloud,
  pomPoms: PomPoms,
  arrow: Arrow,
  sweatDrop: SweatDrop,
  tear: Tear,
  exclaim: Exclaim
};

// AnimatePresence PROPIO (sin mode="wait"): cuando cambia `names` con el mood,
// el prop saliente corre su `exit` (antes muerto: no había presencia que lo
// orquestara) y el entrante su `enter`, SOLAPADOS y sin tocar la cara. Los
// loops `repeat: Infinity` internos siguen gated por `animate`.
export function OwlProps({ names, animate }) {
  return (
    <g data-otto-slot="props">
      <AnimatePresence initial={false} mode="sync">
        {names.map((name) => {
          const Comp = PROP_COMPONENTS[name];
          return Comp ? <Comp key={name} animate={animate} /> : null;
        })}
      </AnimatePresence>
    </g>
  );
}
OwlProps.propTypes = { names: PropTypes.array, animate: PropTypes.bool };

/* ============================================================
   OwlFace — compone la cara (cejas + ojos + mejillas + pico) para un mood.
   PERSISTENTE: nunca se desmonta al cambiar de mood; cada slot transiciona
   en el sitio (continuidad sobre teletransporte).
   ============================================================ */
export function OwlFace({ mood, uid, animate, reduce, gaze }) {
  const expr = EXPRESSIONS[mood] || EXPRESSIONS.idle;
  // `gaze` (mirada ambiental) se SUMA al offset de pupila del mood: en reposo
  // Otto "echa un vistazo" y la pupila se desliza vía su muelle (eye-tracking).
  // Clamp para que la pupila + gaze nunca saque el iris del blanco del ojo
  // (radio libre blanco-iris ≈13; `thinking` parte de {7,-4} → {7,0}+gaze
  // {7,0} = {14,-4} se vería bizco). Límites {9,7} → magnitud ≤11.4 < 13.
  const pupil =
    gaze && (gaze.x || gaze.y)
      ? {
          x: clampPupil(expr.pupil.x + gaze.x, 9),
          y: clampPupil(expr.pupil.y + gaze.y, 7)
        }
      : expr.pupil;
  return (
    <g data-otto-face>
      <OwlBrows variant={expr.brows} animate={animate} reduce={reduce} />
      <OwlEyes variant={expr.eyes} pupil={pupil} uid={uid} animate={animate} reduce={reduce} />
      <OwlCheeks show={expr.cheeks} animate={animate} reduce={reduce} />
      <OwlBeak variant={expr.beak} animate={animate} reduce={reduce} />
    </g>
  );
}
OwlFace.propTypes = {
  mood: PropTypes.string.isRequired,
  uid: PropTypes.string.isRequired,
  animate: PropTypes.bool,
  reduce: PropTypes.bool,
  gaze: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number })
};
