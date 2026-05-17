/**
 * @fileoverview Tests del helper isSafeRedirectPath (T-905 B6).
 *
 * Verifica defensa contra open redirect en redirectByRole.
 */

import { describe, it, expect } from 'vitest';
import { isSafeRedirectPath } from '../routes';

describe('isSafeRedirectPath (B6)', () => {
  describe('rutas válidas internas', () => {
    it.each([
      '/dashboard',
      '/dashboard?tab=overview',
      '/create-session',
      '/board-setup/abc123',
      '/game/xyz',
      '/sessions',
      '/sessions/abc',
      '/contexts',
      '/decks',
      '/decks/new',
      '/analytics/students',
      '/admin/approvals',
      '/admin/students/transfer',
      '/privacy'
    ])('acepta %s', path => {
      expect(isSafeRedirectPath(path)).toBe(true);
    });
  });

  describe('open redirect attacks (rechazadas)', () => {
    it.each([
      '//evil.com',
      '//evil.com/path',
      'https://evil.com',
      'http://evil.example/dashboard',  
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox',
      'about:blank',
      '\\\\evil.com',
      '/login',
      '/register',
      'relative/path',
      ''
    ])('rechaza "%s"', path => {
      expect(isSafeRedirectPath(path)).toBe(false);
    });
  });

  describe('input no-string', () => {
    it.each([null, undefined, 0, false, [], {}, true])('rechaza %p', value => {
      expect(isSafeRedirectPath(value)).toBe(false);
    });
  });
});
