import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, defaultDropAnimationSideEffects, useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, RotateCcw, Play, Shuffle } from 'lucide-react';
import clsx from 'clsx';
import { useConfetti } from '../hooks/useConfetti';
import { toast } from 'sonner';
import { sessionsAPI, usersAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { captureException } from '../lib/sentry';
import { useAuth } from '../context/AuthContext';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { ROUTES } from '../constants/routes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import SelectPremium from '../components/ui/SelectPremium';
import ButtonPremium from '../components/ui/ButtonPremium';
import Tooltip from '../components/ui/Tooltip';

/** Fisher-Yates shuffle — returns a new shuffled copy of the array */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    // eslint-disable-next-line sonarjs/pseudo-random -- Fisher-Yates shuffle para UI, no requiere seguridad criptografica
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function BoardSetup() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
    const { user } = useAuth();
  useDocumentTitle('Configurar Tablero');
  const { fireBurst } = useConfetti();
  const [loading, setLoading] = useState(true);
  
  // Game Data
  const [session, setSession] = useState(null);
  const [availableCards, setAvailableCards] = useState([]); // All cards in session
  const [availableStudents, setAvailableStudents] = useState([]);
  
  // Board State
  // Map<SlotId, Card>
  const [slots, setSlots] = useState({}); 
  const [activeId, setActiveId] = useState(null); // For DragOverlay
  const [selectedStudentId, setSelectedStudentId] = useState('');
    const [savingBoard, setSavingBoard] = useState(false);

    const init = useCallback((signal) => {
        const run = async () => {
        try {
                        if (!sessionId) {
                            throw new Error('No se encontró la sesión para configurar el tablero');
                        }

                                                const sessionResponse = await sessionsAPI.getSessionById(sessionId, signal ? { signal } : {});
                        const currentSession = extractData(sessionResponse);

                        setSession(currentSession);

                        const teacherId = user?.id || user?._id;
                        const requestOptions = signal ? { signal } : {};
                        const studentsResponse = teacherId
                            ? await usersAPI.getStudentsByTeacher(teacherId, { sortBy: 'name', order: 'asc' }, requestOptions)
                            : { data: { data: [] } };

                        const students = extractData(studentsResponse) || [];

                        const mappings = Array.isArray(currentSession?.cardMappings)
                            ? currentSession.cardMappings
                            : [];

                        const enrichedCards = mappings.map(mapping => {
                            const displayValue = mapping.displayData?.value || mapping.assignedValue;
                            const displayIcon = mapping.displayData?.display || null;
                            const assetKey = mapping.displayData?.key;

                            return {
                                id: mapping.uid,
                                uid: mapping.uid,
                                label: displayValue || `Tarjeta ${mapping.uid}`,
                                icon: displayIcon,
                                subLabel: assetKey ? `Asset: ${assetKey}` : mapping.uid,
                                assignedValue: mapping.assignedValue,
                                displayData: mapping.displayData,
                                asset: mapping.displayData || null
                            };
                        });

                        setAvailableCards(enrichedCards);

                        if (Array.isArray(currentSession?.boardLayout) && currentSession.boardLayout.length > 0) {
                            const cardsByUid = new Map(enrichedCards.map(card => [card.uid, card]));
                            const preloadedSlots = {};

                            currentSession.boardLayout.forEach(slot => {
                                const slotCard = cardsByUid.get(slot.uid);
                                if (!slotCard) {
                                    return;
                                }

                                preloadedSlots[`slot_${slot.slotIndex}`] = slotCard;
                            });

                            setSlots(preloadedSlots);
                        }

                        setAvailableStudents(Array.isArray(students) ? students : []);
        } catch (e) {
                        if (isAbortError(e)) {
                            return;
                        }
                        captureException(e);
                        toast.error(extractErrorMessage(e));
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    };

    run();
    }, [sessionId, user]);

    useEffect(() => {
        const controller = new AbortController();
        init(controller.signal);
        return () => controller.abort();
    }, [init]);

    useRefetchOnFocus({
        refetch: () => init(),
        isLoading: loading,
        hasData: Boolean(session)
    });

  const cardsInLibrary = availableCards.filter(card => !Object.values(slots).some(c => c.id === card.id));
    const totalSlots = session?.config?.numberOfCards || availableCards.length || 0;
  const isBoardComplete = totalSlots > 0 && Object.keys(slots).length === totalSlots;
  const canStart = isBoardComplete && selectedStudentId;

    const buildBoardLayoutPayload = useCallback(() => {
        return Object.entries(slots)
            .map(([slotId, card]) => {
                const slotIndex = Number.parseInt(slotId.replace('slot_', ''), 10);
                if (!Number.isInteger(slotIndex) || !card) {
                    return null;
                }

                return {
                    slotIndex,
                    uid: card.uid,
                    assignedValue: card.assignedValue || card.label || card.uid,
                    displayData: card.displayData || card.asset || {}
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.slotIndex - b.slotIndex);
    }, [slots]);

    const handleRandomize = useCallback(() => {
        if (!session?.cardMappings?.length) return;
        const shuffled = shuffleArray(session.cardMappings);
        const newSlots = {};
        shuffled.forEach((card, index) => {
            newSlots[`slot_${index}`] = {
                id: card.uid,
                uid: card.uid,
                assignedValue: card.assignedValue,
                displayData: card.displayData || {},
                label: card.assignedValue,
                asset: card.displayData || null,
                icon: card.displayData?.display || null
            };
        });
        setSlots(newSlots);
        toast.success('Tablero distribuido aleatoriamente');
    }, [session?.cardMappings]);

    const handleStartPlay = useCallback(async () => {
        if (!canStart || savingBoard) {
            return;
        }

        try {
            setSavingBoard(true);
            const boardLayout = buildBoardLayoutPayload();
            await sessionsAPI.updateSession(sessionId, { boardLayout });

            const playerQuery = selectedStudentId
                ? `?playerId=${encodeURIComponent(selectedStudentId)}`
                : '';
            navigate(`${ROUTES.GAME(sessionId)}${playerQuery}`);
        } catch (error) {
            toast.error('No se pudo guardar el tablero', {
                description: extractErrorMessage(error)
            });
        } finally {
            setSavingBoard(false);
        }
    }, [buildBoardLayoutPayload, canStart, navigate, savingBoard, selectedStudentId, sessionId]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeCardId = active.id;
    const overId = over.id; // Could be a slot 'slot_X' or 'library'

    const activeCard = availableCards.find(c => c.id === activeCardId);
    
    // Find where the card currently is (Library or a Slot)
    const currentSlotId = Object.keys(slots).find(key => slots[key].id === activeCardId);

    // 1. DROP ON LIBRARY (Remove from board)
    if (overId === 'library') {
        if (currentSlotId) {
            const newSlots = { ...slots };
            delete newSlots[currentSlotId];
            setSlots(newSlots);
        }
        return;
    }

    // 2. DROP ON A SLOT
    if (overId.startsWith('slot_')) {
        const targetSlotId = overId;
        const existingCardInTarget = slots[targetSlotId];

        // If card was in another slot, remove it from there first
        const newSlots = { ...slots };
        if (currentSlotId) {
            delete newSlots[currentSlotId];
        }

        // SWAP LOGIC: If target has a card, move it to the source slot (if source was a slot)
        if (existingCardInTarget && currentSlotId) {
             newSlots[currentSlotId] = existingCardInTarget;
        } 
        // If source was library and target has card, the target card goes back to library (implicitly, by being overwritten)
        
        // Place active card in target
        newSlots[targetSlotId] = activeCard;
        setSlots(newSlots);

        // Confetti effect for feedback
        fireBurst({
            particleCount: 30,
            spread: 50,
            origin: { y: 0.7 },
        });
    }
  };

  if (loading) return <div className="text-text-primary p-8">Cargando tablero...</div>;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-screen flex flex-col p-6 bg-background-base overflow-hidden">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary font-display">Configuración del Tablero</h1>
                    <p className="text-text-muted">Arrastra las tarjetas a los huecos para configurar la partida.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <SelectPremium
                        value={selectedStudentId}
                        onChange={(val) => setSelectedStudentId(val)}
                        placeholder="Asignar Estudiante"
                        options={availableStudents.map(student => ({
                            value: student.id || student._id,
                            label: student.name
                        }))}
                        className="w-64"
                    />

                    <Tooltip content="Distribuir aleatoriamente">
                        <button
                            type="button"
                            onClick={handleRandomize}
                            className="flex items-center gap-2 rounded-lg border border-accent-indigo/30 bg-accent-indigo/10 px-4 py-2 text-sm font-medium text-accent-indigo hover:bg-accent-indigo/20 transition-colors"
                        >
                            <Shuffle size={16} />
                            Aleatorio
                        </button>
                    </Tooltip>
                    <Tooltip content="Resetear Tablero">
                        <ButtonPremium
                            variant="ghost"
                            onClick={() => setSlots({})}
                        >
                            <RotateCcw size={20} />
                        </ButtonPremium>
                    </Tooltip>
                    <ButtonPremium
                        variant="success"
                        onClick={handleStartPlay}
                        disabled={!canStart || savingBoard}
                        className="shadow-lg shadow-success-base/20"
                    >
                        <Play size={20} /> {savingBoard ? 'Guardando tablero…' : 'Iniciar Partida'}
                    </ButtonPremium>
                </div>
            </header>

            <div className="flex gap-8 h-full overflow-hidden">
                {/* LIBRARY SIDEBAR */}
                <LibraryDroppable cards={cardsInLibrary} />

                {/* BOARD AREA */}
                <div className="flex-1 bg-background-elevated/20 rounded-3xl border-2 border-dashed border-border-subtle flex flex-col items-center justify-center relative p-8">
                     <div className="absolute top-4 left-4 text-text-muted font-mono text-xs">TABLERO VIRTUAL</div>
                     
                     <div className="w-full h-full overflow-y-auto flex items-center justify-center p-8 custom-scrollbar">
                         <div className="grid gap-6 max-w-6xl" style={{ gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(totalSlots))}, 1fr)` }}>
                            {Array.from({ length: totalSlots }).map((_, idx) => {
                                const slotId = `slot_${idx}`;
                                const card = slots[slotId];
                                return (
                                    <Slot key={slotId} id={slotId} card={card} index={idx} />
                                );
                            })}
                         </div>
                     </div>
                </div>
            </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={{
             sideEffects: defaultDropAnimationSideEffects({
                styles: {
                    active: { opacity: '0.8' },
                },
            }),
        }}>
            {activeId ? (
                 <CardView 
                    card={availableCards.find(c => c.id === activeId)} 
                    isOverlay 
                    // Use 'slot' variant if dragging a card that is currently in a slot (so it looks the same)
                    variant={Object.values(slots).some(c => c.id === activeId) ? 'slot' : 'default'}
                 />
            ) : null}
        </DragOverlay>

    </DndContext>
  );
}

// --- SUB COMPONENTS ---

function LibraryDroppable({ cards }) {
    const { setNodeRef, isOver } = useDroppableCompat({ id: 'library' });

    return (
        <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            ref={setNodeRef}
            className={clsx(
                "w-80 bg-background-elevated/40 backdrop-blur-md rounded-2xl border p-4 flex flex-col transition-colors",
                isOver ? "border-accent-indigo bg-accent-indigo/10" : "border-border-subtle"
            )}
        >
            <h2 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
                <Layers size={18} className="text-accent-indigo"/> Librería ({cards.length})
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                <AnimatePresence>
                    {cards.map(card => (
                        <DraggableCard key={card.id} card={card} />
                    ))}
                    {cards.length === 0 && (
                        <div className="text-center text-text-muted py-8 text-sm italic">
                            Todas las tarjetas están colocadas.
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    )
}

function Slot({ id, card, index }) {
    const { setNodeRef, isOver } = useDroppableCompat({ id });

    return (
        <div 
            ref={setNodeRef}
            className={clsx(
                "size-32 rounded-xl border-2 border-dashed transition-[transform,border-color,background-color] flex items-center justify-center relative",
                (() => {
                    if (isOver) return "border-accent-indigo bg-accent-indigo/10 scale-105";
                    if (card) return "border-accent-indigo/30 bg-accent-indigo/5 shadow-inner";
                    return "border-background-surface bg-background-base/20";
                })()
            )}
        >
            {!card && <span className="absolute top-2 left-2 text-xs font-mono text-text-disabled">#{index + 1}</span>}
            {card && <DraggableCard card={card} variant="slot" />}
        </div>
    )
}

function DraggableCard({ card, variant = 'default' }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: card.id });
    const style = transform ? {
        transform: CSS.Translate.toString(transform),
    } : undefined;

    return (
        <div 
            ref={setNodeRef} style={style} {...listeners} {...attributes}
            className={clsx("touch-none", isDragging && "opacity-0", variant === 'slot' ? "w-full h-full" : "")}
        >
            <CardView card={card} variant={variant} />
        </div>
    );
}

function CardView({ card, isOverlay, variant = 'default' }) {
    if (variant === 'slot') {
        return (
             <div className={clsx(
                 "w-full h-full flex flex-col items-center justify-center p-2 cursor-grab active:cursor-grabbing rounded-xl",
                 isOverlay && "bg-background-elevated/90 border border-accent-indigo shadow-xl" // Overlay needs bg
             )}>
                  <CardAssetPreview
                    asset={card.asset}
                    alt={`Carta ${card.uid}`}
                    className="size-16 rounded-xl mb-2"
                    fit="cover"
                    fallbackClassName="text-4xl"
                    fallbackLabel={card.icon || '🎴'}
                  />
                  <div className="text-text-primary font-bold text-xs text-center leading-tight bg-background-base/50 px-2 py-1 rounded-full">{card.label}</div>
             </div>
        )
    }

    return (
        <div className={clsx(
            "p-3 rounded-xl border bg-background-elevated flex items-center gap-3 cursor-grab active:cursor-grabbing",
            isOverlay ? "border-accent-indigo shadow-2xl scale-105" : "border-border-default hover:border-border-strong shadow-sm"
        )}>
            <CardAssetPreview
              asset={card.asset}
              alt={`Carta ${card.uid}`}
              className="size-10 rounded border border-accent-indigo/30"
              fit="cover"
              fallbackClassName="bg-accent-indigo/20 text-xl font-bold"
              fallbackLabel={card.icon || '#'}
            />
            <div>
                <div className="text-text-primary font-bold text-sm leading-tight">{card.label}</div>
                <div className="text-text-muted text-xs font-mono">{card.uid}</div>
            </div>
        </div>
    )
}

// Helper hook to simplify droppable usage with dnd-kit
function useDroppableCompat(props) {
    const { setNodeRef, isOver } = useDroppable(props);
    return { setNodeRef, isOver };
}
