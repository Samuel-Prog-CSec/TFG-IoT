/**
 * @fileoverview Tests del microcopy contextual del GameOver (ADR-F).
 */

import { describe, it, expect } from 'vitest';
import { getGameOverCopy } from '../gameOverCopy';

describe('getGameOverCopy', () => {
  it('devuelve copy específico de Memoria para la nota máxima (5⭐)', () => {
    const { title, subtitle } = getGameOverCopy(5, 'memory');
    expect(title).toMatch(/MEMORIA/i);
    expect(subtitle).toBeTruthy();
  });

  it('devuelve copy específico de Asociación para la nota máxima (5⭐)', () => {
    const { title } = getGameOverCopy(5, 'association');
    expect(title).toMatch(/CONEXIÓN|CONEXION|GENIO|PERFECTA/i);
  });

  it('devuelve copy específico de Secuencia para la nota máxima (5⭐)', () => {
    const { title } = getGameOverCopy(5, 'sequence');
    expect(title).toMatch(/RITMO|SECUENCIA/i);
  });

  it('cae a copy genérico si la mecánica no se reconoce', () => {
    const { title, subtitle } = getGameOverCopy(5, 'unknown');
    expect(title).toBe('¡INCREÍBLE!');
    expect(subtitle).toBe('¡Eres un crack!');
  });

  it('cubre los 5 tiers (1–5) por mecánica', () => {
    for (const mechanic of ['memory', 'association', 'sequence']) {
      for (const stars of [1, 2, 3, 4, 5]) {
        const { title, subtitle } = getGameOverCopy(stars, mechanic);
        expect(title, `${mechanic} ${stars}⭐ debe tener title`).toBeTruthy();
        expect(subtitle, `${mechanic} ${stars}⭐ debe tener subtitle`).toBeTruthy();
      }
    }
  });

  it('cae a 1 estrella (mínimo motivador) si stars no es válido', () => {
    const minimo = getGameOverCopy(1, 'memory');
    const cero = getGameOverCopy(0, 'memory');
    const negative = getGameOverCopy(-1, 'memory');
    const tooHigh = getGameOverCopy(99, 'memory');
    expect(cero).toEqual(minimo);
    expect(negative).toEqual(minimo);
    expect(tooHigh).toEqual(minimo);
  });
});
