import { useId } from 'react';

/**
 * EduPlay brand icon — tarjeta RFID con ondas de señal.
 *
 * La tarjeta es SÓLIDA (currentColor al 100%): la versión anterior usaba
 * rellenos al 15% y trazos finos que, en blanco sobre el degradado morado del
 * sidebar/login, se "apagaban" y costaba distinguir la silueta. El chip se
 * perfora con una <mask> (deja ver el fondo a través de la tarjeta), así el
 * icono sigue siendo monocromo (currentColor) y funciona sobre cualquier
 * superficie sin necesitar un segundo color.
 *
 * `useId` garantiza ids de máscara únicos: el icono se renderiza varias veces
 * por página (sidebar, login, registro) y los ids duplicados en SVG hacen que
 * todos los usos compartan la primera máscara definida.
 */
export default function EduPlayIcon({ size = 20, className = '' }) {
  const maskId = `eduplay-card-${useId()}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <mask id={maskId}>
        <rect x="2" y="3" width="13" height="17" rx="2.5" fill="white" />
        {/* Chip perforado: se ve el fondo a través de la tarjeta */}
        <rect x="5" y="7.5" width="4.5" height="3.2" rx="0.8" fill="black" />
      </mask>
      {/* Tarjeta RFID sólida */}
      <rect
        x="2"
        y="3"
        width="13"
        height="17"
        rx="2.5"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
      {/* Onda de señal (cercana) */}
      <path
        d="M18.2 9a4.5 4.5 0 010 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Onda de señal (lejana) */}
      <path
        d="M21 7a7.5 7.5 0 010 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}
