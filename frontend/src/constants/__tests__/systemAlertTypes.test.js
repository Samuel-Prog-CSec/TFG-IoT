/**
 * @fileoverview Tests de las constantes de SystemAlerts en el frontend (T-942).
 */

import { describe, it, expect } from 'vitest';
import {
  SYSTEM_ALERT_TYPE_ICONS,
  SYSTEM_ALERT_TYPE_LABELS,
  SYSTEM_ALERT_SOURCES,
  SOURCE_STYLES,
  SEVERITY_STYLES,
  STATUS_STYLES,
  ANNOUNCEMENT_SEVERITY_STYLES,
  ANNOUNCEMENT_SEVERITIES,
  SYSTEM_SNOOZE_PRESETS_HOURS
} from '../systemAlertTypes';

describe('systemAlertTypes (T-942)', () => {
  const expectedTypes = [
    'redis_high_latency',
    'mongo_disconnected',
    'memory_pressure',
    'queue_backlog',
    'account_lockout_spike',
    'auth_failed_spike',
    'token_theft_detected',
    'pending_teachers_aging',
    'inactive_teachers',
    'context_without_assets',
    'data_retention_lag',
    'consent_withdrawal_spike'
  ];

  it('tiene icono y label para los 12 tipos canónicos', () => {
    for (const type of expectedTypes) {
      expect(SYSTEM_ALERT_TYPE_ICONS[type]).toBeDefined();
      expect(SYSTEM_ALERT_TYPE_LABELS[type]).toEqual(expect.any(String));
    }
  });

  it('reexporta SEVERITY_STYLES y STATUS_STYLES con las 3/4 claves esperadas', () => {
    expect(Object.keys(SEVERITY_STYLES)).toEqual(
      expect.arrayContaining(['critical', 'warning', 'info'])
    );
    expect(Object.keys(STATUS_STYLES)).toEqual(
      expect.arrayContaining(['active', 'resolved', 'dismissed', 'snoozed'])
    );
  });

  it('cada SOURCE tiene un estilo definido', () => {
    for (const src of SYSTEM_ALERT_SOURCES) {
      expect(SOURCE_STYLES[src]).toBeDefined();
      expect(SOURCE_STYLES[src].badge).toEqual(expect.any(String));
      expect(SOURCE_STYLES[src].label).toEqual(expect.any(String));
    }
  });

  it('ANNOUNCEMENT_SEVERITIES incluye info/warning/urgent y todos tienen estilo', () => {
    expect(ANNOUNCEMENT_SEVERITIES).toEqual(['info', 'warning', 'urgent']);
    for (const sev of ANNOUNCEMENT_SEVERITIES) {
      expect(ANNOUNCEMENT_SEVERITY_STYLES[sev]).toBeDefined();
    }
  });

  it('presets de snooze son positivos y crecientes', () => {
    expect(SYSTEM_SNOOZE_PRESETS_HOURS.length).toBeGreaterThan(0);
    for (let i = 1; i < SYSTEM_SNOOZE_PRESETS_HOURS.length; i += 1) {
      expect(SYSTEM_SNOOZE_PRESETS_HOURS[i]).toBeGreaterThan(
        SYSTEM_SNOOZE_PRESETS_HOURS[i - 1]
      );
    }
  });
});
