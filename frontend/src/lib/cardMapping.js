export function getBestAssetImageUrl(asset) {
  if (!asset) {
    return null;
  }

  return asset.thumbnailUrl || asset.imageUrl || null;
}

export function normalizeCardMappingsFromDeck(deckData, cardsCatalog = []) {
  const mappings = Array.isArray(deckData?.cardMappings)
    ? deckData.cardMappings
    : Array.isArray(deckData?.cards)
      ? deckData.cards
      : [];

  return mappings
    .map((mapping) => {
      const cardId =
        mapping?.cardId?._id ||
        mapping?.cardId ||
        mapping?.card?.id ||
        mapping?.card?.cardId;

      if (!cardId) {
        return null;
      }

      const fallbackCard = cardsCatalog.find((card) => card._id === cardId || card.id === cardId);
      const displayData = mapping.displayData || mapping.assignedAsset || {};
      const assignedValue = mapping.assignedValue || displayData.value || '';

      return {
        cardId,
        uid: mapping.uid || mapping?.cardId?.uid || mapping?.card?.uid || fallbackCard?.uid || '',
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
    const assignedAsset = cardAssignments[card._id] || {};
    const assignedValue = assignedAsset.value || assignedAsset.display || card.uid;

    return {
      cardId: card._id,
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