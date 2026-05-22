/**
 * @fileoverview Panel táctil alternativo cuando no hay sensor RFID conectado.
 * Muestra las cartas disponibles como botones para que el jugador
 * pueda responder tocando directamente en la pantalla.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Hand, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import PropTypes from 'prop-types';
import CardAssetPreview from '../ui/CardAssetPreview';

/**
 * Panel de respuesta tactil para modo sin sensor RFID.
 *
 * Diseño pensado para niños 4-6 años:
 *  - Grid fluido 2 cols (movil) / 3 cols (≥640px) con cartas GRANDES (aspect
 *    cuadrado) que caben comodamente en la motricidad fina del usuario.
 *  - Tono neutro (no warning): el aviso superior usa mano indicativa, no alerta.
 *  - Feedback tactil: scale 0.92 y background pulse al tocar (whileTap).
 */
/**
 * Devuelve la cadena que usaremos para ordenar la carta. Prioridad:
 *  1. `assignedValue` (concepto educativo)
 *  2. `displayData.display` (texto visible)
 *  3. `uid` como último recurso (estable)
 *
 * @param {Object} card
 * @returns {string}
 */
const getSortKey = (card) =>
  String(card?.assignedValue ?? card?.displayData?.display ?? card?.uid ?? '').toLowerCase();

