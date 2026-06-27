/**
 * @fileoverview Estrategia de mecanica Memoria.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

const shuffle = list => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    // eslint-disable-next-line sonarjs/pseudo-random -- safe: Fisher-Yates shuffle for game mechanics
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

    const uidSet = new Map(mappings.map(mapping => [mapping.uid, mapping]));

    const mappedLayout = providedLayout
      .map(slot => {
        const slotUid = slot.uid;
        const matchedMapping = uidSet.get(slotUid);
        const resolvedUid = slotUid || matchedMapping?.uid;

        if (!resolvedUid) {
          return null;
        }

        return {
          slotIndex: slot.slotIndex,
          uid: resolvedUid,
          assignedValue: slot.assignedValue,
          displayData: slot.displayData || matchedMapping?.displayData || {}
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.slotIndex - b.slotIndex);

    const fallbackLayout = shuffle(mappings).map((mapping, index) => ({
      slotIndex: index,
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
      lastRevealedUid: null,
      // Bookkeeping para finalSummary (ADR-A, ADR-B). Mantenemos contadores
      // running en strategyState porque varias métricas (peakStreak, tiempo
      // medio por pareja, primera pareja acertada) no se pueden derivar
      // post-hoc de los `events` sin perder precisión cuando la partida
      // sufre `complete()` con $slice -500.
      currentStreak: 0,
      peakStreak: 0,
      totalMatches: 0,
      totalMatchTimeMs: 0,
      firstMatchAtAttempt: null
    };
  }

  /**
   * Actualiza el bookkeeping de Memoria tras evaluar un grupo seleccionado.
   * El GameEngine invoca este hook con `isCorrect`, `timeElapsed` (ms desde
   * que el alumno levantó la primera carta del grupo) y `strategyState`
   * mutable.
   *
   * Reglas:
   *  - Acierto: incrementa streak, recalcula peakStreak, suma timeElapsed
   *    al acumulador y registra el número de intento del primer match.
   *  - Fallo: rompe el streak (vuelve a 0). El attempts ya lo incrementa
   *    `processScan` antes de devolver `resolved`.
   */
  recordScanResult({ isCorrect, timeElapsed, strategyState } = {}) {
    if (!strategyState) {
      return;
    }
    if (isCorrect) {
      const currentStreak = Number(strategyState.currentStreak || 0) + 1;
      strategyState.currentStreak = currentStreak;
      strategyState.peakStreak = Math.max(Number(strategyState.peakStreak || 0), currentStreak);
      strategyState.totalMatches = Number(strategyState.totalMatches || 0) + 1;
      const elapsed = Number(timeElapsed || 0);
      if (elapsed > 0) {
        strategyState.totalMatchTimeMs = Number(strategyState.totalMatchTimeMs || 0) + elapsed;
      }
      if (
        strategyState.firstMatchAtAttempt === null ||
        strategyState.firstMatchAtAttempt === undefined
      ) {
        // `attempts` ya se incrementó en processScan antes de devolver
        // 'resolved', por lo que registra el ordinal exacto del primer
        // acierto (1, 2, 3, …).
        strategyState.firstMatchAtAttempt = Number(strategyState.attempts || 1);
      }
    } else {
      strategyState.currentStreak = 0;
    }
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

    return (strategyState.boardLayout || []).map(slot => {
      // Una carta es "visible" solo si está revelada o ya emparejada. Mientras
      // esté boca abajo, ni `assignedValue` ni `displayData` deben serializarse:
      // viajarían en el payload `memory_board` y la respuesta sería
      // inspeccionable (DOM/red) antes de voltear la carta — fuga del reto.
      const isVisible = revealed.has(slot.uid) || matched.has(slot.uid);
      return {
        slotIndex: slot.slotIndex,
        uid: slot.uid,
        assignedValue: isVisible ? slot.assignedValue : null,
        isMatched: matched.has(slot.uid),
        isSelected: selected.has(slot.uid),
        isRevealed: isVisible,
        displayData: isVisible ? slot.displayData : null
      };
    });
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
