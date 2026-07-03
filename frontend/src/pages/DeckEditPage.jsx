/**
 * @fileoverview Página de edición de mazos de cartas
 * Permite modificar un mazo existente: añadir/quitar cartas, cambiar contexto y reasignar assets.
 * 
 * @module pages/DeckEditPage
 */

import { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import { useConfetti } from '../hooks/useConfetti';
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
  RefreshCw,
  Wand2,
  Check
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getId } from '../lib/entityId';
import { validateAssignmentCardinality } from '../lib/deckCardinality';
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
import InlineSuccessBadge from '../components/ui/InlineSuccessBadge';
import useInlineSuccess from '../hooks/useInlineSuccess';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { decksAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { GAME_CONFIG } from '../constants/gameConfig';
import { toast } from 'sonner';
import Breadcrumb from '../components/ui/Breadcrumb';
import Tooltip from '../components/ui/Tooltip';

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
  useDocumentTitle('Editar Mazo');
  const { fireConfetti } = useConfetti();
  // Micro-confirmación inline tras guardar (T-955). Coexiste con el toast,
  // pero el badge vive junto al botón Save para que el docente registre el
  // éxito sin recorrer la pantalla.
  const saveBadge = useInlineSuccess();

  // Estados de carga
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Datos del mazo
  const [deck, setDeck] = useState(null);
  const [deckName, setDeckName] = useState('');
  // Error inline del nombre (aria-invalid + role="alert" vía InputPremium),
  // alineado con el backend (mínimo 2 caracteres) en vez de un toast al enviar.
  const [nameError, setNameError] = useState('');
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [cardAssignments, setCardAssignments] = useState({});
  // Entrada manual de UID en el modal "Añadir cartas" (paridad con el wizard de
  // creación, QA 2026-06-04): permite añadir tarjetas sin lector físico.
  const [manualUid, setManualUid] = useState('');
  
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
      toast.error('No pudimos cargar el mazo', {
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
    const originalCardIds = (deck.cardMappings || []).flatMap(c => c.uid ? [c.uid] : []).sort();
    const currentCardIds = selectedCards.map(c => c.uid).sort();

    const nameChanged = deckName !== originalName;
    // El cambio de contexto se determina por la selección EXPLÍCITA del usuario
    // (`selectedContext`), NO por `effectiveContext`: este último cae a `null`
    // mientras la lista `contexts` aún no ha cargado —o si el contexto del mazo
    // no está en ella—, de modo que `effectiveContext?._id !== originalContext`
    // marcaba dirty en falso nada más montar la página y dejaba el banner
    // "Tienes cambios sin guardar" + el guard de beforeunload activos sin que el
    // usuario tocara nada (QA 2026-05-25; mismo síntoma que BUG-DECK-2 por la vía
    // del contexto). `selectedContext` es null hasta que el usuario elige otro.
    const selectedContextId = getId(selectedContext);
    const contextChanged = selectedContextId != null && selectedContextId !== originalContext;
    const cardsChanged = JSON.stringify(originalCardIds) !== JSON.stringify(currentCardIds);

    // BUG-DECK-2 (QA 2026-05-14): comparar el assignment ACTUAL contra el del
    // mazo cargado del backend, no contra `{}` vacío. Antes se marcaba dirty
    // desde mount porque la carga inicial pre-rellena cardAssignments con los
    // displayData de cada mapping.
    const originalAssignments = (deck.cardMappings || []).reduce((acc, mapping) => {
      const key = mapping?.displayData?.key;
      if (mapping?.uid && key) {
        acc[mapping.uid] = key;
      }
      return acc;
    }, {});
    const currentAssignments = Object.entries(cardAssignments).reduce((acc, [uid, asset]) => {
      if (asset?.key) {
        acc[uid] = asset.key;
      }
      return acc;
    }, {});
    const assignmentsChanged =
      JSON.stringify(originalAssignments) !== JSON.stringify(currentAssignments);

    return nameChanged || contextChanged || cardsChanged || assignmentsChanged;
  }, [deck, deckName, selectedContext, selectedCards, cardAssignments]);

  // T-957: confirmExit envuelve callbacks programáticos de navegación
  // (botones "Ver detalle", "Volver", etc.) con un modal warning cuando
  // hay cambios sin guardar. El `blocker`/`isBlocked` queda como stub
  // hasta una eventual migración a Data Router.
  const { confirmExit, confirmExitModalProps } = useUnsavedChanges(hasChanges);

  // Cerrar el modal "Añadir cartas" con Escape (WCAG modal-escape). El modal ya
  // cierra con click-fuera y la X, pero faltaba la tecla Escape (QA 2026-06-04).
  useEffect(() => {
    if (!ui.showAddCards) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dispatchUI({ type: 'HIDE_ADD_CARDS' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui.showAddCards]);

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

    // Check cross-deck: verificar si la tarjeta está en otro mazo activo (ADR-022)
    decksAPI.checkCard(card.uid, deckId).then(res => {
      const result = res.data?.data;
      if (result?.found) {
        toast.warning('Tarjeta en otro mazo', {
          description: `La tarjeta ${card.uid} está en el mazo "${result.deck.name}". Se moverá automáticamente al guardar.`
        });
      }
      return undefined;
    }).catch(() => {
      // Silencioso: el check es informativo, no crítico
    });
  }, [selectedCards, deckId]);

  // Añadir una carta escribiendo su UID a mano (sin lector físico).
  const handleAddManualCard = useCallback(() => {
    const uid = manualUid.trim().toUpperCase();
    if (!/^[0-9A-F]{1,16}$/.test(uid)) {
      toast.warning('UID no válido', { description: 'Introduce un identificador en hexadecimal (0-9, A-F).' });
      return;
    }
    handleAddCard({ uid });
    setManualUid('');
  }, [manualUid, handleAddCard]);

  // Generar el siguiente UID secuencial (8 dígitos hex) a partir de los existentes.
  const handleGenerateUid = useCallback(() => {
    const max = selectedCards.reduce((acc, c) => {
      const n = parseInt(c.uid, 16);
      return Number.isNaN(n) ? acc : Math.max(acc, n);
    }, -1);
    setManualUid((max + 1).toString(16).toUpperCase().padStart(8, '0'));
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
    // El DTO toGameContextDTOV1 expone `id`; mantenemos compat con `_id` por
    // si llegase un documento Mongoose crudo desde otro consumidor.
    const incomingKey = getId(context);
    const currentKey = getId(effectiveContext);
    if (incomingKey && incomingKey === currentKey) return;

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
    // Validaciones. El nombre se valida inline (no con toast) y con el mismo
    // mínimo que el backend (2 caracteres) para no rechazar nombres válidos.
    if (deckName.trim().length < 2) {
      setNameError('El nombre debe tener al menos 2 caracteres');
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

    // Validar cardinalidad de recursos ANTES de llamar al backend (QA 2026-06-04):
    // el servidor exige que cada valor aparezca 1 vez (Asociación/Secuencia) o
    // exactamente 2 veces (parejas para Memoria). Si añades una carta de más a un
    // mazo 1:1 y reutilizas un recurso, el estado queda "mixto" y el backend
    // respondía con un 400 técnico. Aquí damos un mensaje claro y guiamos al tab.
    const cardinality = validateAssignmentCardinality(selectedCards, cardAssignments);
    if (!cardinality.valid) {
      toast.error('Recursos repetidos sin formar parejas', { description: cardinality.reason });
      dispatchUI({ type: 'SET_ACTIVE_TAB', payload: 'assign' });
      return;
    }

    setSaving(true);
    
    try {
      const updateData = {
        name: deckName.trim(),
        contextId: getId(effectiveContext),
        cardMappings: buildCardMappingsPayload(selectedCards, cardAssignments)
      };
      
      const response = await decksAPI.updateDeck(deckId, updateData);
      const responseData = response.data?.data;

      fireConfetti({
        particleCount: 100,
        spread: 60,
        origin: { y: 0.6 },
      });

      saveBadge.trigger();
      toast.success('Mazo actualizado');

      // Resumen de tarjetas movidas cross-deck (ADR-022)
      if (responseData?.affectedDecks?.movedCards?.length > 0) {
        const { movedCards, archivedDecks } = responseData.affectedDecks;
        let description = `${movedCards.length} tarjeta(s) movida(s) desde otros mazos.`;
        if (archivedDecks?.length > 0) {
          description += ` ${archivedDecks.length} mazo(s) archivado(s) por quedar con pocas cartas.`;
        }
        toast.info('Tarjetas reorganizadas', { description, duration: 6000 });
      }

      const updatedCardMappings = buildUpdatedCardMappings(selectedCards, cardAssignments);
      
      // Actualizar datos locales
      setDeck(prev => ({
        ...prev,
        name: deckName.trim(),
        contextId: getId(effectiveContext),
        cardMappings: updatedCardMappings
      }));
      
    } catch (err) {
      toast.error('No pudimos guardar los cambios', {
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
      toast.error('No pudimos archivar el mazo', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="page-container py-[var(--space-fluid-section)]">
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
      <div className="page-container py-[var(--space-fluid-section)] flex items-center justify-center">
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
  const assetUsageCounts = Object.values(cardAssignments).reduce((acc, asset) => {
    if (asset?.key) acc.set(asset.key, (acc.get(asset.key) || 0) + 1);
    return acc;
  }, new Map());
  const currentDeckId = getId(deck) || deckId;

  return (
    <div className="page-container py-[var(--space-fluid-section)]">
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
              onClick={() =>
                currentDeckId &&
                confirmExit(() => navigate(ROUTES.CARD_DECKS_DETAIL(currentDeckId)))
              }
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
            <div className="relative">
              <ButtonPremium
                onClick={handleSave}
                disabled={!hasChanges || saving}
                loading={saving}
                icon={<Save size={16} />}
              >
                Guardar Cambios
              </ButtonPremium>
              <InlineSuccessBadge visible={saveBadge.visible} label="Guardado" placement="left" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Nombre del mazo */}
      <div className="max-w-5xl mx-auto mb-6">
        <GlassCard className="p-5">
          <InputPremium
            label="Nombre del mazo"
            value={deckName}
            onChange={(e) => {
              setDeckName(e.target.value);
              if (nameError) setNameError('');
            }}
            error={nameError}
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
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                // BUG-A11Y-DECKEDIT-TAB (QA Sprint 0): accent-indigo a 60%
                // luminancia da 4.07:1 con white. Subimos a indigo-700
                // (Tailwind) que es más oscuro y cumple AA.
                ui.activeTab === tab.id
                  ? 'bg-indigo-700 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.count && (
                // BUG-A11Y-DECKEDIT-COUNT (QA Sprint 0): text-text-muted
                // sobre bg-background-surface daba 4.23:1. text-secondary
                // pasa AA y mantiene el rol terciario del badge.
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full text-text-secondary',
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
                      {/* BUG-A11Y-REMOVE-BUTTON (QA Sprint 0): el botón
                          sólo contiene icono X — sin aria-label el botón no
                          tiene nombre accesible (Tooltip aporta title visual
                          pero no aria-labelledby). */}
                      <Tooltip content="Quitar carta">
                        <button
                          onClick={() => handleRemoveCard(card.uid)}
                          disabled={selectedCards.length <= MIN_CARDS}
                          aria-label={`Quitar carta ${card.uid}`}
                          className={cn(
                            'absolute -top-2 -right-2 size-6 rounded-full',
                            'bg-error-base text-white flex items-center justify-center',
                            'opacity-0 group-hover:opacity-100 transition-opacity',
                            'hover:bg-error-dark disabled:opacity-50 disabled:cursor-not-allowed'
                          )}
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </Tooltip>
                      
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
                    {contexts.map((context) => {
                      const ctxKey = getId(context);
                      const effectiveKey = getId(effectiveContext);
                      const isSelected = Boolean(effectiveKey) && effectiveKey === ctxKey;
                      return (
                      <motion.button
                        key={ctxKey}
                        onClick={() => handleContextChange(context)}
                        className={cn(
                          'relative p-4 rounded-xl border-2 transition-[border-color,background-color] duration-200 text-left focus-ring',
                          isSelected
                            ? 'border-accent-indigo bg-accent-indigo/10'
                            : 'border-border-default bg-background-elevated/30 hover:border-border-strong'
                        )}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex flex-wrap gap-1.5 mb-3 h-10 overflow-hidden">
                          {context.assets?.slice(0, 6).map((asset) => (
                            <CardAssetPreview
                              key={asset?.key || asset?.value || asset?.id || asset?.display || `${ctxKey}-asset`}
                              asset={asset}
                              className="size-8 rounded-lg flex-shrink-0"
                              showSkeleton={false}
                              fallbackLabel={asset.display}
                            />
                          ))}
                        </div>
                        <h3 className="font-medium text-text-primary mb-1">{context.name}</h3>
                        <p className="text-xs text-text-muted">
                          {context.assets?.length || 0} recursos
                        </p>
                      </motion.button>
                      );
                    })}
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
                            'w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left',
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
                        Recursos de &quot;{effectiveContext?.name}&quot;
                      </h3>
                      <AssetSelector
                        assets={effectiveContext?.assets || []}
                        selectedAssetKey={cardAssignments[ui.activeUid]?.key}
                        assignedAssets={[]}
                        assetUsageCounts={assetUsageCounts}
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-cards-title"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-background-base border border-border-default rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 id="add-cards-title" className="text-lg font-semibold text-text-primary">Añadir cartas</h3>
                <Tooltip content="Cerrar">
                  <button
                    onClick={() => dispatchUI({ type: 'HIDE_ADD_CARDS' })}
                    className="p-2 rounded-lg hover:bg-border-default transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </Tooltip>
              </div>

              {/* Entrada manual de UID — paridad con el wizard de creación, para
                  añadir tarjetas sin lector físico (QA 2026-06-04). */}
              <div className="mb-4 rounded-xl border border-border-default bg-background-elevated/40 p-3">
                <label htmlFor="edit-manual-uid" className="block text-sm font-medium text-text-secondary mb-2">
                  Entrada manual de UID
                </label>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
                  {/* Paridad con StepCards del wizard: InputPremium + ButtonPremium
                      (ghost "Generar UID" con Wand2, primary "Agregar" con Check).
                      El input usa id="edit-manual-uid" para conservar el htmlFor del
                      <label> superior; no se pasa `label` a InputPremium para no
                      duplicar la etiqueta visible. */}
                  <div className="flex-1">
                    <InputPremium
                      id="edit-manual-uid"
                      value={manualUid}
                      onChange={(e) => setManualUid(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualCard(); } }}
                      placeholder="Ej: 0000000A"
                    />
                  </div>
                  <ButtonPremium
                    variant="ghost"
                    onClick={handleGenerateUid}
                    icon={<Wand2 size={16} />}
                    title="Generar UID secuencial"
                  >
                    Generar UID
                  </ButtonPremium>
                  <ButtonPremium
                    onClick={handleAddManualCard}
                    disabled={!manualUid.trim()}
                    icon={<Check size={16} />}
                  >
                    Agregar
                  </ButtonPremium>
                </div>
                <p className="mt-1.5 text-xs text-text-muted">¿Sin lector a mano? Escribe el identificador de la tarjeta o genera uno.</p>
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
        confirmText="Archivar"
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
              {/* BUG-A11Y-DECKEDIT-UNSAVED (QA Sprint 0): warning-base sólido
                  cumple en dark pero falla en light (3.03). light:text-warning-dark
                  resuelve ambos temas. */}
              <span className="text-sm text-warning-on-alpha">Tienes cambios sin guardar</span>
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

      {/* T-957: modal de confirmación al salir con cambios sin guardar
          (botones programáticos via confirmExit). Cubre "Ver detalle" y
          otros navigate() del wizard; los <Link> de breadcrumb/sidebar
          siguen sin bloquearse hasta migrar a Data Router. */}
      <ConfirmationModal {...confirmExitModalProps} />
    </div>
  );
}
