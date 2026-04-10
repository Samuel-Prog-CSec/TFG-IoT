/**
 * @fileoverview Página de gestión de mazos de cartas
 * Lista todos los mazos del profesor con opciones de crear, ver, editar y archivar.
 * Incluye filtros, búsqueda, paginación y animaciones premium.
 * 
 * @module pages/CardDecksPage
 */

import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Filter, 
  Layers, 
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';
import { cn, crossfadeVariants } from '../lib/utils';
import { decksAPI, extractErrorMessage, isAbortError } from '../services/api';
import DeckCard, { DeckCardSkeleton } from '../components/ui/DeckCard';
import { SkeletonGrid } from '../components/ui/SkeletonShimmer';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import SelectPremium from '../components/ui/SelectPremium';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ROUTES } from '../constants/routes';
import PageHeader from '../components/ui/PageHeader';
import ErrorState from '../components/ui/ErrorState';
import { toast } from 'sonner';

// Límite de mazos por profesor (sincronizado con backend)
const MAX_DECKS = 50;

const buildDeckQueryParams = ({ page, statusFilter, searchQuery, contextFilter }) => ({
  page,
  limit: 12,
  status: statusFilter,
  ...(searchQuery && { search: searchQuery }),
  ...(contextFilter && { contextId: contextFilter }),
  sortBy: 'createdAt',
  order: 'desc',
});

const shouldUsePaginationCount = ({ statusFilter, searchQuery, contextFilter, pagination }) =>
  statusFilter === 'active' && !searchQuery && !contextFilter && pagination.total !== undefined;

const mergeDecks = ({ previousDecks, newDecks, resetPage }) =>
  resetPage ? newDecks : [...previousDecks, ...newDecks];

const resolveDeckCount = async ({
  skipCount,
  statusFilter,
  searchQuery,
  contextFilter,
  pagination,
  signal
}) => {
  if (skipCount) {
    return null;
  }

  if (shouldUsePaginationCount({ statusFilter, searchQuery, contextFilter, pagination })) {
    return { active: pagination.total };
  }

  return decksAPI.getDecksCount(signal ? { signal } : {});
};

const renderDecksGrid = ({ decks, shouldReduceMotion, handleViewDeck, handleEditDeck, handleArchiveDeck }) => (
  <motion.div
    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
    {...(shouldReduceMotion ? {} : crossfadeVariants)}
  >
    {decks.map((deck) => {
      const deckId = deck.id || deck._id;
      return (
        <div key={deckId}>
          <DeckCard
            deck={deck}
            onView={handleViewDeck}
            onEdit={handleEditDeck}
            onDelete={handleArchiveDeck}
            reducedMotion={shouldReduceMotion}
          />
        </div>
      );
    })}
  </motion.div>
);

const renderDecksErrorState = ({ error, loadDecks }) => (
  <ErrorState
    title="Error al cargar mazos"
    message={`${error} Pulsa Reintentar o recarga la página.`}
    icon={<AlertCircle size={28} />}
    onRetry={() => loadDecks({ resetPage: true })}
  />
);

const renderDecksLoadingState = () => (
  <SkeletonGrid count={6} columns={3} />
);

