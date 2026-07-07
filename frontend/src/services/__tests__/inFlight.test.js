/**
 * Tests para D.2 — inFlight dedupRequest helper.
 *
 * Cubre:
 *   - Dos callers con la misma key reciben la misma promesa
 *   - Tras settle, la siguiente invocación dispara fetch nuevo
 *   - Reject también limpia la entrada (no "envenena" futuras)
 *   - Keys distintas no se mezclan
 *   - getInFlightKeys reporta el estado actual
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dedupRequest, getInFlightKeys, __clearInFlightForTests } from '../inFlight';

describe('inFlight.dedupRequest', () => {
  beforeEach(() => {
    __clearInFlightForTests();
  });

  it('dos callers con la misma key reciben la misma promesa (1 sola ejecución)', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data-A');
    const p1 = dedupRequest('key-A', fetchFn);
    const p2 = dedupRequest('key-A', fetchFn);
    expect(p1).toBe(p2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(await p1).toBe('data-A');
    expect(await p2).toBe('data-A');
  });

  it('keys distintas resultan en fetches separados', async () => {
    const fetchA = vi.fn().mockResolvedValue('A');
    const fetchB = vi.fn().mockResolvedValue('B');
    const [a, b] = await Promise.all([
      dedupRequest('A', fetchA),
      dedupRequest('B', fetchB)
    ]);
    expect(a).toBe('A');
    expect(b).toBe('B');
    expect(fetchA).toHaveBeenCalledTimes(1);
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('tras resolve, la siguiente llamada dispara fetch nuevo', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    await dedupRequest('key', fetchFn);
    await dedupRequest('key', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('tras reject, la siguiente llamada también dispara fetch nuevo (no envenenamiento)', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    await expect(dedupRequest('key', fetchFn)).rejects.toThrow('fail');
    const result = await dedupRequest('key', fetchFn);
    expect(result).toBe('success');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('getInFlightKeys refleja el estado actual', async () => {
    const fetchFn = vi.fn(() => new Promise(resolve => setTimeout(() => resolve('done'), 50)));
    const p = dedupRequest('active-key', fetchFn);
    // Mientras está en vuelo, aparece en la lista
    expect(getInFlightKeys()).toContain('active-key');
    await p;
    // Tras settle, ya no
    expect(getInFlightKeys()).not.toContain('active-key');
  });

  it('__clearInFlightForTests limpia el Map', () => {
    const fetchFn = vi.fn(() => new Promise(() => {}));
    dedupRequest('some-key', fetchFn);
    expect(getInFlightKeys().length).toBeGreaterThan(0);
    __clearInFlightForTests();
    expect(getInFlightKeys().length).toBe(0);
  });
});
