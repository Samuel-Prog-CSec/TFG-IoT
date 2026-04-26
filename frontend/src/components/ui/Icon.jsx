/**
 * @fileoverview Wrapper único para iconos Lucide con tamaños semánticos.
 *
 * Reemplaza la importación directa `import { Play } from 'lucide-react'` +
 * `<Play size={16} />` por `<Icon name="Play" size="md" />`. Objetivos:
 *   - Consistencia visual: el tamaño se expresa en tokens (sm/md/lg/xl) en vez
 *     de números arbitrarios repartidos por la app.
 *   - Catálogo auditable: todos los iconos usados viven en `iconRegistry.js`.
 *   - Fallback seguro en producción: si un nombre no está registrado devuelve
 *     un placeholder inline (no rompe la pantalla) y logea un warning en dev.
 *
 * Principios aplicados:
 *   - `patterns-explicit-variants` (composition patterns): `size` es un enum,
 *     no un conjunto de booleans.
 *   - `react19-no-forwardRef`: la ref se acepta como prop regular.
 *   - `no-emoji-icons` (ui-ux-pro-max): los tamaños se alinean con el sistema
 *     4/8pt, y los iconos son SVG no emoji.
 *
 * @module components/ui/Icon
 */

import PropTypes from 'prop-types';
import { ICON_REGISTRY } from './iconRegistry';
import { cn } from '../../lib/utils';

const SIZE_TO_PX = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24
};

/**
 * Devuelve la resolución numérica en px para un size enum o un número directo.
 * Se exporta para que helpers puedan replicar el cálculo sin re-renderizar el
 * componente (p. ej. reservar espacio en un skeleton).
 */
// eslint-disable-next-line react-refresh/only-export-components -- helper fuertemente acoplado al componente Icon; mover a fichero aparte romperia cohesion
export const resolveIconSize = size => {
  if (typeof size === 'number' && Number.isFinite(size)) {
    return size;
  }
  return SIZE_TO_PX[size] ?? SIZE_TO_PX.md;
};

/**
 * Renderiza un icono del registry. Si el nombre no existe, loguea warning en
 * dev y devuelve un span vacío con `aria-hidden` (no bloquea el render).
 *
 * @param {Object} props
 * @param {string} props.name - Nombre del icono en el registry.
 * @param {'sm'|'md'|'lg'|'xl'|number} [props.size='md']
 * @param {string} [props.className]
 * @param {number} [props.strokeWidth]
 * @param {React.Ref<SVGSVGElement>} [props.ref]
 * @returns {JSX.Element}
 */
const Icon = ({ name, size = 'md', className, strokeWidth, ref, ...rest }) => {
  const LucideComponent = ICON_REGISTRY[name];

  if (!LucideComponent) {
    if (import.meta?.env?.DEV) {
      // Mensaje intencional en dev para detectar typos en nombres de icono.
      console.warn(`[Icon] "${name}" no existe en iconRegistry. Añádelo si es necesario.`);
    }
    const px = resolveIconSize(size);
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn('inline-block align-middle', className)}
        style={{ width: px, height: px }}
        data-icon-missing={name}
        {...rest}
      />
    );
  }

  return (
    <LucideComponent
      ref={ref}
      size={resolveIconSize(size)}
      strokeWidth={strokeWidth}
      className={className}
      {...rest}
    />
  );
};

Icon.propTypes = {
  name: PropTypes.string.isRequired,
  size: PropTypes.oneOfType([
    PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
    PropTypes.number
  ]),
  className: PropTypes.string,
  strokeWidth: PropTypes.number
};

export default Icon;
