/**
 * @fileoverview Tests del módulo sessionSnapshot (sessionStorage TTL 10min).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
  purgeExpiredSnapshots,
  __test__
} from '../sessionSnapshot';

describe('sessionSnapshot', () => {
  beforeEach(() => {
    globalThis.sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T10:00:00Z').getTime());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('save/load roundtrip preserva el estado', () => {
    const state = { score: 42, currentRound: 3, challenge: { uid: 'AAA' } };
    expect(saveSnapshot('play-1', state)).toBe(true);

    const loaded = loadSnapshot('play-1');
    expect(loaded).toEqual(state);
  });

  it('load devuelve null si no hay snapshot', () => {
    expect(loadSnapshot('play-nonexistent')).toBeNull();
  });

  it('load devuelve null y borra entrada cuando ha expirado el TTL', () => {
    saveSnapshot('play-stale', { score: 10 });
    vi.advanceTimersByTime(__test__.SNAPSHOT_TTL_MS + 1_000);

    expect(loadSnapshot('play-stale')).toBeNull();
    expect(globalThis.sessionStorage.getItem(`${__test__.KEY_PREFIX}play-stale`)).toBeNull();
  });

  it('clearSnapshot elimina el snapshot de una partida', () => {
    saveSnapshot('play-2', { score: 5 });
    clearSnapshot('play-2');
    expect(loadSnapshot('play-2')).toBeNull();
  });

  it('save sobreescribe el snapshot anterior', () => {
    saveSnapshot('play-3', { score: 1 });
    saveSnapshot('play-3', { score: 2 });
    expect(loadSnapshot('play-3')).toEqual({ score: 2 });
  });

  it('save sin playId o state es no-op silencioso', () => {
    expect(saveSnapshot(null, { score: 1 })).toBe(false);
    expect(saveSnapshot('play-x', null)).toBe(false);
    expect(loadSnapshot('play-x')).toBeNull();
  });

  it('rechaza snapshots con schemaVersion incorrecta', () => {
    globalThis.sessionStorage.setItem(
      `${__test__.KEY_PREFIX}play-bad`,
      JSON.stringify({ schemaVersion: 999, state: { score: 1 }, savedAt: Date.now() })
    );
    expect(loadSnapshot('play-bad')).toBeNull();
  });

  it('rechaza snapshots con JSON corrupto sin lanzar', () => {
    globalThis.sessionStorage.setItem(`${__test__.KEY_PREFIX}play-corrupt`, '{not-json');
    expect(() => loadSnapshot('play-corrupt')).not.toThrow();
    expect(loadSnapshot('play-corrupt')).toBeNull();
  });

  it('purgeExpiredSnapshots elimina snapshots vencidos y conserva los válidos', () => {
    saveSnapshot('play-fresh', { score: 1 });
    saveSnapshot('play-old', { score: 2 });

    // Avanzar para que play-old caduque pero refrescamos play-fresh.
    vi.advanceTimersByTime(__test__.SNAPSHOT_TTL_MS - 60_000);
    saveSnapshot('play-fresh', { score: 100 }); // refresh
    vi.advanceTimersByTime(2 * 60_000); // play-old definitivamente expirado

    const purged = purgeExpiredSnapshots();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(loadSnapshot('play-fresh')).toEqual({ score: 100 });
    expect(loadSnapshot('play-old')).toBeNull();
  });
});
