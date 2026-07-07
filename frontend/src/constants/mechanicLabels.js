/**
 * @fileoverview Single source of truth para labels, iconos y descripciones de
 * las mecánicas de juego. Antes cada componente importaba sus propios iconos
 * y mapeaba labels duplicados; ahora todos consumen desde aquí.
 *
 * Si en el futuro entra una nueva mecánica, este es el único archivo a tocar
 * (más el seeder backend `03-mechanics.js` y la lógica del strategy).
 */

import { Brain, ListOrdered, Link2, Gamepad2 } from 'lucide-react';

/**
 * Configuración por mecánica. La clave es `mechanic.name` (slug) tal como
 * lo expone el backend en `GameMechanic.name`.
 *
 * - `label`: nombre visible para el profesor.
 * - `icon`: componente Lucide (no string) — listo para `<Icon size={...} />`.
 * - `tint`: token Tailwind (sin prefijo `bg-`/`text-`) que define el color
 *   acento de la mecánica. Cada mecánica tiene un tono propio para que el
 *   profesor las distinga "de un vistazo" en charts y filtros.
 * - `tintClass`: utilidad lista para usar como className.
 * - `description`: copy corta para tooltips, cards y filtros.
 */
export const MECHANIC_LABELS = Object.freeze({
  association: Object.freeze({
    label: 'Asociación',
    icon: Link2,
    tint: 'brand',
    tintClass: 'text-brand-base',
    description: 'Encuentra la respuesta correcta para cada consigna.'
  }),
  memory: Object.freeze({
    label: 'Memoria',
    icon: Brain,
    tint: 'accent-cyan',
    tintClass: 'text-accent-cyan',
    description: 'Empareja cartas iguales volteándolas de dos en dos.'
  }),
  sequence: Object.freeze({
    label: 'Secuencia',
    icon: ListOrdered,
    tint: 'accent-amber',
    tintClass: 'text-accent-amber',
    description: 'Memoriza el orden de las cartas y reprodúcelo escaneando.'
  })
});

/** Fallback usado cuando la mecánica es desconocida (defensivo). */
export const DEFAULT_MECHANIC_META = Object.freeze({
  label: 'Mecánica',
  icon: Gamepad2,
  tint: 'text-secondary',
  tintClass: 'text-text-secondary',
  description: 'Mecánica de juego.'
});

/** Lookup defensivo por `mechanic.name`. */
export const getMechanicMeta = mechanicName => {
  if (!mechanicName) return DEFAULT_MECHANIC_META;
  const key = mechanicName.toString().toLowerCase();
  return MECHANIC_LABELS[key] || DEFAULT_MECHANIC_META;
};

/** Lista ordenada de slugs para iterar en filtros. */
export const MECHANIC_NAMES = Object.freeze(['association', 'memory', 'sequence']);
