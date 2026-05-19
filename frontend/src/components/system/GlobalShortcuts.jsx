import { useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  useShortcutRegistry,
  useRegisterShortcutSource,
} from '../../context/ShortcutRegistryContext';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import KeyboardShortcutsOverlay from '../ui/KeyboardShortcutsOverlay';

/**
 * @fileoverview Atajos verdaderamente globales (T-952 Fase 1).
 *
 * Vive en `<App>` justo después de los Providers de Theme + Registry.
 * Esto garantiza que `Shift+T`, `Shift+?` y `Escape` funcionen en CADA
 * pantalla de la app, incluidas las que no usan AppLayout (Login,
 * Register, GameLayout en las 3 mecánicas, NotFound).
 *
 * Responsabilidades:
 *  1. Registrar la sección "Sistema" con atajos universales (`Shift+T`,
 *     `Shift+?`, `Escape`) en el `ShortcutRegistry`.
 *  2. Enganchar el ÚNICO listener `keydown` para toda la app mediante
 *     `useKeyboardShortcuts(registry.flatShortcuts)`. Como el listener
 *     consume la lista plana del registry (global + contextuales), no es
 *     necesario que cada layout instale el suyo — basta con que registren
 *     secciones.
 *  3. Renderizar el `<KeyboardShortcutsOverlay>` controlado, consumiendo
 *     `registry.sections` para mostrar el set aplicable al contexto
 *     actual (global solo en Login/Register; global + navegación + acciones
 *     en AppLayout teacher, etc.).
 */
/**
 * Busca el primer input de búsqueda visible en la página actual marcado con
 * `data-global-search`. Si no existe (p. ej. en una página sin búsqueda) no
 * hace nada — el atajo se consume silenciosamente para que la "/" no acabe
 * escrita en el contenido. Patrón usado por Slack/GitHub/Linear.
 */
function focusGlobalSearch() {
  const target = document.querySelector('[data-global-search]');
  if (target && typeof target.focus === 'function') {
    target.focus();
    // Si es un input con valor, situar el cursor al final para que el
    // usuario pueda añadir tokens sin sobreescribir lo escrito.
    if (typeof target.setSelectionRange === 'function' && target.value) {
      const end = target.value.length;
      try {
        target.setSelectionRange(end, end);
      } catch {
        // Algunos inputs (search) no soportan setSelectionRange; ignorar.
      }
    }
  }
}

export default function GlobalShortcuts() {
  const { toggleTheme } = useTheme();
  const registry = useShortcutRegistry();
  const { shortcutsOpen, openShortcuts, closeShortcuts } = registry;

  // Sección "Sistema": disponible en cualquier pantalla. El handler de
  // `Escape` se marca `allowInInput: true` para que cierre el overlay
  // incluso si el foco está dentro de un campo (caso real al revisar
  // atajos mientras se rellena un formulario).
  const systemSections = useMemo(
    () => [
      {
        title: 'Sistema',
        shortcuts: [
          {
            key: 'Shift+T',
            description: 'Alternar tema claro / oscuro',
            handler: () => toggleTheme(),
          },
          {
            key: 'Shift+?',
            description: 'Mostrar atajos de teclado',
            handler: openShortcuts,
          },
          {
            // Atajo de búsqueda global (T-951 criterio explícito). Convención
            // ya consolidada en Slack, GitHub y Linear: "/" enfoca el campo de
            // búsqueda de la página actual. Si no hay input marcado con
            // `data-global-search`, el handler no-op silencioso y el
            // `preventDefault` del hook evita que "/" se escriba.
            key: '/',
            description: 'Enfocar la búsqueda de la página',
            handler: focusGlobalSearch,
          },
          {
            key: 'Escape',
            description: 'Cerrar diálogos abiertos',
            handler: closeShortcuts,
            allowInInput: true,
          },
        ],
      },
    ],
    [toggleTheme, openShortcuts, closeShortcuts],
  );

  useRegisterShortcutSource('global', systemSections);

  // Listener único para TODA la app — incluye global + cualquier fuente
  // registrada por el layout activo (AppLayout, GameLayout, …).
  useKeyboardShortcuts(registry.flatShortcuts);

  return (
    <KeyboardShortcutsOverlay
      isOpen={shortcutsOpen}
      onClose={closeShortcuts}
      sections={registry.sections}
    />
  );
}
