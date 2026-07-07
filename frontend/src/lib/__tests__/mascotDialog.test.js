/**
 * @fileoverview Tests del diccionario de diálogo de la mascota (ADR-D).
 */

import { describe, it, expect } from 'vitest';
import {
  MASCOT_DIALOG,
  pickMascotMessage
} from '../mascotDialog';

const REQUIRED_EVENTS = [
  'roundStart',
  'correctAnswer',
  'errorAnswer',
  'timeout',
  'streakReached',
  'gameOverHigh',
  'gameOverMid',
  'gameOverLow'
];

describe('MASCOT_DIALOG estructura', () => {
  it.each(['memory', 'association', 'sequence'])('%s expone todos los eventos requeridos', mechanic => {
    const dialog = MASCOT_DIALOG[mechanic];
    for (const event of REQUIRED_EVENTS) {
      expect(Array.isArray(dialog[event]), `${mechanic}.${event} debe ser array`).toBe(true);
      expect(dialog[event].length).toBeGreaterThan(0);
    }
  });

  it('los pools no contienen frases vacías', () => {
    for (const dialog of Object.values(MASCOT_DIALOG)) {
      for (const pool of Object.values(dialog)) {
        for (const phrase of pool) {
          expect(phrase, 'frases no pueden estar vacías').toBeTruthy();
          expect(phrase.length).toBeGreaterThan(2);
        }
      }
    }
  });

  it('las 3 mecánicas tienen pools distintos para correctAnswer', () => {
    const memorySet = new Set(MASCOT_DIALOG.memory.correctAnswer);
    const assocSet = new Set(MASCOT_DIALOG.association.correctAnswer);
    const seqSet = new Set(MASCOT_DIALOG.sequence.correctAnswer);
    // Hay al menos una frase única por mecánica (no son pools idénticos).
    const allShared =
      memorySet.size === assocSet.size &&
      assocSet.size === seqSet.size &&
      [...memorySet].every(p => assocSet.has(p) && seqSet.has(p));
    expect(allShared).toBe(false);
  });
});

describe('pickMascotMessage', () => {
  it('devuelve una frase del pool correspondiente', () => {
    const pool = MASCOT_DIALOG.memory.correctAnswer;
    expect(pool).toContain(pickMascotMessage('memory', 'correctAnswer'));
  });

  it('respeta el seed para resultados reproducibles', () => {
    const pool = MASCOT_DIALOG.memory.correctAnswer;
    const phrase0 = pickMascotMessage('memory', 'correctAnswer', null, 0);
    const phrase1 = pickMascotMessage('memory', 'correctAnswer', null, 1);
    expect(phrase0).toBe(pool[0]);
    expect(phrase1).toBe(pool[1]);
  });

  it('para gameOver con tier resuelve el sub-pool', () => {
    const phraseHigh = pickMascotMessage('memory', 'gameOver', 'high', 0);
    expect(MASCOT_DIALOG.memory.gameOverHigh).toContain(phraseHigh);
    const phraseLow = pickMascotMessage('memory', 'gameOver', 'low', 0);
    expect(MASCOT_DIALOG.memory.gameOverLow).toContain(phraseLow);
  });

  it('cae a memory si la mecánica no existe', () => {
    expect(MASCOT_DIALOG.memory.correctAnswer).toContain(
      pickMascotMessage('unknown', 'correctAnswer', null, 0)
    );
  });

  it('devuelve null si no hay pool', () => {
    expect(pickMascotMessage('memory', 'eventoDesconocido')).toBeNull();
  });
});
