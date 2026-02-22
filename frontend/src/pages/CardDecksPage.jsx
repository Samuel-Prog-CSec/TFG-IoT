/**
 * @fileoverview Página de gestión de mazos de cartas
 * Lista todos los mazos del profesor con opciones de crear, ver, editar y archivar.
 * Incluye filtros, búsqueda, paginación y animaciones premium.
 * 
 * @module pages/CardDecksPage
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Filter, 
  Layers, 
  AlertCircle,
  Archive,
  RefreshCw,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { decksAPI, extractErrorMessage, isAbortError } from '../services/api';
import { DeckCard, DeckCardSkeleton, ButtonPremium, GlassCard, ConfirmationModal, useConfirmationModal } from '../components/ui';
import { useContexts, useRefetchOnFocus, useReducedMotion } from '../hooks';
import { ROUTES } from '../constants/routes';
import { toast } from 'sonner';

// Límite de mazos por profesor (sincronizado con backend)
const MAX_DECKS = 50;
/**
 * Página principal de gestión de mazos
 */
export default function CardDecksPage() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  
  // Estados
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deckCount, setDeckCount] = useState({ active: 0, archived: 0, total: 0 });
  
  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [contextFilter, setContextFilter] = useState('');
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
  const loadDecks = useCallback(async (resetPage = true, skipCount = false, signal, pageOverride) => {
    try {
      if (resetPage) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const pageToUse = resetPage ? 1 : (pageOverride || page);
      const params = {
        page: pageToUse,
        limit: 12,
        status: statusFilter,
        ...(searchQuery && { search: searchQuery }),
        ...(contextFilter && { contextId: contextFilter }),
        sortBy: 'createdAt',
        order: 'desc',
      };

      const response = await decksAPI.getDecks(params, signal ? { signal } : {});
      const {data} = response;
      
      const newDecks = data.data || [];
      const pagination = data.pagination || {};

      if (resetPage) {
        setDecks(newDecks);
      } else {
        setDecks(prev => [...prev, ...newDecks]);
      }

      setHasMore(pagination.page < pagination.totalPages);
      
      // Optimización: Usar total de paginación cuando está disponible
      // Solo llamar al endpoint de conteo cuando es necesario
      if (!skipCount) {
        // Si estamos en estado 'active' sin filtros, usamos pagination.total
        if (statusFilter === 'active' && !searchQuery && !contextFilter && pagination.total !== undefined) {
          setDeckCount(prev => ({ ...prev, active: pagination.total }));
        } else {
          // Necesitamos el conteo completo (incluye archived)
          const countData = await decksAPI.getDecksCount(signal ? { signal } : {});
          setDeckCount(countData);
        }
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
  }, [searchQuery, statusFilter, contextFilter, page]);

  // Cargar al montar y cuando cambian filtros
  useEffect(() => {
    decksAbortRef.current?.abort();
    countAbortRef.current?.abort();
    const controller = new AbortController();
    decksAbortRef.current = controller;
    countAbortRef.current = controller;
    loadDecks(true, false, controller.signal);

    return () => controller.abort();
  }, [searchQuery, statusFilter, contextFilter]);

  const refetchDecks = useCallback(() => {
    decksAbortRef.current?.abort();
    countAbortRef.current?.abort();
    const controller = new AbortController();
    decksAbortRef.current = controller;
    countAbortRef.current = controller;
    loadDecks(true, false, controller.signal);
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
      loadDecks(false, true, controller.signal, nextPage);
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
      loadDecks(true);
    } catch (err) {
      toast.error('Error al archivar', {
        description: extractErrorMessage(err),
      });
    } finally {
      setArchiveLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('active');
    setContextFilter('');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'active' || contextFilter;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white font-display flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Layers size={20} className="text-white" />
              </div>
              Mis Mazos
            </h1>
            <p className="text-slate-400 mt-1">
              Gestiona tus mazos de cartas RFID para las sesiones de juego
            </p>
          </div>

          {/* Contador y botón crear */}
          <div className="flex items-center gap-4">
            {/* Contador de mazos */}
            <motion.div
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium',
                'bg-slate-800/50 border border-white/10',
                deckCount.active >= MAX_DECKS && 'border-amber-500/50 bg-amber-500/10'
              )}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className={cn(
                deckCount.active >= MAX_DECKS ? 'text-amber-400' : 'text-indigo-400'
              )}>
                {deckCount.active}
              </span>
              <span className="text-slate-500">/{MAX_DECKS} mazos</span>
            </motion.div>

            <ButtonPremium
              onClick={handleCreateDeck}
              disabled={deckCount.active >= MAX_DECKS}
              icon={<Plus size={18} />}
            >
              Nuevo Mazo
            </ButtonPremium>
          </div>
        </div>
      </motion.div>

      {/* Barra de búsqueda y filtros */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <GlassCard className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Búsqueda */}
            <div className="relative flex-1">
              <Search 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" 
                size={18} 
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar mazos..."
                className={cn(
                  'w-full pl-10 pr-4 py-2.5 rounded-xl',
                  'bg-slate-800/50 border border-white/10',
                  'text-white placeholder-slate-500',
                  'focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20',
                  'transition-all duration-300'
                )}
              />
            </div>

            {/* Toggle filtros */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all',
                showFilters || hasActiveFilters
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                  : 'bg-slate-800/50 border-white/10 text-slate-400 hover:border-white/20'
              )}
            >
              <Filter size={18} />
              Filtros
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
              )}
            </button>
          </div>

          {/* Filtros expandibles */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-4 border-t border-white/5 overflow-hidden"
              >
                <div className="flex flex-wrap gap-4">
                  {/* Filtro por estado */}
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs text-slate-500 mb-1.5">Estado</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-slate-800/50 border border-white/10',
                        'text-white text-sm',
                        'focus:outline-none focus:border-indigo-500/50'
                      )}
                    >
                      <option value="active">Activos</option>
                      <option value="archived">Archivados</option>
                    </select>
                  </div>

                  {/* Filtro por contexto */}
                  <div className="flex-1 min-w-[150px]">
                    <label className="block text-xs text-slate-500 mb-1.5">Contexto</label>
                    <select
                      value={contextFilter}
                      onChange={(e) => setContextFilter(e.target.value)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-slate-800/50 border border-white/10',
                        'text-white text-sm',
                        'focus:outline-none focus:border-indigo-500/50'
                      )}
                    >
                      <option value="">Todos los contextos</option>
                      {contexts.map((ctx) => (
                        <option key={ctx._id} value={ctx._id}>
                          {ctx.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Limpiar filtros */}
                  {hasActiveFilters && (
                    <button
                      onClick={clearFilters}
                      className="self-end px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm flex items-center gap-1.5"
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
        <div className="mb-4 bg-slate-800/50 border border-white/10 text-slate-300 px-4 py-2 rounded-xl text-sm">
          Actualizando mazos...
        </div>
      )}

      {/* Contenido principal */}
      {error ? (
        /* Estado de error */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-16"
        >
          <div className="w-16 h-16 rounded-full bg-rose-500/20 flex items-center justify-center mb-4">
            <AlertCircle className="text-rose-400" size={32} />
          </div>
          <p className="text-slate-400 mb-4">{error}</p>
          <ButtonPremium
            variant="secondary"
            onClick={() => loadDecks(true)}
            icon={<RefreshCw size={16} />}
          >
            Reintentar
          </ButtonPremium>
        </motion.div>
      ) : loading && decks.length === 0 ? (
        /* Estado de carga */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <DeckCardSkeleton />
            </motion.div>
          ))}
        </div>
      ) : decks.length === 0 ? (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16"
        >
          <motion.div
            className="w-32 h-32 mb-6 relative"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* SVG animado de cartas */}
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <motion.rect
                x="15" y="25" width="35" height="50" rx="4"
                fill="none" stroke="#6366f1" strokeWidth="2"
                initial={{ rotate: -15, opacity: 0.5 }}
                animate={{ rotate: [-15, -10, -15], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ transformOrigin: '32px 50px' }}
              />
              <motion.rect
                x="32" y="20" width="35" height="50" rx="4"
                fill="none" stroke="#8b5cf6" strokeWidth="2"
                initial={{ rotate: 0 }}
                animate={{ rotate: [0, 5, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                style={{ transformOrigin: '50px 45px' }}
              />
              <motion.rect
                x="50" y="25" width="35" height="50" rx="4"
                fill="none" stroke="#a855f7" strokeWidth="2"
                initial={{ rotate: 15, opacity: 0.5 }}
                animate={{ rotate: [15, 10, 15], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.6 }}
                style={{ transformOrigin: '68px 50px' }}
              />
            </svg>
          </motion.div>
          
          <h3 className="text-xl font-semibold text-white mb-2">
            {hasActiveFilters ? 'No hay resultados' : 'Crea tu primer mazo'}
          </h3>
          <p className="text-slate-400 text-center max-w-md mb-6">
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
      ) : (
        /* Grid de mazos */
        <>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: shouldReduceMotion ? 0.02 : 0.05 },
              },
            }}
          >
            {decks.map((deck, index) => {
              const deckId = deck.id || deck._id;
              return (
              <motion.div
                key={deckId}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
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
          </motion.div>

          {/* Cargar más */}
          {hasMore && (
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
        </>
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
            <strong className="text-white">&quot;{archivingDeck?.name}&quot;</strong>?
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
