/**
 * @fileoverview Tests del microcopy contextual del GameOver (ADR-F).
 */

import { describe, it, expect } from 'vitest';
import { getGameOverCopy } from '../gameOverCopy';

describe('getGameOverCopy', () => {
  it('devuelve copy específico de Memoria para 3 estrellas', () => {
    const { title, subtitle } = getGameOverCopy(3, 'memory');
    expect(title).toMatch(/MEMORIA/i);
    expect(subtitle).toBeTruthy();
  });

  it('devuelve copy específico de Asociación para 3 estrellas', () => {
    const { title } = getGameOverCopy(3, 'association');
    expect(title).toMatch(/CONEXIÓN|CONEXION|GENIO|PERFECTA/i);
  });

  it('devuelve copy específico de Secuencia para 3 estrellas', () => {
    const { title } = getGameOverCopy(3, 'sequence');
    expect(title).toMatch(/RITMO|SECUENCIA/i);
  });

  it('cae a copy genérico si la mecánica no se reconoce', () => {
    const { title, subtitle } = getGameOverCopy(3, 'unknown');
    expect(title).toBe('¡INCREÍBLE!');
    expect(subtitle).toBe('¡Eres un crack!');
  });

  it('cubre los 4 tiers (0–3) por mecánica', () => {
    for (const mechanic of ['memory', 'association', 'sequence']) {
      for (const stars of [0, 1, 2, 3]) {
        const { title, subtitle } = getGameOverCopy(stars, mechanic);
        expect(title, `${mechanic} ${stars}⭐ debe tener title`).toBeTruthy();
        expect(subtitle, `${mechanic} ${stars}⭐ debe tener subtitle`).toBeTruthy();
      }
    }
  });

  it('cae a 0 estrellas si stars no es válido', () => {
    const fallback = getGameOverCopy(0, 'memory');
    const negative = getGameOverCopy(-1, 'memory');
    const tooHigh = getGameOverCopy(99, 'memory');
    expect(negative).toEqual(fallback);
    expect(tooHigh).toEqual(fallback);
  });
});
