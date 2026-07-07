/**
 * @fileoverview AuthBackground — escena visual signature para Login/Register.
 *
 * Sustituye el típico aurora-de-tres-orbes por una "constelación de tarjetas
 * escaneadas": 5 tarjetas RFID con iconos contextuales (Geo / Animals / Colors
 * / Numbers / Shapes) flotando con drift suave, una rejilla técnica detrás
 * y un anillo de scan que pulsa en torno a la tarjeta protagonista.
 *
 * Diseño separado por tema (no es solo "swap de colores"):
 *  - **Dark** ("Sala de control" del docente): rejilla técnica fina, glow
 *    cromático en cada tarjeta, scanline sutil cada 7 s. Dramatismo.
 *  - **Light** ("Mesa del aula"): papel marfil con margen de cuaderno,
 *    tarjetas como recortes de cartulina con sombras de papel y ligera
 *    rotación, washi-tape de marca.
 *
 * Es la firma identitaria de las pantallas no-autenticadas — comunica de un
 * vistazo qué hace EduPlay sin necesidad de leer la tagline.
 *
 * @module components/auth/AuthBackground
 */

import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import {
  Globe2, Dog, Palette, Hash, Shapes,
} from 'lucide-react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Configuración de las tarjetas de la constelación. Cada tarjeta lleva
 * un icono Lucide que evoca su contexto pedagógico (Geo, Animals, etc.),
 * un tono de marca y un par de coordenadas relativas al contenedor.
 *
 * Las coordenadas están elegidas para evitar el centro de la pantalla —
 * el formulario vive ahí. La columna izquierda concentra la constelación;
 * la columna derecha apenas tiene tarjetas (sólo decorativas en los
 * extremos) para no competir con el form.
 */
/**
 * Posiciones elegidas para "enmarcar" el centro de la columna hero
 * (donde vive headline + chips), sin que ninguna tarjeta cruce ni el
 * texto principal ni el formulario. Las cinco tarjetas dibujan un
 * trapecio: 2 arriba, 1 peeking en el borde y 2 abajo.
 *
 * Coordenadas en % del viewport completo. La columna hero ocupa
 * ~7/12 ≈ 58% (1118px en 1920×1080); por encima del 50% en x ya
 * estamos invadiendo el form, así que el límite es 42% para no rozar.
 */
const CARDS = [
  {
    id: 'geo',
    Icon: Globe2,
    label: 'Geografía',
    tint: 'var(--color-theme-geography)',
    tintAlt: 'var(--color-theme-geography-alt)',
    tintText: 'var(--color-theme-geography-text)',
    // Esquina superior izquierda — protagonista, el scan ring se
    // ancla aquí.
    style: { top: '5%', left: '3%' },
    rotate: -8,
    delay: 0,
  },
  {
    id: 'shapes',
    Icon: Shapes,
    label: 'Formas',
    tint: 'var(--color-theme-default)',
    tintAlt: 'var(--color-theme-default-alt)',
    tintText: 'var(--color-theme-default-text)',
    // Esquina superior derecha de la columna hero (no toca el form).
    style: { top: '6%', left: '38%' },
    rotate: 10,
    delay: 0.6,
  },
  {
    id: 'animals',
    Icon: Dog,
    label: 'Animales',
    tint: 'var(--color-theme-animals)',
    tintAlt: 'var(--color-theme-animals-alt)',
    tintText: 'var(--color-theme-animals-text)',
    // Peek desde el borde izquierdo, mid altura. El translateX
    // negativo en CSS la deja medio fuera para sensación "deck pile".
    style: { top: '40%', left: '-3%' },
    rotate: -16,
    delay: 1.2,
  },
  {
    id: 'numbers',
    Icon: Hash,
    label: 'Números',
    tint: 'var(--color-theme-numbers)',
    tintAlt: 'var(--color-theme-numbers-alt)',
    tintText: 'var(--color-theme-numbers-text)',
    // Esquina inferior izquierda.
    style: { top: '74%', left: '4%' },
    rotate: 6,
    delay: 1.8,
  },
  {
    id: 'colors',
    Icon: Palette,
    label: 'Colores',
    tint: 'var(--color-theme-colors)',
    tintAlt: 'var(--color-theme-colors-alt)',
    tintText: 'var(--color-theme-colors-text)',
    // Centro-derecha inferior, antes del form.
    style: { top: '76%', left: '34%' },
    rotate: -4,
    delay: 2.4,
  },
];

