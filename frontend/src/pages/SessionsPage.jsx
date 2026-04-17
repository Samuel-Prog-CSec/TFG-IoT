/**
 * @fileoverview Página de gestión de sesiones de juego (configuración).
 * Lista sesiones del profesor con filtros, paginación y acciones seguras.
 *
 * @module pages/SessionsPage
 */

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock,
  PlusCircle,
  Filter,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Map,
  Layers,
  Timer,
  Award,
  RotateCcw,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, mechanicsAPI, extractErrorMessage, extractData, isAbortError } from '../services/api';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROUTES } from '../constants/routes';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import SelectPremium from '../components/ui/SelectPremium';
import StatusBadge from '../components/ui/StatusBadge';
import { SkeletonGrid } from '../components/ui/SkeletonShimmer';
import Tooltip from '../components/ui/Tooltip';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import PageHeader from '../components/ui/PageHeader';
import { cn, listContainerVariants, listItemVariants } from '../lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'created', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'completed', label: 'Completada' }
];

const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' }
];

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

const extractSessionItems = ({ payload, extracted }) => {
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(extracted)) {
    return extracted;
  }
  if (Array.isArray(extracted?.data)) {
    return extracted.data;
  }
  return [];
};

const BORDER_CLASSES = {
  created: 'border-l-warning-base/70',
  active: 'border-l-success-base/70',
  completed: 'border-l-success-base/40',
};

const STATUS_CARD_CLASSES = {
  created: 'border-dashed border-warning-base/30',
  active: 'ring-1 ring-brand-base/30 shadow-[0_0_12px_var(--color-brand-glow)]',
  completed: 'border-b-2 border-b-success-base/40',
};

const SessionCard = memo(function SessionCard({
  session,
  cloneLoading,
  onClone,
  onDelete,
  onNavigate
}) {
  const statusInfo = statusToBadge(session.status);
  const title = session.name || session.deck?.name || 'Sesión sin mazo asignado';
  const mechanicLabel = session.mechanic?.displayName || session.mechanic?.name || 'Mecánica';
  const contextLabel = session.context?.name || 'Contexto';
  const sessionId = session.id || session._id;
  const canEdit = session.status === 'created';
  const canDelete = session.status === 'created';
  const borderClass = BORDER_CLASSES[session.status] || 'border-l-background-surface/50';

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <GlassCard className={cn(
        'p-6 flex flex-col gap-5 hover:border-border-strong transition-[border-color] border-l-4',
        borderClass,
        STATUS_CARD_CLASSES[session.status]
      )}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
            <p className="text-sm text-text-muted">{mechanicLabel} · {contextLabel}</p>
          </div>
          <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
          <div className="bg-accent-indigo/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-indigo/15 flex items-center justify-center flex-shrink-0">
              <Layers size={14} className="text-accent-indigo" />
            </div>
            <div>
              <p className="text-text-muted">Tarjetas</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.numberOfCards || session.cardMappingsCount}</p>
            </div>
          </div>
          <div className="bg-accent-cyan/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-cyan/15 flex items-center justify-center flex-shrink-0">
              <RotateCcw size={14} className="text-accent-cyan" />
            </div>
            <div>
              <p className="text-text-muted">Rondas</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.numberOfRounds}</p>
            </div>
          </div>
          <div className="bg-warning-base/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-warning-base/15 flex items-center justify-center flex-shrink-0">
              <Timer size={14} className="text-warning-base" />
            </div>
            <div>
              <p className="text-text-muted">Tiempo</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.timeLimit}s</p>
            </div>
          </div>
          <div className="bg-success-base/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-success-base/15 flex items-center justify-center flex-shrink-0">
              <Award size={14} className="text-success-base" />
            </div>
            <div>
              <p className="text-text-muted">Puntos</p>
              <p className="text-text-primary font-semibold font-display">+{session.config?.pointsPerCorrect}</p>
            </div>
          </div>
        </div>

        {session.playStats && session.playStats.playsCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-background-surface/50 px-3 py-2 text-xs text-text-muted">
            <BarChart3 size={14} className="text-text-muted/70 flex-shrink-0" />
            <span>
              {session.playStats.playsCount} {session.playStats.playsCount === 1 ? 'partida jugada' : 'partidas jugadas'}
              {session.playStats.averageScore != null && (
                <> {'\u00B7'} {session.playStats.averageScore} pts promedio</>
              )}
            </span>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-border-subtle space-y-3">
          <div className="flex gap-3">
            <ButtonPremium
              variant="secondary"
              onClick={() => onNavigate(ROUTES.SESSION_DETAIL(sessionId))}
              className="flex-1"
            >
              <Eye size={16} />
              Ver detalle
            </ButtonPremium>
            <ButtonPremium
              variant="primary"
              onClick={() => onClone(session)}
              disabled={cloneLoading}
              className="flex-1"
            >
              <RefreshCw size={16} />
              <span className="sm:hidden">Clonar</span>
              <span className="hidden sm:inline">Clonar y jugar</span>
            </ButtonPremium>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-glass-bg rounded-lg p-1">
              <Tooltip content="Ver mapping">
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
                  aria-label="Ver mapping de tarjetas"
                >
                  <Map size={14} />
                </ButtonPremium>
              </Tooltip>
              {/* Tooltip dinamico: explica el motivo cuando los botones estan disabled
                  para que el usuario sepa que solo las sesiones en borrador son editables. */}
              <Tooltip content={canEdit ? 'Editar sesión' : 'Las sesiones jugadas no se pueden editar; clónala para crear una nueva en borrador'}>
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(ROUTES.SESSION_EDIT(sessionId))}
                  disabled={!canEdit}
                  aria-label={canEdit ? 'Editar sesión' : 'Editar sesión (deshabilitado: ya tiene partidas)'}
                >
                  <Pencil size={14} />
                </ButtonPremium>
              </Tooltip>
              <Tooltip content={canDelete ? 'Eliminar sesión' : 'Las sesiones jugadas no se pueden eliminar; archivalas en su lugar'}>
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(session)}
                  disabled={!canDelete}
                  aria-label={canDelete ? 'Eliminar sesión' : 'Eliminar sesión (deshabilitado: ya tiene partidas)'}
                >
                  <Trash2 size={14} />
                </ButtonPremium>
              </Tooltip>
            </div>
          </div>
        </div>

      </GlassCard>
    </motion.div>
  );
});

