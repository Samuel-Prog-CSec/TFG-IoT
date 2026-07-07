/**
 * Selecciona la URL de imagen óptima según el contexto de uso.
 *
 * @param {Object} asset - Objeto asset con imageUrl y thumbnailUrl
 * @param {Object} [options]
 * @param {boolean} [options.preferFull=false] - true para displays grandes (ChallengeDisplay),
 *   false para grids/cards donde el thumbnail (256x256) es suficiente
 * @returns {string|null} URL de la imagen seleccionada
 */
export function getAssetImageUrl(asset, { preferFull = false } = {}) {
  if (!asset) {
    return null;
  }

  if (preferFull) {
    return asset.imageUrl || asset.thumbnailUrl || null;
  }

  return asset.thumbnailUrl || asset.imageUrl || null;
}

/**
 * Alias retrocompatible: devuelve thumbnail > imageUrl.
 * Usado por CardAssetPreview y grids de cards.
 */
export function getBestAssetImageUrl(asset) {
  return getAssetImageUrl(asset);
}

export function normalizeCardMappingsFromDeck(deckData) {
  const mappings = (() => {
    if (Array.isArray(deckData?.cardMappings)) return deckData.cardMappings;
    if (Array.isArray(deckData?.cards)) return deckData.cards;
    return [];
  })();

  return mappings
    .map((mapping) => {
      const uid = mapping?.uid;

      if (!uid) {
        return null;
      }

      const displayData = mapping.displayData || mapping.assignedAsset || {};
      const assignedValue = mapping.assignedValue || displayData.value || '';

      return {
        uid,
        assignedValue,
        displayData: {
          ...displayData,
          value: assignedValue || displayData.value || '',
          key: displayData.key || '',
          display: displayData.display || displayData.emoji || ''
        }
      };
    })
    .filter(Boolean);
}

/**
 * Pre-carga en el cache del navegador las imagenes de un array de cardMappings.
 * Se usa al iniciar una partida para que las URLs de Supabase Storage esten
 * calientes antes de que la UI las pinte en cada ronda. Evita los flash de
 * bloque-de-color que aparecen cuando la red devuelve 5xx o es lenta.
 *
 * Es idempotente: si el navegador ya cacheo la imagen, `new Image()` no hace
 * request de red; si hay error, registra el fallo y sigue (no bloqueante).
 *
 * @param {Array<{ displayData?: { imageUrl?: string, thumbnailUrl?: string } }>} cardMappings
 * @param {(failedCount: number) => void} [onAnyFailure] - callback opcional invocado
 *   una sola vez si al menos una imagen fallo. Permite al caller mostrar UI discreta.
 * @param {Object} [options]
 * @param {boolean} [options.includeFullRes=true] - (C1) Si false, NO precarga la
 *   imagen full-res (768px). Solo ChallengeDisplay (mecánica Asociación) la pinta;
 *   Memoria y Secuencia usan siempre el thumbnail (getBestAssetImageUrl), así que
 *   precargar la full en esas 2 de cada 3 partidas malgasta egress de Supabase
 *   (~1-3 MB inservibles por arranque) contra el free-tier.
 */
export function prefetchDeckImages(cardMappings, onAnyFailure, { includeFullRes = true } = {}) {
  if (!Array.isArray(cardMappings) || cardMappings.length === 0 || typeof Image === 'undefined') {
    return;
  }

  const urls = new Set();
  for (const mapping of cardMappings) {
    const data = mapping?.displayData || {};
    if (data.thumbnailUrl) urls.add(data.thumbnailUrl);
    // La full solo se precarga si el caller la usará (Asociación) o si no hay
    // thumbnail (en cuyo caso el tablero cae a imageUrl como fallback real).
    if (data.imageUrl && (includeFullRes || !data.thumbnailUrl)) urls.add(data.imageUrl);
  }

  let failedCount = 0;
  let notified = false;
  urls.forEach(url => {
    const img = new Image();
    img.decoding = 'async';
    img.onerror = () => {
      failedCount += 1;
      if (!notified && typeof onAnyFailure === 'function') {
        notified = true;
        onAnyFailure(failedCount);
      }
    };
    img.src = url;
  });
}

export function buildCardMappingsPayload(selectedCards, cardAssignments) {
  return selectedCards.map((card) => {
    const assignedAsset = cardAssignments[card.uid] || {};
    const assignedValue = assignedAsset.value || assignedAsset.display || card.uid;

    return {
      uid: card.uid,
      assignedValue,
      displayData: {
        key: assignedAsset.key || '',
        value: assignedValue,
        display: assignedAsset.display || '',
        imageUrl: assignedAsset.imageUrl || null,
        thumbnailUrl: assignedAsset.thumbnailUrl || null,
        audioUrl: assignedAsset.audioUrl || null,
        dominantColor: assignedAsset.dominantColor || null
      }
    };
  });
}