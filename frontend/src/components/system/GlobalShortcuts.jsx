import { useCallback, useMemo, useState } from 'react';
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
export default function GlobalShortcuts() {
  const { toggleTheme } = useTheme();
  const registry = useShortcutRegistry();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const openShortcutsOverlay = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcutsOverlay = useCallback(() => setShortcutsOpen(false), []);

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
            handler: openShortcutsOverlay,
          },
          {
            key: 'Escape',
            description: 'Cerrar diálogos abiertos',
            handler: closeShortcutsOverlay,
            allowInInput: true,
          },
        ],
      },
    ],
    [toggleTheme, openShortcutsOverlay, closeShortcutsOverlay],
  );

  useRegisterShortcutSource('global', systemSections);

  // Listener único para TODA la app — incluye global + cualquier fuente
  // registrada por el layout activo (AppLayout, GameLayout, …).
  useKeyboardShortcuts(registry.flatShortcuts);

  return (
    <KeyboardShortcutsOverlay
      isOpen={shortcutsOpen}
      onClose={closeShortcutsOverlay}
      sections={registry.sections}
    />
  );
}
