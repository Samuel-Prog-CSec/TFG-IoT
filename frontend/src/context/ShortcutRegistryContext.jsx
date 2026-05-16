import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';

/**
 * @fileoverview Registro de secciones de atajos de teclado (T-952 Fase 1).
 *
 * La aplicación tiene atajos a dos niveles:
 *  - "global": disponibles en cualquier pantalla (Login, Register, App,
 *    Game). Se registran desde `<GlobalShortcuts />`.
 *  - "contextuales": dependientes de un layout concreto (sidebar de
 *    AppLayout aporta `g s / g d / [ / Shift+N`, etc.). Se registran desde
 *    AppLayout/GameLayout cuando éstos se montan.
 *
 * El overlay `Shift+?` debe mostrar todos los aplicables al contexto
 * actual sin duplicados. Este contexto se encarga de combinar las fuentes
 * y limpiar el registro cuando un layout desmonta.
 *
 * Cada fuente identifica sus secciones con un id estable (`'global'`,
 * `'app-layout'`, `'app-layout-admin'`, `'game-layout'`). Al desmontar
 * llama a `unregister(sourceId)`.
 */

const ShortcutRegistryContext = createContext(null);

export function ShortcutRegistryProvider({ children }) {
  // Map ordenado: sourceId → Section[]. `useState` con Map vacío fuerza
  // renders al actualizar (re-asignamos al replace; el sub-tree lee la
  // versión nueva). El orden de inserción es el orden de renderizado en
  // el overlay — global primero, layout después, lo que coincide con el
  // sentido natural (sistema → navegación específica).
  const [sources, setSources] = useState(() => new Map());

  // Estado del overlay de atajos. Antes vivía localmente en
  // `<GlobalShortcuts />`, pero al subirlo al contexto cualquier consumidor
  // (botón del sidebar, NotificationBell, NotFound…) puede abrirlo sin
  // necesidad de un atajo de teclado, mejorando descubribilidad para
  // alumnos/profesores que usan ratón.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Mantenemos la lista plana de definiciones (key + handler + allowInInput)
  // que `useKeyboardShortcuts` necesita. Esto evita que los consumidores
  // tengan que enganchar otro `useKeyboardShortcuts` cada uno con su
  // listener — el `<GlobalShortcuts />` registra UN listener al árbol
  // entero y resuelve cualquier atajo de cualquier fuente.
  const sourcesRef = useRef(new Map());
  sourcesRef.current = sources;

  const registerSource = useCallback((sourceId, sections) => {
    if (!sourceId) return;
    setSources((prev) => {
      const next = new Map(prev);
      next.set(sourceId, sections);
      return next;
    });
  }, []);

  const unregisterSource = useCallback((sourceId) => {
    if (!sourceId) return;
    setSources((prev) => {
      if (!prev.has(sourceId)) return prev;
      const next = new Map(prev);
      next.delete(sourceId);
      return next;
    });
  }, []);

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const toggleShortcuts = useCallback(() => setShortcutsOpen((prev) => !prev), []);

  const value = useMemo(() => {
    const sectionsBySource = Array.from(sources.entries());
    // Aplanamos para tener todas las secciones del overlay en orden estable.
    const sections = sectionsBySource.flatMap(([, sectionList]) => sectionList);
    const flatShortcuts = sections.flatMap((section) => section.shortcuts);
    return {
      sources,
      sections,
      flatShortcuts,
      registerSource,
      unregisterSource,
      shortcutsOpen,
      openShortcuts,
      closeShortcuts,
      toggleShortcuts,
    };
  }, [sources, registerSource, unregisterSource, shortcutsOpen, openShortcuts, closeShortcuts, toggleShortcuts]);

  return (
    <ShortcutRegistryContext.Provider value={value}>
      {children}
    </ShortcutRegistryContext.Provider>
  );
}

ShortcutRegistryProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useShortcutRegistry() {
  const ctx = useContext(ShortcutRegistryContext);
  if (ctx === null) {
    throw new Error(
      'useShortcutRegistry debe usarse dentro de <ShortcutRegistryProvider>',
    );
  }
  return ctx;
}

/**
 * Hook utilitario para registrar una fuente de atajos durante el ciclo de
 * vida del componente. Las secciones se reflejan automáticamente en el
 * overlay y el listener global. Si `sections` cambia, el registro se
 * actualiza; al desmontar, se desregistra.
 *
 * Importante: `sections` debe ser estable o memoizado en el consumidor
 * (con `useMemo`), porque su identidad determina cuándo se actualiza el
 * registro. Pasar un array literal en cada render dispara registros
 * infinitos.
 */
export function useRegisterShortcutSource(sourceId, sections, { enabled = true } = {}) {
  const { registerSource, unregisterSource } = useShortcutRegistry();

  useEffect(() => {
    if (!enabled || !sourceId) return undefined;
    registerSource(sourceId, sections);
    return () => unregisterSource(sourceId);
  }, [enabled, sourceId, sections, registerSource, unregisterSource]);
}
