/**
 * @fileoverview Tests unitarios dirigidos para alertsValidator (T-941, alertas
 * pedagógicas del docente).
 *
 * Cubre la transform+pipe de `limit`, los defaults de status/days/reason, los
 * filtros (severity/type/studentId/period/cursor), y los refines de snooze
 * (untilDays/untilDate) y bulk (action=snooze requiere ventana — variante de
 * días, sin untilHours a diferencia de las alertas de sistema).
 */

const {
  alertIdParamsSchema,
  listAlertsQuerySchema,
  alertsSummaryQuerySchema,
  alertsEffectivenessQuerySchema,
  dismissAlertBodySchema,
  snoozeAlertBodySchema,
  bulkAlertActionBodySchema
} = require('../../src/validators/alertsValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('alertsValidator (unit)', () => {
  describe('alertIdParamsSchema', () => {
    it('acepta ObjectId válido y rechaza basura', () => {
      expect(alertIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(alertIdParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });
  });

  describe('listAlertsQuerySchema', () => {
    it('aplica defaults status=active limit=20', () => {
      const result = listAlertsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.limit).toBe(20);
    });

    it('acepta status=all y filtros válidos', () => {
      const result = listAlertsQuerySchema.safeParse({
        status: 'all',
        severity: 'warning',
        type: 'declining_performance',
        studentId: VALID_OBJECT_ID,
        period: '30d',
        cursor: VALID_OBJECT_ID
      });
      expect(result.success).toBe(true);
    });

    it('transforma limit="100" → 100', () => {
      const result = listAlertsQuerySchema.safeParse({ limit: '100' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(100);
    });

    it('rechaza limit > 100', () => {
      expect(listAlertsQuerySchema.safeParse({ limit: '200' }).success).toBe(false);
    });

    it('rechaza type fuera del catálogo', () => {
      expect(listAlertsQuerySchema.safeParse({ type: 'made_up' }).success).toBe(false);
    });

    it('rechaza period fuera del enum', () => {
      expect(listAlertsQuerySchema.safeParse({ period: '1y' }).success).toBe(false);
    });

    it('acepta period=all', () => {
      expect(listAlertsQuerySchema.safeParse({ period: 'all' }).success).toBe(true);
    });

    it('rechaza studentId inválido', () => {
      expect(listAlertsQuerySchema.safeParse({ studentId: 'bad' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(listAlertsQuerySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });

  describe('alertsSummaryQuerySchema', () => {
    it('acepta vacío (default {}) y rechaza params (strict)', () => {
      expect(alertsSummaryQuerySchema.safeParse({}).success).toBe(true);
      expect(alertsSummaryQuerySchema.safeParse({ x: 1 }).success).toBe(false);
    });
  });

  describe('alertsEffectivenessQuerySchema (transform days)', () => {
    it('aplica default days=30', () => {
      const result = alertsEffectivenessQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.days).toBe(30);
    });

    it('transforma days="90" → 90', () => {
      const result = alertsEffectivenessQuerySchema.safeParse({ days: '90' });
      expect(result.success).toBe(true);
      expect(result.data.days).toBe(90);
    });

    it('rechaza days > 365 y days = 0', () => {
      expect(alertsEffectivenessQuerySchema.safeParse({ days: '366' }).success).toBe(false);
      expect(alertsEffectivenessQuerySchema.safeParse({ days: '0' }).success).toBe(false);
    });
  });

  describe('dismissAlertBodySchema', () => {
    it('aplica default reason=other', () => {
      const result = dismissAlertBodySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('other');
    });

    it('acepta reason del catálogo y rechaza fuera', () => {
      expect(dismissAlertBodySchema.safeParse({ reason: 'irrelevant' }).success).toBe(true);
      expect(dismissAlertBodySchema.safeParse({ reason: 'whatever' }).success).toBe(false);
    });
  });

  describe('snoozeAlertBodySchema (refine ventana en días)', () => {
    it('acepta untilDays', () => {
      expect(snoozeAlertBodySchema.safeParse({ untilDays: 7 }).success).toBe(true);
    });

    it('acepta untilDate ISO', () => {
      expect(
        snoozeAlertBodySchema.safeParse({ untilDate: '2030-01-01T00:00:00.000Z' }).success
      ).toBe(true);
    });

    it('rechaza objeto vacío (refine)', () => {
      const result = snoozeAlertBodySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /untilDays o untilDate/.test(i.message))).toBe(true);
    });

    it('rechaza untilHours (no soportado en alertas pedagógicas, strict)', () => {
      expect(snoozeAlertBodySchema.safeParse({ untilHours: 6 }).success).toBe(false);
    });

    it('rechaza untilDays > 30', () => {
      expect(snoozeAlertBodySchema.safeParse({ untilDays: 31 }).success).toBe(false);
    });
  });

  describe('bulkAlertActionBodySchema (refine snooze)', () => {
    it('acepta dismiss/resolve y snooze con untilDays', () => {
      expect(
        bulkAlertActionBodySchema.safeParse({ ids: [VALID_OBJECT_ID], action: 'dismiss' }).success
      ).toBe(true);
      expect(
        bulkAlertActionBodySchema.safeParse({ ids: [VALID_OBJECT_ID], action: 'resolve' }).success
      ).toBe(true);
      expect(
        bulkAlertActionBodySchema.safeParse({
          ids: [VALID_OBJECT_ID],
          action: 'snooze',
          untilDays: 7
        }).success
      ).toBe(true);
    });

    it('rechaza snooze sin ventana (refine)', () => {
      const result = bulkAlertActionBodySchema.safeParse({
        ids: [VALID_OBJECT_ID],
        action: 'snooze'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /snooze requiere/.test(i.message))).toBe(true);
    });

    it('rechaza ids vacío y >100', () => {
      expect(bulkAlertActionBodySchema.safeParse({ ids: [], action: 'dismiss' }).success).toBe(
        false
      );
      const ids = Array.from({ length: 101 }, () => VALID_OBJECT_ID);
      expect(bulkAlertActionBodySchema.safeParse({ ids, action: 'dismiss' }).success).toBe(false);
    });

    it('rechaza action desconocida', () => {
      expect(
        bulkAlertActionBodySchema.safeParse({ ids: [VALID_OBJECT_ID], action: 'explode' }).success
      ).toBe(false);
    });
  });
});