SessionCard.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    status: PropTypes.string,
    deck: PropTypes.shape({
      name: PropTypes.string,
    }),
    mechanic: PropTypes.shape({
      name: PropTypes.string,
      displayName: PropTypes.string,
    }),
    context: PropTypes.shape({
      name: PropTypes.string,
    }),
    config: PropTypes.shape({
      numberOfCards: PropTypes.number,
      numberOfRounds: PropTypes.number,
      timeLimit: PropTypes.number,
      pointsPerCorrect: PropTypes.number,
    }),
    cardMappingsCount: PropTypes.number,
    playStats: PropTypes.shape({
      playsCount: PropTypes.number,
      averageScore: PropTypes.number,
    }),
  }).isRequired,
  cloneLoading: PropTypes.bool.isRequired,
  onClone: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
};

const renderSessionsContent = ({
  loading,
  sessions,
  navigate,
  cloneLoading,
  handleClone,
  handleDelete
}) => {
  if (loading && sessions.length === 0) {
    return <SkeletonGrid count={6} columns={3} />;
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="Aún no tienes sesiones"
        description="Crea tu primera sesión de juego para que tus alumnos empiecen a aprender."
        icon={<CalendarClock size={28} />}
        action={(
          <ButtonPremium variant="primary" onClick={() => navigate(ROUTES.CREATE_SESSION)}>
            <PlusCircle size={18} />
            Crear sesión
          </ButtonPremium>
        )}
      />
    );
  }

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      variants={listContainerVariants(0.04)}
      initial="hidden"
      animate="visible"
    >
      {sessions.map((session) => (
        <motion.div key={session.id || session._id} variants={listItemVariants}>
          <SessionCard
            session={session}
            cloneLoading={cloneLoading}
            onClone={handleClone}
            onDelete={handleDelete}
            onNavigate={navigate}
          />
        </motion.div>
      ))}
    </motion.div>
  );
};

const filtersInitialState = {
  statusFilter: '',
  difficultyFilter: '',
  mechanicFilter: '',
  contextFilter: '',
};

function filtersReducer(state, action) {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, statusFilter: action.payload };
    case 'SET_DIFFICULTY':
      return { ...state, difficultyFilter: action.payload };
    case 'SET_MECHANIC':
      return { ...state, mechanicFilter: action.payload };
    case 'SET_CONTEXT':
      return { ...state, contextFilter: action.payload };
    case 'RESET_FILTERS':
      return filtersInitialState;
    default:
      return state;
  }
}

