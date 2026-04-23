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
  Archive,
  CreditCard,
  AlertCircle,
  X
} from 'lucide-react';
import { cn, listContainerVariants, motionConfig, DURATION, EASING } from '../lib/utils';

// Variants locales con settle en entrada y "papel volando" en exit, coherente
// con SessionsPage / ContextsPage para toda la familia de tarjetas de lista.
const buildDeckCardWrapperVariants = (shouldReduceMotion) => {
  if (shouldReduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }
  return {
    hidden: { opacity: 0, y: -12, scale: 0.94 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: motionConfig.springGame,
    },
    exit: {
      opacity: 0,
      x: -24,
      scale: 0.92,
      rotate: -2,
      transition: { duration: DURATION.exit, ease: EASING.outQuart },
    },
  };
};
import { decksAPI, extractErrorMessage, isAbortError } from '../services/api';
import DeckCard from '../components/ui/DeckCard';
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
import ActiveFiltersBar from '../components/ui/ActiveFiltersBar';
import EmptyState from '../components/ui/EmptyState';
import { EmptyDecksIllustration } from '../components/ui/illustrations';
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

const mergeDecks = ({ previousDecks, newDecks, resetPage }) =>
  resetPage ? newDecks : [...previousDecks, ...newDecks];

const resolveDeckCount = async ({ skipCount, signal }) => {
  if (skipCount) {
    return null;
  }

  // Siempre pedimos el recuento completo {active, archived, total} para que
  // los KPIs "ACTIVOS / ARCHIVADOS / TOTAL" sean siempre coherentes. El atajo
  // anterior (reutilizar pagination.total cuando estabamos en "active") dejaba
  // `total=0` aunque hubiera 6 activos (detectado en QA 2026-04-23).
  return decksAPI.getDecksCount(signal ? { signal } : {});
};

const renderDecksGrid = ({ decks, shouldReduceMotion, handleViewDeck, handleEditDeck, handleArchiveDeck }) => {
  const wrapperVariants = buildDeckCardWrapperVariants(shouldReduceMotion);
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
      variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
      initial={shouldReduceMotion ? false : "hidden"}
      animate="visible"
    >
      <AnimatePresence>
        {decks.map((deck) => {
          const deckId = deck.id || deck._id;
          return (
            <motion.div
              key={deckId}
              variants={wrapperVariants}
              exit="exit"
            >
              <DeckCard
                deck={deck}
                onView={handleViewDeck}
                onEdit={handleEditDeck}
                onDelete={handleArchiveDeck}
                reducedMotion={shouldReduceMotion}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};

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

const renderDecksEmptyState = ({ hasActiveFilters, clearFilters, handleCreateDeck }) => (
  <EmptyState
    illustration={<EmptyDecksIllustration size={180} />}
    variant={hasActiveFilters ? 'filtered' : 'first-use'}
    title={hasActiveFilters ? 'Prueba con otro filtro' : 'Crea tu primer mazo'}
    description={
      hasActiveFilters
        ? 'No encontramos mazos con esos criterios. Limpia los filtros o prueba con otra búsqueda.'
        : 'Los mazos te permiten reutilizar un conjunto de tarjetas RFID en varias sesiones. Configura uno, asígnalo a sesiones y ahorra tiempo.'
    }
    action={hasActiveFilters ? (
      <ButtonPremium variant="secondary" onClick={clearFilters}>
        Limpiar filtros
      </ButtonPremium>
    ) : (
      <ButtonPremium onClick={handleCreateDeck} icon={<Plus size={18} />}>
        Crear mi primer mazo
      </ButtonPremium>
    )}
  />
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
    return renderDecksEmptyState({ hasActiveFilters, clearFilters, handleCreateDeck });
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

      const countData = await resolveDeckCount({ skipCount, signal });
      if (countData) {
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

  // Chips de filtros activos para la barra visible sobre la lista
  const activeFilterChips = [
    filters.searchQuery && {
      key: 'search',
      label: `Búsqueda: "${filters.searchQuery}"`,
      onRemove: () => dispatchFilters({ type: 'SET_SEARCH', payload: '' }),
    },
    filters.statusFilter !== 'active' && {
      key: 'status',
      label: filters.statusFilter === 'archived' ? 'Estado: Archivados' : `Estado: ${filters.statusFilter}`,
      onRemove: () => dispatchFilters({ type: 'SET_STATUS', payload: 'active' }),
    },
    filters.contextFilter && {
      key: 'context',
      label: (() => {
        const ctx = contexts.find((c) => c._id === filters.contextFilter);
        return `Contexto: ${ctx?.name || 'Desconocido'}`;
      })(),
      onRemove: () => dispatchFilters({ type: 'SET_CONTEXT', payload: '' }),
    },
  ].filter(Boolean);

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
          {/* Pill de uso ampliado con barra de progreso sutil para que el
              usuario perciba cuán cerca está del tope; con Nuevo Mazo al lado
              para que la acción y su contexto cuantitativo estén unidos (QA 22/04/2026). */}
          <motion.div
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium min-w-[140px]',
              'bg-background-elevated/60 border border-border-default',
              deckCount.active >= MAX_DECKS && 'border-warning-base/50 bg-warning-base/10'
            )}
            initial={shouldReduceMotion ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: shouldReduceMotion ? 0 : 0.2 }}
          >
            <div className="flex items-baseline gap-1">
              <span className={cn(
                'text-lg font-display font-semibold tabular-nums',
                deckCount.active >= MAX_DECKS ? 'text-warning-base' : 'text-accent-indigo'
              )}>
                {deckCount.active}
              </span>
              <span className="text-text-muted text-xs">/ {MAX_DECKS} mazos</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-background-surface/70 overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  deckCount.active >= MAX_DECKS ? 'bg-warning-base' : 'bg-gradient-to-r from-accent-indigo to-brand-base'
                )}
                style={{ width: `${Math.min(100, (deckCount.active / MAX_DECKS) * 100)}%` }}
              />
            </div>
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

      {/* KPIs resumen — coherente con la vista de Contextos, da contexto
          numérico inmediato (Activos / Archivados / Total) sin tener que
          ir a filtros (QA 22/04/2026). */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.08 }}
        className="grid grid-cols-3 gap-3 mb-5"
      >
        <GlassCard className="p-3 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-accent-indigo/15 flex items-center justify-center">
            <Layers size={16} className="text-accent-indigo" />
          </div>
          <div>
            <p className="text-xl font-semibold text-text-primary font-display tabular-nums">{deckCount.active}</p>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Activos</p>
          </div>
        </GlassCard>
        <GlassCard className="p-3 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-background-surface/60 flex items-center justify-center">
            <Archive size={16} className="text-text-muted" />
          </div>
          <div>
            <p className="text-xl font-semibold text-text-primary font-display tabular-nums">{deckCount.archived}</p>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Archivados</p>
          </div>
        </GlassCard>
        <GlassCard className="p-3 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-brand-base/15 flex items-center justify-center">
            <CreditCard size={16} className="text-brand-light" />
          </div>
          <div>
            <p className="text-xl font-semibold text-text-primary font-display tabular-nums">{deckCount.total}</p>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Total</p>
          </div>
        </GlassCard>
      </motion.div>

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

      {activeFilterChips.length > 0 && (
        <div className="mb-4">
          <ActiveFiltersBar filters={activeFilterChips} onClearAll={clearFilters} />
        </div>
      )}

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
