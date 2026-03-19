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
  Gauge
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import EmptyState from '../components/ui/EmptyState';
import Tooltip from '../components/ui/Tooltip';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { cn, pageVariants } from '../lib/utils';
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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ButtonPremium variant="ghost" onClick={() => navigate(ROUTES.SESSIONS)}>
              <ArrowLeft size={16} />
              Volver
            </ButtonPremium>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">
                {session.deck?.name || 'Sesión de juego'}
              </h1>
              <p className="text-slate-400">
                {session.mechanic?.displayName || session.mechanic?.name} · {session.context?.name}
              </p>
            </div>
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
              variant="secondary"
              onClick={cloneModal.open}
              disabled={cloneLoading}
            >
              <Timer size={16} />
              Volver a jugar
            </ButtonPremium>
            <ButtonPremium
              variant="ghost"
              onClick={() => navigate(ROUTES.SESSION_EDIT(session.id || session._id))}
              disabled={!canEdit}
            >
              <Pencil size={16} />
              Editar
            </ButtonPremium>
            <Tooltip content="Eliminar sesión">
              <ButtonPremium
                variant="ghost"
                onClick={deleteModal.open}
                disabled={!canDelete}
              >
                <Trash2 size={16} />
              </ButtonPremium>
            </Tooltip>
          </div>
        </header>

        {canEdit && isAssociationSession && session.requiresAssociationPlanConfiguration && (
          <GlassCard className="p-4 border border-amber-500/30 text-amber-300 flex items-center gap-3">
            <AlertTriangle size={18} />
            Esta sesión es un clon con borrador de retos precargado. Revísalo y guarda la configuración antes de iniciar.
          </GlassCard>
        )}

        {canEdit && isMemorySession && !hasMemoryBoardConfigured && (
          <GlassCard className="p-4 border border-amber-500/30 text-amber-300 flex flex-wrap items-center justify-between gap-3">
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
            <h2 className="text-lg font-semibold text-white">Configuración</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Layers size={16} />
                  Tarjetas
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfCards}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Timer size={16} />
                  Tiempo por ronda
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  {session.config?.timeLimit}s
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Award size={16} />
                  Puntos por acierto
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  +{session.config?.pointsPerCorrect}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <RotateCcw size={16} />
                  Rondas
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfRounds}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Minus size={16} />
                  Penalización
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  {session.config?.penaltyPerError}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Gauge size={16} />
                  Dificultad
                </div>
                <p className="text-white text-xl font-semibold font-display mt-2">
                  {{ easy: 'Fácil', medium: 'Media', hard: 'Difícil' }[session.difficulty] || session.difficulty}
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Resumen</h2>
            <div className="text-sm text-slate-400 space-y-2">
              <p>Estado: <span className="text-white">{statusInfo.label}</span></p>
              <p>Mecánica: <span className="text-white">{session.mechanic?.displayName}</span></p>
              <p>Contexto: <span className="text-white">{session.context?.name}</span></p>
              <p>Mazo: <span className="text-white">{session.deck?.name}</span></p>
              <p>Creada: <span className="text-white">{new Date(session.createdAt).toLocaleDateString()}</span></p>
            </div>
            {!canEdit && (
              <div className="text-xs text-slate-500 border border-white/10 rounded-lg p-3">
                Solo las sesiones en borrador pueden editarse o eliminarse.
              </div>
            )}
          </GlassCard>
        </div>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Mapping de tarjetas</h2>
          {mappingCards.length === 0 ? (
            <EmptyState
              title="Sin tarjetas asignadas"
              description="Aún no hay tarjetas vinculadas a esta sesión."
              icon={<Layers size={26} />}
              className="bg-transparent border border-white/5"
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
                      'rounded-2xl border border-white/10 p-4 bg-white/5',
                      'flex flex-col items-center justify-center gap-2 text-center'
                    )}
                    whileHover={{ scale: 1.04, y: -2 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <CardAssetPreview
                      asset={mapping.displayData}
                      alt={label}
                      className="w-14 h-14 rounded-xl"
                      fit="cover"
                      fallbackLabel={display}
                    />
                    <p className="text-sm text-white font-semibold">{label}</p>
                    <p className="text-xs text-slate-400">{mapping.uid}</p>
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
