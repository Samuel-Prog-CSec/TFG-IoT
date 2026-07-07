/**
 * @fileoverview Métricas de rendimiento de la partida actual (footer del juego).
 *
 * La cabecera ya muestra la PUNTUACIÓN (marcador central) y el PROGRESO
 * (Ronda X/N o Parejas X/Y + dots). Para no repetir esos datos, este footer
 * muestra tres métricas de RENDIMIENTO distintas por mecánica, con la etiqueta
 * SIEMPRE coherente con su valor (antes "Ronda" mostraba los aciertos):
 *   - Secuencia : Cartas correctas · Fallos · Racha
 *   - Asociación: Aciertos · Fallos · Racha
 *   - Memoria   : Parejas · Intentos · Fallos
 */

import { memo } from 'react';
import PropTypes from 'prop-types';
import { CheckCircle2, XCircle, Flame, Brain, Repeat } from 'lucide-react';

/** Celda individual de una métrica */
function MetricPill({ icon: Icon, iconClass, label, value }) {
  return (
    <div className="rounded-md bg-background-elevated/60 border border-border-subtle px-2 py-1">
      <div className="flex items-center gap-1 text-micro tracking-wide text-text-secondary">
        <Icon size={12} className={iconClass} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="text-text-primary text-sm font-semibold">{value}</div>
    </div>
  );
}

MetricPill.propTypes = {
  icon: PropTypes.elementType.isRequired,
  iconClass: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

const CurrentPlayMetrics = memo(function CurrentPlayMetrics({
  mode,
  correctAnswers = 0,
  totalErrors = 0,
  streak = 0,
  attempts = 0
}) {
  const isMemory = mode === 'memory';
  const isSequence = mode === 'sequence';

  // Pill de "aciertos": etiqueta e icono según la mecánica, coherente con el
  // vocabulario de cada juego (cartas correctas / aciertos / parejas).
  let correctLabel = 'Aciertos';
  let CorrectIcon = CheckCircle2;
  let correctIconClass = 'text-success-base';
  if (isSequence) {
    correctLabel = 'Cartas correctas';
  } else if (isMemory) {
    correctLabel = 'Parejas';
    CorrectIcon = Brain;
    correctIconClass = 'text-brand-base';
  }

  // Tercer dato: en Memoria los intentos (volteos); en el resto, la racha de
  // aciertos consecutivos. Ninguno repite el progreso de la cabecera.
  const thirdPill = isMemory
    ? { icon: Repeat, iconClass: 'text-accent-indigo', label: 'Intentos', value: attempts }
    : { icon: Flame, iconClass: 'text-accent-amber', label: 'Racha', value: streak };

  return (
    <div className="mb-1.5 max-w-4xl mx-auto rounded-lg border border-border-default bg-background-base/30 px-3 py-1.5">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetricPill icon={CorrectIcon} iconClass={correctIconClass} label={correctLabel} value={correctAnswers} />
        <MetricPill icon={XCircle} iconClass="text-error-base" label="Fallos" value={totalErrors} />
        <MetricPill icon={thirdPill.icon} iconClass={thirdPill.iconClass} label={thirdPill.label} value={thirdPill.value} />
      </div>
    </div>
  );
});

CurrentPlayMetrics.displayName = 'CurrentPlayMetrics';

CurrentPlayMetrics.propTypes = {
  mode: PropTypes.string,
  correctAnswers: PropTypes.number,
  totalErrors: PropTypes.number,
  streak: PropTypes.number,
  attempts: PropTypes.number
};

export default CurrentPlayMetrics;
