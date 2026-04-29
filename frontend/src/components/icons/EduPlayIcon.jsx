/**
 * EduPlay brand icon — RFID card with wireless signal arcs.
 * Designed for the sidebar logo and other brand contexts.
 */
export default function EduPlayIcon({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* RFID Card */}
      <rect
        x="2"
        y="3"
        width="12"
        height="16"
        rx="2"
        fill="currentColor"
        opacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* Card chip */}
      <rect
        x="5"
        y="7"
        width="4.5"
        height="3"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.5"
      />
      {/* Signal wave (close) */}
      <path
        d="M18 9a4.5 4.5 0 010 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Signal wave (far) */}
      <path
        d="M21 7a7.5 7.5 0 010 10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
