import { useEffect, useState, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import ConfirmationModal, { useConfirmationModal } from '../ui/ConfirmationModal';

/**
 * Layout fullscreen para rutas de gameplay (/game/:sessionId).
 *
 * Bypass total de AppLayout: sin sidebar, sin topbar, sin widget RFID
 * flotante. La partida ocupa los 100dvh del viewport y maximiza la
 * superficie visible para el alumno (decisión brainstorming 2026-05-09:
 * en 1366×768 el sidebar de 288px ahogaba el board).
 *
 * Salida controlada: botón "X" arriba-derecha + tecla Escape. Si hay
 * estado activo (lo señaliza window.__gameActive booleano que setea
 * GameSession), pide confirmación antes de salir; si no, navega atrás.
 */
export default function GameLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const exitModal = useConfirmationModal();
  const [hasActiveGame, setHasActiveGame] = useState(false);

  // GameSession setea window.__gameActive=true al startPlay y false al endPlay,
  // y dispara `gameactive:change` para notificar a este layout sin polling.
  // Aún así re-checkeamos en cada cambio de location por si la página se
  // carga directamente en /game (sin haber pasado por mount→event).
  useEffect(() => {
    const checkActive = () => setHasActiveGame(Boolean(globalThis.__gameActive));
    checkActive();
    globalThis.addEventListener('gameactive:change', checkActive);
    return () => globalThis.removeEventListener('gameactive:change', checkActive);
  }, [location.pathname]);

  const performExit = useCallback(() => {
    globalThis.__gameActive = false;
    navigate(-1);
  }, [navigate]);

  const handleExit = useCallback(() => {
    if (hasActiveGame) {
      exitModal.openModal({
        title: '¿Salir de la partida?',
        description: 'Si sales ahora, la partida en curso no quedará registrada.',
        variant: 'warning',
        confirmText: 'Salir',
        cancelText: 'Continuar jugando',
        onConfirm: performExit,
      });
    } else {
      performExit();
    }
  }, [hasActiveGame, exitModal, performExit]);

  // Escape global → mismo handler que el botón X.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleExit();
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [handleExit]);

  return (
    <div className="h-[100dvh] w-screen overflow-hidden game-bg relative flex flex-col">
      <button
        type="button"
        onClick={handleExit}
        aria-label="Salir de la partida"
        title="Salir (Esc)"
        className="absolute top-4 right-4 z-50 size-10 inline-flex items-center justify-center rounded-xl bg-background-elevated/80 backdrop-blur-xl border border-border-default text-text-primary hover:bg-background-surface/80 transition-colors"
      >
        <X size={20} />
      </button>
      <Outlet />
      <ConfirmationModal {...exitModal.modalProps} />
    </div>
  );
}