const renderDecksEmptyState = ({ shouldReduceMotion, hasActiveFilters, clearFilters, handleCreateDeck }) => (
  <motion.div
    initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16"
  >
    <motion.div
      className="size-32 mb-6 relative"
      animate={shouldReduceMotion ? { y: 0 } : { y: [0, -10, 0] }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <motion.rect
          x="15" y="25" width="35" height="50" rx="4"
          fill="none" stroke="#6366f1" strokeWidth="2"
          initial={{ rotate: -15, opacity: 0.5 }}
          animate={shouldReduceMotion ? { rotate: -15, opacity: 0.7 } : { rotate: [-15, -10, -15], opacity: [0.5, 0.8, 0.5] }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }}
          style={{ transformOrigin: '32px 50px' }}
        />
        <motion.rect
          x="32" y="20" width="35" height="50" rx="4"
          fill="none" stroke="#8b5cf6" strokeWidth="2"
          initial={{ rotate: 0 }}
          animate={shouldReduceMotion ? { rotate: 0 } : { rotate: [0, 5, 0] }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, delay: 0.3 }}
          style={{ transformOrigin: '50px 45px' }}
        />
        <motion.rect
          x="50" y="25" width="35" height="50" rx="4"
          fill="none" stroke="#a855f7" strokeWidth="2"
          initial={{ rotate: 15, opacity: 0.5 }}
          animate={shouldReduceMotion ? { rotate: 15, opacity: 0.7 } : { rotate: [15, 10, 15], opacity: [0.5, 0.8, 0.5] }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, delay: 0.6 }}
          style={{ transformOrigin: '68px 50px' }}
        />
      </svg>
    </motion.div>

    <h3 className="text-xl font-semibold text-text-primary mb-2">
      {hasActiveFilters ? 'No hay resultados' : 'Crea tu primer mazo'}
    </h3>
    <p className="text-text-muted text-center max-w-md mb-6">
      {hasActiveFilters
        ? 'Intenta con otros filtros o términos de búsqueda'
        : 'Los mazos te permiten reutilizar configuraciones de tarjetas en múltiples sesiones de juego'}
    </p>

    {hasActiveFilters ? (
      <ButtonPremium variant="secondary" onClick={clearFilters}>
        Limpiar filtros
      </ButtonPremium>
    ) : (
      <ButtonPremium onClick={handleCreateDeck} icon={<Plus size={18} />}>
        Crear mi primer mazo
      </ButtonPremium>
    )}
  </motion.div>
);

const renderDecksState = ({
  error,
  loading,
  decks,
  shouldReduceMotion,
  hasActiveFilters,
  clearFilters,
  handleCreateDeck,
  loadDecks,
  handleViewDeck,
  handleEditDeck,
  handleArchiveDeck,
}) => {
  if (error) {
    return renderDecksErrorState({ error, shouldReduceMotion, loadDecks });
  }

  if (loading && decks.length === 0) {
    return renderDecksLoadingState();
  }

  if (decks.length === 0) {
    return renderDecksEmptyState({ shouldReduceMotion, hasActiveFilters, clearFilters, handleCreateDeck });
  }

  return renderDecksGrid({ decks, shouldReduceMotion, handleViewDeck, handleEditDeck, handleArchiveDeck });
};
const filtersInitialState = {
  searchQuery: '',
  statusFilter: 'active',
  contextFilter: '',
};

function filtersReducer(state, action) {
  switch (action.type) {
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload };
    case 'SET_STATUS':
      return { ...state, statusFilter: action.payload };
    case 'SET_CONTEXT':
      return { ...state, contextFilter: action.payload };
    case 'RESET_FILTERS':
      return filtersInitialState;
    default:
      return state;
  }
}

/**
 * Página principal de gestión de mazos
 */
