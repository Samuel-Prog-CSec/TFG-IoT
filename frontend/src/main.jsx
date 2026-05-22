import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Filtrar warning conocido de Recharts en el primer render (PROP-40):
// "The width(-1) and height(-1) of chart should be greater than 0".
// Es benigno — el chart se redibuja correctamente tras el ResizeObserver inicial.
// Issue upstream conocido: recharts/recharts#3615.
// Solo silenciamos este mensaje específico para no contaminar devtools.
if (typeof console !== 'undefined' && typeof console.warn === 'function') {
  const originalWarn = console.warn.bind(console);
  console.warn = (...args) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('The width(-1) and height(-1) of chart')) return;
    originalWarn(...args);
  };
}

// T-907: Sentry se carga por dynamic import diferido al idle del navegador.
// Antes se inicializaba síncrono pre-render — eso obligaba al chunk crítico a
// incluir el SDK (~30-40 KB gzipped) y retrasaba FCP. Ahora el SDK queda en su
// propio chunk perezoso y se inicializa cuando el hilo principal está libre.
// Errores de los primeros ~200 ms son raros porque vienen de módulos ya cargados
// y, en su caso, los recoge window.onerror nativo antes de que Sentry se anexe.
const initSentryDeferred = () => {
  import('./lib/sentry').then((m) => m.initSentry()).catch(() => {});
};

if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(initSentryDeferred, { timeout: 2000 });
  } else {
    setTimeout(initSentryDeferred, 200);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
