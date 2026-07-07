/**
 * @fileoverview Tests unitarios dirigidos para systemAlertsValidator (T-942).
 *
 * Cubre la transform+pipe de `limit` (string→int 1..100 con default 20), los
 * defaults de status/days/reason, los refines de snooze (untilHours/Days/Date) y
 * bulk (action=snooze requiere ventana), y el rechazo strict de cada schema.
 */

const {
  systemAlertIdParamsSchema,
  listSystemAlertsQuerySchema,
  systemAlertsSummaryQuerySchema,
  systemAlertsEffectivenessQuerySchema,
  dismissSystemAlertBodySchema,
  snoozeSystemAlertBodySchema,
  bulkSystemAlertActionBodySchema
} = require('../../src/validators/systemAlertsValidator');

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_OBJECT_ID = '507f1f77bcf86cd799439012';

describe('systemAlertsValidator (unit)', () => {
  describe('systemAlertIdParamsSchema', () => {
    it('acepta ObjectId válido y rechaza basura', () => {
      expect(systemAlertIdParamsSchema.safeParse({ id: VALID_OBJECT_ID }).success).toBe(true);
      expect(systemAlertIdParamsSchema.safeParse({ id: 'bad' }).success).toBe(false);
    });
  });

  describe('listSystemAlertsQuerySchema', () => {
    it('aplica defaults status=active limit=20 con query vacía', () => {
      const result = listSystemAlertsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.status).toBe('active');
      expect(result.data.limit).toBe(20);
    });

    it('acepta status=all', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ status: 'all' }).success).toBe(true);
    });

    it('transforma limit="50" → 50', () => {
      const result = listSystemAlertsQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      expect(result.data.limit).toBe(50);
    });

    it('rechaza limit > 100 tras transform', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    });

    it('rechaza limit = 0 tras transform', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    });

    it('acepta severity/source/type del catálogo', () => {
      const result = listSystemAlertsQuerySchema.safeParse({
        severity: 'critical',
        source: 'redis',
        type: 'redis_high_latency'
      });
      expect(result.success).toBe(true);
    });

    it('rechaza source fuera del catálogo', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ source: 'kafka' }).success).toBe(false);
    });

    it('rechaza type fuera del catálogo', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ type: 'unknown_type' }).success).toBe(false);
    });

    it('acepta cursor ObjectId opcional', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ cursor: VALID_OBJECT_ID }).success).toBe(true);
    });

    it('rechaza cursor inválido', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ cursor: 'bad' }).success).toBe(false);
    });

    it('rechaza campos extra (strict)', () => {
      expect(listSystemAlertsQuerySchema.safeParse({ foo: 1 }).success).toBe(false);
    });
  });

  describe('systemAlertsSummaryQuerySchema', () => {
    it('acepta objeto vacío (default {})', () => {
      expect(systemAlertsSummaryQuerySchema.safeParse(undefined).success).toBe(true);
      expect(systemAlertsSummaryQuerySchema.safeParse({}).success).toBe(true);
    });

    it('rechaza cualquier parámetro (strict)', () => {
      expect(systemAlertsSummaryQuerySchema.safeParse({ x: 1 }).success).toBe(false);
    });
  });

  describe('systemAlertsEffectivenessQuerySchema (transform days)', () => {
    it('aplica default days=30 con query vacía', () => {
      const result = systemAlertsEffectivenessQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.days).toBe(30);
    });

    it('transforma days="7" → 7', () => {
      const result = systemAlertsEffectivenessQuerySchema.safeParse({ days: '7' });
      expect(result.success).toBe(true);
      expect(result.data.days).toBe(7);
    });

    it('rechaza days > 365', () => {
      expect(systemAlertsEffectivenessQuerySchema.safeParse({ days: '366' }).success).toBe(false);
    });

    it('rechaza days = 0', () => {
      expect(systemAlertsEffectivenessQuerySchema.safeParse({ days: '0' }).success).toBe(false);
    });
  });

  describe('dismissSystemAlertBodySchema', () => {
    it('aplica default reason=other con body vacío', () => {
      const result = dismissSystemAlertBodySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.reason).toBe('other');
    });

    it('acepta reason del catálogo', () => {
      expect(dismissSystemAlertBodySchema.safeParse({ reason: 'false_positive' }).success).toBe(
        true
      );
    });

    it('rechaza reason fuera del catálogo', () => {
      expect(dismissSystemAlertBodySchema.safeParse({ reason: 'porque-si' }).success).toBe(false);
    });
  });

  describe('snoozeSystemAlertBodySchema (refine ventana obligatoria)', () => {
    it('acepta untilHours válido', () => {
      expect(snoozeSystemAlertBodySchema.safeParse({ untilHours: 6 }).success).toBe(true);
    });

    it('acepta untilDays válido', () => {
      expect(snoozeSystemAlertBodySchema.safeParse({ untilDays: 3 }).success).toBe(true);
    });

    it('acepta untilDate ISO', () => {
      expect(
        snoozeSystemAlertBodySchema.safeParse({ untilDate: '2030-01-01T00:00:00.000Z' }).success
      ).toBe(true);
    });

    it('rechaza objeto vacío (refine: especifica ventana)', () => {
      const result = snoozeSystemAlertBodySchema.safeParse({});
      expect(result.success).toBe(false);
      expect(
        result.error.issues.some(i => /untilHours, untilDays o untilDate/.test(i.message))
      ).toBe(true);
    });

    it('rechaza untilHours > 72', () => {
      expect(snoozeSystemAlertBodySchema.safeParse({ untilHours: 73 }).success).toBe(false);
    });

    it('rechaza untilDays > 30', () => {
      expect(snoozeSystemAlertBodySchema.safeParse({ untilDays: 31 }).success).toBe(false);
    });

    it('rechaza untilDate no-ISO', () => {
      expect(snoozeSystemAlertBodySchema.safeParse({ untilDate: '2030-01-01' }).success).toBe(
        false
      );
    });
  });

  describe('bulkSystemAlertActionBodySchema (refine snooze)', () => {
    it('acepta action=dismiss con ids', () => {
      const result = bulkSystemAlertActionBodySchema.safeParse({
        ids: [VALID_OBJECT_ID, OTHER_OBJECT_ID],
        action: 'dismiss'
      });
      expect(result.success).toBe(true);
    });

    it('acepta action=resolve', () => {
      expect(
        bulkSystemAlertActionBodySchema.safeParse({ ids: [VALID_OBJECT_ID], action: 'resolve' })
          .success
      ).toBe(true);
    });

    it('acepta action=snooze con untilHours', () => {
      expect(
        bulkSystemAlertActionBodySchema.safeParse({
          ids: [VALID_OBJECT_ID],
          action: 'snooze',
          untilHours: 6
        }).success
      ).toBe(true);
    });

    it('rechaza action=snooze SIN ventana (refine)', () => {
      const result = bulkSystemAlertActionBodySchema.safeParse({
        ids: [VALID_OBJECT_ID],
        action: 'snooze'
      });
      expect(result.success).toBe(false);
      expect(result.error.issues.some(i => /snooze requiere/.test(i.message))).toBe(true);
    });

    it('rechaza ids vacío (min 1)', () => {
      expect(
        bulkSystemAlertActionBodySchema.safeParse({ ids: [], action: 'dismiss' }).success
      ).toBe(false);
    });

    it('rechaza más de 100 ids', () => {
      const ids = Array.from({ length: 101 }, () => VALID_OBJECT_ID);
      expect(bulkSystemAlertActionBodySchema.safeParse({ ids, action: 'dismiss' }).success).toBe(
        false
      );
    });

    it('rechaza ids con ObjectId inválido', () => {
      expect(
        bulkSystemAlertActionBodySchema.safeParse({ ids: ['bad'], action: 'dismiss' }).success
      ).toBe(false);
    });

    it('rechaza action fuera del enum', () => {
      expect(
        bulkSystemAlertActionBodySchema.safeParse({ ids: [VALID_OBJECT_ID], action: 'nuke' })
          .success
      ).toBe(false);
    });
  });
});
