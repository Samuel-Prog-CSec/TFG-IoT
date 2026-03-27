/**
 * @fileoverview Tests unitarios para escapeRegex.
 * Verifica que todos los caracteres especiales de RegExp se escapan correctamente (prevención ReDoS).
 */

const { escapeRegex } = require('../src/utils/escapeRegex');

describe('escapeRegex', () => {
  it('escapes all RegExp special characters', () => {
    const input = '.*+?^${}()|[]\\';
    const escaped = escapeRegex(input);

    // eslint-disable-next-line security/detect-non-literal-regexp -- testing escaped output is safe for RegExp
    expect(() => new RegExp(escaped)).not.toThrow();
    expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('does not modify strings without special characters', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
    expect(escapeRegex('abc123')).toBe('abc123');
  });

  it('returns empty string for non-string input', () => {
    expect(escapeRegex(undefined)).toBe('');
    expect(escapeRegex(null)).toBe('');
    expect(escapeRegex(42)).toBe('');
    expect(escapeRegex({})).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('handles mixed normal and special characters', () => {
    const input = 'user.name (test)';
    const escaped = escapeRegex(input);

    expect(escaped).toBe('user\\.name \\(test\\)');
  });

  it('produces a safe RegExp that matches the literal input', () => {
    const dangerous = 'price is $100.00 (USD)';
    const escaped = escapeRegex(dangerous);
    // eslint-disable-next-line security/detect-non-literal-regexp -- testing escaped output is safe for RegExp
    const regex = new RegExp(escaped);

    expect(regex.test(dangerous)).toBe(true);
    expect(regex.test('price is X100Y00 ZUSD ')).toBe(false);
  });
});
