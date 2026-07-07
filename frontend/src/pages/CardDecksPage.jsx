/**
 * @fileoverview Página de gestión de mazos de cartas
 * Lista todos los mazos del profesor con opciones de crear, ver, editar y archivar.
 * Incluye filtros, búsqueda, paginación y animaciones premium.
 * 
 * @module pages/CardDecksPage
 */

import { useState, useEffect, useCallback, useReducer, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
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
import { getId, sameId } from '../lib/entityId';
import PageHeader from '../components/ui/PageHeader';
import ErrorState from '../components/ui/ErrorState';
import ActiveFiltersBar from '../components/ui/ActiveFiltersBar';
import EmptyState from '../components/ui/EmptyState';
import CharacterMascot from '../components/game/CharacterMascot';
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

const renderDecksGrid = ({ decks, shouldReduceMotion, handleViewDeck, handleEditDeck, handleArchiveDeck, handleRenameDeck }) => {
  const wrapperVariants = buildDeckCardWrapperVariants(shouldReduceMotion);
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--space-fluid-gutter)]"
      variants={shouldReduceMotion ? {} : listContainerVariants(0.04)}
      initial={shouldReduceMotion ? false : "hidden"}
      animate="visible"
    >
      {/* mode="popLayout" — al archivar/borrar un mazo, el item sale
          de flujo y los hermanos reflowan via animación de layout sin
          saltar a la nueva posición instantáneamente (T-952 Fase 2). */}
      <AnimatePresence mode="popLayout">
        {decks.map((deck) => {
          const deckId = getId(deck);
          return (
            <motion.div
              key={deckId}
              layout
              variants={wrapperVariants}
              exit="exit"
            >
              <DeckCard
                deck={deck}
                onView={handleViewDeck}
                onEdit={handleEditDeck}
                onDelete={handleArchiveDeck}
                onRename={handleRenameDeck ? handleRenameDeck(deck) : undefined}
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
    title="No pudimos cargar tus mazos"
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
    illustration={hasActiveFilters ? <EmptyDecksIllustration size={180} /> : undefined}
    mascot={hasActiveFilters ? undefined : <CharacterMascot mood="encouraging" size="sm" noBubble />}
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
  handleRenameDeck,
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

  return renderDecksGrid({ decks, shouldReduceMotion, handleViewDeck, handleEditDeck, handleArchiveDeck, handleRenameDeck });
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
// eslint-disable-next-line sonarjs/cyclomatic-complexity -- pagina principal orquesta filtros, modals, CRUD y estados de carga (ver ADR-086 patron similar)
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
      toast.error('No pudimos cargar tus mazos', {
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
    const deckId = getId(deck);
    if (deckId) {
      navigate(ROUTES.CARD_DECKS_DETAIL(deckId));
    }
  };

  const handleEditDeck = (deck) => {
    const deckId = getId(deck);
    if (deckId) {
      navigate(ROUTES.CARD_DECKS_EDIT(deckId));
    }
  };

  const handleArchiveDeck = (deck) => {
    setArchivingDeck(deck);
    archiveModal.open();
  };

  // Inline rename: el InlineEditableText commitea (o autoguarda
  // debounced) y dispara este handler. Actualiza optimistamente la
  // lista local para que el cambio sea instantáneo; si la API falla,
  // refresca desde backend para revertir.
  const handleRenameDeck = useCallback(
    (deck) => async (newName) => {
      const deckId = getId(deck);
      if (!deckId) return;
      const previousName = deck.name;
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === previousName) return;
      setDecks((current) =>
        current.map((d) => (sameId(d, deckId) ? { ...d, name: trimmed } : d)),
      );
      try {
        await decksAPI.updateDeck(deckId, { name: trimmed });
        toast.success('Nombre guardado', {
          description: `Renombrado a "${trimmed}".`,
        });
      } catch (err) {
        // Revertir y avisar — el optimistic update permitió ver el cambio,
        // pero el backend lo rechazó; volvemos al estado previo.
        setDecks((current) =>
          current.map((d) =>
            sameId(d, deckId) ? { ...d, name: previousName } : d,
          ),
        );
        toast.error('No se pudo guardar el nombre', {
          description: extractErrorMessage(err),
        });
        throw err;
      }
    },
    [],
  );

  const confirmArchive = async () => {
    if (!archivingDeck) return;
    
    setArchiveLoading(true);
    try {
      const deckId = getId(archivingDeck);
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
      toast.error('No pudimos archivar el mazo', {
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
        const ctx = contexts.find((c) => sameId(c, filters.contextFilter));
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
    handleRenameDeck,
  });

  return (
    <div className="page-container py-[var(--space-fluid-section)]">
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
              {/* Llenado animado por scaleX (compositor) + transición de color
                  acotada a background-color; antes era transition-all sobre width. */}
              <div
                className={cn(
                  'h-full w-full origin-left rounded-full transition-[background-color,transform] duration-300',
                  deckCount.active >= MAX_DECKS ? 'bg-warning-base' : 'bg-gradient-to-r from-accent-indigo to-brand-base'
                )}
                style={{ transform: `scaleX(${Math.min(1, deckCount.active / MAX_DECKS)})` }}
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
        className="grid grid-cols-2 sm:grid-cols-3 gap-[var(--space-fluid-gutter)] mb-8"
      >
        {/* El flex va en un div interno, NO en el className de GlassCard:
            GlassCard envuelve sus children en un div propio, así que las clases
            de layout pasadas por className no alinean los hijos (icono+texto
            quedaban apilados y el glyph se veía desplazado). QA 2026-06-04. */}
        <GlassCard className="p-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-accent-indigo/15 flex items-center justify-center shrink-0">
              <Layers size={22} className="text-accent-indigo" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-text-primary font-display tabular-nums">{deckCount.active}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Activos</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-background-surface/60 flex items-center justify-center shrink-0">
              <Archive size={22} className="text-text-muted" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-text-primary font-display tabular-nums">{deckCount.archived}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Archivados</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-brand-base/15 flex items-center justify-center shrink-0">
              <CreditCard size={22} className="text-brand-light" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-semibold text-text-primary font-display tabular-nums">{deckCount.total}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Total</p>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Barra de búsqueda y filtros. `relative z-30`: el dropdown de los
          filtros se renderiza dentro de esta sección; sin un z-index que la
          eleve, la rejilla de mazos (posterior en el DOM) pintaba sus cards
          ENCIMA del dropdown y lo tapaba (no era overflow, era stacking).
          z-30 queda por encima de la rejilla y por debajo de modales (QA 2026-06-04). */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: shouldReduceMotion ? 0 : 0.1 }}
        className="mb-6 relative z-30"
      >
        {/* overflow-visible: GlassCard clipa por defecto (overflow-hidden base);
            aquí lo anulamos para que el dropdown de los filtros (SelectPremium,
            sin portal) no quede recortado por la card (QA 2026-06-04). */}
        <GlassCard className="p-4 overflow-visible">
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
                data-global-search="true"
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

          {/* Filtros expandibles. Entrada con opacity + slide (NO animación de
              altura): animar `height` exigía `overflow-hidden`, que recortaba el
              dropdown de los SelectPremium (sin portal). Con fade+slide no hace
              falta clipar y el dropdown se ve completo (QA 2026-06-04). */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 pt-4 border-t border-border-subtle"
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
                          // El DTO de contexto expone `id` (no `_id`); con `_id`
                          // el value era undefined y el filtro no aplicaba.
                          value: getId(ctx),
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
        confirmText="Archivar"
        loading={archiveLoading}
      />
    </div>
  );
}
