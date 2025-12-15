import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, RotateCcw, Play, CheckCircle } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../services/mockApi';

export default function BoardSetup() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    const init = async () => {
        try {
            // 1. Fetch Session from Mock API using ID
            let currentSession = null;
            if (sessionId) {
                currentSession = await api.getSessionById(sessionId);
            }

            // Fallback for demo/direct access (dev only)
            if (!currentSession) {
                // If no session found, we might want to alert or redirect. 
                // For now, we mock a basic fallback or stay null
                 console.warn("Session not found, loading demo");
                 const cards = await api.getAvailableCards();
                 currentSession = { 
                     id: 'demo', 
                     config: { numberOfCards: 5 }, 
                     cardMappings: {}, 
                     selectedCardIds: cards.slice(0, 5).map(c => c.id) 
                };
            }
            
            setSession(currentSession);

            // 2. Fetch all necessary data to hydrate the view
            const [allCards, context, students] = await Promise.all([
                 api.getAvailableCards(),
                 currentSession.contextId ? api.getContextById(currentSession.contextId) : null,
                 api.getStudents()
            ]);

            // 3. Enrich Cards with Asset Data (Icon/Value)
            // Filter only the cards selected for this session
            const sessionCards = allCards.filter(c => currentSession.selectedCardIds.includes(c.id));
            
            const enrichedCards = sessionCards.map(card => {
                const assetKey = currentSession.cardMappings[card.id];
                const asset = context?.assets?.find(a => a.key === assetKey);
                
                return {
                    ...card,
                    label: asset ? asset.value : card.label, // "España" vs "Tarjeta 1"
                    icon: asset ? asset.display : null,     // "🇪🇸"
                    subLabel: asset ? `Asset: ${asset.key}` : card.uid // extra info
                };
            });

            setAvailableCards(enrichedCards);
            setAvailableStudents(students);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    init();
  }, [sessionId]);

  const cardsInLibrary = availableCards.filter(card => !Object.values(slots).some(c => c.id === card.id));
  const totalSlots = session?.config?.numberOfCards || session?.selectedCardIds?.length || 0;
  const isBoardComplete = totalSlots > 0 && Object.keys(slots).length === totalSlots;
  const canStart = isBoardComplete && selectedStudentId;

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
    }
  };

  if (loading) return <div className="text-white p-8">Cargando tablero...</div>;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-screen flex flex-col p-6 bg-slate-900 overflow-hidden">
            <header className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white font-display">Configuración del Tablero</h1>
                    <p className="text-slate-400">Arrastra las tarjetas a los huecos para configurar la partida.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <select 
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="bg-slate-800 text-white p-3 rounded-xl border border-white/10 outline-none focus:border-indigo-500"
                    >
                        <option value="">-- Asignar Estudiante --</option>
                        {availableStudents.map(student => (
                            <option key={student.id} value={student.id}>{student.name}</option>
                        ))}
                    </select>

                    <button 
                        onClick={() => setSlots({})}
                        className="p-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                        title="Resetear Tablero"
                    >
                        <RotateCcw size={20} />
                    </button>
                    <button 
                        onClick={() => {
                            // navigate(`/game/${sessionId}`); // Disabled as per request
                            alert(`¡Partida configurada para ${availableStudents.find(s=>s.id === selectedStudentId)?.name}!\n(La pantalla de juego está deshabilitada temporalmente)`);
                            navigate('/dashboard');
                        }}
                        disabled={!canStart}
                        className="px-6 py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50 disabled:grayscale hover:bg-emerald-400 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                        <Play size={20} /> Iniciar Partida
                    </button>
                </div>
            </header>

            <div className="flex gap-8 h-full overflow-hidden">
                {/* LIBRARY SIDEBAR */}
                <LibraryDroppable cards={cardsInLibrary} />

                {/* BOARD AREA */}
                <div className="flex-1 bg-slate-800/20 rounded-3xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center relative p-8">
                     <div className="absolute top-4 left-4 text-slate-500 font-mono text-xs">TABLERO VIRTUAL</div>
                     
                     <div className="w-full h-full overflow-y-auto flex items-center justify-center p-8 custom-scrollbar">
                         <div className="grid grid-cols-5 gap-6 max-w-6xl">
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
                "w-80 bg-slate-800/40 backdrop-blur-md rounded-2xl border p-4 flex flex-col transition-colors",
                isOver ? "border-indigo-500 bg-indigo-500/10" : "border-white/5"
            )}
        >
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Layers size={18} className="text-indigo-400"/> Librería ({cards.length})
            </h2>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                <AnimatePresence>
                    {cards.map(card => (
                        <DraggableCard key={card.id} card={card} />
                    ))}
                    {cards.length === 0 && (
                        <div className="text-center text-slate-500 py-8 text-sm italic">
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
                "w-32 h-32 rounded-xl border-2 border-dashed transition-all flex items-center justify-center relative",
                isOver ? "border-indigo-400 bg-indigo-400/10 scale-105" : 
                card ? "border-indigo-500/30 bg-indigo-500/5 shadow-inner" : "border-slate-700 bg-slate-900/20"
            )}
        >
            {!card && <span className="absolute top-2 left-2 text-xs font-mono text-slate-600">#{index + 1}</span>}
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
                 isOverlay && "bg-slate-800/90 border border-indigo-400 shadow-xl" // Overlay needs bg
             )}>
                  <div className="text-5xl mb-2 filter drop-shadow-lg">{card.icon}</div>
                  <div className="text-white font-bold text-xs text-center leading-tight bg-slate-900/50 px-2 py-1 rounded-full">{card.label}</div>
             </div>
        )
    }

    return (
        <div className={clsx(
            "p-3 rounded-xl border bg-slate-800 flex items-center gap-3 cursor-grab active:cursor-grabbing",
            isOverlay ? "border-indigo-400 shadow-2xl scale-105" : "border-white/10 hover:border-white/30 shadow-sm"
        )}>
            <div className="w-10 h-10 rounded bg-indigo-500/20 flex items-center justify-center text-xl font-bold border border-indigo-500/30">
                {card.icon || '#'}
            </div>
            <div>
                <div className="text-white font-bold text-sm leading-tight">{card.label}</div>
                <div className="text-slate-500 text-xs font-mono">{card.uid}</div>
            </div>
        </div>
    )
}

// Helper hook to simplify droppable usage with dnd-kit
import { useDroppable } from '@dnd-kit/core';
function useDroppableCompat(props) {
    const { setNodeRef, isOver } = useDroppable(props);
    return { setNodeRef, isOver };
}
