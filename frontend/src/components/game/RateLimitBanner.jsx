import { useEffect, useRef, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import PropTypes from 'prop-types';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Banner persistente con countdown que comunica un rate-limit / dedupe
 * temporal al jugador (PROP-92).
 *
 * El backend devuelve `retryAfterMs` en el payload del error
 * (`RATE_LIMITED`, `TEMP_BLOCKED`, `DUPLICATE_RFID_EVENT`). Este componente
 * pinta una barra de progreso que se vacía a lo largo de ese tiempo y
 * auto-dismissa al llegar a 0. Sustituye al `toast.warning` legacy que dejaba
 * al jugador sin saber cuándo podía volver a tocar.
 *
 * Accesibilidad:
 *  - `role="status"` + `aria-live="polite"`: lectores anuncian el tiempo.
 *  - Respeta `prefers-reduced-motion`: deshabilita animación de barra y
 *    muestra el contador numérico actualizado cada 100ms.
 *  - Auto-dismiss invoca `onDismiss` para que el padre limpie el error.
 *
 * @param {Object} props
 * @param {number} props.retryAfterMs - Tiempo restante en ms (origen backend).
 * @param {string} [props.message] - Mensaje principal. Default: "Espera un momento entre intentos."
 * @param {Function} props.onDismiss - Callback al consumir el countdown.
 */
export default function RateLimitBanner({
  retryAfterMs,
  message = 'Espera un momento entre intentos.',
  onDismiss
}) {
  const { shouldReduceMotion } = useReducedMotion();
  const startedAtRef = useRef(null);
  const [remainingMs, setRemainingMs] = useState(retryAfterMs);

  // Reset si llega un nuevo retryAfterMs (otro rate-limit antes de auto-dismiss).
  useEffect(() => {
    startedAtRef.current = Date.now();
    setRemainingMs(retryAfterMs);
  }, [retryAfterMs]);

  // Auto-dismiss + tick de countdown numérico.
  useEffect(() => {
    if (!Number.isFinite(retryAfterMs) || retryAfterMs <= 0) return undefined;

    const dismissTimer = setTimeout(() => {
      onDismiss?.();
    }, retryAfterMs);

    // El tick existe principalmente para reduced-motion (sin barra animada).
    // 100ms da fluidez sin saturar el render.
    const tickInterval = setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current || Date.now());
      const left = Math.max(0, retryAfterMs - elapsed);
      setRemainingMs(left);
      if (left <= 0) clearInterval(tickInterval);
    }, 100);

    return () => {
      clearTimeout(dismissTimer);
      clearInterval(tickInterval);
    };
  }, [retryAfterMs, onDismiss]);

  if (!retryAfterMs || retryAfterMs <= 0) return null;

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <motion.aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="relative w-full max-w-2xl mx-auto rounded-xl border border-warning-base/30 bg-warning-base/10 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Hourglass size={18} className="text-warning-base flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary">{message}</p>
          <p className="text-xs text-text-muted mt-0.5">
            Vuelves a poder tocar en {remainingSeconds}s
          </p>
        </div>
      </div>

      {/* Barra de progreso: width 100% → 0% en `retryAfterMs` (animación CSS).
          Reduced-motion la sustituye por una barra estática "consumida" según
          remainingMs para que el contador numérico siga siendo informativo. */}
      <div
        className="h-1 w-full bg-warning-base/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={retryAfterMs}
        aria-valuenow={Math.max(0, retryAfterMs - remainingMs)}
        aria-label="Tiempo restante hasta poder volver a interactuar"
      >
        {shouldReduceMotion ? (
          <div
            className="h-full bg-warning-base"
            style={{ width: `${(remainingMs / retryAfterMs) * 100}%` }}
          />
        ) : (
          <div
            className="h-full bg-warning-base"
            style={{
              width: '100%',
              animation: `rate-limit-bar ${retryAfterMs}ms linear forwards`
            }}
          />
        )}
      </div>

      {/* Keyframes locales — encapsulados en el propio componente para no
          contaminar index.css con utilidades casi exclusivas de este banner. */}
      <style>{`
        @keyframes rate-limit-bar {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </motion.aside>
  );
}

RateLimitBanner.propTypes = {
  retryAfterMs: PropTypes.number.isRequired,
  message: PropTypes.string,
  onDismiss: PropTypes.func.isRequired
};
