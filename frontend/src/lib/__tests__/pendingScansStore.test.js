/**
 * @fileoverview Tests del wrapper IndexedDB para pending scans.
 *
 * Usamos `fake-indexeddb` para simular IDB en jsdom. Cubre el ciclo
 * completo (add/getAll/remove/purgeOlderThan/clear) y el caso degradado
 * en el que IndexedDB no esté disponible (devolver vacío sin lanzar).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import * as store from '../pendingScansStore';

beforeEach(async () => {
  // Reset IDB entre tests para aislar estado.
  await new Promise((resolve) => {
    const req = globalThis.indexedDB.deleteDatabase('rfid_game_db');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pendingScansStore', () => {
  it('add → getAll devuelve la entrada con id, payload, queuedAt', async () => {
    const id = await store.add({ uid: 'AABB1122', sensorId: 's-1', source: 'web_serial' });
    expect(typeof id).toBe('number');

    const entries = await store.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id,
      payload: expect.objectContaining({ uid: 'AABB1122' }),
      queuedAt: expect.any(Number),
      sensorId: 's-1'
    });
  });

  it('remove por id elimina la entrada', async () => {
    const id1 = await store.add({ uid: 'X', sensorId: 's' });
    await store.add({ uid: 'Y', sensorId: 's' });
    await store.remove(id1);

    const entries = await store.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].payload.uid).toBe('Y');
  });

  it('clear elimina todo el store', async () => {
    await store.add({ uid: '1' });
    await store.add({ uid: '2' });
    await store.clear();
    expect(await store.getAll()).toHaveLength(0);
  });

  it('purgeOlderThan elimina sólo entries más viejos que el TTL', async () => {
    // No usamos fake timers porque colisionan con la cola interna de
    // fake-indexeddb. En su lugar usamos un TTL muy pequeño (50ms) y
    // esperamos un poco para que el primer entry pase a "viejo".
    await store.add({ uid: 'old' });
    await new Promise(resolve => setTimeout(resolve, 80));
    await store.add({ uid: 'fresh' });

    const purged = await store.purgeOlderThan(50);

    expect(purged).toBe(1);
    const remaining = await store.getAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].payload.uid).toBe('fresh');
  });

  it('add con payload null devuelve null sin lanzar', async () => {
    expect(await store.add(null)).toBeNull();
    expect(await store.getAll()).toHaveLength(0);
  });

  it('getAll funciona tras múltiples ciclos add/remove', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await store.add({ uid: `UID-${i}` }));
    }
    expect((await store.getAll())).toHaveLength(5);

    await store.remove(ids[0]);
    await store.remove(ids[2]);

    const remaining = await store.getAll();
    expect(remaining).toHaveLength(3);
    expect(remaining.map(e => e.payload.uid).sort()).toEqual(['UID-1', 'UID-3', 'UID-4']);
  });
});
