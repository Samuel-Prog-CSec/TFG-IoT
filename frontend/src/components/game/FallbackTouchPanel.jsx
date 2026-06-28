/**
 * @fileoverview Panel táctil alternativo cuando no hay sensor RFID conectado.
 * Muestra las cartas disponibles como botones para que el jugador
 * pueda responder tocando directamente en la pantalla.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { Hand, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn } from '../../lib/utils';
import CardAssetPreview from '../ui/CardAssetPreview';
import { useSquareGridColumns } from '../../hooks/useSquareGridColumns';

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
  // Mostrar TODAS las cartas del mazo (sin recortar a 12): si la carta objetivo
  // de la ronda quedaba más allá de la 12ª en orden alfabético, en modo táctil
  // (sin sensor) el alumno NO podía responderla → ronda imposible de ganar. El
  // mazo admite hasta 20 cartas y el grid cuadrado adaptativo ya escala el
  // tamaño de carta al área disponible.
  const visibleCards = (Array.isArray(cards) ? [...cards] : [])
    .sort((a, b) => getSortKey(a).localeCompare(getSortKey(b), 'es'));

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

  // Columnas adaptativas por aspect-ratio de la región (ADR-207 addendum): el
  // hook mide el `fieldset` y elige el nº de columnas que MAXIMIZA el lado de
  // carta cuadrada. Región ancha-baja (720p) → más columnas/menos filas; región
  // alta (4K) → menos columnas que llenan el alto. Suelo táctil WCAG en la carta.
  const [gridRef, gridCols] = useSquareGridColumns(visibleCards.length, { maxCols: 6 });

  return (
    // Región flex-1 hermana de la referencia (reparto equilibrado del alto).
    // Internamente: header shrink-0, grid flex-1 que escala las cartas por ALTO
    // disponible (auto-rows-fr) y botón de pausa shrink-0. Así el panel nunca
    // empuja ni recorta el reto y las cartas siempre caben sin scroll.
    <div className="w-full flex-1 min-h-0 max-w-[clamp(48rem,116vh,80rem)] mx-auto rounded-2xl border border-accent-indigo/25 bg-accent-indigo/5 p-2.5 sm:p-3 flex flex-col">
      <div className="flex items-center justify-center gap-2 text-text-secondary mb-2 shrink-0">
        <Hand size={14} className="shrink-0 text-accent-indigo" aria-hidden="true" />
        <p className="text-xs font-medium">Selecciona la carta correcta</p>
      </div>

      {visibleCards.length > 0 && (
        <fieldset
          ref={gridRef}
          className="grid gap-2 sm:gap-3 border-0 p-0 m-0 flex-1 min-h-0 auto-rows-fr content-center justify-center w-full"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
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
                // El pulso de fondo al tocar se delega a la clase
                // `active:bg-accent-indigo/20` (resuelve el token del tema y
                // se homogeneiza con Secuencia al alpha /20); whileTap queda
                // sólo con el scale para no hardcodear un rgba fijo.
                whileTap={{ scale: 0.93 }}
                whileHover={tappedUid === null ? { y: -4, scale: 1.03 } : undefined}
                animate={isError ? { x: [-3, 3, -2, 2, 0], transition: { duration: 0.35 } } : undefined}
                transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                aria-label={`Seleccionar carta: ${card.assignedValue || card.uid}`}
                aria-busy={isWaiting}
                // Tamaño dirigido por ALTO disponible: la carta es cuadrada
                // (aspect-square) acotada a la celda (max-h-full/max-w-full) y
                // centrada (mx-auto). En pantalla ancha la carta crece en ancho
                // sin crecer en alto; el suelo min-h-[2.75rem] (44px, WCAG 2.5.8)
                // garantiza target táctil incluso en mazos grandes a 720p.
                // `opacity-60` suaviza el bloqueo de las demás cartas tras un tap.
                className={cn(
                  'relative aspect-square max-h-full max-w-full mx-auto min-h-[2.75rem] rounded-xl border-2 p-1.5 text-center',
                  // Superficie premium: gradiente vertical sutil + bisel superior
                  // (inner highlight) para que la carta se sienta física y "tocable".
                  'bg-gradient-to-b from-background-surface/80 to-background-base/65',
                  'shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-text-primary)_14%,transparent)]',
                  'transition-[transform,background-color,border-color,box-shadow,opacity] duration-200',
                  'hover:border-accent-indigo/50 hover:shadow-[0_10px_28px_color-mix(in_oklab,var(--color-accent-indigo)_30%,transparent)]',
                  'active:bg-accent-indigo/20',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-indigo focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
                  'disabled:cursor-not-allowed',
                  borderClass,
                  // glowClass (éxito/error) va DESPUÉS del bisel para que su
                  // sombra de color sustituya al inner highlight al dar feedback.
                  glowClass,
                  tappedUid !== null && !isTapped && 'opacity-60'
                )}
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
                      <span className="text-nano font-semibold text-accent-indigo">Procesando…</span>
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
                      <span className="text-nano font-semibold text-success-base">¡Bien!</span>
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
                      <span className="text-nano font-semibold text-error-base">Otra vez</span>
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
        <div className="mt-2 flex justify-center shrink-0">
          <button
            type="button"
            onClick={onPauseRequest}
            className="text-nano px-3 py-1 rounded-full bg-background-base/60 text-text-secondary border border-border-subtle hover:bg-background-base/80 transition-colors"
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
