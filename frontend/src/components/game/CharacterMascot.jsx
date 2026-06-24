import { m as motion, AnimatePresence, useInView } from 'framer-motion';
import { useRef, useMemo, useId, useState, useEffect, memo } from 'react';
import PropTypes from 'prop-types';
import { cn, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getMechanicTheme } from '../../lib/mechanicTheme';
import { EXPRESSIONS, bodyAnimFor } from './mascot/owlExpressions';
import {
  OwlDefs, OwlShadow, OwlEars, OwlWings, OwlBody, OwlFeet, OwlFace, OwlProps
} from './mascot/owlParts';

// Animación CORPORAL por mood. Solo `transform` (GPU-friendly). El rig
// (cara, props, parpadeo) aporta la micro-expresividad; esto da el "peso"
// y la energía juguetona del cuerpo entero.
const bodyAnimation = {
  // Reposo: flotar + micro-respiración (escala sutil) → "vivo" sin coste.
  float: {
    y: [0, -8, 0],
    scale: [1, 1.02, 1],
    transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' }
  },
  bounce: {
    y: [0, -14, 0],
    scale: [1, 1.08, 1],
    transition: { duration: 0.5, repeat: Infinity, ease: 'easeOut' }
  },
  jump: {
    y: [0, -28, 0],
    rotate: [0, 8, -8, 0],
    transition: { duration: 0.6, repeat: Infinity, ease: 'easeOut' }
  },
  nod: {
    rotate: [0, 5, -5, 0],
    transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' }
  },
  tilt: {
    rotate: [0, 14, 0],
    transition: { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
  },
  sway: {
    x: [-5, 5, -5],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  // Gestura de señalar: inclina y empuja hacia el objetivo (sin cliché de mano).
  point: {
    rotate: [0, 5, 8, 5, 0],
    x: [0, 4, 6, 4, 0],
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
  },
  // Preocupación contenida: micro-oscilación X + leve opacity. NO shake
  // (evita parecer un error de validación).
  wobble: {
    x: [0, -2, 2, -2, 0],
    opacity: [1, 0.9, 1, 0.9, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
  },
  // Sorpresa puntual: un solo "pop" enérgico, sin repeat (el asombro decae).
  pop: {
    scale: [1, 1.28, 0.96, 1.06, 1],
    rotate: [0, -4, 4, -2, 0],
    transition: { duration: 0.7, ease: 'easeOut' }
  }
};

// Mapa glow (familia de color del halo) → clase Tailwind.
const GLOW_CLASS = {
  success: 'bg-success-base/25',
  warning: 'bg-warning-base/30',
  warningSoft: 'bg-warning-base/15',
  brand: 'bg-brand-light/20',
  error: 'bg-error-base/18',
  pink: 'bg-accent-pink/25'
};

// Ancho FLUIDO del personaje por tamaño (clamp por viewport). Se ajusta a la
// resolución para que Otto no quede diminuto en 4K ni invada en 720p; al ser
// vectorial, sus detalles se aprecian nítidos en toda la escalera. El alto se
// deriva del viewBox 200x215 vía aspect-ratio.
const SIZE_CLAMP = {
  sm: 'clamp(78px, 4.5vw + 30px, 118px)',
  md: 'clamp(98px, 5.5vw + 42px, 150px)',
  lg: 'clamp(120px, 6vw + 56px, 188px)'
};

const greetingPool = [
  '¡Hola!',
  '¿Jugamos?',
  '¡Vamos!',
  '¿Empezamos?',
  '¿Listos?',
  '¡Aquí estoy!'
];

// Delight ambiental "con firma": en moods de REPOSO (idle/thinking) Otto "echa
// un vistazo" de vez en cuando — la pupila se desliza a un objetivo y vuelve al
// centro, reutilizando el muelle de la pupila del rig. Baja frecuencia y
// ALEATORIZADA (no metronómica) → se siente vivo sin distraer; en partida los
// moods son reactivos y frecuentes, así que esto luce especialmente en
// superficies en reposo (login, estados vacíos). Se desactiva fuera de viewport
// y en reduced-motion (`active=false`), donde se mantiene la mirada centrada.
const GAZE_RESTING_MOODS = new Set(['idle', 'thinking']);
const GAZE_TARGETS = [
  { x: 6, y: 1 },
  { x: -6, y: 1 },
  { x: 4, y: -3 },
  { x: -4, y: -3 },
  { x: 7, y: 0 }
];

function useAmbientGaze(mood, active) {
  const [gaze, setGaze] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!active || !GAZE_RESTING_MOODS.has(mood)) {
      setGaze({ x: 0, y: 0 });
      return undefined;
    }
    let timer;
    const scheduleNext = () => {
      // 2.8–6.4s entre vistazos (aleatorio → no metronómico).
      // eslint-disable-next-line sonarjs/pseudo-random -- cadencia visual de la mirada, no requiere CSPRNG
      const delay = 2800 + Math.random() * 3600;
      timer = globalThis.setTimeout(() => {
        // eslint-disable-next-line sonarjs/pseudo-random -- selección visual de objetivo de mirada
        setGaze(GAZE_TARGETS[Math.floor(Math.random() * GAZE_TARGETS.length)]);
        // …vuelve al centro tras ~1s y reprograma.
        timer = globalThis.setTimeout(() => {
          setGaze({ x: 0, y: 0 });
          scheduleNext();
        }, 1000);
      }, delay);
    };
    scheduleNext();
    return () => globalThis.clearTimeout(timer);
  }, [mood, active]);

  return gaze;
}

