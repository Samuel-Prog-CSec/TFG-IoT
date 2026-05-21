/**
 * @fileoverview Tests de la configuración del sistema de SystemAlerts (T-942).
 *
 * Garantiza que el catálogo de tipos es consistente y que las claves
 * exportadas se mantienen al añadir nuevos detectores.
 */

const config = require('../../../src/config/systemAlerts');
const { ALL_SYSTEM_DETECTORS } = require('../../../src/services/analytics/systemDetectors');

describe('systemAlerts config (T-942)', () => {
  it('expone 16 tipos canónicos', () => {
    expect(config.SYSTEM_ALERT_TYPE_KEYS).toHaveLength(16);
  });

  it('incluye los 4 detectores free-tier (T-910)', () => {
    expect(config.SYSTEM_ALERT_TYPE_KEYS).toEqual(
      expect.arrayContaining([
        'upstash_commands_quota',
        'atlas_storage_quota',
        'rate_limit_store_fallback',
        'in_memory_cache_low_hit'
      ])
    );
  });

  it('cada tipo tiene label, source, thresholds y direction', () => {
    for (const key of config.SYSTEM_ALERT_TYPE_KEYS) {
      const entry = config.SYSTEM_ALERT_TYPES[key];
      expect(entry).toBeDefined();
      expect(entry.label).toEqual(expect.any(String));
      expect(entry.source).toEqual(expect.any(String));
      expect(entry.thresholds).toEqual(expect.any(Object));
      expect(entry.direction).toEqual(expect.any(String));
    }
  });

  it('cada detector registrado tiene una entrada en SYSTEM_ALERT_TYPES', () => {
    for (const detector of ALL_SYSTEM_DETECTORS) {
      expect(config.SYSTEM_ALERT_TYPE_KEYS).toContain(detector.type);
    }
  });

  it('cada source del catálogo está en SYSTEM_ALERT_SOURCES', () => {
    for (const key of config.SYSTEM_ALERT_TYPE_KEYS) {
      expect(config.SYSTEM_ALERT_SOURCES).toContain(config.SYSTEM_ALERT_TYPES[key].source);
    }
  });

  it('SYSTEM_DETECTION_CONFIG tiene valores numéricos positivos para escalas', () => {
    const cfg = config.SYSTEM_DETECTION_CONFIG;
    expect(cfg.autoResolveAfterMissedRuns).toBeGreaterThanOrEqual(1);
    expect(cfg.escalateWarningAfterHours).toBeGreaterThan(0);
    expect(cfg.escalateMinOccurrences).toBeGreaterThanOrEqual(1);
    expect(cfg.reopenAfterHours).toBeGreaterThan(0);
    expect(cfg.hardDeleteAfterDays).toBeGreaterThan(0);
    expect(cfg.maxPinned).toBeGreaterThanOrEqual(1);
    expect(cfg.cacheTtlSeconds).toBeGreaterThanOrEqual(1);
  });

  it('SYSTEM_ANNOUNCEMENT_CONFIG declara severities/audiences correctas', () => {
    expect(config.SYSTEM_ANNOUNCEMENT_CONFIG.severities).toEqual(['info', 'warning', 'urgent']);
    expect(config.SYSTEM_ANNOUNCEMENT_CONFIG.audiences).toEqual(['all_teachers', 'all_users']);
    expect(config.SYSTEM_ANNOUNCEMENT_CONFIG.maxActive).toBeGreaterThanOrEqual(1);
  });
});
