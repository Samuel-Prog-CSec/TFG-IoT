/**
 * @fileoverview Tests del catálogo de constantes de alertas (T-941).
 */

import { describe, it, expect } from 'vitest';
import {
  ALERT_TYPE_ICONS,
  ALERT_TYPE_LABELS,
  SEVERITY_STYLES,
  STATUS_STYLES,
  STATUS_ORDER,
  DISMISS_REASONS,
  SNOOZE_PRESETS_DAYS,
  PIN_ICON
} from '../alertTypes';

describe('alertTypes — catálogo (T-941)', () => {
  it('tiene exactamente 13 tipos catalogados (6 originales + 7 nuevos)', () => {
    expect(Object.keys(ALERT_TYPE_LABELS)).toHaveLength(13);
    expect(Object.keys(ALERT_TYPE_ICONS)).toHaveLength(13);
  });

  it('cada tipo tiene icono y label correspondiente', () => {
    for (const key of Object.keys(ALERT_TYPE_LABELS)) {
      expect(ALERT_TYPE_ICONS).toHaveProperty(key);
      expect(typeof ALERT_TYPE_LABELS[key]).toBe('string');
      expect(ALERT_TYPE_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('incluye los detectores nuevos T-941', () => {
    const keys = Object.keys(ALERT_TYPE_LABELS);
    expect(keys).toContain('plateau_detected');
    expect(keys).toContain('engagement_drop');
    expect(keys).toContain('recovery_after_drop');
    expect(keys).toContain('mastery_milestone');
    expect(keys).toContain('mechanic_specific_struggle');
    expect(keys).toContain('sequence_stagnation');
    expect(keys).toContain('sequence_order_errors');
  });

  it('SEVERITY_STYLES cubre critical/warning/info', () => {
    expect(SEVERITY_STYLES).toHaveProperty('critical');
    expect(SEVERITY_STYLES).toHaveProperty('warning');
    expect(SEVERITY_STYLES).toHaveProperty('info');
    for (const style of Object.values(SEVERITY_STYLES)) {
      expect(style).toHaveProperty('dot');
      expect(style).toHaveProperty('bg');
      expect(style).toHaveProperty('label');
      expect(style).toHaveProperty('Icon');
    }
  });

  it('STATUS_STYLES cubre los 4 estados del lifecycle', () => {
    expect(STATUS_STYLES).toHaveProperty('active');
    expect(STATUS_STYLES).toHaveProperty('resolved');
    expect(STATUS_STYLES).toHaveProperty('dismissed');
    expect(STATUS_STYLES).toHaveProperty('snoozed');
  });

  it('STATUS_ORDER mantiene un orden estable', () => {
    expect(STATUS_ORDER).toEqual(['active', 'snoozed', 'resolved', 'dismissed']);
  });

  it('DISMISS_REASONS incluye los 4 motivos válidos', () => {
    const values = DISMISS_REASONS.map(r => r.value);
    expect(values).toContain('false_positive');
    expect(values).toContain('already_addressed');
    expect(values).toContain('irrelevant');
    expect(values).toContain('other');
  });

  it('SNOOZE_PRESETS_DAYS son enteros ordenados ascendente', () => {
    const days = [...SNOOZE_PRESETS_DAYS];
    expect(days).toEqual([...days].sort((a, b) => a - b));
    for (const d of days) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    }
  });

  it('PIN_ICON es un componente Lucide importable', () => {
    expect(PIN_ICON).toBeDefined();
    expect(typeof PIN_ICON).toBe('object'); // forwardRef object en Lucide
  });
});
