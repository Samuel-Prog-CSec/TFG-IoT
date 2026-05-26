/**
 * @fileoverview Panel de detalle específico para sesiones de Secuencia.
 * Muestra el plan de secuencias por ronda + parámetros de configuración
 * (min/max length, displaySeconds) + reglas de dificultad (intentos por
 * carta y disponibilidad de pistas).
 *
 * Parte de la reorganización de SessionDetail por mecánica (ADR-114).
 *
 * @module components/session/detail/SessionDetailSequencePanel
 */

import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { ListOrdered, Eye, Hourglass, Sparkles, AlertTriangle, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../../ui/GlassCard';
import CardAssetPreview from '../../ui/CardAssetPreview';
import EmptyState from '../../ui/EmptyState';
import ButtonPremium from '../../ui/ButtonPremium';
import { ROUTES } from '../../../constants/routes';
import { SEQUENCE_DIFFICULTY_RULES } from '../../../constants/sequenceConfig';

function SessionDetailSequencePanel({ session }) {
  const navigate = useNavigate();
  const plan = useMemo(
    () =>
      Array.isArray(session?.sequencePlan)
        ? session.sequencePlan.toSorted(
            (a, b) => Number(a.roundNumber) - Number(b.roundNumber)
          )
        : [],
    [session]
  );

  const sequenceConfig = session?.sequenceConfig || {};
  const sessionId = session?.id || session?._id;
  const isDraft = session?.status === 'created';
  const difficultyRule = SEQUENCE_DIFFICULTY_RULES[session?.difficulty] || null;

  if (plan.length === 0) {
    return (
      <GlassCard className="p-6">
        <EmptyState
          title="Plan de secuencias sin configurar"
          description="La mecánica Secuencia necesita un plan generado a partir del mazo. Edita la sesión y pulsa 'Regenerar plan' para crearlo."
          icon={<AlertTriangle size={28} className="text-warning-base" />}
          action={
            isDraft && (
              <ButtonPremium
                variant="primary"
                onClick={() => navigate(ROUTES.SESSION_EDIT(sessionId))}
              >
                <Pencil size={16} />
                Editar sesión
              </ButtonPremium>
            )
          }
        />
      </GlassCard>
    );
  }

  const totalCards = plan.reduce((acc, round) => acc + (round.length || 0), 0);

  return (
    <div className="space-y-5">
      {/* Configuración global de secuencia */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-accent-amber" />
          Configuración de la secuencia
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ParamPill
            icon={<ListOrdered size={14} className="text-accent-amber" />}
            label="Longitud mín."
            value={`${sequenceConfig.minSequenceLength ?? '—'} cartas`}
          />
          <ParamPill
            icon={<ListOrdered size={14} className="text-accent-amber" />}
            label="Longitud máx."
            value={`${sequenceConfig.maxSequenceLength ?? '—'} cartas`}
          />
          <ParamPill
            icon={<Eye size={14} className="text-brand-light" />}
            label="Memorización"
            value={`${sequenceConfig.displaySeconds ?? '—'}s`}
          />
          <ParamPill
            icon={<Hourglass size={14} className="text-accent-cyan" />}
            label="Cartas totales"
            value={`${totalCards}`}
          />
        </div>
        {difficultyRule && (
          <div className="mt-4 p-3 rounded-xl bg-background-elevated/40 border border-border-subtle">
            <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
              Reglas según dificultad: <span className="text-text-primary font-semibold">{difficultyRule.label}</span>
            </p>
            <p className="text-sm text-text-secondary">
              Hasta <strong>{difficultyRule.maxAttemptsPerCard}</strong>{' '}
              {difficultyRule.maxAttemptsPerCard === 1 ? 'intento' : 'intentos'} por carta.
              {difficultyRule.hintsEnabled
                ? ' Las pistas se entregan tras un fallo (texto/sílaba según el caso).'
                : ' Sin pistas: al alcanzar el máximo de intentos la carta queda bloqueada.'}
            </p>
          </div>
        )}
      </GlassCard>

      {/* Plan de secuencias por ronda */}
      <GlassCard className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <ListOrdered size={18} className="text-accent-amber" />
            Plan de secuencias
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {plan.length} {plan.length === 1 ? 'ronda' : 'rondas'} con secuencia generada del mazo. El alumno memoriza el orden y lo reproduce.
          </p>
        </div>
        <ol className="space-y-3 list-none p-0 m-0">
          {plan.map(round => (
            <li
              key={round.roundNumber}
              className="rounded-xl border border-border-subtle bg-glass-bg p-3"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-shrink-0 size-8 rounded-full bg-accent-amber/15 text-accent-amber font-bold flex items-center justify-center text-sm">
                  {round.roundNumber}
                </div>
                <span className="text-xs text-text-muted">
                  {round.length} {round.length === 1 ? 'carta' : 'cartas'} en orden
                </span>
              </div>
              <ol className="flex items-center gap-2 list-none p-0 m-0 overflow-x-auto">
                {(round.sequence || []).map((card, idx) => {
                  const display = card.displayData?.display || card.displayData?.emoji;
                  const label = card.displayData?.value || card.assignedValue || card.uid;
                  return (
                    <li
                      key={`${round.roundNumber}-${idx}-${card.uid}`}
                      className="flex flex-col items-center gap-1 flex-shrink-0"
                    >
                      <div className="relative">
                        <CardAssetPreview
                          asset={card.displayData}
                          alt={label}
                          className="size-14 rounded-lg"
                          fit="cover"
                          fallbackLabel={display || label}
                        />
                        <span className="absolute -top-1 -left-1 size-5 rounded-full bg-accent-amber text-text-primary text-nano font-bold flex items-center justify-center tabular-nums">
                          {idx + 1}
                        </span>
                      </div>
                      <span className="text-nano text-text-muted truncate max-w-14" title={label}>
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      </GlassCard>
    </div>
  );
}

function ParamPill({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-background-elevated/40 border border-border-subtle p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-base font-semibold text-text-primary font-display tabular-nums mt-1">
        {value}
      </p>
    </div>
  );
}

ParamPill.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired
};

SessionDetailSequencePanel.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    status: PropTypes.string,
    difficulty: PropTypes.string,
    sequencePlan: PropTypes.array,
    sequenceConfig: PropTypes.shape({
      minSequenceLength: PropTypes.number,
      maxSequenceLength: PropTypes.number,
      displaySeconds: PropTypes.number
    })
  })
};

export default memo(SessionDetailSequencePanel);
