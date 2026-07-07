/**
 * @fileoverview Panel de detalle específico para sesiones de Asociación.
 * Muestra la lista de rondas con la carta asignada, asset y consigna
 * (`promptText`) si la hay. Si el plan está vacío, propone configurarlo.
 *
 * Parte de la reorganización de SessionDetail por mecánica (ADR-114).
 *
 * @module components/session/detail/SessionDetailAssociationPanel
 */

import { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link2, Search, AlertTriangle, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../../ui/GlassCard';
import CardAssetPreview from '../../ui/CardAssetPreview';
import EmptyState from '../../ui/EmptyState';
import ButtonPremium from '../../ui/ButtonPremium';
import { ROUTES } from '../../../constants/routes';
import { getId } from '../../../lib/entityId';

function SessionDetailAssociationPanel({ session }) {
  const navigate = useNavigate();
  const plan = useMemo(
    () =>
      Array.isArray(session?.associationChallengePlan)
        ? session.associationChallengePlan.toSorted(
            (a, b) => Number(a.roundNumber) - Number(b.roundNumber)
          )
        : [],
    [session]
  );

  const sessionId = getId(session);
  const isDraft = session?.status === 'created';

  if (plan.length === 0) {
    return (
      <GlassCard className="p-6">
        <EmptyState
          title="Plan de retos sin configurar"
          description="La mecánica Asociación necesita un plan que indique qué carta toca en cada ronda y, opcionalmente, una consigna para el alumno."
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

  return (
    <GlassCard className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Link2 size={18} className="text-accent-cyan" />
          Plan de retos
        </h2>
        <p className="text-sm text-text-muted mt-1">
          {plan.length} {plan.length === 1 ? 'ronda configurada' : 'rondas configuradas'}. En cada ronda el alumno debe encontrar la carta que coincide con la consigna.
        </p>
      </div>

      <ol className="space-y-3 list-none p-0 m-0">
        {plan.map(round => {
          const display = round.displayData?.display || round.displayData?.emoji;
          const label = round.displayData?.value || round.assignedValue || round.uid;
          return (
            <li
              key={round.roundNumber}
              className="flex items-start gap-3 rounded-xl border border-border-subtle bg-glass-bg p-3"
            >
              <div className="flex-shrink-0 size-8 rounded-full bg-accent-cyan/15 text-accent-cyan font-bold flex items-center justify-center text-sm">
                {round.roundNumber}
              </div>
              <CardAssetPreview
                asset={round.displayData}
                alt={label}
                className="size-14 rounded-lg flex-shrink-0"
                fit="cover"
                fallbackLabel={display || label}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text-primary font-semibold truncate">
                  {label}
                </p>
                {round.promptText ? (
                  <p className="text-xs text-text-secondary mt-1 flex items-start gap-1.5">
                    <Search size={12} className="text-accent-cyan flex-shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{round.promptText}</span>
                  </p>
                ) : (
                  <p className="text-micro text-text-muted/70 italic mt-1">
                    Sin consigna personalizada: la app mostrará &quot;Encuentra: {label}&quot;.
                  </p>
                )}
                <p className="text-nano text-text-muted/60 font-mono mt-1" title={round.uid}>
                  Chip {round.uid}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}

SessionDetailAssociationPanel.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    status: PropTypes.string,
    associationChallengePlan: PropTypes.array
  })
};

export default memo(SessionDetailAssociationPanel);
