/**
 * @fileoverview Página de edición de mazos de cartas
 * Permite modificar un mazo existente: añadir/quitar cartas, cambiar contexto y reasignar assets.
 * 
 * @module pages/DeckEditPage
 */

import { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Eye,
  Save,
  Layers,
  CreditCard,
  Palette,
  LinkIcon,
  AlertTriangle,
  Trash2,
  Plus,
  X,
  RefreshCw
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  buildCardMappingsPayload,
  normalizeCardMappingsFromDeck
} from '../lib/cardMapping';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import InputPremium from '../components/ui/InputPremium';
import AssetSelector from '../components/ui/AssetSelector';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import RFIDScannerPanel from '../components/ui/RFIDScannerPanel';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { decksAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { GAME_CONFIG } from '../constants/gameConfig';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';

const { MIN_CARDS, MAX_CARDS } = GAME_CONFIG;

const uiInitialState = {
  activeTab: 'cards',
  showAddCards: false,
  captureMode: 'manual',
  activeUid: null,
};

function uiReducer(state, action) {
  switch (action.type) {
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTab: action.payload };
    case 'TOGGLE_ADD_CARDS':
      return { ...state, showAddCards: !state.showAddCards };
    case 'SHOW_ADD_CARDS':
      return { ...state, showAddCards: true };
    case 'HIDE_ADD_CARDS':
      return { ...state, showAddCards: false };
    case 'SET_CAPTURE_MODE':
      return { ...state, captureMode: action.payload };
    case 'SET_ACTIVE_CARD':
      return { ...state, activeUid: action.payload };
    default:
      return state;
  }
}

const buildUpdatedCardMappings = (cards, assignments) => {
  return buildCardMappingsPayload(cards, assignments);
};

/**
 * Página de edición de mazo
 */
