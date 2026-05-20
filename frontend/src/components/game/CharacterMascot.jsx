import { m as motion, AnimatePresence, useInView } from 'framer-motion';
import { useRef, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { Star, Sparkles } from 'lucide-react';
import { cn, EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { getMechanicTheme } from '../../lib/mechanicTheme';
import MascotAccessory from './MascotAccessory';

const bodyAnimation = {
  float: {
    y: [0, -8, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  bounce: {
    y: [0, -15, 0],
    scale: [1, 1.1, 1],
    transition: { duration: 0.5, repeat: Infinity }
  },
  jump: {
    y: [0, -30, 0],
    rotate: [0, 10, -10, 0],
    transition: { duration: 0.6, repeat: Infinity }
  },
  nod: {
    rotate: [0, 5, -5, 0],
    transition: { duration: 1, repeat: Infinity }
  },
  tilt: {
    rotate: [0, 15, 0],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  sway: {
    x: [-5, 5, -5],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' }
  },
  // T-953 Fase 2.2 — nuevos moods.
  // `pointRight`: gestura indexadora (subir y rotate-y), tilt-right ligero
  // para que se sienta "señalando" sin caer en cliché de mano levantada.
  pointRight: {
    rotate: [0, 5, 8, 5, 0],
    x: [0, 4, 6, 4, 0],
    transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
  },
  // `wobble`: oscilación micro X + opacity para "preocupación contenida".
  // No usamos shake para no parecer error de validación.
  wobble: {
    x: [0, -2, 2, -2, 0],
    opacity: [1, 0.85, 1, 0.85, 1],
    transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
  },
  // `pop`: respuesta de sorpresa puntual. NO usa repeat:Infinity porque
  // el "asombro" decae rápido en la realidad — repetir lo convierte en
  // tic visual molesto. Se reproduce una vez al cambio de mood y luego
  // se queda quieto hasta el siguiente trigger.
  pop: {
    scale: [1, 1.3, 0.95, 1.05, 1],
    rotate: [0, -4, 4, -2, 0],
    transition: { duration: 0.7, ease: 'easeOut' }
  },
};

const expressions = {
  idle: { bodyAnim: 'float' },
  happy: { bodyAnim: 'bounce' },
  encouraging: { bodyAnim: 'nod' },
  celebrating: { bodyAnim: 'jump' },
  thinking: { bodyAnim: 'tilt' },
  sad: { bodyAnim: 'sway' },
  // T-953 Fase 2.2: 3 moods nuevos para más expresividad.
  pointing: { bodyAnim: 'pointRight' },
  worried: { bodyAnim: 'wobble' },
  surprised: { bodyAnim: 'pop' },
};

// Pool minimal de "greeting" — solo se usa cuando NO se pasa `message`
// como prop. Esto solo ocurre en el primer render antes del primer
// validation_result (la mascota saluda al alumno) o en las pocas
// pantallas donde se monta sin hook (por ahora ninguna). Para los moods
// expresivos (happy/encouraging/celebrating/sad/thinking/pointing/
// worried/surprised), el `message` viene siempre desde
// `useGameFeedback` con la frase de `mascotDialog.js` por mecánica
// (T-953 Fase 2.1, sesión 2026-05-09). Mantener pools genéricos por
// mood era código muerto: el hook ya decide la frase y nunca deja
// `message` vacío en esos casos.
const greetingPool = ['¡Hola!', '¿Jugamos?', '¡Vamos!'];

/**
 * Mascota animada híbrida (emoji 🦉 + accesorios SVG) que acompaña al niño durante el juego.
 * El emoji base es siempre 🦉 para consistencia de identidad.
 * La expresividad se logra con accesorios SVG superpuestos y animaciones corporales.
 *
 * @param {Object} props
 * @param {'idle'|'happy'|'encouraging'|'celebrating'|'thinking'|'sad'|'pointing'|'worried'|'surprised'} props.mood
 * @param {string} props.message - Mensaje contextual en burbuja de diálogo
 * @param {'left' | 'right'} props.position
 * @param {'memory'|'association'|'sequence'|null} props.mechanicType
 *   Mecánica activa. Tinta el halo en estados pasivos (idle/thinking) y
 *   selecciona el accesorio SVG mecánica-aware en estados expresivos
 *   (thinking, celebrating).
 * @param {boolean} [props.isFirstAppearance=false]
 *   Cuando es true, la mascota entra deslizando lateralmente en lugar
 *   del fade-scale habitual. Útil al montarse en GameSession por primera
 *   vez para que el alumno note el "saludo" sin necesidad de mood nuevo.
 */
// T-907 F: memo evita re-render por cambios irrelevantes de props del padre
// (GameSession.jsx re-renderiza por cada scan; las props de la mascota solo
// cambian en eventos significativos — mood, message, mechanicType — y el
// shallow-compare por defecto detecta eso correctamente).
function CharacterMascot({
  mood = 'idle',
  message,
  position = 'left',
  mechanicType = null,
  isFirstAppearance = false,
  noBubble = false,
  className
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const lastMsgRef = useRef(-1);

  // Sprint 0 pre-v1.0.0 (M3): pausamos los loops `repeat: Infinity` cuando
  // la mascota está fuera del viewport (típicamente tras navegar a GameOver
  // o desplazarse). Sin esto, Framer Motion mantiene cada loop activo
  // gastando CPU/RAF aunque el usuario no lo vea. `once: false` permite
  // reanudar al volver a entrar (e.g. scroll back).
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: false, margin: '0px' });
  const animationsActive = isInView && !shouldReduceMotion;

  const expr = expressions[mood];

  // ADR-D + T-953 Fase 2.2: cuando la mecánica está disponible, el glow
  // se tinta con su accent color en estados pasivos (idle, thinking,
  // pointing) para mantener la identidad por mecánica incluso entre
  // rondas. Para los estados expresivos (happy/celebrating/encouraging/
  // sad/worried/surprised) el glow propio del mood manda — son momentos
  // de celebración, consuelo o sorpresa donde la mecánica pasa a
  // segundo plano (la emoción es lo que importa).
  const mechanicGlowVar = mechanicType
    ? getMechanicTheme(mechanicType).accentVar
    : null;
  const useMechanicTintForGlow =
    mechanicGlowVar && (mood === 'idle' || mood === 'thinking' || mood === 'pointing');

  // Selecciona una frase de "greeting" rotativa SOLO cuando el caller no
  // pasa `message` y el mood es idle. En el resto de moods, si no hay
  // `message`, no mostramos burbuja (el hook es la fuente canónica de
  // frases — `mascotDialog.js`). Esto evita el "AI slop" de mostrar
  // mensajes genéricos descontextualizados cuando la mascota está en
  // happy/encouraging/sad pero el caller olvidó pasar message.
  const rotatingMessage = useMemo(() => {
    if (mood !== 'idle') return null;
    if (greetingPool.length <= 1) return greetingPool[0];
    let idx;
    do {
      // eslint-disable-next-line sonarjs/pseudo-random -- seleccion aleatoria de mensaje visual, no requiere seguridad criptografica
      idx = Math.floor(Math.random() * greetingPool.length);
    } while (idx === lastMsgRef.current && greetingPool.length > 1);
    lastMsgRef.current = idx;
    return greetingPool[idx];
  }, [mood]);

  // `noBubble` permite usar la mascota como ilustración decorativa sin
  // bocadillo (OnboardingOverlay, EmptyState, etc. — sitios donde el mensaje
  // principal ya está en el contenedor padre y la burbuja generaría
  // redundancia visual + solape con el layout del padre). ADR-163.
  const displayMessage = noBubble ? null : (message || rotatingMessage);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        position === 'left' ? 'items-start' : 'items-end',
        className
      )}
    >
      {/* Speech bubble */}
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            key={displayMessage}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 6 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASING.outQuart }}
            className={cn(
              "absolute -top-20 max-w-48 z-10",
              "bg-glass-bg backdrop-blur-sm",
              "px-3 py-1.5 rounded-2xl",
              "border border-glass-border",
              "text-text-primary text-sm font-medium",
              position === 'left' ? 'left-0' : 'right-0'
            )}
          >
            {displayMessage}
            {/* Bubble tail */}
            <div className={cn(
              "absolute -bottom-2 size-4",
              "bg-glass-bg border-l border-b border-glass-border",
              "rotate-[-45deg]",
              position === 'left' ? 'left-4' : 'right-4'
            )} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mascot container — `isFirstAppearance` añade un slide lateral
          (desde la izquierda si position=left, de la derecha si right)
          al primer mount, para que la mascota se sienta "saludando" en
          lugar de aparecer de la nada. Después la animación pasa al
          loop bodyAnimation normal. */}
      <motion.div
        initial={
          shouldReduceMotion || !isFirstAppearance
            ? false
            : { x: position === 'right' ? 60 : -60, opacity: 0 }
        }
        animate={
          animationsActive
            ? bodyAnimation[expr.bodyAnim]
            : { x: 0, y: 0, scale: 1, rotate: 0 }
        }
        transition={
          isFirstAppearance && !shouldReduceMotion
            ? { x: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.4 } }
            : undefined
        }
        className="relative"
      >
        {/* Glow effect — un color por familia de mood:
            celebrating/happy → warmth (warning/success),
            encouraging      → brand soft (acompañamiento),
            sad/worried      → warning soft / error soft (atención),
            surprised        → accent-pink (chispa de sorpresa),
            idle/thinking/pointing → tint mecánica si hay, gris neutro si no. */}
        <div
          className={cn(
            'absolute inset-0 rounded-full blur-xl',
            mood === 'celebrating' && 'bg-warning-base/30',
            mood === 'happy' && 'bg-success-base/20',
            mood === 'encouraging' && 'bg-brand-light/20',
            mood === 'sad' && 'bg-warning-base/15',
            mood === 'worried' && 'bg-error-base/15',
            mood === 'surprised' && 'bg-accent-pink/25',
            !useMechanicTintForGlow &&
              (mood === 'idle' || mood === 'thinking' || mood === 'pointing') &&
              'bg-text-muted/10'
          )}
          style={
            useMechanicTintForGlow
              ? {
                  // Halo tintado con el accent de la mecánica (ADR-D).
                  // ~22% opacity con color-mix para que respete tema oscuro.
                  backgroundColor: `color-mix(in oklab, var(${mechanicGlowVar}) 22%, transparent)`
                }
              : undefined
          }
        />

        {/* Mascot emoji — always 🦉 for identity consistency */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mood}
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.8 }}
            animate={{
              opacity: 1,
              scale: !shouldReduceMotion && (mood === 'happy' || mood === 'celebrating')
                ? [1, 1.1, 1]
                : 1,
            }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
            transition={shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.5, repeat: (mood === 'happy' || mood === 'celebrating') ? Infinity : 0 }
            }
            className="relative text-6xl select-none filter drop-shadow-lg"
          >
            🦉
            {/* SVG accessory overlay — mecánica-aware en `thinking`. */}
            <MascotAccessory mood={mood} mechanicType={mechanicType} />
          </motion.div>
        </AnimatePresence>

        {/* Extra decorations for celebrating — antes emojis ⭐✨, ahora
            Lucide Star/Sparkles para coherencia con el resto del design
            system y para que el color rote con --color-warning-base.
            Solo se renderiza cuando la mascota está en viewport para no
            mantener los loops Infinity activos fuera de pantalla (M3). */}
        {mood === 'celebrating' && animationsActive && (
          <>
            <motion.span
              className="absolute -top-2 -right-2 text-warning-base drop-shadow-[0_0_8px_var(--color-warning-glow)]"
              animate={{
                scale: [0, 1, 0],
                rotate: [0, 180, 360]
              }}
              transition={{ duration: 1, repeat: Infinity }}
              aria-hidden="true"
            >
              <Star size={20} fill="currentColor" strokeWidth={1.25} />
            </motion.span>
            <motion.span
              className="absolute -top-1 -left-2 text-brand-light drop-shadow-[0_0_6px_var(--color-brand-glow)]"
              animate={{
                scale: [0, 1, 0],
              }}
              transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
              aria-hidden="true"
            >
              <Sparkles size={18} fill="currentColor" strokeWidth={1.25} />
            </motion.span>
          </>
        )}
      </motion.div>
    </div>
  );
}

CharacterMascot.propTypes = {
  mood: PropTypes.oneOf([
    'idle', 'happy', 'encouraging', 'celebrating', 'thinking', 'sad',
    'pointing', 'worried', 'surprised'
  ]),
  message: PropTypes.string,
  position: PropTypes.oneOf(['left', 'right']),
  // Mecánica activa para tintar el halo en estados pasivos (ADR-D).
  // null/undefined mantiene el comportamiento histórico (gris neutro).
  mechanicType: PropTypes.oneOf(['memory', 'association', 'sequence', null]),
  // Slide-in lateral en el primer mount (T-953 Fase 2.2).
  isFirstAppearance: PropTypes.bool,
  // Suprime el bocadillo aunque haya `message` o `rotatingMessage`. Útil
  // cuando la mascota se usa como ilustración decorativa (OnboardingOverlay,
  // EmptyState) y el texto principal ya vive en el contenedor padre.
  noBubble: PropTypes.bool,
  className: PropTypes.string
};

export default memo(CharacterMascot);
