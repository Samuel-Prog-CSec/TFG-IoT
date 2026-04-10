/**
 * @fileoverview Detalle de sesión de juego (configuración).
 * Muestra configuración, estado y mapping de tarjetas.
 *
 * @module pages/SessionDetail
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  Calendar,
  Users,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, usersAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { useAuth } from '../context/AuthContext';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import SelectPremium from '../components/ui/SelectPremium';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import EmptyState from '../components/ui/EmptyState';
import Breadcrumb from '../components/ui/Breadcrumb';
import Tooltip from '../components/ui/Tooltip';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { cn, pageVariants, formatDate } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

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
  const { user } = useAuth();
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();
  useDocumentTitle('Detalle de Sesión');

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);

  // Estado para el modal de seleccion de alumno antes de jugar
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);

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

  const handleOpenPlayerModal = useCallback(async () => {
    setPlayerModalOpen(true);
    setSelectedStudentId('');

    const teacherId = user?.id || user?._id;
    if (!teacherId) {
      toast.error('No se pudo determinar el profesor.');
      return;
    }

    setLoadingStudents(true);
    try {
      const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, {
        sortBy: 'name',
        order: 'asc'
      });
      const students = extractData(studentsRes) || [];
      setAvailableStudents(Array.isArray(students) ? students : []);
    } catch (err) {
      toast.error('No se pudieron cargar los alumnos', {
        description: extractErrorMessage(err)
      });
    } finally {
      setLoadingStudents(false);
    }
  }, [user]);

  const handleStartWithPlayer = useCallback(() => {
    if (!selectedStudentId) {
      toast.warning('Selecciona un alumno antes de iniciar.');
      return;
    }
    const sid = session?.id || session?._id;
    setPlayerModalOpen(false);
    navigate(`${ROUTES.GAME(sid)}?playerId=${encodeURIComponent(selectedStudentId)}`);
  }, [selectedStudentId, session, navigate]);

  const statusInfo = statusToBadge(session?.status);
  const canEdit = session?.status === 'created';
  const canDelete = session?.status === 'created';
  const canPlayDirectly = session?.status === 'created' || session?.status === 'active';
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
          { label: session.name || session.deck?.name || 'Sesión de juego' },
        ]} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary font-display">
              {session.name || session.deck?.name || 'Sesión de juego'}
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
            {/* Botón de juego: navegar directamente si no se ha jugado, clonar si ya finalizó */}
            {canPlayDirectly ? (
              <ButtonPremium
                variant="primary"
                onClick={() => {
                  const sid = session.id || session._id;
                  if (isMemorySession) {
                    navigate(ROUTES.BOARD_SETUP_WITH_ID(sid));
                  } else {
                    handleOpenPlayerModal();
                  }
                }}
              >
                <Gamepad2 size={16} />
                Jugar
              </ButtonPremium>
            ) : (
              <ButtonPremium
                variant="primary"
                onClick={cloneModal.open}
                disabled={cloneLoading}
              >
                <Timer size={16} />
                <span className="sm:hidden">Jugar</span>
                <span className="hidden sm:inline">Volver a jugar</span>
              </ButtonPremium>
            )}
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
          <GlassCard className="p-6 lg:col-span-2">
            <div className="h-full flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-text-primary">Configuración</h2>
            <div className="flex-1 flex items-center">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
              <div className="bg-accent-indigo/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Layers size={15} className="text-accent-indigo shrink-0" />
                  <span>Tarjetas</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfCards}
                </p>
              </div>
              <div className="bg-warning-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Timer size={15} className="text-warning-base shrink-0" />
                  <span>Tiempo por ronda</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.timeLimit}s
                </p>
              </div>
              <div className="bg-success-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Award size={15} className="text-success-base shrink-0" />
                  <span>Puntos por acierto</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  +{session.config?.pointsPerCorrect}
                </p>
              </div>
              <div className="bg-accent-cyan/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <RotateCcw size={15} className="text-accent-cyan shrink-0" />
                  <span>Rondas</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.numberOfRounds}
                </p>
              </div>
              <div className="bg-error-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Minus size={15} className="text-error-base shrink-0" />
                  <span>Penalización</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {session.config?.penaltyPerError}
                </p>
              </div>
              <div className="bg-brand-base/10 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Gauge size={15} className="text-brand-base shrink-0" />
                  <span>Dificultad</span>
                </div>
                <p className="text-text-primary text-xl font-semibold font-display mt-2">
                  {{ easy: 'Fácil', medium: 'Media', hard: 'Difícil' }[session.difficulty] || session.difficulty}
                </p>
              </div>
            </div>
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

      {/* Modal de seleccion de alumno antes de iniciar partida */}
      <AnimatePresence>
        {playerModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPlayerModalOpen(false)}
          >
            <motion.div
              className="bg-background-elevated border border-border-default rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-accent-indigo/10">
                    <Users size={20} className="text-accent-indigo" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary font-display">
                      Seleccionar alumno
                    </h3>
                    <p className="text-sm text-text-muted">
                      Elige quién va a jugar esta partida.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlayerModalOpen(false)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-glass-bg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingStudents && (
                <div className="flex items-center justify-center py-8 text-text-muted text-sm">
                  Cargando alumnos...
                </div>
              )}
              {!loadingStudents && availableStudents.length === 0 && (
                <div className="text-center py-6 text-text-muted text-sm">
                  No hay alumnos asignados. Crea o asigna alumnos desde el panel de administracion.
                </div>
              )}
              {!loadingStudents && availableStudents.length > 0 && (
                <SelectPremium
                  value={selectedStudentId}
                  onChange={(val) => setSelectedStudentId(val)}
                  placeholder="Seleccionar alumno..."
                  label="Alumno"
                  options={availableStudents.map(student => ({
                    value: student.id || student._id,
                    label: student.name
                  }))}
                  className="w-full"
                />
              )}

              <div className="flex justify-end gap-3 mt-6">
                <ButtonPremium
                  variant="secondary"
                  onClick={() => setPlayerModalOpen(false)}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  variant="primary"
                  onClick={handleStartWithPlayer}
                  disabled={!selectedStudentId || loadingStudents}
                >
                  <Gamepad2 size={16} />
                  Iniciar partida
                </ButtonPremium>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