export default function DeckEditPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  
  // Estados de carga
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Datos del mazo
  const [deck, setDeck] = useState(null);
  const [deckName, setDeckName] = useState('');
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [cardAssignments, setCardAssignments] = useState({});
  
  // Hook de contextos
  const { contexts, loading: contextsLoading, findContextById } = useContexts({ 
    autoLoad: true, 
    onlyActive: true 
  });
  
  // Datos auxiliares
  
  // UI states (agrupados con useReducer)
  const [ui, dispatchUI] = useReducer(uiReducer, uiInitialState);
  // effectiveContext: usa la selección del usuario, o calcula desde el mazo original
  const effectiveContext = selectedContext ?? (
    deck && contexts.length
      ? findContextById(deck.contextId?._id || deck.contextId) ?? null
      : null
  );
  
  // Modal de confirmación para eliminar
  const deleteModal = useConfirmationModal();
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Cargar datos iniciales
  const loadData = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError(null);

      // Cargar mazo (contextos ya se cargan con useContexts)
      const deckRes = await decksAPI.getDeckById(deckId, signal ? { signal } : {});

      const deckData = extractData(deckRes);

      if (!deckData) {
        throw new Error('Mazo no encontrado');
      }

      setDeck(deckData);
      setDeckName(deckData.name);

      const normalizedMappings = normalizeCardMappingsFromDeck(deckData);

      if (normalizedMappings.length > 0) {
        // Build card objects from mappings using uid
        const cards = normalizedMappings.map((mapping) => ({
          uid: mapping.uid,
          type: 'RFID'
        }));

        setSelectedCards(cards);

        const assignments = {};
        normalizedMappings.forEach((mapping) => {
          if (mapping.displayData) {
            assignments[mapping.uid] = mapping.displayData;
          }
        });
        setCardAssignments(assignments);

        if (cards.length > 0) {
          dispatchUI({ type: 'SET_ACTIVE_CARD', payload: cards[0].uid });
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      setError(extractErrorMessage(err));
      toast.error('Error al cargar mazo', {
        description: extractErrorMessage(err)
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [deckId]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useRefetchOnFocus({
    refetch: () => loadData(),
    isLoading: loading,
    hasData: Boolean(deck),
    hasError: Boolean(error)
  });

  // Derivar si hay cambios (calculado, no estado)
  const hasChanges = useMemo(() => {
    if (!deck) return false;

    const originalName = deck.name;
    const originalContext = deck.contextId?._id || deck.contextId;
    const originalCardIds = (deck.cardMappings || []).map(c => c.uid).filter(Boolean).sort();
    const currentCardIds = selectedCards.map(c => c.uid).sort();

    const nameChanged = deckName !== originalName;
    const contextChanged = effectiveContext?._id !== originalContext;
    const cardsChanged = JSON.stringify(originalCardIds) !== JSON.stringify(currentCardIds);
    // Simplificado: cualquier cambio en asignaciones
    const assignmentsChanged = Object.keys(cardAssignments).length > 0;

    return nameChanged || contextChanged || cardsChanged || assignmentsChanged;
  }, [deck, deckName, effectiveContext, selectedCards, cardAssignments]);

  // Handlers
  const handleAddCard = useCallback((card) => {
    if (selectedCards.length >= MAX_CARDS) {
      toast.warning(`Máximo ${MAX_CARDS} cartas por mazo`);
      return;
    }
    
    if (selectedCards.some((c) => c.uid === card.uid)) {
      toast.info('Esta carta ya está en el mazo');
      return;
    }

    setSelectedCards(prev => [...prev, card]);
    dispatchUI({ type: 'SET_ACTIVE_CARD', payload: card.uid });
    toast.success(`Carta ${card.uid} añadida`);
  }, [selectedCards]);

  const handleRemoveCard = useCallback((uid) => {
    if (selectedCards.length <= MIN_CARDS) {
      toast.warning(`Mínimo ${MIN_CARDS} cartas por mazo`);
      return;
    }

    setSelectedCards(prev => prev.filter(c => c.uid !== uid));
    setCardAssignments(prev => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });

    // Si era la carta activa, seleccionar otra
    if (ui.activeUid === uid) {
      const nextActiveCard = selectedCards.find((c) => c.uid !== uid);
      dispatchUI({ type: 'SET_ACTIVE_CARD', payload: nextActiveCard?.uid || null });
    }
  }, [selectedCards, ui.activeUid]);

  const handleContextChange = useCallback((context) => {
    if (effectiveContext?._id === context._id) return;
    
    setSelectedContext(context);
    // Limpiar asignaciones al cambiar contexto
    setCardAssignments({});
    toast.info('Contexto cambiado. Reasigna los assets.');
  }, [effectiveContext]);

  const handleAssignAsset = useCallback((uid, asset) => {
    setCardAssignments(prev => ({
      ...prev,
      [uid]: asset
    }));
  }, []);

  // Guardar cambios
  const handleSave = async () => {
    // Validaciones
    if (!deckName.trim() || deckName.trim().length < 3) {
      toast.error('El nombre debe tener al menos 3 caracteres');
      return;
    }
    
    if (selectedCards.length < MIN_CARDS) {
      toast.error(`Necesitas al menos ${MIN_CARDS} cartas`);
      return;
    }
    
    if (!effectiveContext) {
      toast.error('Selecciona un contexto');
      return;
    }
    
    // Verificar que todas las cartas tengan asignación
    const unassigned = selectedCards.filter(c => !cardAssignments[c.uid]);
    if (unassigned.length > 0) {
      toast.error(`Hay ${unassigned.length} carta(s) sin asignar`);
      dispatchUI({ type: 'SET_ACTIVE_TAB', payload: 'assign' });
      return;
    }

    setSaving(true);
    
    try {
      const updateData = {
        name: deckName.trim(),
        contextId: effectiveContext._id,
        cardMappings: buildCardMappingsPayload(selectedCards, cardAssignments)
      };
      
      await decksAPI.updateDeck(deckId, updateData);
      
      // TOKEN-EXCEPTION: canvas-confetti requires raw hex colors
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399']
      });
      
      toast.success('Mazo actualizado');

      const updatedCardMappings = buildUpdatedCardMappings(selectedCards, cardAssignments);
      
      // Actualizar datos locales
      setDeck(prev => ({
        ...prev,
        name: deckName.trim(),
        contextId: effectiveContext._id,
        cardMappings: updatedCardMappings
      }));
      
    } catch (err) {
      toast.error('Error al guardar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setSaving(false);
    }
  };

  // Archivar mazo
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await decksAPI.deleteDeck(deckId);
      toast.success('Mazo archivado');
      deleteModal.close();
      navigate(ROUTES.CARD_DECKS);
    } catch (err) {
      toast.error('Error al archivar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background-deep p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-32 bg-background-elevated rounded animate-pulse mb-6" />
          <div className="h-12 w-64 bg-background-elevated rounded animate-pulse mb-8" />
          <SkeletonCard className="h-96" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background-deep p-4 lg:p-8 flex items-center justify-center">
        <GlassCard className="p-8 max-w-md text-center">
          <AlertTriangle size={48} className="text-error-base mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Error</h2>
          <p className="text-text-muted mb-6">{error}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <ButtonPremium
              variant="primary"
              onClick={() => loadData()}
              icon={<RefreshCw size={18} />}
            >
              Reintentar
            </ButtonPremium>
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.CARD_DECKS)}
            >
              Volver a Mis Mazos
            </ButtonPremium>
          </div>
        </GlassCard>
      </div>
    );
  }

  const assignedCount = Object.keys(cardAssignments).length;
  const assignedAssetKeys = Object.values(cardAssignments).map(a => a?.key);
  const currentDeckId = deck?.id || deck?._id || deckId;

  return (
    <div className="min-h-screen bg-background-deep p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-6"
      >
        <Breadcrumb items={[
          { label: 'Mazos', to: ROUTES.CARD_DECKS },
          { label: deck?.name || 'Mazo', to: ROUTES.CARD_DECKS_DETAIL(deckId) },
          { label: 'Editar' },
        ]} />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center">
              <Layers size={24} className="text-text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Editar Mazo</h1>
              <p className="text-text-muted text-sm">
                {deck?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ButtonPremium
              variant="secondary"
              onClick={() => currentDeckId && navigate(ROUTES.CARD_DECKS_DETAIL(currentDeckId))}
              disabled={!currentDeckId}
              icon={<Eye size={16} />}
            >
              Ver detalle
            </ButtonPremium>
            <ButtonPremium
              variant="ghost"
              onClick={() => deleteModal.open()}
              icon={<Trash2 size={16} />}
              className="text-error-base hover:text-error-base/80"
            >
              Archivar
            </ButtonPremium>
            <ButtonPremium
              onClick={handleSave}
              disabled={!hasChanges || saving}
              loading={saving}
              icon={<Save size={16} />}
            >
              Guardar Cambios
            </ButtonPremium>
          </div>
        </div>
      </motion.div>

      {/* Nombre del mazo */}
      <div className="max-w-5xl mx-auto mb-6">
        <GlassCard className="p-5">
          <InputPremium
            label="Nombre del mazo"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            placeholder="Ej: Capitales de Europa"
            maxLength={50}
          />
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto mb-6">
        <div className="flex bg-background-elevated/50 rounded-xl p-1 w-fit">
          {[
            { id: 'cards', label: 'Cartas', icon: CreditCard, count: selectedCards.length },
            { id: 'context', label: 'Contexto', icon: Palette },
            { id: 'assign', label: 'Asignaciones', icon: LinkIcon, count: `${assignedCount}/${selectedCards.length}` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => dispatchUI({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                ui.activeTab === tab.id
                  ? 'bg-accent-indigo text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  ui.activeTab === tab.id ? 'bg-border-strong' : 'bg-background-surface'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          {ui.activeTab === 'cards' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Cartas del mazo</h2>
                    <p className="text-sm text-text-muted">
                      {selectedCards.length} de {MIN_CARDS}-{MAX_CARDS} cartas
                    </p>
                  </div>
                  <ButtonPremium
                    variant="secondary"
                    onClick={() => dispatchUI({ type: 'SHOW_ADD_CARDS' })}
                    disabled={selectedCards.length >= MAX_CARDS}
                    icon={<Plus size={16} />}
                  >
                    Añadir Cartas
                  </ButtonPremium>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedCards.map((card) => (
                    <motion.div
                      key={card.uid}
                      layout
                      className="relative p-4 rounded-xl bg-background-elevated/50 border border-border-default group"
                    >
                      <button
                        onClick={() => handleRemoveCard(card.uid)}
                        disabled={selectedCards.length <= MIN_CARDS}
                        className={cn(
                          'absolute -top-2 -right-2 size-6 rounded-full',
                          'bg-error-base text-text-primary flex items-center justify-center',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                          'hover:bg-error-base/80 disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        <X size={12} />
                      </button>
                      
                      <div className="size-10 rounded-lg bg-gradient-to-br from-accent-indigo/20 to-brand-base/20 flex items-center justify-center mb-2">
                        <CreditCard size={18} className="text-accent-indigo" />
                      </div>
                      <p className="text-sm font-mono text-text-primary">{card.uid}</p>
                      <p className="text-xs text-text-muted">{card.type || 'RFID'}</p>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {ui.activeTab === 'context' && (
            <motion.div
              key="context"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-text-primary">Contexto temático</h2>
                  <p className="text-sm text-text-muted">
                    Cambiar el contexto reseteará las asignaciones de assets
                  </p>
                </div>

                {contextsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((slot) => (
                      <div 
                        key={`context-skeleton-${slot}`} 
                        className="p-4 rounded-xl border-2 border-border-subtle bg-background-elevated/30 animate-pulse"
                      >
                        <div className="flex gap-1.5 mb-3 h-10">
                          {[1, 2, 3, 4].map((assetSlot) => (
                            <div key={`asset-skeleton-${slot}-${assetSlot}`} className="size-8 rounded bg-background-surface" />
                          ))}
                        </div>
                        <div className="h-5 w-24 bg-background-surface rounded mb-2" />
                        <div className="h-3 w-16 bg-background-surface/50 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {contexts.map((context) => (
                      <motion.button
                        key={context._id}
                        onClick={() => handleContextChange(context)}
                        className={cn(
                          'relative p-4 rounded-xl border-2 transition-all text-left',
                          effectiveContext?._id === context._id
                            ? 'border-accent-indigo bg-accent-indigo/10'
                            : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex flex-wrap gap-1.5 mb-3 h-10 overflow-hidden">
                          {context.assets?.slice(0, 6).map((asset) => (
                            <span
                              key={asset?.key || asset?.value || asset?.id || asset?.display || `${context._id}-asset`}
                              className="text-2xl"
                            >
                              {asset.display || '📦'}
                            </span>
                          ))}
                        </div>
                        <h3 className="font-medium text-text-primary mb-1">{context.name}</h3>
                        <p className="text-xs text-text-muted">
                          {context.assets?.length || 0} assets
                        </p>
                      </motion.button>
                    ))}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {ui.activeTab === 'assign' && (
            <motion.div
              key="assign"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de cartas */}
                <GlassCard className="p-4">
                  <h3 className="font-medium text-text-primary mb-3">Cartas</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedCards.map((card) => {
                      const isAssigned = !!cardAssignments[card.uid];
                      const isActive = ui.activeUid === card.uid;

                      return (
                        <button
                          key={card.uid}
                          onClick={() => dispatchUI({ type: 'SET_ACTIVE_CARD', payload: card.uid })}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                            isActive
                              ? 'border-accent-indigo bg-accent-indigo/10'
                              : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                          )}
                        >
                          <div className={cn(
                            'size-8 rounded-lg flex items-center justify-center text-lg overflow-hidden',
                            isAssigned ? 'bg-success-base/20' : 'bg-background-surface'
                          )}>
                            {isAssigned ? (
                              <CardAssetPreview
                                asset={cardAssignments[card.uid]}
                                alt={`Asset asignado a ${card.uid}`}
                                className="w-full h-full rounded-lg"
                                fit="cover"
                                fallbackLabel="📎"
                              />
                            ) : (
                              <CreditCard size={16} className="text-text-muted" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{card.uid}</p>
                            <p className="text-xs text-text-muted truncate">
                              {isAssigned ? cardAssignments[card.uid]?.value : 'Sin asignar'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>

                {/* Selector de assets */}
                <GlassCard className="p-4 lg:col-span-2">
                  {ui.activeUid ? (
                    <>
                      <h3 className="font-medium text-text-primary mb-3">
                        Assets de &quot;{effectiveContext?.name}&quot;
                      </h3>
                      <AssetSelector
                        assets={effectiveContext?.assets || []}
                        selectedAssetKey={cardAssignments[ui.activeUid]?.key}
                        assignedAssets={assignedAssetKeys}
                        onSelect={(asset) => handleAssignAsset(ui.activeUid, asset)}
                      />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-text-muted">
                      Selecciona una carta
                    </div>
                  )}
                </GlassCard>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal añadir cartas */}
      <AnimatePresence>
        {ui.showAddCards && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-sm"
            onClick={() => dispatchUI({ type: 'HIDE_ADD_CARDS' })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background-base border border-border-default rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-text-primary">Añadir cartas</h3>
                <button
                  onClick={() => dispatchUI({ type: 'HIDE_ADD_CARDS' })}
                  className="p-2 rounded-lg hover:bg-border-default transition-colors"
                >
                  <X size={20} className="text-text-muted" />
                </button>
              </div>

              <RFIDScannerPanel
                onCardScanned={handleAddCard}
                scannedCards={[]}
                maxCards={MAX_CARDS - selectedCards.length}
                showMockButton={import.meta.env.MODE === 'development'}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal confirmar archivo */}
      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={handleDelete}
        title="Archivar mazo"
        description={
          <>
            ¿Estás seguro de archivar{' '}
            <strong className="text-text-primary">&quot;{deckName}&quot;</strong>?
            El mazo dejará de aparecer en tu lista de mazos activos.
          </>
        }
        variant="archive"
        confirmLabel="Archivar"
        loading={deleteLoading}
      />

      {/* Indicador de cambios sin guardar */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-warning-base/20 border border-warning-base/50 backdrop-blur-lg">
              <AlertTriangle size={18} className="text-warning-base" />
              <span className="text-sm text-warning-base/80">Tienes cambios sin guardar</span>
              <ButtonPremium
                size="sm"
                onClick={handleSave}
                loading={saving}
                icon={<Save size={14} />}
              >
                Guardar
              </ButtonPremium>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
