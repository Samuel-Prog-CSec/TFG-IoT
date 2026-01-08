import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Timer, Zap, Shield, AlertTriangle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import clsx from 'clsx';
// import useSound from 'use-sound'; // Placeholder for future polish

export default function GameSession() {
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes
  const [gameState, setGameState] = useState('playing'); // playing, victory, gameover
  const [score, setScore] = useState(0);
  const [round] = useState(1);

  // Simulate timer
  useEffect(() => {
    if (gameState !== 'playing') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
            setGameState('gameover');
            return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [gameState]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Mock interaction
  const simulateScan = () => {
     if (gameState !== 'playing') return;
     // Random success/fail
     const success = Math.random() > 0.3;
     if (success) {
         setScore(s => s + 100);
         // setRound(r => r + 1);
     } else {
         setScore(s => Math.max(0, s - 20));
     }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-900 text-white flex flex-col relative font-sans selection:bg-indigo-500/30">
       {/* Background Grid Animation */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] animate-pulse pointer-events-none"></div>
      
      {/* Top HUD */}
      <header className="h-20 bg-slate-950/50 backdrop-blur-xl border-b border-white/10 flex justify-between items-center px-8 z-10 shrink-0">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-2xl shadow-lg shadow-indigo-500/20">
              {round}
           </div>
           <div>
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Ronda</div>
              <div className="text-xl font-bold font-display">Fase de Inicialización</div>
           </div>
        </div>

        <div className="flex items-center gap-8">
           <div className="flex items-col text-center">
              <div className={clsx("text-3xl font-mono font-bold tabular-nums tracking-wider flex items-center gap-2", timeLeft < 60 ? "text-rose-500 animate-pulse" : "text-indigo-400")}>
                 <Timer className="" /> {formatTime(timeLeft)}
              </div>
           </div>
        </div>

        <div className="flex items-center gap-4">
           <div className="text-right">
              <div className="text-xs text-slate-400 uppercase tracking-widest font-bold">Puntuación</div>
              <div className="text-2xl font-bold text-emerald-400 font-display">{score.toLocaleString()}</div>
           </div>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative flex items-center justify-center p-8">
         {/* Central Node */}
         <motion.div 
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-96 h-96 rounded-full border border-indigo-500/30 bg-indigo-500/5 backdrop-blur-sm flex items-center justify-center relative group cursor-pointer"
            onClick={simulateScan}
         >
             <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-[spin_10s_linear_infinite]"></div>
             <div className="absolute inset-4 rounded-full border border-purple-500/20 animate-[spin_15s_linear_infinite_reverse]"></div>
             
             <div className="text-center z-10 pointer-events-none">
                <Shield size={64} className="mx-auto mb-4 text-indigo-400" />
                <h2 className="text-2xl font-bold font-display tracking-wider">SISTEMA SEGURO</h2>
                <p className="text-indigo-300/60 mt-2">Monitorizando sensores...</p>
                <p className="text-xs text-slate-500 mt-4">(Click para simular escaneo)</p>
             </div>
         </motion.div>

         {/* Floating Cards / Events - Simulated */}
         <EventNotification />
      </main>

      {/* Bottom Bar - Player Hand / Status */}
      <footer className="h-24 bg-slate-950/50 backdrop-blur-xl border-t border-white/10 flex items-center justify-center px-8 z-10 shrink-0 gap-4">
          <PlayerCard name="Sensor DHT22" type="Activo" />
          <PlayerCard name="Regla Firewall" type="Defensa" />
          <PlayerCard name="Encriptación" type="Utilidad" />
      </footer>

      {/* Game Over / Victory Overlay */}
      <AnimatePresence>
          {gameState !== 'playing' && (
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-lg flex items-center justify-center"
              >
                  <motion.div 
                    initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                    className="bg-slate-800 p-12 rounded-3xl border border-white/10 text-center shadow-2xl max-w-lg w-full"
                  >
                      {gameState === 'victory' ? (
                          <>
                            <CheckCircle size={80} className="text-emerald-500 mx-auto mb-6" />
                            <h2 className="text-4xl font-bold text-white mb-4 font-display">¡Misión Cumplida!</h2>
                            <p className="text-slate-400 text-lg mb-8">El sistema está seguro y operativo.</p>
                          </>
                      ) : (
                          <>
                            <XCircle size={80} className="text-rose-500 mx-auto mb-6" />
                            <h2 className="text-4xl font-bold text-white mb-4 font-display">Tiempo Agotado</h2>
                            <p className="text-slate-400 text-lg mb-8">No se logró asegurar el sistema a tiempo.</p>
                          </>
                      )}
                      
                      <div className="bg-slate-900/50 p-6 rounded-xl mb-8 flex justify-center gap-12">
                          <div>
                              <div className="text-xs text-slate-500 uppercase font-bold">Puntuación Final</div>
                              <div className="text-3xl font-bold text-white">{score}</div>
                          </div>
                      </div>

                      <button 
                        onClick={() => window.location.reload()}
                        className="px-8 py-4 bg-white text-slate-900 rounded-xl font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 w-full"
                      >
                          <RefreshCw size={20} /> Jugar de Nuevo
                      </button>
                  </motion.div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

function PlayerCard({ name, type }) {
   return (
      <motion.button 
         whileHover={{ y: -20, scale: 1.1 }}
         className="w-48 h-16 bg-slate-800 rounded-xl border border-white/10 hover:border-indigo-500 flex items-center px-4 gap-3 transition-colors shadow-xl"
      >
         <div className="w-8 h-8 rounded bg-indigo-500/20 flex items-center justify-center">
            <Zap size={16} className="text-indigo-400" />
         </div>
         <div className="text-left">
            <div className="font-bold text-sm">{name}</div>
            <div className="text-xs text-slate-500 uppercase">{type}</div>
         </div>
      </motion.button>
   )
}

function EventNotification() {
    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                className="absolute top-8 right-8 w-80 bg-slate-900/90 backdrop-blur-md border-l-4 border-amber-500 p-4 rounded-r-xl shadow-2xl"
            >
                <div className="flex items-start gap-3">
                   <AlertTriangle className="text-amber-500 shrink-0" />
                   <div>
                      <h3 className="font-bold text-amber-500">Alerta de Seguridad</h3>
                      <p className="text-sm text-slate-300 mt-1">Tráfico inusual detectado en Puerto 8080. Despliega contramedidas.</p>
                   </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
