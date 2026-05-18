import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom no implementa scrollIntoView; varios componentes (SelectPremium,
// listas con highlight, etc.) lo invocan al navegar por teclado o abrir
// el dropdown. El polyfill no-op evita "TypeError: scrollIntoView is not a function".
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoViewPolyfill() {};
}

// T-907 INT2: en producción la app envuelve el árbol en `<LazyMotion>` para
// que los componentes `m.X` carguen solo ~25KB del bundle de Framer. En tests
// los componentes que importan `m as motion` no estarían envueltos y harían
// throw "You need to wrap with LazyMotion". Para no añadir el wrapper en cada
// render call, redirigimos `m` al `motion` real (no-lazy) y convertimos
// `LazyMotion` en passthrough — los tests siguen ejerciendo el JSX exactamente
// igual y el comportamiento visible es idéntico al de producción para los
// aserts de testing-library (lo único que se pierde es la optimización de
// bundle, irrelevante en tests).
vi.mock('framer-motion', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    m: actual.motion,
    LazyMotion: ({ children }) => children
  };
});