export default function FallbackTouchPanel({
  cards,
  round = 1,
  onSelectCard,
  onPauseRequest,
  canPause,
  // Reflejo del feedback global tras `validation_result`. Permite
  // sustituir el spinner "Procesando…" por un check verde / X roja sobre
  // la propia carta tapeada, conectando visualmente el tap con la
  // respuesta del backend (antes el alumno veía el bounce del target
  // arriba, sin nada que confirmase su acción local en el panel).
  feedbackState = 'idle'
}) {
  // Ordenamos alfabéticamente con `localeCompare('es')` para que el niño
  // encuentre el concepto de forma predecible bajo presión de tiempo.
  // Sólo afecta al panel táctil de fallback; el flujo con sensor RFID
  // mantiene su orden original (el alumno escanea físicamente).
  const visibleCards = (Array.isArray(cards) ? [...cards] : [])
    .sort((a, b) => getSortKey(a).localeCompare(getSortKey(b), 'es'))
    .slice(0, 12);

  // PROP-79: feedback "procesando" entre tap y validation_result. Confirma
  // visualmente al jugador que su tap se ha registrado, evitando la sensación
  // de "he tocado y no ha pasado nada" que llevaba a doble taps innecesarios.
  // El estado se resetea automáticamente al cambiar de ronda.
  const [tappedUid, setTappedUid] = useState(null);

  useEffect(() => {
    setTappedUid(null);
  }, [round]);

  const handleTap = (card) => {
    setTappedUid(card.uid);
    onSelectCard(card);
  };

  // Numero de columnas adaptativo: con 2-4 cartas una fila compacta, con mas
  // un grid 3xN. Los cards son siempre grandes (aspect-square) pero se escalan
  // con el ancho disponible para que siempre quepan en viewport sin scroll.
  // Target size WCAG 2.5.8 y Apple HIG (>=44pt) para niños 4-6 años.
  // En tablets pequeñas (640-768px) mantenemos 3 cols hasta `md` para
  // que cada botón tenga al menos ~96px de lado útil.
  const colsClass = (() => {
    const n = visibleCards.length;
    if (n <= 3) return 'grid-cols-3';
    if (n <= 4) return 'grid-cols-4';
    // Límite lg:5 (antes md:6): con 6 cols en mazos grandes (12+ cartas)
    // los botones se aplastaban a < 96px de lado en md (640-1024px),
    // sacrificando target size WCAG. 3/4/5 garantiza >=110px en cualquier
    // viewport >=md y mantiene la cuadrícula legible.
    if (n <= 8) return 'grid-cols-2 sm:grid-cols-4';
    return 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5';
  })();

  return (
    <div className="mt-2 w-full max-w-5xl rounded-2xl border border-accent-indigo/25 bg-accent-indigo/5 p-3 sm:p-4">
      <div className="flex items-center justify-center gap-2 text-text-secondary mb-3">
        <Hand size={14} className="shrink-0 text-accent-indigo" aria-hidden="true" />
        <p className="text-xs font-medium">Selecciona la carta correcta</p>
      </div>

      {visibleCards.length > 0 && (
        <fieldset
          className={`grid ${colsClass} gap-3 sm:gap-4 border-0 p-0 m-0`}
          aria-label="Cartas disponibles para selección táctil"
        >
          {visibleCards.map(card => {
            const isTapped = tappedUid === card.uid;
            const isWaiting = isTapped && feedbackState === 'idle';
            const isSuccess = isTapped && feedbackState === 'success';
            const isError = isTapped && feedbackState === 'error';
            // Borde según fase: indigo durante "procesando", éxito/error
            // tras la respuesta. Las cartas no-tapeadas mantienen su borde
            // neutro para que el alumno siga distinguiendo claramente cuál
            // fue la suya.
            const borderClass = (() => {
              if (isSuccess) return 'border-success-base';
              if (isError) return 'border-error-base';
              if (isWaiting) return 'border-accent-indigo';
              return 'border-border-default';
            })();
            const glowClass = (() => {
              if (isSuccess) return 'shadow-[0_0_20px_var(--color-success-glow)]';
              if (isError) return 'shadow-[0_0_20px_var(--color-error-glow)]';
              return '';
            })();
            return (
              <motion.button
                // Key incluye round para forzar re-mount de CardAssetPreview entre rondas
                // y asi sanear el estado interno si una imagen fallo en la ronda anterior.
                key={`fallback-card-${card.uid}-r${round}`}
                type="button"
                onClick={() => handleTap(card)}
                disabled={tappedUid !== null}
                // TOKEN-EXCEPTION: Framer Motion whileTap requires direct color value for interpolation
                whileTap={{ scale: 0.94, backgroundColor: 'rgba(99, 102, 241, 0.25)' }}
                whileHover={tappedUid === null ? { y: -2 } : undefined}
                animate={isError ? { x: [-3, 3, -2, 2, 0], transition: { duration: 0.35 } } : undefined}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                aria-label={`Seleccionar carta: ${card.assignedValue || card.uid}`}
                aria-busy={isWaiting}
                // Tamaño generoso para desktop (QA 2026-04-23: antes las cartas
                // quedaban muy pequeñas dejando mucho aire al usuario). En mobile
                // se mantiene un min de 72px para preservar el target size WCAG.
                // `opacity-60` (antes 40) suaviza el bloqueo: las otras cards
                // siguen siendo legibles aunque deshabilitadas; el contraste
                // anterior parecía un error de la app, no un estado de espera.
                className={`relative aspect-square min-h-[72px] md:min-h-[110px] rounded-xl border-2 ${borderClass} ${glowClass} bg-background-base/60 p-2 text-center transition-[background-color,border-color,box-shadow,opacity] hover:border-accent-indigo/50 hover:shadow-[0_4px_16px_rgba(99,102,241,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base disabled:cursor-not-allowed ${tappedUid !== null && !isTapped ? 'opacity-60' : ''}`}
              >
                <CardAssetPreview
                  asset={card.displayData || { display: card.assignedValue || card.uid }}
                  className="h-full w-full rounded-lg"
                  fit="contain"
                  loading="eager"
                  fallbackLabel={card.assignedValue || card.uid}
                  // Cuando el panel fallback esta en pantalla, el alumno necesita
                  // leer el nombre grande si la imagen no llega a cargar tras
                  // los retries, porque es su unica forma de asociar.
                  largeFallback
                />
                <AnimatePresence mode="wait">
                  {isWaiting && (
                    <motion.div
                      key="processing"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-accent-indigo/15 backdrop-blur-[2px] pointer-events-none"
                      aria-hidden="true"
                    >
                      <Loader2 size={20} className="text-accent-indigo animate-spin" />
                      <span className="text-[10px] font-semibold text-accent-indigo">Procesando…</span>
                    </motion.div>
                  )}
                  {isSuccess && (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-success-base/15 backdrop-blur-[2px] pointer-events-none"
                      aria-hidden="true"
                    >
                      <CheckCircle2 size={28} className="text-success-base drop-shadow" />
                      <span className="text-[10px] font-semibold text-success-base">¡Bien!</span>
                    </motion.div>
                  )}
                  {isError && (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-error-base/15 backdrop-blur-[2px] pointer-events-none"
                      aria-hidden="true"
                    >
                      <XCircle size={28} className="text-error-base drop-shadow" />
                      <span className="text-[10px] font-semibold text-error-base">Otra vez</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </fieldset>
      )}

      {canPause && (
        // El botón se centra en su propia fila bajo el grid; antes quedaba
        // anclado al inicio (debajo del primer asset) por defecto del flow.
        // Wording neutral: el panel táctil se usa sin sensor, así que
        // "Pausar para revisar sensor" sugería revisar algo inexistente.
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={onPauseRequest}
            className="text-[10px] px-3 py-1 rounded-full bg-background-base/60 text-text-secondary border border-border-subtle hover:bg-background-base/80 transition-colors"
          >
            Pausar partida
          </button>
        </div>
      )}
    </div>
  );
}

FallbackTouchPanel.propTypes = {
  cards: PropTypes.array,
  round: PropTypes.number,
  onSelectCard: PropTypes.func.isRequired,
  onPauseRequest: PropTypes.func.isRequired,
  canPause: PropTypes.bool,
  feedbackState: PropTypes.oneOf(['idle', 'success', 'error'])
};
