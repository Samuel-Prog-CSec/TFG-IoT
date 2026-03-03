/**
 * @fileoverview Estrategia de mecanica Asociacion.
 */

const BaseMechanicStrategy = require('./BaseMechanicStrategy');

class AssociationStrategy extends BaseMechanicStrategy {
  constructor() {
    super('association');
  }

  initialize() {
    return { lastUid: null };
  }

  resolvePlannedChallenge({ sessionDoc, playDoc }) {
    const roundNumber = Number(playDoc?.currentRound || 0);
    if (!Number.isFinite(roundNumber) || roundNumber < 1) {
      return null;
    }

    const plan = Array.isArray(sessionDoc?.associationChallengePlan)
      ? sessionDoc.associationChallengePlan
      : [];

    if (plan.length === 0) {
      return null;
    }

    const plannedItem = plan.find(item => Number(item?.roundNumber) === roundNumber);
    if (!plannedItem) {
      return null;
    }

    const mappings = Array.isArray(sessionDoc?.cardMappings) ? sessionDoc.cardMappings : [];
    const mapping = mappings.find(candidate => candidate.uid === plannedItem.uid) || null;
    if (!mapping) {
      return null;
    }

    return {
      ...mapping,
      displayData:
        plannedItem.displayData && Object.keys(plannedItem.displayData).length > 0
          ? plannedItem.displayData
          : mapping.displayData || {},
      promptText: plannedItem.promptText
    };
  }

  selectChallenge({ sessionDoc, playState }) {
    const plannedChallenge = this.resolvePlannedChallenge({
      sessionDoc,
      playDoc: playState?.playDoc
    });

    if (plannedChallenge) {
      if (playState?.strategyState) {
        playState.strategyState.lastUid = plannedChallenge.uid || null;
      }

      return plannedChallenge;
    }

    const mappings = sessionDoc.cardMappings || [];
    if (mappings.length === 0) {
      return null;
    }

    let candidate = null;
    let attempts = 0;

    do {
      const randomIndex = Math.floor(Math.random() * mappings.length);
      candidate = mappings[randomIndex];
      attempts += 1;
    } while (
      mappings.length > 1 &&
      candidate?.uid === playState.strategyState?.lastUid &&
      attempts < 5
    );

    if (playState.strategyState) {
      playState.strategyState.lastUid = candidate?.uid || null;
    }

    return candidate;
  }
}

module.exports = AssociationStrategy;
