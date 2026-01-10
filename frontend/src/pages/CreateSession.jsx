import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Layers, Map, Database, Tag, Settings, Save, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { api, calculateDifficulty } from '../services/mockApi';

const STEPS = [
  { id: 1, title: "Mecánica", icon: Layers },
  { id: 2, title: "Contexto", icon: Map },
  { id: 3, title: "Tarjetas", icon: Database },
  { id: 4, title: "Valores", icon: Tag },
  { id: 5, title: "Reglas", icon: Settings },
  { id: 6, title: "Revisar", icon: Save },
];

export default function CreateSession() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Data State
  const [mechanics, setMechanics] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [availableCards, setAvailableCards] = useState([]);

  // Session State
  const [session, setSession] = useState({
    name: 'Nueva Sesión',
    mechanicId: null,
    contextId: null,
    selectedCardIds: [],
    cardMappings: {}, // cardId -> assetKey
    config: {
      numberOfRounds: 5,
      timeLimit: 15, // seconds
      pointsPerCorrect: 10,
      penaltyPerError: -2
    }
  });

  // Fetch Initial Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [mechs, ctxs, cards] = await Promise.all([
          api.getMechanics(),
          api.getContexts(),
          api.getAvailableCards()
        ]);
        setMechanics(mechs);
        setContexts(ctxs);
        setAvailableCards(cards);
      } catch (error) {
        console.error("Failed to load data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Helpers
  const nextStep = () => setCurrentStep(p => Math.min(p + 1, 6));
  const prevStep = () => setCurrentStep(p => Math.max(p - 1, 1));
  const selectedMechanic = mechanics.find(m => m.id === session.mechanicId);
  const selectedContext = contexts.find(c => c.id === session.contextId);
  const difficulty = calculateDifficulty(session.selectedCardIds.length);

  const canProceed = () => {
    if (currentStep === 1) return !!session.mechanicId;
    if (currentStep === 2) return !!session.contextId;
    if (currentStep === 3) return session.selectedCardIds.length >= 2;
    if (currentStep === 4) return session.selectedCardIds.every(id => session.cardMappings[id]);
    return true;
  };

  const mapCardValue = (cardId, assetKey) => {
    setSession(prev => ({
      ...prev,
      cardMappings: { ...prev.cardMappings, [cardId]: assetKey }
    }));
  };

  const handleCreate = async () => {
    const sessionPayload = {
        ...session,
        config: {
            ...session.config,
            numberOfCards: session.selectedCardIds.length
        }
    };
    const newSession = await api.createSession(sessionPayload);
    // Navigate to Board Setup with the returned session ID. 
    navigate(`/board-setup/${newSession.id}`);
  };

  if (loading) return <div className="p-8 text-center text-white">Cargando recursos...</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen flex flex-col">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2 font-display">Crear Nueva Sesión</h1>
        <p className="text-slate-400">Configura paso a paso la partida para tus alumnos.</p>
      </header>

      {/* Progress Bar */}
      <div className="flex justify-between mb-12 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-800 -z-10 rounded-full"></div>
        <div 
            className="absolute top-1/2 left-0 h-1 bg-indigo-500 -z-10 rounded-full transition-all duration-500"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }}
        ></div>

        {STEPS.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center gap-2">
              <div 
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                  isActive ? "bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_20px_rgba(99,102,241,0.5)]" : 
                  isCompleted ? "bg-emerald-500 border-emerald-400 text-white" : 
                  "bg-slate-900 border-slate-700 text-slate-500"
                )}
              >
                {isCompleted ? <Check size={18} /> : <step.icon size={18} />}
              </div>
              <span className={clsx("text-xs font-medium uppercase tracking-wider", isActive ? "text-indigo-400" : "text-slate-500")}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Wizard Content */}
      <div className="flex-1 bg-slate-800/40 backdrop-blur-md rounded-2xl border border-white/5 p-8 relative overflow-hidden">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: MECHANIC SELECT */}
          {currentStep === 1 && (
            <motion.div 
              key="step1" 
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white">1. Selecciona la Mecánica de Juego</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {mechanics.map(mech => (
                  <button 
                    key={mech.id}
                    onClick={() => setSession(p => ({ ...p, mechanicId: mech.id }))}
                    className={clsx(
                      "p-6 rounded-xl border text-left transition-all hover:scale-105",
                      session.mechanicId === mech.id 
                        ? "bg-indigo-500/20 border-indigo-500 ring-2 ring-indigo-500/50" 
                        : "bg-slate-900/50 border-white/10 hover:border-white/20"
                    )}
                  >
                    <Layers size={32} className="mb-4 text-indigo-400" />
                    <h3 className="text-lg font-bold text-white block mb-2">{mech.name}</h3>
                    <p className="text-sm text-slate-400">{mech.description}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 2: CONTEXT SELECT */}
          {currentStep === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white">2. Selecciona el Contexto Temático</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {contexts.map(ctx => (
                  <button 
                    key={ctx.id}
                    onClick={() => setSession(p => ({ ...p, contextId: ctx.id }))}
                    className={clsx(
                      "p-6 rounded-xl border text-left transition-all hover:scale-105",
                      session.contextId === ctx.id 
                        ? "bg-purple-500/20 border-purple-500 ring-2 ring-purple-500/50" 
                        : "bg-slate-900/50 border-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center justify-between mb-4">
                        <Map size={32} className="text-purple-400" />
                        <span className="text-3xl">{ctx.assets[0]?.display}</span>
                    </div>
                    <h3 className="text-lg font-bold text-white block mb-2">{ctx.name}</h3>
                    <p className="text-sm text-slate-400">{ctx.assets.length} Assets Disponibles</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 3: CARDS SELECT & DIFFICULTY */}
          {currentStep === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex justify-between items-center">
                 <h2 className="text-2xl font-bold text-white">3. Selecciona las Tarjetas RFID</h2>
                 <div className={clsx(
                    "px-4 py-2 rounded-lg font-bold uppercase tracking-wider text-sm",
                    difficulty === 'easy' ? "bg-emerald-500/20 text-emerald-400" :
                    difficulty === 'medium' ? "bg-amber-500/20 text-amber-400" : "bg-rose-500/20 text-rose-400"
                 )}>
                    Dificultad Calculada: {difficulty === 'easy' ? 'Fácil' : difficulty === 'medium' ? 'Media' : 'Difícil'}
                 </div>
              </div>

              <p className="text-slate-400">Selecciona con cuántas tarjetas físicas se jugará. El número determina la dificultad.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                {availableCards.map(card => {
                    const isSelected = session.selectedCardIds.includes(card.id);
                    return (
                        <button
                            key={card.id}
                            onClick={() => {
                                setSession(p => {
                                    const newSelected = isSelected 
                                        ? p.selectedCardIds.filter(id => id !== card.id)
                                        : [...p.selectedCardIds, card.id];
                                    return { ...p, selectedCardIds: newSelected };
                                })
                            }}
                            className={clsx(
                                "flex flex-col items-center justify-center p-4 rounded-xl border transition-all",
                                isSelected 
                                    ? "bg-indigo-500 text-white border-indigo-400 shadow-lg scale-95" 
                                    : "bg-slate-900/40 text-slate-400 border-white/5 hover:border-white/20"
                            )}
                        >
                            <Database size={20} className="mb-2" />
                            <span className="font-mono text-xs">{card.uid}</span>
                            <span className="text-xs mt-1">{card.label}</span>
                        </button>
                    )
                })}
              </div>
            </motion.div>
          )}

           {/* STEP 4: ASSIGN VALUES */}
           {currentStep === 4 && (
            <motion.div 
              key="step4"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white">4. Asigna Valores a las Tarjetas</h2>
              <p className="text-slate-400">Vincula cada tarjeta física seleccionada a un concepto del contexto "{selectedContext?.name}".</p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto custom-scrollbar p-1">
                 {session.selectedCardIds.map(cardId => {
                     const card = availableCards.find(c => c.id === cardId);
                     return (
                         <div key={cardId} className="bg-slate-900/50 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                             <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
                                 <Tag size={14} /> {card?.uid}
                             </div>
                             <select 
                                value={session.cardMappings[cardId] || ''}
                                onChange={(e) => mapCardValue(cardId, e.target.value)}
                                className="bg-slate-800 border-white/10 rounded-lg text-white text-sm p-2 outline-none focus:border-indigo-500 transition-colors"
                             >
                                 <option value="">-- Seleccionar Valor --</option>
                                 {selectedContext?.assets.map(asset => (
                                     <option key={asset.key} value={asset.key}>
                                         {asset.display} {asset.value}
                                     </option>
                                 ))}
                             </select>
                         </div>
                     )
                 })}
              </div>
            </motion.div>
          )}

        {/* STEP 5: RULES CONFIG */}
        {currentStep === 5 && (
            <motion.div 
              key="step5"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <h2 className="text-2xl font-bold text-white">5. Configura las Reglas</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-400">Nombre de la Sesión</label>
                    <input 
                        type="text" 
                        value={session.name}
                        onChange={(e) => setSession(p => ({ ...p, name: e.target.value }))}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-indigo-500"
                    />
                 </div>

                 <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-400">Tiempo Límite por Ronda (segundos)</label>
                    <input 
                        type="range" min="3" max="60"
                        value={session.config.timeLimit}
                        onChange={(e) => setSession(p => ({ ...p, config: { ...p.config, timeLimit: parseInt(e.target.value) } }))}
                        className="w-full accent-indigo-500"
                    />
                    <div className="text-right text-2xl font-bold text-white">{session.config.timeLimit} s</div>
                 </div>

                 <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-400">Puntos por Acierto</label>
                    <input 
                        type="number"
                        value={session.config.pointsPerCorrect}
                        onChange={(e) => setSession(p => ({ ...p, config: { ...p.config, pointsPerCorrect: parseInt(e.target.value) } }))}
                         className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-emerald-500"
                    />
                 </div>

                 <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-400">Penalización por Error</label>
                    <input 
                        type="number"
                        value={session.config.penaltyPerError}
                        onChange={(e) => setSession(p => ({ ...p, config: { ...p.config, penaltyPerError: parseInt(e.target.value) } }))}
                         className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-white outline-none focus:border-rose-500"
                    />
                 </div>
              </div>
            </motion.div>
          )}

           {/* STEP 6: SUMMARY */}
           {currentStep === 6 && (
            <motion.div 
              key="step6"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-white">6. Resumen e Inicio</h2>
              
              <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex justify-between border-b border-white/5 pb-4">
                      <span className="text-slate-400">Sesión</span>
                      <span className="font-bold text-white">{session.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-4">
                      <span className="text-slate-400">Mecánica</span>
                      <span className="font-bold text-white">{selectedMechanic?.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-4">
                      <span className="text-slate-400">Contexto</span>
                      <span className="font-bold text-white">{selectedContext?.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-4">
                      <span className="text-slate-400">Tarjetas / Dificultad</span>
                      <span className="font-bold text-white">{session.selectedCardIds.length} Tarjetas ({difficulty})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                       <div className="bg-slate-800 p-3 rounded-lg text-center">
                          <span className="block text-xs text-slate-400">Tiempo</span>
                          <span className="block font-bold text-white">{session.config.timeLimit}s</span>
                       </div>
                       <div className="bg-slate-800 p-3 rounded-lg text-center">
                          <span className="block text-xs text-slate-400">Rondas</span>
                          <span className="block font-bold text-white">{session.config.numberOfRounds}</span>
                       </div>
                  </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Navigation Footer */}
      <footer className="mt-8 flex justify-between">
          <button 
            onClick={prevStep}
            disabled={currentStep === 1}
            className="px-6 py-3 rounded-xl bg-slate-800 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors flex items-center gap-2"
          >
            <ChevronLeft size={20} /> Anterior
          </button>

          {currentStep < 6 ? (
              <button 
                onClick={nextStep}
                disabled={!canProceed()}
                className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-indigo-500 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                 Siguiente <ChevronRight size={20} />
              </button>
          ) : (
                <button 
                onClick={handleCreate}
                className="px-8 py-3 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                 Crear Sesión <Check size={20} />
              </button>
          )}
      </footer>
    </div>
  );
}
