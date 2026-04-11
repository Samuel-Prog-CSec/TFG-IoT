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