import { describe, it, expect } from 'vitest';
import { validateAssignmentCardinality } from '../deckCardinality';

const cards = (...uids) => uids.map((uid) => ({ uid }));
const asset = (value) => ({ value });

describe('validateAssignmentCardinality', () => {
  it('acepta un mazo vacío (sin asignaciones todavía)', () => {
    expect(validateAssignmentCardinality([], {}).valid).toBe(true);
  });

  it('acepta todos los valores únicos (Asociación/Secuencia 1:1)', () => {
    const selected = cards('A', 'B', 'C');
    const assignments = { A: asset('Uno'), B: asset('Dos'), C: asset('Tres') };
    expect(validateAssignmentCardinality(selected, assignments).valid).toBe(true);
  });

  it('acepta todos los valores en parejas exactas (Memoria)', () => {
    const selected = cards('A', 'B', 'C', 'D');
    const assignments = { A: asset('Sol'), B: asset('Sol'), C: asset('Luna'), D: asset('Luna') };
    expect(validateAssignmentCardinality(selected, assignments).valid).toBe(true);
  });

  it('rechaza una distribución mixta (un valor repetido sin pareja)', () => {
    const selected = cards('A', 'B', 'C');
    const assignments = { A: asset('Vaca'), B: asset('Vaca'), C: asset('Cerdo') };
    const result = validateAssignmentCardinality(selected, assignments);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/una sola vez|parejas/i);
  });

  it('rechaza un valor que aparece 3 veces', () => {
    const selected = cards('A', 'B', 'C');
    const assignments = { A: asset('X'), B: asset('X'), C: asset('X') };
    expect(validateAssignmentCardinality(selected, assignments).valid).toBe(false);
  });

  it('ignora cartas sin recurso asignado al contar', () => {
    const selected = cards('A', 'B', 'C');
    const assignments = { A: asset('Uno'), B: asset('Dos') }; // C sin asignar
    // Uno x1, Dos x1 → todos únicos entre los asignados → válido
    expect(validateAssignmentCardinality(selected, assignments).valid).toBe(true);
  });
});