export default function SessionsPage() {
  const navigate = useNavigate();
  const { contexts } = useContexts({ autoLoad: true, onlyActive: true });
  useDocumentTitle('Sesiones');

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, dispatchFilters] = useReducer(filtersReducer, filtersInitialState);

  const [mechanics, setMechanics] = useState([]);
  const sessionsAbortRef = useRef(null);
  const mechanicsAbortRef = useRef(null);
  const loadMoreAbortRef = useRef(null);
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();
  const [selectedSession, setSelectedSession] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const mechanicOptions = useMemo(() => [
    { value: '', label: 'Todas' },
    ...mechanics.map((mechanic) => ({
      value: mechanic.id || mechanic._id,
      label: mechanic.displayName || mechanic.name
    }))
  ], [mechanics]);

  const contextOptions = useMemo(() => [
    { value: '', label: 'Todos' },
    ...contexts.map((context) => ({
      value: context.id || context._id,
      label: context.name
    }))
  ], [contexts]);

  const loadMechanics = useCallback(async (signal) => {
    try {
      const response = await mechanicsAPI.getMechanics({ isActive: true }, signal ? { signal } : {});
      const data = extractData(response) || [];
      setMechanics(Array.isArray(data) ? data : []);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudieron cargar las mecánicas', {
        description: extractErrorMessage(err)
      });
    }
  }, []);

  const buildParams = useCallback((pageValue) => {
    const params = {
      page: pageValue,
      limit: 9,
      sortBy: 'createdAt',
      order: 'desc'
    };

    if (filters.statusFilter) params.status = filters.statusFilter;
    if (filters.difficultyFilter) params.difficulty = filters.difficultyFilter;
    if (filters.mechanicFilter) params.mechanicId = filters.mechanicFilter;
    if (filters.contextFilter) params.contextId = filters.contextFilter;

    return params;
  }, [filters]);

  const loadSessions = useCallback(async ({ reset = true, signal, pageOverride } = {}) => {
    try {
      if (reset) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const pageToUse = reset ? 1 : pageOverride;
      const params = buildParams(pageToUse);
      const response = await sessionsAPI.getSessions(params, signal ? { signal } : {});
      const payload = response?.data || {};
      const extracted = extractData(response);
      const items = extractSessionItems({ payload, extracted });
      const pagination = payload.pagination || extracted?.pagination || {};

      if (reset) {
        setSessions(items);
      } else {
        setSessions((prev) => [...prev, ...items]);
      }

      setHasMore(pagination.page < pagination.totalPages);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const message = extractErrorMessage(err);
      setError(message);
      toast.error('Error al cargar sesiones', { description: message });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildParams]);

  useEffect(() => {
    mechanicsAbortRef.current?.abort();
    const controller = new AbortController();
    mechanicsAbortRef.current = controller;
    loadMechanics(controller.signal);

    return () => controller.abort();
  }, [loadMechanics]);

  useEffect(() => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    loadSessions({ reset: true, signal: controller.signal });

    return () => controller.abort();
  }, [loadSessions]);

  const refetchSessions = useCallback(() => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    loadSessions({ reset: true, signal: controller.signal });
  }, [loadSessions]);

  useRefetchOnFocus({
    refetch: refetchSessions,
    isLoading: loading,
    hasData: sessions.length > 0,
    hasError: Boolean(error)
  });

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadMoreAbortRef.current?.abort();
      const controller = new AbortController();
      loadMoreAbortRef.current = controller;
      loadSessions({ reset: false, signal: controller.signal, pageOverride: nextPage });
    }
  };

  const handleDelete = useCallback((session) => {
    setSelectedSession(session);
    deleteModal.open();
  }, [deleteModal]);

  const handleClone = useCallback((session) => {
    setSelectedSession(session);
    cloneModal.open();
  }, [cloneModal]);

  const confirmDelete = async () => {
    if (!selectedSession) return;

    setDeleteLoading(true);
    try {
      await sessionsAPI.deleteSession(selectedSession.id || selectedSession._id);
      toast.success('Sesión eliminada', {
        description: 'La configuración se eliminó correctamente.'
      });
      deleteModal.close();
      setSelectedSession(null);
      loadSessions({ reset: true });
    } catch (err) {
      toast.error('No se pudo eliminar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmClone = async () => {
    if (!selectedSession) return;

    setCloneLoading(true);
    try {
      const response = await sessionsAPI.cloneSession(selectedSession.id || selectedSession._id);
      const clonedSession = extractData(response);
      const clonedSessionId = clonedSession?.id || clonedSession?._id;
      const clonedMechanicName = (clonedSession?.mechanic?.name || '').toString().toLowerCase();

      toast.success('Sesión clonada', {
        description: 'La nueva sesión se creó en borrador y está lista para revisar.'
      });

      cloneModal.close();
      setSelectedSession(null);

      if (clonedSessionId) {
        if (clonedMechanicName === 'memory') {
          navigate(ROUTES.BOARD_SETUP_WITH_ID(clonedSessionId));
        } else {
          navigate(ROUTES.SESSION_DETAIL(clonedSessionId));
        }
      } else {
        loadSessions({ reset: true });
      }
    } catch (err) {
      toast.error('No se pudo clonar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      setCloneLoading(false);
    }
  };

  const clearFilters = () => {
    dispatchFilters({ type: 'RESET_FILTERS' });
  };

  const hasActiveFilters = filters.statusFilter || filters.difficultyFilter || filters.mechanicFilter || filters.contextFilter;

  const sessionsContent = renderSessionsContent({
    loading,
    sessions,
    navigate,
    cloneLoading,
    handleClone,
    handleDelete
  });

  let loadMoreLabel = 'No hay más sesiones';
  if (loadingMore) {
    loadMoreLabel = 'Cargando…';
  } else if (hasMore) {
    loadMoreLabel = 'Cargar más';
  }

  return (
    <div
      className="p-6 lg:p-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={<CalendarClock size={24} />}
          iconClassName="bg-accent-indigo/20 text-accent-indigo"
          title="Sesiones de juego"
          subtitle="Configura y gestiona tus sesiones antes de jugar."
          actions={<>
            <ButtonPremium
              variant="secondary"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <Filter size={18} />
              {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
            </ButtonPremium>
            <ButtonPremium variant="primary" onClick={() => navigate(ROUTES.CREATE_SESSION)}>
              <PlusCircle size={18} />
              Crear sesión
            </ButtonPremium>
          </>}
        />

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4"
              >
                <SelectPremium
                  label="Estado"
                  options={STATUS_OPTIONS}
                  value={filters.statusFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_STATUS', payload: val })}
                  placeholder="Todos"
                />
                <SelectPremium
                  label="Dificultad"
                  options={DIFFICULTY_OPTIONS}
                  value={filters.difficultyFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_DIFFICULTY', payload: val })}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Mecánica"
                  options={mechanicOptions}
                  value={filters.mechanicFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_MECHANIC', payload: val })}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Contexto"
                  options={contextOptions}
                  value={filters.contextFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_CONTEXT', payload: val })}
                  placeholder="Todos"
                />
                {hasActiveFilters && (
                  <div className="md:col-span-4">
                    <ButtonPremium variant="ghost" onClick={clearFilters}>
                      <RefreshCw size={16} />
                      Limpiar filtros
                    </ButtonPremium>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        {error && (
          <ErrorState
            title="Error al cargar sesiones"
            message={`${error} Pulsa Reintentar o recarga la página.`}
            onRetry={refetchSessions}
          />
        )}

        {sessionsContent}

        {sessions.length > 0 && (
          <div className="flex justify-center">
            <ButtonPremium
              variant="secondary"
              onClick={handleLoadMore}
              disabled={!hasMore || loadingMore}
            >
              {loadMoreLabel}
            </ButtonPremium>
          </div>
        )}
      </div>

      <ConfirmationModal
        open={cloneModal.isOpen}
        onClose={cloneModal.close}
        onConfirm={confirmClone}
        title="Volver a jugar"
        description={
          <div className="space-y-2">
            <p>Se creará una nueva sesión en borrador con la configuración resincronizada desde el mazo actual.</p>
            <p className="text-text-muted text-sm">No se modifica la sesión original ni sus partidas.</p>
          </div>
        }
        confirmText="Clonar sesión"
        cancelText="Cancelar"
        variant="info"
        loading={cloneLoading}
      />

      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={confirmDelete}
        title="Eliminar sesión"
        description={
          <div className="space-y-2">
            <p>Esta acción eliminará la configuración de la sesión seleccionada.</p>
            <p className="text-text-muted text-sm">Solo se puede eliminar si está en borrador.</p>
          </div>
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}
