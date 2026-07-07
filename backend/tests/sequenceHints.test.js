/**
 * @fileoverview Tests del algoritmo de pistas progresivas para Secuencia.
 */

const { buildPartialHint, buildFullHint, buildHintPayload } = require('../src/utils/sequenceHints');

describe('sequenceHints — buildPartialHint', () => {
  describe('palabras con tilde', () => {
    it('preserva primera letra y vocales acentuadas', () => {
      // León: L(0=1ra) e(1) ó(2=acent) n(3) → L?ó?
      expect(buildPartialHint('León')).toBe('L?ó?');
    });

    it('preserva tilde inicial sin revelar resto', () => {
      // Águila: Á(0=acent y 1ra) g i u i l a → Á?????
      expect(buildPartialHint('Águila')).toBe('Á?????');
    });

    it('reconoce ü diéresis como vocal acentuada', () => {
      // Pingüino: P(0) i n g ü(4=acent) i n o → P???ü???
      expect(buildPartialHint('Pingüino')).toBe('P???ü???');
    });

    it('preserva tilde central en palabra corta', () => {
      // Sí: S(0) í(1=acent) → Sí
      expect(buildPartialHint('Sí')).toBe('Sí');
    });
  });

  describe('palabras sin tilde', () => {
    it('Caballo (7) → C?b?l?o', () => {
      expect(buildPartialHint('Caballo')).toBe('C?b?l?o');
    });

    it('Tigre (5) → T?g?e', () => {
      expect(buildPartialHint('Tigre')).toBe('T?g?e');
    });

    it('Oso (3) → O?o', () => {
      expect(buildPartialHint('Oso')).toBe('O?o');
    });

    it('España (6, ñ no es vocal acentuada) → E?p?ñ?', () => {
      expect(buildPartialHint('España')).toBe('E?p?ñ?');
    });

    it('Os (2) → O?', () => {
      expect(buildPartialHint('Os')).toBe('O?');
    });
  });

  describe('casos límite', () => {
    it('cadena vacía devuelve cadena vacía', () => {
      expect(buildPartialHint('')).toBe('');
    });

    it('null/undefined devuelve cadena vacía', () => {
      expect(buildPartialHint(null)).toBe('');
      expect(buildPartialHint(undefined)).toBe('');
    });

    it('1 carácter devuelve sin cambios', () => {
      expect(buildPartialHint('A')).toBe('A');
    });

    it('coerce números a string sin romper', () => {
      // No esperado en producción, pero el helper no debe explotar
      expect(buildPartialHint(42)).toBe('42'.charAt(0) + '?'); // 4?
    });
  });

  describe('palabras compuestas', () => {
    it('preserva espacios entre palabras', () => {
      // Oso polar (9 chars): O(0) s(1) o(2) ' '(3=preserve) p(4) o(5) l(6) a(7) r(8=last)
      // sin tildes → idx pares <8: 0,2,4,6 preservados; idx 8 último → '?'
      // → O ? o ' ' p ? l ? r → "O?o p?l?r"
      expect(buildPartialHint('Oso polar')).toBe('O?o p?l?r');
    });

    it('preserva guiones', () => {
      // Tic-tac (7 chars): T(0) i(1) c(2) -(3=preserve) t(4) a(5) c(6=last)
      // idx pares <6: 0,2,4 → preservar; idx 6 último → ?
      // → T ? c - t ? c → "T?c-t?c"
      expect(buildPartialHint('Tic-tac')).toBe('T?c-t?c');
    });
  });
});

describe('sequenceHints — buildFullHint', () => {
  it('devuelve la palabra tal cual', () => {
    expect(buildFullHint('León')).toBe('León');
    expect(buildFullHint('Caballo')).toBe('Caballo');
  });

  it('null/undefined devuelven cadena vacía', () => {
    expect(buildFullHint(null)).toBe('');
    expect(buildFullHint(undefined)).toBe('');
  });
});

describe('sequenceHints — buildHintPayload', () => {
  it('construye payload partial', () => {
    expect(buildHintPayload('partial', 'León')).toEqual({ type: 'partial', text: 'L?ó?' });
  });

  it('construye payload full', () => {
    expect(buildHintPayload('full', 'León')).toEqual({ type: 'full', text: 'León' });
  });

  it('por defecto cae a partial si type es desconocido', () => {
    expect(buildHintPayload('xxx', 'León')).toEqual({ type: 'partial', text: 'L?ó?' });
  });
});
