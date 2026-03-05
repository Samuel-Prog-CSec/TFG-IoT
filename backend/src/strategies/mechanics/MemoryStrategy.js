/**
 * @fileoverview Estrategia de mecanica Memoria.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

const shuffle = list => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

class MemoryStrategy extends BaseMechanicStrategy {
  constructor() {
    super('memory');
  }

  isTurnBasedRound() {
    return false;
  }

  getPlayDurationMs(sessionDoc) {
    const seconds = Number(sessionDoc?.config?.timeLimit || 0);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  }

  initialize({ sessionDoc }) {
    const mappings = Array.isArray(sessionDoc.cardMappings) ? sessionDoc.cardMappings : [];
    const behavior = sessionDoc?.mechanicId?.rules?.behavior || {};
    const matchingGroupSize = Number(behavior.matchingGroupSize) || 2;
    const providedLayout = Array.isArray(sessionDoc.boardLayout) ? sessionDoc.boardLayout : [];

    const uidByCardId = new Map(
      mappings.map(mapping => [mapping.cardId?.toString?.(), mapping.uid])
    );

    const mappedLayout = providedLayout
      .map(slot => {
        const slotCardId = slot.cardId?.toString?.();
        const uidFromDeck = uidByCardId.get(slotCardId);
        const fallbackMapping = mappings.find(mapping => mapping.uid === slot.uid);
        const resolvedUid = uidFromDeck || fallbackMapping?.uid || slot.uid;

        if (!resolvedUid) {
          return null;
        }

        return {
          slotIndex: slot.slotIndex,
          cardId: slot.cardId,
          uid: resolvedUid,
          assignedValue: slot.assignedValue,
          displayData: slot.displayData || fallbackMapping?.displayData || {}
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    const fallbackLayout = shuffle(mappings).map((mapping, index) => ({
      slotIndex: index,
      cardId: mapping.cardId,
      uid: mapping.uid,
      assignedValue: mapping.assignedValue,
      displayData: mapping.displayData || {}
    }));

    const layout = mappedLayout.length === mappings.length ? mappedLayout : fallbackLayout;

    const groupsByValue = {};
    for (const slot of layout) {
      const assignedValue = slot?.assignedValue || '__unknown__';
      if (!groupsByValue[assignedValue]) {
        groupsByValue[assignedValue] = [];
      }
      groupsByValue[assignedValue].push(slot.uid);
    }

    const totalGroups = Object.keys(groupsByValue).length;
    const playableGroupSize = Math.max(2, matchingGroupSize);

    return {
      boardLayout: layout,
      groupsByValue,
      matchingGroupSize: playableGroupSize,
      revealedUids: [],
      matchedUids: [],
      selectedUids: [],
      totalGroups,
      totalCards: layout.length,
      attempts: 0,
      lastRevealedUid: null
    };
  }

  selectChallenge({ playState }) {
    return {
      displayData: {
        mode: 'memory_board',
        board: this.buildBoardForClient(playState?.strategyState || {})
      }
    };
  }

  buildBoardForClient(strategyState) {
    const revealed = new Set(strategyState.revealedUids || []);
    const matched = new Set(strategyState.matchedUids || []);
    const selected = new Set(strategyState.selectedUids || []);

    return (strategyState.boardLayout || []).map(slot => ({
      slotIndex: slot.slotIndex,
      cardId: slot.cardId,
      uid: slot.uid,
      assignedValue: slot.assignedValue,
      isMatched: matched.has(slot.uid),
      isSelected: selected.has(slot.uid),
      isRevealed: revealed.has(slot.uid) || matched.has(slot.uid),
      displayData: revealed.has(slot.uid) || matched.has(slot.uid) ? slot.displayData : null
    }));
  }

  isCompleted(strategyState) {
    const matched = new Set(strategyState.matchedUids || []);
    const totalCards = Number(strategyState.totalCards || 0);
    return totalCards > 0 && matched.size >= totalCards;
  }

  processScan({ scannedCard, sessionDoc, strategyState }) {
    if (!strategyState || !scannedCard?.uid) {
      return { type: 'ignored' };
    }

    const matched = new Set(strategyState.matchedUids || []);
    const revealed = new Set(strategyState.revealedUids || []);
    const selected = Array.isArray(strategyState.selectedUids)
      ? [...strategyState.selectedUids]
      : [];
    const groupSize = Number(strategyState.matchingGroupSize) || 2;

    if (matched.has(scannedCard.uid)) {
      return {
        type: 'ignored',
        board: this.buildBoardForClient(strategyState)
      };
    }

    // Ignorar si ya está seleccionado
    if (selected.includes(scannedCard.uid)) {
      return {
        type: 'ignored',
        board: this.buildBoardForClient(strategyState)
      };
    }

    selected.push(scannedCard.uid);
    revealed.add(scannedCard.uid);
    strategyState.lastRevealedUid = scannedCard.uid;

    // Aún no se alcanzó el groupSize => selección intermedia
    if (selected.length < groupSize) {
      strategyState.selectedUids = selected;
      strategyState.revealedUids = [...revealed];

      return {
        type: selected.length === 1 ? 'first_pick' : 'intermediate_pick',
        board: this.buildBoardForClient(strategyState)
      };
    }

    // Se alcanzó el groupSize => evaluar
    const boardByUid = new Map((strategyState.boardLayout || []).map(slot => [slot.uid, slot]));
    const selectedCards = selected.map(uid => boardByUid.get(uid)).filter(Boolean);
    const allSameValue =
      selectedCards.length === groupSize &&
      selectedCards.every(card => card.assignedValue === selectedCards[0].assignedValue);
    const allDistinctUids = new Set(selected).size === selected.length;
    const isCorrect = allSameValue && allDistinctUids;

    strategyState.attempts = Number(strategyState.attempts || 0) + 1;

    const pointsAwarded = isCorrect
      ? Number(sessionDoc?.config?.pointsPerCorrect || 0)
      : Number(sessionDoc?.config?.penaltyPerError || 0);

    if (isCorrect) {
      for (const uid of selected) {
        matched.add(uid);
      }
      strategyState.matchedUids = [...matched];
      strategyState.revealedUids = [...revealed];
      strategyState.selectedUids = [];

      return {
        type: 'resolved',
        isCorrect: true,
        pointsAwarded,
        selectedUids: [...selected],
        board: this.buildBoardForClient(strategyState)
      };
    }

    strategyState.selectedUids = [...selected];
    strategyState.revealedUids = [...revealed];

    return {
      type: 'resolved',
      isCorrect: false,
      pointsAwarded,
      selectedUids: [...selected],
      hideAfterMs:
        Number(sessionDoc?.mechanicId?.rules?.behavior?.hideUnmatchedAfterDelayMs) || 1200,
      board: this.buildBoardForClient(strategyState)
    };
  }

  concealSelected(strategyState, selectedUids = []) {
    if (!strategyState) {
      return;
    }

    const matched = new Set(strategyState.matchedUids || []);
    const selectedSet = new Set(selectedUids);
    const nextRevealed = (strategyState.revealedUids || []).filter(
      uid => matched.has(uid) || !selectedSet.has(uid)
    );

    strategyState.selectedUids = [];
    strategyState.revealedUids = nextRevealed;
  }
}

module.exports = MemoryStrategy;
