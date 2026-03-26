export function getBestAssetImageUrl(asset) {
  if (!asset) {
    return null;
  }

  return asset.thumbnailUrl || asset.imageUrl || null;
}

export function normalizeCardMappingsFromDeck(deckData) {
  const mappings = Array.isArray(deckData?.cardMappings)
    ? deckData.cardMappings
    : Array.isArray(deckData?.cards)
      ? deckData.cards
      : [];

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
        audioUrl: assignedAsset.audioUrl || null
      }
    };
  });
}