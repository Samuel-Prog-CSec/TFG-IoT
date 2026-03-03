/**
 * @fileoverview Página de gestión de sesiones de juego (configuración).
 * Lista sesiones del profesor con filtros, paginación y acciones seguras.
 *
 * @module pages/SessionsPage
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock,
  PlusCircle,
  Filter,
  RefreshCw,
  Eye,
  Pencil,
  Trash2,
  Map
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, mechanicsAPI, extractErrorMessage, extractData, isAbortError } from '../services/api';
import { useContexts, useRefetchOnFocus } from '../hooks';
import { ROUTES } from '../constants/routes';
import {
  ButtonPremium,
  GlassCard,
  SelectPremium,
  StatusBadge,
  SkeletonCard,
  Tooltip,
  EmptyState,
  ConfirmationModal,
  useConfirmationModal
} from '../components/ui';
import { staggerContainer, staggerItem } from '../lib/utils';

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

export default function SessionsPage() {
  const navigate = useNavigate();
  const { contexts } = useContexts({ autoLoad: true, onlyActive: true });

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [statusFilter, setStatusFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [mechanicFilter, setMechanicFilter] = useState('');
  const [contextFilter, setContextFilter] = useState('');

  const [mechanics, setMechanics] = useState([]);
  const sessionsAbortRef = useRef(null);
  const mechanicsAbortRef = useRef(null);
  const loadMoreAbortRef = useRef(null);
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();
  const [selectedSession, setSelectedSession] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const skeletonKeys = useMemo(() => (
    ['session-skeleton-1', 'session-skeleton-2', 'session-skeleton-3', 'session-skeleton-4', 'session-skeleton-5', 'session-skeleton-6']
  ), []);

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

    if (statusFilter) params.status = statusFilter;
    if (difficultyFilter) params.difficulty = difficultyFilter;
    if (mechanicFilter) params.mechanicId = mechanicFilter;
    if (contextFilter) params.contextId = contextFilter;

    return params;
  }, [statusFilter, difficultyFilter, mechanicFilter, contextFilter]);

  const loadSessions = useCallback(async (reset = true, signal, pageOverride) => {
    try {
      if (reset) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const pageToUse = reset ? 1 : (pageOverride || page);
      const params = buildParams(pageToUse);
      const response = await sessionsAPI.getSessions(params, signal ? { signal } : {});
      const payload = response?.data || {};
      const extracted = extractData(response);
      const items = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(extracted)
          ? extracted
          : Array.isArray(extracted?.data)
            ? extracted.data
            : [];
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
  }, [buildParams, page]);

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
    loadSessions(true, controller.signal);

    return () => controller.abort();
  }, [loadSessions]);

  const refetchSessions = useCallback(() => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    loadSessions(true, controller.signal);
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
      loadSessions(false, controller.signal, nextPage);
    }
  };

  const handleDelete = (session) => {
    setSelectedSession(session);
    deleteModal.open();
  };

  const handleClone = (session) => {
    setSelectedSession(session);
    cloneModal.open();
  };

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
      loadSessions(true);
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
        loadSessions(true);
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
    setStatusFilter('');
    setDifficultyFilter('');
    setMechanicFilter('');
    setContextFilter('');
  };

  const hasActiveFilters = statusFilter || difficultyFilter || mechanicFilter || contextFilter;

  const sessionsContent = (() => {
    if (loading && sessions.length === 0) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {skeletonKeys.map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>
      );
    }

    if (sessions.length === 0) {
      return (
        <EmptyState
          title="No hay sesiones todavia"
          description="Crea una nueva sesion para preparar tu proxima experiencia de juego."
          icon={<CalendarClock size={28} />}
          action={(
            <ButtonPremium variant="primary" onClick={() => navigate(ROUTES.CREATE_SESSION)}>
              <PlusCircle size={18} />
              Crear sesion
            </ButtonPremium>
          )}
        />
      );
    }

    return (
      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        variants={staggerContainer}
        initial={false}
        animate="show"
      >
        {sessions.map((session) => {
          const statusInfo = statusToBadge(session.status);
          const title = session.deck?.name || 'Sesión sin mazo';
          const mechanicLabel = session.mechanic?.displayName || session.mechanic?.name || 'Mecánica';
          const contextLabel = session.context?.name || 'Contexto';
          const sessionId = session.id || session._id;
          const canEdit = session.status === 'created';
          const canDelete = session.status === 'created';

          return (
            <motion.div key={sessionId} variants={staggerItem}>
              <GlassCard className="p-5 flex flex-col gap-4 hover:border-white/20 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{title}</h3>
                    <p className="text-sm text-slate-400">{mechanicLabel} · {contextLabel}</p>
                  </div>
                  <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-slate-400">Tarjetas</p>
                    <p className="text-white font-semibold">{session.config?.numberOfCards || session.cardMappingsCount}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-slate-400">Rondas</p>
                    <p className="text-white font-semibold">{session.config?.numberOfRounds}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-slate-400">Tiempo</p>
                    <p className="text-white font-semibold">{session.config?.timeLimit}s</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-slate-400">Puntos</p>
                    <p className="text-white font-semibold">+{session.config?.pointsPerCorrect}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-auto">
                  <ButtonPremium
                    variant="secondary"
                    onClick={() => navigate(ROUTES.SESSION_DETAIL(sessionId))}
                    className="flex-1"
                  >
                    <Eye size={16} />
                    Ver detalle
                  </ButtonPremium>
                  <ButtonPremium
                    variant="secondary"
                    onClick={() => handleClone(session)}
                    disabled={cloneLoading}
                    className="flex-1"
                  >
                    <RefreshCw size={16} />
                    Volver a jugar
                  </ButtonPremium>
                  <Tooltip content="Ver mapping">
                    <ButtonPremium
                      variant="ghost"
                      onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
                    >
                      <Map size={16} />
                    </ButtonPremium>
                  </Tooltip>
                  <Tooltip content="Editar sesion">
                    <ButtonPremium
                      variant="ghost"
                      onClick={() => navigate(ROUTES.SESSION_EDIT(sessionId))}
                      disabled={!canEdit}
                    >
                      <Pencil size={16} />
                    </ButtonPremium>
                  </Tooltip>
                  <Tooltip content="Eliminar sesion">
                    <ButtonPremium
                      variant="ghost"
                      onClick={() => handleDelete(session)}
                      disabled={!canDelete}
                    >
                      <Trash2 size={16} />
                    </ButtonPremium>
                  </Tooltip>
                </div>

                {!canEdit && (
                  <p className="text-xs text-slate-500">
                    Solo sesiones en borrador se pueden editar o eliminar.
                  </p>
                )}
              </GlassCard>
            </motion.div>
          );
        })}
      </motion.div>
    );
  })();

  let loadMoreLabel = 'No hay más sesiones';
  if (loadingMore) {
    loadMoreLabel = 'Cargando...';
  } else if (hasMore) {
    loadMoreLabel = 'Cargar más';
  }

  return (
    <div
      className="p-6 lg:p-8 max-w-7xl mx-auto"
    >
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                <CalendarClock size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white font-display">Sesiones de juego</h1>
                <p className="text-slate-400">Configura y gestiona tus sesiones antes de jugar.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
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
            </div>
          </div>

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
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="Todos"
                />
                <SelectPremium
                  label="Dificultad"
                  options={DIFFICULTY_OPTIONS}
                  value={difficultyFilter}
                  onChange={setDifficultyFilter}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Mecánica"
                  options={mechanicOptions}
                  value={mechanicFilter}
                  onChange={setMechanicFilter}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Contexto"
                  options={contextOptions}
                  value={contextFilter}
                  onChange={setContextFilter}
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
        </header>

        {error && (
          <GlassCard className="p-6 border border-rose-500/30">
            <p className="text-rose-400">{error}</p>
          </GlassCard>
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
            <p className="text-slate-400 text-sm">No se modifica la sesión original ni sus partidas.</p>
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
            <p className="text-slate-400 text-sm">Solo se puede eliminar si está en borrador.</p>
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