export default function CardDecksPage() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Mis Mazos');

  // Estados
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deckCount, setDeckCount] = useState({ active: 0, archived: 0, total: 0 });
  
  // Filtros y búsqueda (agrupados con useReducer)
  const [filters, dispatchFilters] = useReducer(filtersReducer, filtersInitialState);
  const [showFilters, setShowFilters] = useState(false);
  
  // Paginación
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Modal de confirmación para archivar
  const archiveModal = useConfirmationModal();
  const [archivingDeck, setArchivingDeck] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const decksAbortRef = useRef(null);
  const countAbortRef = useRef(null);

  // Hook de contextos (para filtro)
  const { contexts } = useContexts({ autoLoad: true, onlyActive: true });

  // Cargar mazos
  const loadDecks = useCallback(async ({ resetPage = true, skipCount = false, signal, pageOverride } = {}) => {
    try {
      if (resetPage) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const pageToUse = resetPage ? 1 : (pageOverride || page);
      const params = buildDeckQueryParams({
        page: pageToUse,
        statusFilter: filters.statusFilter,
        searchQuery: filters.searchQuery,
        contextFilter: filters.contextFilter
      });

      const response = await decksAPI.getDecks(params, signal ? { signal } : {});
      const { data } = response;

      const newDecks = data.data || [];
      const pagination = data.pagination || {};

      setDecks(prev => mergeDecks({ previousDecks: prev, newDecks, resetPage }));

      setHasMore(pagination.page < pagination.totalPages);

      const countData = await resolveDeckCount({
        skipCount,
        statusFilter: filters.statusFilter,
        searchQuery: filters.searchQuery,
        contextFilter: filters.contextFilter,
        pagination,
        signal
      });
      if (countData?.active !== undefined && countData?.total === undefined) {
        setDeckCount(prev => ({ ...prev, active: countData.active }));
      } else if (countData) {
        setDeckCount(countData);
      }

    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setError(extractErrorMessage(err));
      toast.error('Error al cargar mazos', {
        description: extractErrorMessage(err),
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [filters, page]);

  // Cargar al montar y cuando cambian filtros
  useEffect(() => {
    decksAbortRef.current?.abort();
    countAbortRef.current?.abort();
    const controller = new AbortController();
    decksAbortRef.current = controller;
    countAbortRef.current = controller;
    loadDecks({ resetPage: true, skipCount: false, signal: controller.signal });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadDecks includes page in its deps; we only want to re-run on filter changes
  }, [filters]);

  const refetchDecks = useCallback(() => {
    decksAbortRef.current?.abort();
    countAbortRef.current?.abort();
    const controller = new AbortController();
    decksAbortRef.current = controller;
    countAbortRef.current = controller;
    loadDecks({ resetPage: true, skipCount: false, signal: controller.signal });
  }, [loadDecks]);

  useRefetchOnFocus({
    refetch: refetchDecks,
    isLoading: loading,
    hasData: decks.length > 0,
    hasError: Boolean(error)
  });

  // Cargar más (paginación)
  const loadMore = () => {
    if (!loadingMore && hasMore) {
      setPage(prev => prev + 1);
      const nextPage = page + 1;
      const controller = new AbortController();
      decksAbortRef.current = controller;
      loadDecks({ resetPage: false, skipCount: true, signal: controller.signal, pageOverride: nextPage });
    }
  };

  // Handlers
  const handleCreateDeck = () => {
    if (deckCount.active >= MAX_DECKS) {
      toast.error('Límite alcanzado', {
        description: `Has alcanzado el límite de ${MAX_DECKS} mazos activos. Archiva alguno para crear más.`,
      });
      return;
    }
    navigate(ROUTES.CARD_DECKS_NEW);
  };

  const handleViewDeck = (deck) => {
    const deckId = deck.id || deck._id;
    if (deckId) {
      navigate(ROUTES.CARD_DECKS_DETAIL(deckId));
    }
  };

  const handleEditDeck = (deck) => {
    const deckId = deck.id || deck._id;
    if (deckId) {
      navigate(ROUTES.CARD_DECKS_EDIT(deckId));
    }
  };

  const handleArchiveDeck = (deck) => {
    setArchivingDeck(deck);
    archiveModal.open();
  };

  const confirmArchive = async () => {
    if (!archivingDeck) return;
    
    setArchiveLoading(true);
    try {
      const deckId = archivingDeck.id || archivingDeck._id;
      if (!deckId) {
        throw new Error('No se encontró el ID del mazo.');
      }
      await decksAPI.deleteDeck(deckId);
      toast.success('Mazo archivado', {
        description: `"${archivingDeck.name}" ha sido archivado correctamente.`,
      });
      archiveModal.close();
      setArchivingDeck(null);
      loadDecks({ resetPage: true });
    } catch (err) {
      toast.error('Error al archivar', {
        description: extractErrorMessage(err),
      });
    } finally {
      setArchiveLoading(false);
    }
  };

  const clearFilters = () => {
    dispatchFilters({ type: 'RESET_FILTERS' });
  };

  const hasActiveFilters = filters.searchQuery || filters.statusFilter !== 'active' || filters.contextFilter;

  const decksStateContent = renderDecksState({
    error,
    loading,
    decks,
    shouldReduceMotion,
    hasActiveFilters,
    clearFilters,
    handleCreateDeck,
    loadDecks,
    handleViewDeck,
    handleEditDeck,
    handleArchiveDeck,
  });

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        icon={<Layers size={20} />}
        iconClassName="size-10 bg-gradient-to-br from-accent-indigo to-brand-base text-text-primary"
        title="Mis Mazos"
        subtitle="Gestiona tus mazos de cartas RFID para las sesiones de juego"
        actions={<>
          <motion.div
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium',
              'bg-background-elevated/50 border border-border-default',
              deckCount.active >= MAX_DECKS && 'border-warning-base/50 bg-warning-base/10'
            )}
            initial={shouldReduceMotion ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.2 }}
          >
            <span className={cn(
              deckCount.active >= MAX_DECKS ? 'text-warning-base' : 'text-accent-indigo'
            )}>
              {deckCount.active}
            </span>
            <span className="text-text-muted">/{MAX_DECKS} mazos</span>
          </motion.div>
          <ButtonPremium
            onClick={handleCreateDeck}
            disabled={deckCount.active >= MAX_DECKS}
            icon={<Plus size={18} />}
          >
            Nuevo Mazo
          </ButtonPremium>
        </>}
        className="mb-8"
      />

      {/* Barra de búsqueda y filtros */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.1 }}
        className="mb-6"
      >
        <GlassCard className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                size={18}
              />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) => dispatchFilters({ type: 'SET_SEARCH', payload: e.target.value })}
                placeholder="Buscar mazos…"
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-xl',
                  'bg-background-elevated/50 border border-border-default',
                  'text-text-primary placeholder-text-muted',
                  'focus:outline-none focus:border-accent-indigo/50 focus:ring-2 focus:ring-accent-indigo/20',
                  'transition-[color,border-color,box-shadow] duration-300'
                )}
              />
            </div>

            {/* Toggle filtros */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-colors',
                showFilters || hasActiveFilters
                  ? 'bg-accent-indigo/20 border-accent-indigo/50 text-accent-indigo'
                  : 'bg-background-elevated/50 border-border-default text-text-muted hover:border-border-strong'
              )}
            >
              <Filter size={18} />
              Filtros
              {hasActiveFilters && (
                <span className="size-2 rounded-full bg-accent-indigo" />
              )}
            </button>
          </div>

          {/* Filtros expandibles */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-border-subtle overflow-hidden"
              >
                <div className="flex flex-wrap gap-4">
                  {/* Filtro por estado */}
                  <div className="flex-1 min-w-[150px]">
                    <SelectPremium
                      label="Estado"
                      value={filters.statusFilter}
                      onChange={(val) => dispatchFilters({ type: 'SET_STATUS', payload: val })}
                      options={[
                        { value: 'active', label: 'Activos' },
                        { value: 'archived', label: 'Archivados' },
                      ]}
                    />
                  </div>

                  {/* Filtro por contexto */}
                  <div className="flex-1 min-w-[150px]">
                    <SelectPremium
                      label="Contexto"
                      value={filters.contextFilter}
                      onChange={(val) => dispatchFilters({ type: 'SET_CONTEXT', payload: val })}
                      options={[
                        { value: '', label: 'Todos los contextos' },
                        ...contexts.map((ctx) => ({
                          value: ctx._id,
                          label: ctx.name,
                        })),
                      ]}
                    />
                  </div>

                  {/* Limpiar filtros */}
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="self-end px-3 py-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-glass-bg transition-colors text-sm flex items-center gap-1.5"
                    >
                      <X size={14} />
                      Limpiar
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>

      {loading && decks.length > 0 && (
        <div className="mb-4 bg-background-elevated/50 border border-border-default text-text-secondary px-4 py-2 rounded-xl text-sm">
          Actualizando mazos…
        </div>
      )}

      {/* Contenido principal */}
      {decksStateContent}

      {/* Cargar más */}
      {!error && decks.length > 0 && hasMore && (
        <div className="flex justify-center mt-8">
          <ButtonPremium
            variant="secondary"
            onClick={loadMore}
            loading={loadingMore}
          >
            Cargar más mazos
          </ButtonPremium>
        </div>
      )}

      {/* Modal de confirmación para archivar */}
      <ConfirmationModal
        open={archiveModal.isOpen}
        onClose={() => {
          archiveModal.close();
          setArchivingDeck(null);
        }}
        onConfirm={confirmArchive}
        title="Archivar mazo"
        description={
          <>
            ¿Estás seguro de que quieres archivar{' '}
            <strong className="text-text-primary">&quot;{archivingDeck?.name}&quot;</strong>?
            El mazo no se eliminará, pero no aparecerá en tus mazos activos.
          </>
        }
        variant="archive"
        confirmLabel="Archivar"
        loading={archiveLoading}
      />
    </div>
  );
}
