import '@testing-library/jest-dom/vitest';

// jsdom no implementa scrollIntoView; varios componentes (SelectPremium,
// listas con highlight, etc.) lo invocan al navegar por teclado o abrir
// el dropdown. El polyfill no-op evita "TypeError: scrollIntoView is not a function".
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewPolyfill() {};
}
