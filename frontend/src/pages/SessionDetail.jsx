/**
 * @fileoverview Detalle de sesión de juego (configuración).
 * Muestra configuración, estado y mapping de tarjetas.
 *
 * @module pages/SessionDetail
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Pencil,
  Map,
  Trash2,
  Layers,
  Timer,
  Award,
  AlertTriangle,
  RotateCcw,
  Minus,
  Gauge,
  Info,
  Gamepad2,
  FolderOpen,
  CreditCard,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import EmptyState from '../components/ui/EmptyState';
import Breadcrumb from '../components/ui/Breadcrumb';
import Tooltip from '../components/ui/Tooltip';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { cn, pageVariants, formatDate } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';

const statusToBadge = (status) => {
  switch (status) {
    case 'created':
      return { tone: 'warning', label: 'Borrador' };
    case 'active':
      return { tone: 'active', label: 'Activa' };
    case 'completed':
      return { tone: 'success', label: 'Completada' };
    default:
      return { tone: 'info', label: 'Sin estado' };
  }
};

export default function SessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);

  const loadSession = useCallback(async (signal) => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const response = await sessionsAPI.getSessionById(sessionId, signal ? { signal } : {});
      const data = extractData(response);
      setSession(data);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudo cargar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  useRefetchOnFocus({
    refetch: () => loadSession(),
    isLoading: loading,
    hasData: Boolean(session)
  });

  const handleDelete = async () => {
    if (!session) return;

    setDeleteLoading(true);
    try {
      await sessionsAPI.deleteSession(session.id || session._id);
      toast.success('Sesión eliminada');
      deleteModal.close();
      navigate(ROUTES.SESSIONS);
    } catch (err) {
      toast.error('No se pudo eliminar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleClone = async () => {
    if (!session) return;

    setCloneLoading(true);
    try {
      const response = await sessionsAPI.cloneSession(session.id || session._id);
      const clonedSession = extractData(response);
      const clonedSessionId = clonedSession?.id || clonedSession?._id;
      const clonedMechanicName = (clonedSession?.mechanic?.name || '').toString().toLowerCase();

      toast.success('Sesión clonada', {
        description: 'Se creó una nueva sesión en borrador para volver a jugar.'
      });
      cloneModal.close();

      if (clonedSessionId) {
        if (clonedMechanicName === 'memory') {
          navigate(ROUTES.BOARD_SETUP_WITH_ID(clonedSessionId));
        } else {
          navigate(ROUTES.SESSION_DETAIL(clonedSessionId));
        }
      }
    } catch (err) {
      toast.error('No se pudo clonar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      setCloneLoading(false);
    }
  };

  const statusInfo = statusToBadge(session?.status);
  const canEdit = session?.status === 'created';
  const canDelete = session?.status === 'created';
  const isAssociationSession = (session?.mechanic?.name || '').toString().toLowerCase() === 'association';
  const isMemorySession = (session?.mechanic?.name || '').toString().toLowerCase() === 'memory';
  const hasMemoryBoardConfigured = Array.isArray(session?.boardLayout) && session.boardLayout.length > 0;

  const mappingCards = useMemo(() => session?.cardMappings || [], [session]);

  if (loading && !session) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <SkeletonCard className="h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2 h-72" />
          <SkeletonCard className="h-72" />
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState
          title="Sesión no encontrada"
          description="La sesión solicitada no existe o no está disponible."
          icon={<Layers size={28} />}
          action={(
            <ButtonPremium variant="secondary" onClick={() => navigate(ROUTES.SESSIONS)}>
              <ArrowLeft size={16} />
              Volver a sesiones
            </ButtonPremium>
          )}
        />
      </div>
    );
  }

  return (
    <motion.div
      className="p-6 lg:p-8 max-w-6xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[
          { label: 'Sesiones', to: ROUTES.SESSIONS },
          { label: session.deck?.name || 'Sesión de juego' },
        ]} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary font-display">
              {session.deck?.name || 'Sesión de juego'}
            </h1>
            <p className="text-text-muted">
              {session.mechanic?.displayName || session.mechanic?.name} · {session.context?.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(session.id || session._id))}
            >
              <Map size={16} />
              Ver mapping
            </ButtonPremium>
            <ButtonPremium
              variant="primary"
              onClick={cloneModal.open}
              disabled={cloneLoading}
            >
              <Timer size={16} />
              Volver a jugar
            </ButtonPremium>
            <div className="border-l border-border-default h-8 mx-1" />
            <div className="flex items-center gap-1 bg-glass-bg rounded-lg p-1">
              <Tooltip content="Editar sesión">
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(ROUTES.SESSION_EDIT(session.id || session._id))}
                  disabled={!canEdit}
                >
                  <Pencil size={14} />
                </ButtonPremium>
              </Tooltip>
              <Tooltip content="Eliminar sesión">
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={deleteModal.open}
                  disabled={!canDelete}
                >
                  <Trash2 size={14} />
                </ButtonPremium>
              </Tooltip>
            </div>
          </div>
        </header>

        {canEdit && isAssociationSession && session.requiresAssociationPlanConfiguration && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base flex items-center gap-3">
            <AlertTriangle size={18} />
            Esta sesión es un clon con borrador de retos precargado. Revísalo y guarda la configuración antes de iniciar.
          </GlassCard>
        )}

        {canEdit && isMemorySession && !hasMemoryBoardConfigured && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} />
              Esta sesión de memoria requiere configurar el tablero antes de iniciar.
            </div>
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(session.id || session._id))}
            >
              <Map size={16} />
              Configurar tablero
            </ButtonPremium>
          </GlassCard>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6 lg:col-span-2 space-y-5">
            <h2 className="text-lg font-semibold text-text-primary">Configuración</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-accent-indigo/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Layers size={16} className="text-accent-indigo" />
                  Tarjetas
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfCards}
                </p>
              </div>
              <div className="bg-warning-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Timer size={16} className="text-warning-base" />
                  Tiempo por ronda
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.timeLimit}s
                </p>
              </div>
              <div className="bg-success-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Award size={16} className="text-success-base" />
                  Puntos por acierto
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  +{session.config?.pointsPerCorrect}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-accent-cyan/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <RotateCcw size={16} className="text-accent-cyan" />
                  Rondas
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfRounds}
                </p>
              </div>
              <div className="bg-error-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Minus size={16} className="text-error-base" />
                  Penalización
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.penaltyPerError}
                </p>
              </div>
              <div className="bg-brand-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Gauge size={16} className="text-brand-base" />
                  Dificultad
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {{ easy: 'Fácil', medium: 'Media', hard: 'Difícil' }[session.difficulty] || session.difficulty}
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Resumen</h2>
            <div className="divide-y divide-border-subtle">
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <Info size={14} />
                  Estado
                </span>
                <StatusBadge status={statusInfo.tone} size="sm">{statusInfo.label}</StatusBadge>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <Gamepad2 size={14} />
                  Mecánica
                </span>
                <span className="text-sm text-text-primary font-medium">{session.mechanic?.displayName}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <FolderOpen size={14} />
                  Contexto
                </span>
                <span className="text-sm text-text-primary font-medium">{session.context?.name}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <CreditCard size={14} />
                  Mazo
                </span>
                <span className="text-sm text-text-primary font-medium">{session.deck?.name}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <Calendar size={14} />
                  Creada
                </span>
                <span className="text-sm text-text-primary font-medium">{formatDate(session.createdAt, 'short')}</span>
              </div>
            </div>
            {!canEdit && (
              <div className="text-xs text-text-muted border border-border-default rounded-lg p-3">
                Solo las sesiones en borrador pueden editarse o eliminarse.
              </div>
            )}
          </GlassCard>
        </div>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Mapping de tarjetas</h2>
          {mappingCards.length === 0 ? (
            <EmptyState
              title="Sin tarjetas asignadas"
              description="Aún no hay tarjetas vinculadas a esta sesión."
              icon={<Layers size={26} />}
              className="bg-transparent border border-border-subtle"
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {mappingCards.map((mapping) => {
                const display = mapping.displayData?.display || mapping.displayData?.emoji || '🪪';
                const label = mapping.displayData?.value || mapping.assignedValue || mapping.uid;
                return (
                  <motion.div
                    key={mapping.id || mapping.uid}
                    className={cn(
                      'rounded-2xl border border-accent-indigo/15 p-4 bg-glass-bg',
                      'flex flex-col items-center justify-center gap-2 text-center'
                    )}
                    whileHover={{ scale: 1.04, y: -2 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <div className="relative">
                      <CardAssetPreview
                        asset={mapping.displayData}
                        alt={label}
                        className="w-14 h-14 rounded-xl"
                        fit="cover"
                        fallbackLabel={display}
                      />
                      {mapping.displayData?.audioUrl && (
                        <AudioPlayBadge
                          audioUrl={mapping.displayData.audioUrl}
                          size="xs"
                          className="absolute -top-1 -right-1"
                        />
                      )}
                    </div>
                    <p className="text-sm text-text-primary font-semibold">{label}</p>
                    <p className="text-xs text-text-muted">{mapping.uid}</p>
                  </motion.div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      <ConfirmationModal
        open={cloneModal.isOpen}
        onClose={cloneModal.close}
        onConfirm={handleClone}
        title="Volver a jugar"
        description="Se creará una sesión nueva en borrador con datos resincronizados del mazo actual. La sesión original no se modifica."
        confirmText="Clonar sesión"
        cancelText="Cancelar"
        variant="info"
        loading={cloneLoading}
      />

      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={handleDelete}
        title="Eliminar sesión"
        description="¿Seguro que quieres eliminar esta configuración? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={deleteLoading}
      />
    </motion.div>
  );
}
