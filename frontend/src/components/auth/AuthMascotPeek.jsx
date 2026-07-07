/**
 * @fileoverview Otto "asomándose" detrás de la tarjeta de autenticación.
 *
 * Envuelve la card de login/registro. Al enfocar un campo NORMAL, Otto se asoma
 * por detrás del borde superior (cara completa) con un muelle suave — nunca
 * desde scale 0 (emil-design-eng) — y saluda con un bocadillo contextual a su
 * IZQUIERDA (a la altura de los ojos). Al enfocar un campo de CONTRASEÑA, Otto
 * se AGACHA (baja para tapar sus ojos tras la card; solo asoman las orejas) con
 * un bocadillo ENCIMA de "no miro". Al salir el foco de la tarjeta, se retira.
 *
 * El bocadillo normal va siempre al lado (no arriba) para que las frases largas
 * se extiendan en horizontal sin salirse por el borde superior de la ventana, y
 * a la altura de los ojos para no tapar el enlace "Volver" de registro. La
 * colita SIEMPRE apunta a Otto (a la derecha si el bocadillo está a su izquierda;
 * abajo si está encima). Otto va detrás de la card (z-0); el bocadillo, por
 * encima del borde superior de la card, se ve sin sacarlo de esa capa.
 *
 * `side` elige la esquina por la que asoma (toggle de tema en login; enlace
 * "Volver" en registro). Respeta prefers-reduced-motion.
 *
 * @module components/auth/AuthMascotPeek
 */

import { useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import CharacterMascot from '../game/CharacterMascot';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { cn } from '../../lib/utils';

// Bocadillo contextual por campo (name del input). Sin emojis (política del
// design system) — el carácter lo aporta el rig facial + el saludo del ala.
const FIELD_MESSAGES = {
  email: '¡Hola! ¿Nos conocemos?',
  name: '¡Encantado! ¿Cómo te llamas?',
  centerName: '¿De qué cole vienes?',
  default: '¡Hola!',
};
const SECRET_MESSAGE = 'Tranquilo, no miro';

// Campos ante los que Otto se agacha para no ver lo que se escribe.
const SECRET_FIELDS = new Set(['password', 'confirmPassword']);
// Offsets del peek en PORCENTAJE de la altura del propio Otto. El rig es
// fluido (crece con el viewport: ~126px a 1366×768, ~159px a 1920×1080); con
// un offset fijo en píxeles asomaba proporcionalmente menos cara cuanto más
// grande era la pantalla (a 1080p solo se le veían los ojos). En porcentaje,
// la fracción visible es idéntica en todas las resoluciones.
const PEEK_Y = '30%';   // asomado: ~70% de Otto visible sobre la card.
const DUCK_Y = '76%';   // agachado: solo asoman las orejas (~24%).
const HIDDEN_Y = '110%'; // oculto por completo tras la card (entrada/salida).

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - La tarjeta de auth (form).
 * @param {'greeting'|'happy'|'encouraging'} [props.mood] - Mood de Otto.
 * @param {'left'|'right'} [props.side] - Esquina superior por la que asoma.
 */
export default function AuthMascotPeek({ children, mood = 'greeting', side = 'left' }) {
  const { shouldReduceMotion } = useReducedMotion();
  // null = oculto · 'peek' = asomado (cara) · 'duck' = agachado (solo orejas).
  const [phase, setPhase] = useState(null);
  const [message, setMessage] = useState(FIELD_MESSAGES.default);
  const isRight = side === 'right';
  const visible = phase !== null;
  const isDuck = phase === 'duck';

  const handleFocus = useCallback((e) => {
    const name = e.target?.name;
    if (SECRET_FIELDS.has(name)) {
      setMessage(SECRET_MESSAGE);
      setPhase('duck');
      return;
    }
    setMessage(FIELD_MESSAGES[name] || FIELD_MESSAGES.default);
    setPhase('peek');
  }, []);

  // Solo se esconde cuando el foco abandona la tarjeta por completo — al saltar
  // entre campos dentro de la card, `relatedTarget` sigue contenido.
  const handleBlur = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setPhase(null);
    }
  }, []);

  const peekSpring = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 240, damping: 22 };
  // Con reduced-motion Otto aparece ya en su posición (solo fade); sin ella
  // entra deslizándose desde detrás de la card.
  const enterY = shouldReduceMotion ? PEEK_Y : HIDDEN_Y;

  // Posición del bocadillo y su colita (extraído para no anidar ternarios en el
  // JSX): duck = encima de Otto; peek = al lado OPUESTO al obstáculo de cada
  // pantalla (login → izquierda, lejos del toggle; registro → derecha, lejos del
  // enlace "Volver"). La colita apunta siempre a Otto.
  let bubblePos = 'right-full top-[42%] -translate-y-1/2 mr-2.5';
  let tailPos = 'top-1/2 -right-1.5 -translate-y-1/2 border-t border-r border-glass-border';
  if (isDuck) {
    bubblePos = 'bottom-full left-1/2 -translate-x-1/2 mb-2';
    tailPos = 'left-1/2 -bottom-1.5 -translate-x-1/2 border-b border-r border-glass-border';
  } else if (isRight) {
    bubblePos = 'left-full top-[42%] -translate-y-1/2 ml-2.5';
    tailPos = 'top-1/2 -left-1.5 -translate-y-1/2 border-b border-l border-glass-border';
  }

  return (
    // El div solo DELEGA focus/blur de los inputs hijos (no es interactivo él
    // mismo: no tiene onClick ni manejo de teclado propio) para saber si el foco
    // sigue dentro de la card.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className="relative" onFocus={handleFocus} onBlur={handleBlur}>
      {/* Capa Otto — DETRÁS de la card (z-0). El bocadillo va dentro (queda por
          encima del borde de la card → no lo tapa). pointer-events-none: no
          intercepta clics del formulario. */}
      {/* `bottom-full` ancla la base de la capa al borde superior de la card:
          los offsets de Otto se aplican como translateY en % de su propia
          altura, así la fracción visible no depende de la resolución. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-full z-0 flex',
          isRight ? 'justify-end pr-6 sm:pr-10' : 'justify-start pl-6 sm:pl-10'
        )}
        aria-hidden="true"
      >
        <AnimatePresence>
          {visible && (
            <motion.div
              className="relative"
              initial={{ y: enterY, opacity: 0, scale: 0.9 }}
              animate={{ y: isDuck ? DUCK_Y : PEEK_Y, opacity: 1, scale: 1 }}
              exit={{ y: enterY, opacity: 0, scale: 0.92 }}
              transition={peekSpring}
            >
              <CharacterMascot mood={mood} size="md" noBubble />

              {/* Bocadillo. peek → a la izquierda de Otto (altura de los ojos);
                  duck → encima (sobre las orejas). Colita SIEMPRE hacia Otto. */}
              <motion.div
                key={message}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={shouldReduceMotion ? { duration: 0.15 } : { delay: 0.08, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'absolute whitespace-nowrap rounded-2xl bg-glass-bg backdrop-blur-md px-3.5 py-1.5',
                  'border border-glass-border text-text-primary text-sm font-medium shadow-lg',
                  bubblePos
                )}
              >
                {message}
                {/* Colita (triángulo de cómic) apuntando SIEMPRE a Otto: abajo si
                    está encima; hacia el lado donde queda Otto si está al lado. */}
                <span className={cn('absolute size-3 rotate-45 bg-glass-bg', tailPos)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Card por delante de Otto */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

AuthMascotPeek.propTypes = {
  children: PropTypes.node.isRequired,
  mood: PropTypes.oneOf(['greeting', 'happy', 'encouraging']),
  side: PropTypes.oneOf(['left', 'right']),
};
