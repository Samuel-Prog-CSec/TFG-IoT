/* Tema inicial pre-React (FOUC < 50ms).
 * Lee localStorage['eduplay:theme'] (auto|light|dark), resuelve "auto" con
 * prefers-color-scheme, y aplica el atributo data-theme a <html> antes del
 * primer paint. Sincroniza también la meta theme-color (T-951 Fase 1).
 *
 * Servido como archivo externo (no inline) para mantener la CSP estricta
 * sin necesidad de hash ni nonce. QA 2026-05-21 BUG-QA-1.
 */
(function () {
  try {
    const stored = localStorage.getItem('eduplay:theme');
    const validModes = ['light', 'dark', 'auto'];
    const mode = validModes.includes(stored) ? stored : 'auto';
    let resolved;
    if (mode === 'light' || mode === 'dark') {
      resolved = mode;
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      resolved = prefersLight ? 'light' : 'dark';
    }
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#fbf7ee' : '#0f172a');
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
})();