/**
 * Otto — mascota búho con rig SVG paramétrico (sustituye al emoji 🦉 +
 * accesorios). Render idéntico en cualquier navegador y expresión facial real
 * (ojos, párpados, cejas, pico que cambian) en los 9 moods. El "cerebro"
 * (`useGameFeedback` + `mascotDialog.js`) y el bocadillo/halo/gating se
 * conservan: este componente es presentacional.
 *
 * @param {Object} props
 * @param {'idle'|'greeting'|'happy'|'encouraging'|'celebrating'|'thinking'|'sad'|'pointing'|'worried'|'surprised'} props.mood
 * @param {string} [props.message] - Mensaje contextual en burbuja.
 * @param {'left'|'right'} [props.position]
 * @param {'memory'|'association'|'sequence'|null} [props.mechanicType] - Tinta el halo en estados pasivos.
 * @param {'sm'|'md'|'lg'} [props.size] - Tamaño del personaje (sm esquina, lg héroe GameOver).
 * @param {boolean} [props.isFirstAppearance=false] - Entrada deslizante lateral en el primer mount.
 * @param {boolean} [props.noBubble=false] - Suprime el bocadillo (ilustración decorativa).
 * @param {string} [props.className]
 */
// memo: GameSession re-renderiza por cada scan; las props de Otto solo
// cambian en eventos significativos (mood, message, mechanicType).
function CharacterMascot({
  mood = 'idle',
  message,
  position = 'left',
  mechanicType = null,
  size = 'sm',
  isFirstAppearance = false,
  noBubble = false,
  bubbleTimeout = 0,
  className
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const rawId = useId();
  const uid = useMemo(() => rawId.replace(/:/g, ''), [rawId]);
  const lastMsgRef = useRef(-1);

  // M3: pausar loops `repeat: Infinity` fuera del viewport.
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: false, margin: '0px' });
  const animationsActive = isInView && !shouldReduceMotion;

  // Mirada ambiental (delight con firma) en moods de reposo.
  const gaze = useAmbientGaze(mood, animationsActive);

  const expr = EXPRESSIONS[mood] || EXPRESSIONS.idle;
  const bodyAnim = bodyAnimFor(mood);

  // Halo: en estados pasivos (idle/thinking/pointing) se tinta con el accent
  // de la mecánica activa para mantener la identidad por mecánica; en los
  // estados expresivos manda el color del mood (celebración/consuelo/sorpresa).
  const mechanicGlowVar = mechanicType ? getMechanicTheme(mechanicType).accentVar : null;
  const useMechanicTint = mechanicGlowVar && expr.glow === 'mechanic';
  const glowClass = useMechanicTint
    ? null
    : (GLOW_CLASS[expr.glow] || 'bg-text-muted/10');

  const widthClamp = SIZE_CLAMP[size] || SIZE_CLAMP.sm;

  // Greeting rotativo en idle/greeting sin `message` (evita slop de mensajes
  // genéricos descontextualizados en moods expresivos). `greeting` saluda con
  // el ala mientras dice "¡Hola!"/"¿Jugamos?"… (bienvenida del login).
  const rotatingMessage = useMemo(() => {
    if (mood !== 'idle' && mood !== 'greeting') return null;
    if (greetingPool.length <= 1) return greetingPool[0];
    let idx;
    do {
      // eslint-disable-next-line sonarjs/pseudo-random -- selección visual de saludo, no requiere CSPRNG
      idx = Math.floor(Math.random() * greetingPool.length);
    } while (idx === lastMsgRef.current && greetingPool.length > 1);
    lastMsgRef.current = idx;
    return greetingPool[idx];
  }, [mood]);

  // Auto-dismiss del bocadillo (opt-in vía `bubbleTimeout` ms). En partida las
  // frases son EFÍMERAS: Otto las dice y la burbuja se desvanece tras unos
  // segundos manteniendo el mood facial, para que ninguna frase quede "fuera de
  // lugar" colgada hasta el siguiente evento. En superficies ambientales
  // (login, estados vacíos) se omite → bienvenida persistente.
  const [bubbleHidden, setBubbleHidden] = useState(false);
  useEffect(() => {
    if (!bubbleTimeout || !message) {
      setBubbleHidden(false);
      return undefined;
    }
    setBubbleHidden(false);
    const t = setTimeout(() => setBubbleHidden(true), bubbleTimeout);
    return () => clearTimeout(t);
  }, [message, bubbleTimeout]);

  const displayMessage = noBubble || bubbleHidden ? null : (message || rotatingMessage);

  return (
    <div
      ref={containerRef}
      className={cn('relative', position === 'left' ? 'items-start' : 'items-end', className)}
    >
      {/* Bocadillo */}
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={displayMessage}
            // Decorativo para lectores de pantalla: el bocadillo duplica info que
            // ya aporta la página (consigna, resultado vía aria-live propio, o el
            // dialog del GameOver). Sin esto el SR leería texto estático y
            // redundante. El SVG ya es aria-hidden; faltaba el bocadillo.
            aria-hidden="true"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85, y: 6 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASING.outQuart }}
            className={cn(
              // El bocadillo ancla su BORDE INFERIOR al borde superior de Otto
              // (`bottom-full`) y crece hacia ARRIBA: gap constante (~8px) y
              // nunca lo tapa, sea 1/2/3 líneas o tamaño sm/lg. (Antes `-top-16`
              // fijo → una frase de 2 líneas quedaba a 8px y 3 líneas lo tapaban.)
              'absolute bottom-full mb-2 max-w-48 z-10',
              'bg-glass-bg backdrop-blur-sm',
              'px-3 py-1.5 rounded-2xl',
              'border border-glass-border',
              'text-text-primary text-sm font-medium',
              position === 'left' ? 'left-0' : 'right-0'
            )}
          >
            {displayMessage}
            <div className={cn(
              'absolute -bottom-2 size-4',
              'bg-glass-bg border-l border-b border-glass-border',
              'rotate-[-45deg]',
              position === 'left' ? 'left-4' : 'right-4'
            )} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Wrapper EXTERNO: entrada (una sola vez) — desliza + funde. La opacidad
          y la `x` de entrada SOLO viven aquí y SIEMPRE resuelven a {x:0,
          opacity:1}. Antes la entrada y la animación corporal compartían un
          único `animate`: como las animaciones de cuerpo (float/sway/…) no
          declaran `opacity` ni `x`, Framer dejaba a Otto congelado en su estado
          inicial (opacity:0, x:-60) → invisible y desplazado. Separar ambos lo
          evita. */}
      <motion.div
        initial={
          shouldReduceMotion || !isFirstAppearance
            ? false
            : { x: position === 'right' ? 60 : -60, opacity: 0 }
        }
        animate={{ x: 0, opacity: 1 }}
        transition={
          isFirstAppearance && !shouldReduceMotion
            ? { x: { duration: 0.6, ease: EASING.outExpo }, opacity: { duration: 0.4 } }
            : { duration: 0 }
        }
        className="relative"
        style={{ width: widthClamp, aspectRatio: '200 / 215' }}
      >
        {/* Wrapper INTERNO: animación corporal en bucle (y/scale/rotate y, en
            sway/point, su propia oscilación de x). Nunca toca la opacidad. */}
        <motion.div
          className="relative size-full"
          animate={
            animationsActive
              ? bodyAnimation[bodyAnim]
              : { x: 0, y: 0, scale: 1, rotate: 0 }
          }
        >
          {/* Halo difuso */}
          <div
            className={cn('absolute inset-0 rounded-full blur-xl', glowClass)}
            style={
              useMechanicTint
                ? { backgroundColor: `color-mix(in oklab, var(${mechanicGlowVar}) 22%, transparent)` }
                : undefined
            }
          />

          {/* El búho */}
          <svg
            viewBox="0 0 200 215"
            width="100%"
            height="100%"
            data-otto-size={size}
            className="relative block select-none"
            style={{ overflow: 'visible', filter: 'drop-shadow(0 6px 10px oklch(27% 0.1 285 / 0.28))' }}
            aria-hidden="true"
          >
            <OwlDefs uid={uid} />
            <OwlShadow />
            <OwlEars />
            <OwlWings variant={expr.wings} animate={animationsActive} reduce={shouldReduceMotion} />
            <OwlBody uid={uid} />
            <OwlFeet />
            {/* Cara + props PERSISTENTES: NUNCA se desmontan al cambiar de mood.
                Cada slot (cejas/ojos/pico/mejillas/alas) transiciona EN EL SITIO y
                los props entran/salen por su propio AnimatePresence solapado. Esto
                elimina el "blank-out" del rig que provocaba el `mode="wait"` keyed
                por mood: ojos/pico desaparecían ~0.22-0.44s en cada cambio (timeout)
                y el ala/pompones se desincronizaban del prop. Continuidad sobre
                teletransporte (ui-animation / emil-design-eng). */}
            <OwlFace mood={mood} uid={uid} animate={animationsActive} reduce={shouldReduceMotion} gaze={gaze} />
            <OwlProps names={expr.props} animate={animationsActive} />
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}

CharacterMascot.propTypes = {
  mood: PropTypes.oneOf([
    'idle', 'greeting', 'happy', 'encouraging', 'celebrating', 'thinking', 'sad',
    'pointing', 'worried', 'surprised'
  ]),
  message: PropTypes.string,
  position: PropTypes.oneOf(['left', 'right']),
  mechanicType: PropTypes.oneOf(['memory', 'association', 'sequence', null]),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  isFirstAppearance: PropTypes.bool,
  noBubble: PropTypes.bool,
  bubbleTimeout: PropTypes.number,
  className: PropTypes.string
};

export default memo(CharacterMascot);
