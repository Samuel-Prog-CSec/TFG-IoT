/**
 * @fileoverview Tests de mergeSequenceRehydration (issue 6a): una reconexión de
 * socket emite un snapshot de Secuencia REDACTADO que, aplicado a secas, repinta
 * los assets del tablero como UID crudo. El merge preserva los assets en vivo.
 */

import { describe, it, expect } from 'vitest';
import { mergeSequenceRehydration } from '../sequenceRehydration';

const liveState = {
  cursor: 1,
  phase: 'reproducing',
  cardStatuses: { 0: 'correct' },
  sequence: [
    { uid: 'AAAA1111', assignedValue: 'León', displayData: { imageUrl: 'https://x/leon.png', display: 'León' } },
    { uid: 'BBBB2222', assignedValue: 'Tigre', displayData: { imageUrl: 'https://x/tigre.png', display: 'Tigre' } }
  ]
};

describe('mergeSequenceRehydration', () => {
  it('preserva los assets en vivo cuando el snapshot los trae redactados (mismo uid)', () => {
    const redactedSnapshot = {
      cursor: 2,
      phase: 'reproducing',
      cardStatuses: { 0: 'correct', 1: 'correct' },
      sequence: [
        { uid: 'AAAA1111', assignedValue: null, displayData: {} },
        { uid: 'BBBB2222', assignedValue: null, displayData: {} }
      ]
    };

    const merged = mergeSequenceRehydration(liveState, redactedSnapshot);

    // El progreso lo manda el snapshot…
    expect(merged.cursor).toBe(2);
    expect(merged.cardStatuses).toEqual({ 0: 'correct', 1: 'correct' });
    // …pero los assets se conservan del estado en vivo (no se repintan como UID).
    expect(merged.sequence[0].displayData).toEqual(liveState.sequence[0].displayData);
    expect(merged.sequence[1].displayData.imageUrl).toBe('https://x/tigre.png');
    expect(merged.sequence[0].assignedValue).toBe('León');
  });

  it('no injerta assets si el uid difiere (cambio de ronda)', () => {
    const otherRoundSnapshot = {
      cursor: 0,
      sequence: [{ uid: 'CCCC3333', assignedValue: null, displayData: {} }]
    };

    const merged = mergeSequenceRehydration(liveState, otherRoundSnapshot);

    expect(merged.sequence[0].displayData).toEqual({});
    expect(merged.sequence[0].uid).toBe('CCCC3333');
  });

  it('no pisa un asset presente en el snapshot (fase memorizing con datos completos)', () => {
    const fullSnapshot = {
      cursor: 0,
      sequence: [{ uid: 'AAAA1111', assignedValue: 'León', displayData: { imageUrl: 'https://x/leon2.png' } }]
    };

    const merged = mergeSequenceRehydration(liveState, fullSnapshot);

    expect(merged.sequence[0].displayData.imageUrl).toBe('https://x/leon2.png');
  });

  it('si no hay estado previo, devuelve el snapshot tal cual', () => {
    const snapshot = { cursor: 0, sequence: [{ uid: 'X', displayData: {} }] };
    expect(mergeSequenceRehydration(null, snapshot)).toBe(snapshot);
    expect(mergeSequenceRehydration({ sequence: [] }, snapshot)).toBe(snapshot);
  });

  it('si no hay snapshot, conserva el estado previo', () => {
    expect(mergeSequenceRehydration(liveState, null)).toBe(liveState);
  });
});
