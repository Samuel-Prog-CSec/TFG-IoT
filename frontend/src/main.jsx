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

// QA 2026-05-30: recuperación ante "chunk obsoleto" tras un deploy. Con `lazy()`
// extensivo (rutas admin, paneles de gameplay, charts), un usuario con la app
// abierta cuando se publica una versión nueva puede solicitar un chunk con hash
// antiguo que el nuevo deploy ya no sirve (404 → "Failed to fetch dynamically
// imported module"), quedándose con la navegación rota sin recuperación. Vite
// emite `vite:preloadError` en ese caso: recargamos UNA vez para traer el
// index.html nuevo (con los hashes nuevos). Guard de 30s para no entrar en
// bucle si el fallo es de red (chunk inalcanzable) y no de versión.
if (typeof window !== 'undefined') {
  const PRELOAD_RELOAD_KEY = 'eduplay:preload-error-reloaded';
  window.addEventListener('vite:preloadError', (event) => {
    const lastReload = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < 30000) return; // ya recargamos hace poco → no insistir
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
    event.preventDefault?.();
    window.location.reload();
  });
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
