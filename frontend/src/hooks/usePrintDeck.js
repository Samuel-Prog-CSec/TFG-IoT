/**
 * @fileoverview Hook de estado del modal de impresión de mazos.
 * Gestiona tamaño (con guards), selección de cartas, opciones y la generación +
 * descarga del PDF. La geometría vive en `lib/printLayout` (pura y testeable).
 * @module hooks/usePrintDeck
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { decksAPI, extractErrorMessage } from '../services/api';
import { downloadBlob } from '../lib/utils';
import {
  computeGridLayout,
  pageCount,
  validateCardSizeCm,
  cmToMm,
  DEFAULT_CARD_WIDTH_MM,
  DEFAULT_CARD_HEIGHT_MM
} from '../lib/printLayout';

const STANDARD_WIDTH_CM = DEFAULT_CARD_WIDTH_MM / 10; // 5.5
const STANDARD_HEIGHT_CM = DEFAULT_CARD_HEIGHT_MM / 10; // 8.5

/**
 * Filtra las cartas imprimibles (las que tienen imagen) de un mazo.
 * @param {Array<{displayData?: {imageUrl?: string, thumbnailUrl?: string}}>} cards
 * @returns {Array}
 */
export function getPrintableCards(cards = []) {
  return cards.filter(card => {
    const data = card?.displayData || {};
    return Boolean(data.imageUrl || data.thumbnailUrl);
  });
}

/**
 * Deriva un nombre de fichero ASCII-safe (la descarga por Blob ignora el
 * Content-Disposition del servidor, así que se replica aquí el slug del backend).
 * @param {string} deckName
 * @returns {string}
 */
function buildFilename(deckName) {
  const slug = String(deckName || 'mazo')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 60)
    .replace(/-$/, '');
  return `${slug || 'mazo'}-cartas.pdf`;
}

/**
 * @param {Object} params
 * @param {string} params.deckId
 * @param {string} params.deckName
 * @param {Array} params.cards - cardMappings del mazo (con displayData)
 * @param {string[]} [params.newUids] - UIDs añadidos en esta edición (para "Solo las nuevas")
 */
export function usePrintDeck({ deckId, deckName, cards, newUids = [] }) {
  const printable = useMemo(() => getPrintableCards(cards), [cards]);

  const [preset, setPreset] = useState('standard'); // 'standard' | 'custom'
  const [widthCm, setWidthCm] = useState(String(STANDARD_WIDTH_CM));
  const [heightCm, setHeightCm] = useState(String(STANDARD_HEIGHT_CM));
  const [showLabel, setShowLabel] = useState(false);
  const [selectedUids, setSelectedUids] = useState(() => new Set(printable.map(c => c.uid)));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const effectiveWidthCm = preset === 'standard' ? STANDARD_WIDTH_CM : widthCm;
  const effectiveHeightCm = preset === 'standard' ? STANDARD_HEIGHT_CM : heightCm;

  const sizeErrors = useMemo(
    () =>
      preset === 'custom'
        ? validateCardSizeCm({ widthCm, heightCm })
        : { widthError: null, heightError: null },
    [preset, widthCm, heightCm]
  );
  const sizeValid = !sizeErrors.widthError && !sizeErrors.heightError;

  const layout = useMemo(() => {
    if (!sizeValid) {
      return null;
    }
    return computeGridLayout({
      cardWidthMm: cmToMm(Number(effectiveWidthCm)),
      cardHeightMm: cmToMm(Number(effectiveHeightCm))
    });
  }, [sizeValid, effectiveWidthCm, effectiveHeightCm]);

  const selectedCards = useMemo(
    () => printable.filter(c => selectedUids.has(c.uid)),
    [printable, selectedUids]
  );
  const pages = layout ? pageCount(selectedCards.length, layout.perPage) : 0;

  const toggleCard = useCallback(uid => {
    setSelectedUids(prev => {
      const next = new Set(prev);
      if (next.has(uid)) {
        next.delete(uid);
      } else {
        next.add(uid);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(
    () => setSelectedUids(new Set(printable.map(c => c.uid))),
    [printable]
  );
  const selectNone = useCallback(() => setSelectedUids(new Set()), []);

  const newPrintableUids = useMemo(
    () => newUids.filter(uid => printable.some(c => c.uid === uid)),
    [newUids, printable]
  );
  const selectNew = useCallback(
    () => setSelectedUids(new Set(newPrintableUids)),
    [newPrintableUids]
  );

  const canGenerate = sizeValid && selectedCards.length > 0 && !generating;

  const generate = useCallback(async () => {
    if (!canGenerate) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const options = {
        cardWidthMm: cmToMm(Number(effectiveWidthCm)),
        cardHeightMm: cmToMm(Number(effectiveHeightCm)),
        showLabel
      };
      // Solo enviar cardUids si es un subconjunto (el backend imprime todas por defecto).
      if (selectedCards.length !== printable.length) {
        options.cardUids = selectedCards.map(c => c.uid);
      }

      const response = await decksAPI.printDeck(deckId, options);
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: 'application/pdf' });
      downloadBlob(blob, buildFilename(deckName));
      toast.success('PDF generado', {
        description: 'Se ha descargado el archivo listo para imprimir'
      });
    } catch (err) {
      const message = extractErrorMessage(err);
      setError(message);
      toast.error('No se pudo generar el PDF', { description: message });
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    deckId,
    deckName,
    effectiveWidthCm,
    effectiveHeightCm,
    showLabel,
    selectedCards,
    printable.length
  ]);

  return {
    printable,
    selectedCards,
    selectedUids,
    preset,
    setPreset,
    widthCm,
    setWidthCm,
    heightCm,
    setHeightCm,
    effectiveWidthCm,
    effectiveHeightCm,
    sizeErrors,
    sizeValid,
    showLabel,
    setShowLabel,
    layout,
    pages,
    toggleCard,
    selectAll,
    selectNone,
    selectNew,
    hasNew: newPrintableUids.length > 0,
    newCount: newPrintableUids.length,
    generating,
    error,
    canGenerate,
    generate
  };
}
