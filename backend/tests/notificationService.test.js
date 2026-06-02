/**
 * @fileoverview Tests de integración para notificationService (T-955).
 * Usa la BD test (ya conectada en tests/setup.js) y Redis mock vía
 * ioredis-mock. Cubre createNotification con dedup, listForUser cursor,
 * markRead, markAllRead, countUnread y manejo de errores defensivo.
 */

const mongoose = require('mongoose');
const Notification = require('../src/models/Notification');
const notificationService = require('../src/services/notificationService');
const { getRedis } = require('../src/config/redis');

/**
 * Genera ObjectIds aislados por test para que las suites no se pisen y
 * la dedup window por usuario no afecte a otros tests del archivo.
 */
const genId = () => new mongoose.Types.ObjectId().toString();

describe('notificationService (integración)', () => {
  beforeEach(async () => {
    await Notification.deleteMany({});
    // Limpiar dedup keys del Redis mock para que cada test arranque limpio.
    try {
      const redis = getRedis();
      if (redis) {
        const keys = await redis.keys('*notif:dedup*');
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }
    } catch {
      // Redis mock sin conexión — no es necesario limpiar.
    }
    notificationService.setSocketServer(null);
  });

  afterAll(async () => {
    await Notification.deleteMany({});
  });

  describe('createNotification', () => {
    it('persiste la notificación y devuelve un DTO V1 válido', async () => {
      const userId = genId();
      const dto = await notificationService.createNotification({
        userId,
        type: 'play_completed',
        title: 'Maria ha completado',
        body: '3 estrellas',
        link: `/sessions/${genId()}`,
        metadata: { score: 80 }
      });

      expect(dto).toMatchObject({
        type: 'play_completed',
        title: 'Maria ha completado',
        body: '3 estrellas',
        read: false
      });
      expect(dto.id).toBeDefined();
      expect(dto.createdAt).toBeInstanceOf(Date);

      const inDb = await Notification.findById(dto.id);
      expect(inDb).toBeTruthy();
      expect(inDb.userId.toString()).toBe(userId);
    });

    it('genera dedup keys estables (mismo input → misma key)', async () => {
      const userId = genId();
      const k1 = notificationService._internals.buildDedupKey(userId, 'play_completed', {
        resourceId: 'play-abc'
      });
      const k2 = notificationService._internals.buildDedupKey(userId, 'play_completed', {
        resourceId: 'play-abc'
      });
      const k3 = notificationService._internals.buildDedupKey(userId, 'play_completed', {
        resourceId: 'play-xyz'
      });
      expect(k1).toBe(k2);
      expect(k1).not.toBe(k3);
      // eslint-disable-next-line security/detect-non-literal-regexp -- userId generado en el test (genId), no es entrada externa
      expect(k1).toMatch(new RegExp(`^${userId}:play_completed:`));
    });

    it('permite notificar el mismo tipo a usuarios distintos sin colisión de dedup', async () => {
      const userA = genId();
      const userB = genId();
      const a = await notificationService.createNotification({
        userId: userA,
        type: 'context_shared',
        title: 'Nuevo contexto',
        metadata: { resourceId: 'ctx-1' }
      });
      const b = await notificationService.createNotification({
        userId: userB,
        type: 'context_shared',
        title: 'Nuevo contexto',
        metadata: { resourceId: 'ctx-1' }
      });
      expect(a).not.toBeNull();
      expect(b).not.toBeNull();
      expect(a.id).not.toBe(b.id);
    });

    it('emite el evento Socket.IO al room user_<id> cuando hay server inyectado', async () => {
      const emit = jest.fn();
      const to = jest.fn(() => ({ emit }));
      notificationService.setSocketServer({ to });

      const userId = genId();
      await notificationService.createNotification({
        userId,
        type: 'registration_pending',
        title: 'Solicitud pendiente'
      });

      expect(to).toHaveBeenCalledWith(`user_${userId}`);
      expect(emit).toHaveBeenCalledWith(
        'notification:created',
        expect.objectContaining({ type: 'registration_pending' })
      );
    });

    it('valida campos obligatorios', async () => {
      await expect(
        notificationService.createNotification({ type: 'play_completed', title: 'X' })
      ).rejects.toThrow();
      await expect(
        notificationService.createNotification({ userId: genId(), title: 'X' })
      ).rejects.toThrow();
      await expect(
        notificationService.createNotification({ userId: genId(), type: 'play_completed' })
      ).rejects.toThrow();
    });
  });

  describe('listForUser', () => {
    it('devuelve items recientes primero con cursor cuando hay más página', async () => {
      const userId = genId();
      // Creamos 25 notificaciones con createdAt sintéticos para forzar el orden.
      for (let i = 0; i < 25; i++) {
        await Notification.create({
          userId,
          type: 'play_completed',
          title: `Notif ${i}`,
          createdAt: new Date(2026, 0, 25 - i)
        });
      }

      const page1 = await notificationService.listForUser(userId, { limit: 20 });
      expect(page1.items).toHaveLength(20);
      expect(page1.nextCursor).toBeTruthy();
      expect(page1.items[0].title).toBe('Notif 0'); // el más reciente

      const page2 = await notificationService.listForUser(userId, {
        limit: 20,
        before: page1.nextCursor
      });
      expect(page2.items).toHaveLength(5);
      expect(page2.nextCursor).toBeNull();
    });

    it('devuelve nextCursor null cuando la página completa cabe en un sólo lote', async () => {
      const userId = genId();
      await Notification.create({
        userId,
        type: 'context_shared',
        title: 'Único'
      });

      const result = await notificationService.listForUser(userId, { limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('countUnread y markRead', () => {
    it('cuenta no leídas y se reduce al marcar una', async () => {
      const userId = genId();
      const a = await Notification.create({
        userId,
        type: 'play_completed',
        title: 'A'
      });
      await Notification.create({ userId, type: 'context_shared', title: 'B' });

      let count = await notificationService.countUnread(userId);
      expect(count).toBe(2);

      await notificationService.markRead(userId, a._id.toString());

      count = await notificationService.countUnread(userId);
      expect(count).toBe(1);
    });

    it('markRead lanza si la notificación pertenece a otro usuario', async () => {
      const userId = genId();
      const otherUserId = genId();
      const notif = await Notification.create({
        userId: otherUserId,
        type: 'play_completed',
        title: 'No mía'
      });
      await expect(notificationService.markRead(userId, notif._id.toString())).rejects.toThrow();
    });

    it('markAllRead marca todas las del usuario sin tocar las de otros', async () => {
      const userId = genId();
      const otherUserId = genId();
      await Notification.create({ userId, type: 'play_completed', title: 'A' });
      await Notification.create({ userId, type: 'context_shared', title: 'B' });
      await Notification.create({ userId: otherUserId, type: 'play_completed', title: 'C' });

      const { modified } = await notificationService.markAllRead(userId);
      expect(modified).toBe(2);

      const otherUnread = await Notification.countDocuments({ userId: otherUserId, read: false });
      expect(otherUnread).toBe(1);
    });
  });

  describe('notify (helper interno)', () => {
    it('silencia errores y devuelve null para no bloquear flujos de dominio', async () => {
      // Forzamos error pasando un userId inválido (no ObjectId).
      const result = await notificationService.notify({
        userId: 'no-es-un-objectid',
        type: 'play_completed',
        title: 'X'
      });
      // Mongoose rechazará el cast; notify() lo captura y devuelve null.
      expect(result).toBeNull();
    });
  });
});