/**
 * Tarjeta RFID individual de la constelación. Estilo distinto por tema:
 *  - Dark: glass con borde brand y glow del tinte contextual.
 *  - Light: papel mate con sombra blanda y un cinta washi-tape arriba.
 *
 * Si `withScanRing=true`, renderiza un anillo de scan concéntrico que
 * pulsa exactamente sobre el centro del icono. Vivir DENTRO de la
 * tarjeta es la única forma fiable de garantizar el centrado: el ring
 * comparte el sistema de coordenadas del flex container del icono y
 * sigue la respiración de la tarjeta.
 *
 * El driftSpring se anima con keyframes simples (translateY) para no
 * machacar el render. Cuando reduce-motion está activo, queda estática.
 */
function ConstellationCard({
  Icon,
  label,
  tint,
  tintAlt,
  tintText,
  style,
  rotate,
  delay,
  shouldReduceMotion,
  withScanRing = false,
}) {
  const drift = shouldReduceMotion
    ? { y: 0 }
    : { y: [0, -12, 0, 8, 0] };

  return (
    <motion.div
      className="absolute"
      style={style}
      initial={{ opacity: 0, scale: 0.85, rotate: rotate - 4 }}
      animate={{ opacity: 1, scale: 1, rotate, ...drift }}
      transition={{
        opacity: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
        scale: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
        rotate: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
        y: shouldReduceMotion
          ? { duration: 0 }
          : { duration: 9 + delay, delay, repeat: Infinity, ease: 'easeInOut' },
      }}
    >
      <div
        className="auth-card relative rounded-2xl flex flex-col justify-between p-4 backdrop-blur-md"
        style={{
          // Tamaño fluido entre 100px (1366×768) y 140px (1920+) para que
          // las tarjetas tengan presencia en monitores grandes sin invadir
          // el formulario en portátiles.
          width: 'clamp(100px, 8vw, 140px)',
          height: 'clamp(132px, 10.5vw, 184px)',
          // Custom properties para que el CSS por tema modifique fondo/borde
          '--card-tint': tint,
          '--card-tint-alt': tintAlt,
          '--card-tint-text': tintText || tint,
        }}
      >
        {/* Washi-tape (light) o glow strip (dark) */}
        <span className="auth-card-tape" aria-hidden="true" />
        {/* Chip RFID — pequeño cuadrado superior izquierdo */}
        <span
          className="absolute top-3 left-3 w-7 h-5 rounded-sm border opacity-60"
          style={{ borderColor: 'var(--card-tint)' }}
          aria-hidden="true"
        />
        {/* Icono central — wrapped en relative para anclar el scan ring
            que comparte exactamente el mismo flex item. */}
        <div className="flex-1 flex items-center justify-center relative">
          {/* Scan ring (sólo en la tarjeta protagonista). Tres círculos
              concéntricos que pulsan alrededor del icono. Posicionados
              `absolute inset-auto` con left/top:50% translate -50% para
              que el centro coincida 1:1 con el centro del icono — el
              flex padre los layout-separa del icono pero CSS absolute
              hace que vivan sobre él. */}
          {withScanRing && !shouldReduceMotion && (
            <span
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                width: 70,
                height: 70,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border-2"
                  style={{ borderColor: 'var(--card-tint)' }}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0, 0.55, 0], scale: [0.6, 1.6, 2.2] }}
                  transition={{
                    duration: 3,
                    delay: i * 1,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </span>
          )}
          <Icon
            size={42}
            strokeWidth={1.5}
            style={{ color: 'var(--card-tint)', position: 'relative', zIndex: 1 }}
            aria-hidden="true"
          />
        </div>
        {/* Etiqueta inferior — BUG-A11Y-AUTH-CARD-LABEL (QA Sprint 0):
            usar `--card-tint-text` (variante específica para texto, AA en
            ambos temas). Antes usaba `--card-tint` que mezcla bg/borde y no
            está garantizado a contraste 4.5:1. */}
        <span
          className="block text-micro font-bold tracking-widest uppercase text-center"
          style={{ color: 'var(--card-tint-text, var(--card-tint))' }}
        >
          {label}
        </span>
      </div>
    </motion.div>
  );
}

