/**
 * @fileoverview Componente reutilizable para animar numeros de 0 al valor final.
 * Soporta sufijos (ej: "45%", "1.2k") y valores no numericos (renderiza directamente).
 * Usa Framer Motion animate() para interpolacion fluida GPU-friendly.
 *
 * @module components/ui/AnimatedNumber
 */

import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';
import { EASING } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * @param {Object} props
 * @param {string|number} props.value - Valor a animar (ej: "120", "45%", "3.5s")
 * @param {number} [props.duration=1.2] - Duracion de la animacion en segundos
 * @param {Array} [props.ease] - Curva de easing (por defecto outExpo)
 * @param {string} [props.className] - Clases CSS adicionales
 */
export default function AnimatedNumber({
  value,
  duration = 1.2,
  ease = EASING.outExpo,
  className,
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const ref = useRef(null);

  // Parsear parte numerica y sufijo
  const strValue = String(value);
  // eslint-disable-next-line security/detect-unsafe-regex -- regex simple para parsear valor numérico + sufijo
  const match = strValue.match(/^(\d+(?:\.\d+)?)(.*)/);
  const numericPart = match ? parseFloat(match[1]) : null;
  const suffix = match ? match[2] : '';
  const hasDecimals = match ? match[1].includes('.') : false;

  useEffect(() => {
    if (numericPart === null || shouldReduceMotion || !ref.current) return undefined;

    const controls = animate(0, numericPart, {
      duration,
      ease,
      onUpdate(latest) {
        if (ref.current) {
          const formatted = hasDecimals ? latest.toFixed(1) : Math.round(latest);
          ref.current.textContent = `${formatted}${suffix}`;
        }
      },
    });

    return () => controls.stop();
  }, [numericPart, suffix, hasDecimals, duration, ease, shouldReduceMotion]);

  if (numericPart === null || shouldReduceMotion) {
    return <span className={className}>{value}</span>;
  }

  return <span ref={ref} className={className}>0{suffix}</span>;
}
