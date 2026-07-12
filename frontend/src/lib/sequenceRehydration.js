/**
 * @fileoverview Fusión de snapshots de rehidratación del tablero de Secuencia.
 * @module lib/sequenceRehydration
 */

const isRedacted = displayData =>
  !displayData || typeof displayData !== 'object' || Object.keys(displayData).length === 0;

const hasAsset = displayData =>
  Boolean(displayData) && typeof displayData === 'object' && Object.keys(displayData).length > 0;

/**
 * Fusiona un snapshot de rehidratación de Secuencia (que el backend REDACTA por
 * anti-fuga: las cartas ya jugadas llegan sin `displayData`/`assignedValue`) con
 * el estado en vivo del tablero, preservando los assets que ya teníamos.
 *
 * Reparto de autoridad:
 *  - El snapshot manda en el PROGRESO (cursor, cardStatuses, phase, roundNumber).
 *  - El estado en vivo manda en los ASSETS ya revelados (imágenes de las cartas).
 *
 * Sin esta fusión, una reconexión de socket durante la ronda repintaba el tablero
 * con los UID crudos en lugar de las imágenes (issue 6a). Se preservan SOLO las
 * posiciones cuyo `uid` coincide entre ambos, de modo que un cambio de ronda
 * (uids distintos) nunca injerta imágenes equivocadas.
 *
 * @param {object|null} prev - sequenceState en vivo (puede ser el inicial vacío)
 * @param {object|null} snapshot - salida de `buildSequenceStateFromSnapshot`
 * @returns {object|null}
 */
export function mergeSequenceRehydration(prev, snapshot) {
  if (!snapshot) {
    return prev ?? null;
  }
  const prevSequence = Array.isArray(prev?.sequence) ? prev.sequence : [];
  if (prevSequence.length === 0 || !Array.isArray(snapshot.sequence)) {
    return snapshot;
  }

  const mergedSequence = snapshot.sequence.map((item, index) => {
    const prevItem = prevSequence[index];
    // Solo preservamos si es la MISMA carta (uid) en la misma posición y el
    // snapshot la trae redactada pero teníamos su asset real en vivo.
    const sameCard = Boolean(item?.uid && prevItem?.uid && item.uid === prevItem.uid);
    if (sameCard && isRedacted(item?.displayData) && hasAsset(prevItem?.displayData)) {
      return {
        ...item,
        uid: item.uid || prevItem.uid,
        assignedValue: item.assignedValue ?? prevItem.assignedValue ?? null,
        displayData: prevItem.displayData
      };
    }
    return item;
  });

  return { ...snapshot, sequence: mergedSequence };
}

export default mergeSequenceRehydration;
