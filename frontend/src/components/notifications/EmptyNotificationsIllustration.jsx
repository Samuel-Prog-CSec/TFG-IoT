/**
 * @fileoverview Ilustración signature para el empty state del panel de
 * notificaciones (T-955 / Phase 7).
 *
 * Sigue la línea "Tactile RFID + Paper" del ADR-070: un sobre de papel
 * cerrado con cordel/lacre, evoca el correo físico cuando no hay novedades.
 * SVG inline para que pueda heredar `currentColor` y se tinte por tema
 * (light/dark + atmósfera del contexto activo).
 *
 * @module components/notifications/EmptyNotificationsIllustration
 */

import PropTypes from 'prop-types';

export default function EmptyNotificationsIllustration({
  className = '',
  width = 120,
  height = 96
}) {
  return (
    <svg
      role="img"
      aria-label="Buzón vacío"
      width={width}
      height={height}
      viewBox="0 0 120 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="env-paper" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.10" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="env-flap" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* Sombra suave bajo el sobre */}
      <ellipse cx="60" cy="86" rx="36" ry="4" fill="currentColor" opacity="0.08" />

      {/* Sobre — cuerpo */}
      <rect
        x="18"
        y="28"
        width="84"
        height="56"
        rx="6"
        fill="url(#env-paper)"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />

      {/* Solapa frontal */}
      <path
        d="M18 34 L60 60 L102 34"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        fill="url(#env-flap)"
        strokeLinejoin="round"
      />

      {/* Lacre (círculo central) */}
      <circle
        cx="60"
        cy="56"
        r="9"
        fill="currentColor"
        opacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1"
      />
      <path
        d="M55 56 L59 60 L65 53"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Pequeño sello en la esquina */}
      <rect
        x="84"
        y="36"
        width="12"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="0.8"
        strokeDasharray="1.5 1"
      />

      {/* Líneas de borde tactil */}
      <line
        x1="22"
        y1="76"
        x2="98"
        y2="76"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="0.8"
        strokeDasharray="2 3"
      />
    </svg>
  );
}

EmptyNotificationsIllustration.propTypes = {
  className: PropTypes.string,
  width: PropTypes.number,
  height: PropTypes.number
};
