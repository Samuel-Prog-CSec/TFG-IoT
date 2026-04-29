import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initSentry } from './lib/sentry'
import './index.css'

// Inicializar pre-render para agarrar cualquier error temprano
initSentry()

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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