ConstellationCard.propTypes = {
  Icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  tint: PropTypes.string.isRequired,
  tintAlt: PropTypes.string.isRequired,
  tintText: PropTypes.string,
  style: PropTypes.object.isRequired,
  rotate: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  shouldReduceMotion: PropTypes.bool.isRequired,
  withScanRing: PropTypes.bool,
};

/**
 * AuthBackground — escena completa para Login/Register.
 *
 * @param {Object} props
 * @param {('login'|'register')} [props.variant='login'] — Cambia el sutil
 *   reparto izquierda/derecha del énfasis (login con scan en izq, register
 *   con scan en der) para que las dos pantallas no se sientan idénticas.
 */
export default function AuthBackground({ variant = 'login' }) {
  const { shouldReduceMotion } = useReducedMotion();
  // Mount delay para evitar que los keyframes inicien antes de la
  // hidratación — sólo afecta a la escala global de scanline.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const flipped = variant === 'register';

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {/* Capa 1 — Background base con tinte sutil del tema (override por
          [data-theme] en CSS). Crea la "atmósfera" antes de cualquier
          decorador. */}
      <div className="auth-bg-base absolute inset-0" />

      {/* Capa 2 — Rejilla técnica fina (dark) o líneas de cuaderno (light).
          Ambas se gestionan en CSS bajo `.auth-bg-grid`. */}
      <div className="auth-bg-grid absolute inset-0" />

      {/* Capa 3 — Aurora difusa de soporte. Más intensa y mejor distribuida
          que la del aurora-layer global; aquí sí queremos que sienta el
          producto. */}
      <div className="auth-bg-glow absolute inset-0">
        <div
          className="auth-bg-glow-orb auth-bg-glow-orb-1"
          style={{ backgroundColor: 'var(--color-theme-geography)' }}
        />
        <div
          className="auth-bg-glow-orb auth-bg-glow-orb-2"
          style={{ backgroundColor: 'var(--color-theme-colors)' }}
        />
        <div
          className="auth-bg-glow-orb auth-bg-glow-orb-3"
          style={{ backgroundColor: 'var(--color-theme-numbers)' }}
        />
      </div>

      {/* Capa 4 — Constelación de tarjetas. En `register` los `left`
          se convierten a `right` para que las tarjetas vivan en el lado
          opuesto del viewport sin flippear su contenido (icono, label,
          chip RFID y washi-tape se leen normalmente).

          La rotación también se invierte: una carta con tilt -8° en
          login pasa a +8° en register, manteniendo la sensación de
          "espejo" entre las dos pantallas.

          La primera tarjeta (Geo) recibe `withScanRing` para que los
          anillos pulsen exactamente alrededor del icono Globe2 — vive
          dentro de la tarjeta, en el mismo flex item, evitando offsets
          por diferencias de coordenadas. */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: 'none' }}
      >
        <div className="relative w-full h-full">
          {mounted && CARDS.map((card, idx) => {
            const mirroredStyle = flipped
              ? { top: card.style.top, right: card.style.left }
              : card.style;
            return (
              <ConstellationCard
                key={card.id}
                Icon={card.Icon}
                label={card.label}
                tint={card.tint}
                tintAlt={card.tintAlt}
                tintText={card.tintText}
                style={mirroredStyle}
                rotate={flipped ? -card.rotate : card.rotate}
                delay={card.delay}
                shouldReduceMotion={shouldReduceMotion}
                withScanRing={idx === 0}
              />
            );
          })}
        </div>
      </div>

      {/* Capa 5 — Scanline horizontal que barre cada 7 s (sólo dark, en
          light queda anulada por CSS). */}
      <div className="auth-bg-scanline" />

      {/* Capa 6 — Wave de RFID en el footer. Tres ondas concéntricas
          tenues que pulsan desde el centro inferior. */}
      <div className="auth-bg-wave" />
    </div>
  );
}

AuthBackground.propTypes = {
  variant: PropTypes.oneOf(['login', 'register']),
};
