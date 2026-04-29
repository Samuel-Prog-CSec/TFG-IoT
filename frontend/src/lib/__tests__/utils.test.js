import { describe, it, expect, vi, afterEach } from 'vitest';
import { cn, formatNumber, formatTime, calculateStars, delay, downloadBlob } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges Tailwind classes correctly', () => {
      const result = cn('px-4 py-2', 'px-6');
      expect(result).toContain('px-6');
      expect(result).not.toContain('px-4');
    });

    it('handles undefined and null inputs', () => {
      expect(() => cn(undefined, null, false, 'text-sm')).not.toThrow();
      expect(cn(undefined, 'text-sm')).toBe('text-sm');
    });

    it('handles conditional classes', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active');
      expect(result).toContain('active');
    });
  });

  describe('formatNumber', () => {
    it('formats number using toLocaleString', () => {
      const result = formatNumber(1000);
      // Node/jsdom may not have full es-ES locale; just verify it returns a string
      expect(typeof result).toBe('string');
      expect(result).toContain('1000');
    });

    it('returns "0" for zero', () => {
      expect(formatNumber(0)).toBe('0');
    });
  });

  describe('formatTime', () => {
    it('formats 65 seconds as "1:05"', () => {
      expect(formatTime(65)).toBe('1:05');
    });

    it('formats 0 seconds as "0:00"', () => {
      expect(formatTime(0)).toBe('0:00');
    });

    it('pads single-digit seconds', () => {
      expect(formatTime(3)).toBe('0:03');
    });

    it('formats exact minutes', () => {
      expect(formatTime(120)).toBe('2:00');
    });
  });

  describe('calculateStars', () => {
    it('returns 3 stars for >= 90%', () => {
      expect(calculateStars(90)).toBe(3);
      expect(calculateStars(100)).toBe(3);
    });

    it('returns 2 stars for 70-89%', () => {
      expect(calculateStars(70)).toBe(2);
      expect(calculateStars(89)).toBe(2);
    });

    it('returns 1 star for 50-69%', () => {
      expect(calculateStars(50)).toBe(1);
      expect(calculateStars(69)).toBe(1);
    });

    it('returns 0 stars for < 50%', () => {
      expect(calculateStars(49)).toBe(0);
      expect(calculateStars(0)).toBe(0);
    });
  });

  describe('delay', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves after the specified time', async () => {
      vi.useFakeTimers();

      let resolved = false;
      delay(1000).then(() => { resolved = true; });

      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1000);

      expect(resolved).toBe(true);
    });
  });

  describe('downloadBlob', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('crea enlace temporal, dispara click y revoca URL', () => {
      const mockUrl = 'blob:http://localhost/fake-url';
      const originalCreateObjectURL = globalThis.URL.createObjectURL;
      const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

      globalThis.URL.createObjectURL = vi.fn(() => mockUrl);
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockClick = vi.fn();
      const mockLink = {
        href: '',
        download: '',
        click: mockClick
      };

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

      const blob = new Blob(['test data'], { type: 'application/json' });
      downloadBlob(blob, 'test-file.json');

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockLink.download).toBe('test-file.json');
      expect(mockClick).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();

      // Restaurar
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    });
  });
});
