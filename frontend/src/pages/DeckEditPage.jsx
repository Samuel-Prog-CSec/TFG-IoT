/**
 * @fileoverview Página de edición de mazos de cartas
 * Permite modificar un mazo existente: añadir/quitar cartas, cambiar contexto y reasignar assets.
 * 
 * @module pages/DeckEditPage
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft,
  Save,
  Layers,
  CreditCard,
  Palette,
  LinkIcon,
  AlertTriangle,
  Trash2,
  Plus,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  ButtonPremium,
  GlassCard,
  InputPremium,
  AssetSelector,
  CardSelector,
  RFIDScannerPanel,
  SkeletonCard,
  ConfirmationModal,
  useConfirmationModal
} from '../components/ui';
import { useContexts } from '../hooks';
import { decksAPI, cardsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
import { GAME_CONFIG } from '../constants/gameConfig';
import { toast } from 'sonner';

const { MIN_CARDS, MAX_CARDS } = GAME_CONFIG;

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
  const [availableCards, setAvailableCards] = useState([]);
  
  // UI states
  const [activeTab, setActiveTab] = useState('cards'); // 'cards' | 'context' | 'assign'
  const [showAddCards, setShowAddCards] = useState(false);
  const [captureMode, setCaptureMode] = useState('manual');
  const [activeCardId, setActiveCardId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Modal de confirmación para eliminar
  const deleteModal = useConfirmationModal();
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Cargar mazo y cartas en paralelo (contextos ya se cargan con useContexts)
        const [deckRes, cardsRes] = await Promise.all([
          decksAPI.getDeckById(deckId),
          cardsAPI.getCards({ status: 'active', limit: 100 })
        ]);

        const deckData = extractData(deckRes);
        const cardsData = extractData(cardsRes)?.data || [];

        if (!deckData) {
          throw new Error('Mazo no encontrado');
        }

        setDeck(deckData);
        setDeckName(deckData.name);
        setAvailableCards(cardsData);

        // Establecer cartas y asignaciones
        if (deckData.cards && Array.isArray(deckData.cards)) {
          const cards = deckData.cards.map(dc => {
            // La carta puede venir poblada o solo como ID
            const cardData = dc.cardId?._id ? dc.cardId : cardsData.find(c => c._id === dc.cardId);
            return cardData;
          }).filter(Boolean);
          
          setSelectedCards(cards);
          
          // Mapear asignaciones
          const assignments = {};
          deckData.cards.forEach(dc => {
            const cardId = dc.cardId?._id || dc.cardId;
            if (dc.assignedAsset) {
              assignments[cardId] = dc.assignedAsset;
            }
          });
          setCardAssignments(assignments);
          
          // Establecer primera carta como activa
          if (cards.length > 0) {
            setActiveCardId(cards[0]._id);
          }
        }

      } catch (err) {
        setError(extractErrorMessage(err));
        toast.error('Error al cargar mazo', {
          description: extractErrorMessage(err)
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [deckId]);

  // Establecer contexto seleccionado cuando los contextos se carguen
  useEffect(() => {
    if (!deck || !contexts.length) return;
    
    const contextId = deck.contextId?._id || deck.contextId;
    const ctx = findContextById(contextId);
    if (ctx && !selectedContext) {
      setSelectedContext(ctx);
    }
  }, [deck, contexts, findContextById, selectedContext]);

  // Detectar cambios
  useEffect(() => {
    if (!deck) return;
    
    const originalName = deck.name;
    const originalContext = deck.contextId?._id || deck.contextId;
    const originalCardIds = (deck.cards || []).map(c => c.cardId?._id || c.cardId).sort();
    const currentCardIds = selectedCards.map(c => c._id).sort();
    
    const nameChanged = deckName !== originalName;
    const contextChanged = selectedContext?._id !== originalContext;
    const cardsChanged = JSON.stringify(originalCardIds) !== JSON.stringify(currentCardIds);
    // Simplificado: cualquier cambio en asignaciones
    const assignmentsChanged = Object.keys(cardAssignments).length > 0;
    
    setHasChanges(nameChanged || contextChanged || cardsChanged || assignmentsChanged);
  }, [deck, deckName, selectedContext, selectedCards, cardAssignments]);

  // Handlers
  const handleAddCard = useCallback((card) => {
    if (selectedCards.length >= MAX_CARDS) {
      toast.warning(`Máximo ${MAX_CARDS} cartas por mazo`);
      return;
    }
    
    if (selectedCards.find(c => c._id === card._id)) {
      toast.info('Esta carta ya está en el mazo');
      return;
    }
    
    setSelectedCards(prev => [...prev, card]);
    setActiveCardId(card._id);
    toast.success(`Carta ${card.uid} añadida`);
  }, [selectedCards]);

  const handleRemoveCard = useCallback((cardId) => {
    if (selectedCards.length <= MIN_CARDS) {
      toast.warning(`Mínimo ${MIN_CARDS} cartas por mazo`);
      return;
    }
    
    setSelectedCards(prev => prev.filter(c => c._id !== cardId));
    setCardAssignments(prev => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    
    // Si era la carta activa, seleccionar otra
    if (activeCardId === cardId) {
      const remaining = selectedCards.filter(c => c._id !== cardId);
      setActiveCardId(remaining[0]?._id || null);
    }
  }, [selectedCards, activeCardId]);

  const handleContextChange = useCallback((context) => {
    if (selectedContext?._id === context._id) return;
    
    setSelectedContext(context);
    // Limpiar asignaciones al cambiar contexto
    setCardAssignments({});
    toast.info('Contexto cambiado. Reasigna los assets.');
  }, [selectedContext]);

  const handleAssignAsset = useCallback((cardId, asset) => {
    setCardAssignments(prev => ({
      ...prev,
      [cardId]: asset
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
    
    if (!selectedContext) {
      toast.error('Selecciona un contexto');
      return;
    }
    
    // Verificar que todas las cartas tengan asignación
    const unassigned = selectedCards.filter(c => !cardAssignments[c._id]);
    if (unassigned.length > 0) {
      toast.error(`Hay ${unassigned.length} carta(s) sin asignar`);
      setActiveTab('assign');
      return;
    }

    setSaving(true);
    
    try {
      const updateData = {
        name: deckName.trim(),
        contextId: selectedContext._id,
        cards: selectedCards.map(card => ({
          cardId: card._id,
          assignedAsset: cardAssignments[card._id]
        }))
      };
      
      await decksAPI.updateDeck(deckId, updateData);
      
      confetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399']
      });
      
      toast.success('Mazo actualizado');
      setHasChanges(false);
      
      // Actualizar datos locales
      setDeck(prev => ({
        ...prev,
        name: deckName.trim(),
        contextId: selectedContext._id,
        cards: selectedCards.map(card => ({
          cardId: card,
          assignedAsset: cardAssignments[card._id]
        }))
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
      <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-32 bg-slate-800 rounded animate-pulse mb-6" />
          <div className="h-12 w-64 bg-slate-800 rounded animate-pulse mb-8" />
          <SkeletonCard className="h-96" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-8 flex items-center justify-center">
        <GlassCard className="p-8 max-w-md text-center">
          <AlertTriangle size={48} className="text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-slate-400 mb-6">{error}</p>
          <ButtonPremium onClick={() => navigate(ROUTES.CARD_DECKS)}>
            Volver a Mis Mazos
          </ButtonPremium>
        </GlassCard>
      </div>
    );
  }

  const assignedCount = Object.keys(cardAssignments).length;
  const assignedAssetKeys = Object.values(cardAssignments).map(a => a?.key);

  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-6"
      >
        <button
          onClick={() => navigate(ROUTES.CARD_DECKS)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft size={18} />
          Volver a Mis Mazos
        </button>
        
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Layers size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Editar Mazo</h1>
              <p className="text-slate-400 text-sm">
                {deck?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ButtonPremium
              variant="ghost"
              onClick={() => deleteModal.open()}
              icon={<Trash2 size={16} />}
              className="text-rose-400 hover:text-rose-300"
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
        <GlassCard className="p-4">
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
        <div className="flex bg-slate-800/50 rounded-xl p-1 w-fit">
          {[
            { id: 'cards', label: 'Cartas', icon: CreditCard, count: selectedCards.length },
            { id: 'context', label: 'Contexto', icon: Palette },
            { id: 'assign', label: 'Asignaciones', icon: LinkIcon, count: `${assignedCount}/${selectedCards.length}` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count && (
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  activeTab === tab.id ? 'bg-white/20' : 'bg-slate-700'
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
          {activeTab === 'cards' && (
            <motion.div
              key="cards"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Cartas del mazo</h2>
                    <p className="text-sm text-slate-400">
                      {selectedCards.length} de {MIN_CARDS}-{MAX_CARDS} cartas
                    </p>
                  </div>
                  <ButtonPremium
                    variant="secondary"
                    onClick={() => setShowAddCards(true)}
                    disabled={selectedCards.length >= MAX_CARDS}
                    icon={<Plus size={16} />}
                  >
                    Añadir Cartas
                  </ButtonPremium>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {selectedCards.map((card) => (
                    <motion.div
                      key={card._id}
                      layout
                      className="relative p-4 rounded-xl bg-slate-800/50 border border-white/10 group"
                    >
                      <button
                        onClick={() => handleRemoveCard(card._id)}
                        disabled={selectedCards.length <= MIN_CARDS}
                        className={cn(
                          'absolute -top-2 -right-2 w-6 h-6 rounded-full',
                          'bg-rose-500 text-white flex items-center justify-center',
                          'opacity-0 group-hover:opacity-100 transition-opacity',
                          'hover:bg-rose-400 disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        <X size={12} />
                      </button>
                      
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mb-2">
                        <CreditCard size={18} className="text-indigo-400" />
                      </div>
                      <p className="text-sm font-mono text-white">{card.uid}</p>
                      <p className="text-xs text-slate-500">{card.type || 'RFID'}</p>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'context' && (
            <motion.div
              key="context"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <GlassCard className="p-6">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold text-white">Contexto temático</h2>
                  <p className="text-sm text-slate-400">
                    Cambiar el contexto reseteará las asignaciones de assets
                  </p>
                </div>

                {contextsLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                      <div 
                        key={i} 
                        className="p-4 rounded-xl border-2 border-white/5 bg-slate-800/30 animate-pulse"
                      >
                        <div className="flex gap-1 mb-3 h-10">
                          {[...Array(4)].map((_, j) => (
                            <div key={j} className="w-8 h-8 rounded bg-slate-700" />
                          ))}
                        </div>
                        <div className="h-5 w-24 bg-slate-700 rounded mb-2" />
                        <div className="h-3 w-16 bg-slate-700/50 rounded" />
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
                          selectedContext?._id === context._id
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-white/10 bg-slate-800/30 hover:border-white/20'
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex flex-wrap gap-1 mb-3 h-10 overflow-hidden">
                          {context.assets?.slice(0, 6).map((asset, i) => (
                            <span key={i} className="text-2xl">{asset.display || '📦'}</span>
                          ))}
                        </div>
                        <h3 className="font-medium text-white mb-1">{context.name}</h3>
                        <p className="text-xs text-slate-400">
                          {context.assets?.length || 0} assets
                        </p>
                      </motion.button>
                    ))}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'assign' && (
            <motion.div
              key="assign"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de cartas */}
                <GlassCard className="p-4">
                  <h3 className="font-medium text-white mb-3">Cartas</h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {selectedCards.map((card) => {
                      const isAssigned = !!cardAssignments[card._id];
                      const isActive = activeCardId === card._id;
                      
                      return (
                        <button
                          key={card._id}
                          onClick={() => setActiveCardId(card._id)}
                          className={cn(
                            'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                            isActive
                              ? 'border-indigo-500 bg-indigo-500/10'
                              : 'border-white/10 bg-slate-800/30 hover:border-white/20'
                          )}
                        >
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-lg',
                            isAssigned ? 'bg-green-500/20' : 'bg-slate-700'
                          )}>
                            {isAssigned 
                              ? cardAssignments[card._id]?.display 
                              : <CreditCard size={16} className="text-slate-400" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{card.uid}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {isAssigned ? cardAssignments[card._id]?.value : 'Sin asignar'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>

                {/* Selector de assets */}
                <GlassCard className="p-4 lg:col-span-2">
                  {activeCardId ? (
                    <>
                      <h3 className="font-medium text-white mb-3">
                        Assets de "{selectedContext?.name}"
                      </h3>
                      <AssetSelector
                        assets={selectedContext?.assets || []}
                        selectedAsset={cardAssignments[activeCardId]}
                        assignedAssetKeys={assignedAssetKeys}
                        onSelect={(asset) => handleAssignAsset(activeCardId, asset)}
                      />
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-slate-400">
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
        {showAddCards && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddCards(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Añadir cartas</h3>
                <button
                  onClick={() => setShowAddCards(false)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {/* Toggle modo */}
              <div className="flex bg-slate-800/50 rounded-xl p-1 mb-4 w-fit">
                <button
                  onClick={() => setCaptureMode('manual')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    captureMode === 'manual'
                      ? 'bg-indigo-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  Selección Manual
                </button>
                <button
                  onClick={() => setCaptureMode('rfid')}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    captureMode === 'rfid'
                      ? 'bg-indigo-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  Escaneo RFID
                </button>
              </div>

              {captureMode === 'manual' ? (
                <CardSelector
                  cards={availableCards.filter(c => !selectedCards.find(sc => sc._id === c._id))}
                  selectedCards={[]}
                  onChange={(cards) => {
                    cards.forEach(handleAddCard);
                  }}
                  maxCards={MAX_CARDS - selectedCards.length}
                />
              ) : (
                <RFIDScannerPanel
                  onCardScanned={handleAddCard}
                  scannedCards={[]}
                  maxCards={MAX_CARDS - selectedCards.length}
                  showMockButton={import.meta.env.MODE === 'development'}
                />
              )}
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
            <strong className="text-white">"{deckName}"</strong>?
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
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/20 border border-amber-500/50 backdrop-blur-lg">
              <AlertTriangle size={18} className="text-amber-400" />
              <span className="text-sm text-amber-200">Tienes cambios sin guardar</span>
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
