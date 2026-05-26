/**
 * @fileoverview Hero estandarizado para las páginas del área super_admin.
 *
 * Encapsula la firma visual "DIRECCIÓN" — eyebrow tag + icono enmarcado en
 * gradient warning + título grande + descripción opcional + slot derecho
 * (típicamente CTAs como "Nuevo X" o filtros). Los orbes decorativos de
 * fondo (warning + accent-purple aurora) son opcionales pero recomendados
 * para reforzar la coherencia visual con `ApprovalPanel` y `AdminDashboard`.
 *
 * Patrón consolidado en T-942 tras la auditoría de zona admin. Su misión es
 * que cualquier página admin se reconozca a primera vista como zona del
 * director — distinta del Dashboard del profesor y del resto de la app.
 *
 * @module components/admin/AdminPageHero
 */
import { memo } from 'react';
import PropTypes from 'prop-types';
import { Shield } from 'lucide-react';

/**
 * Orbes decorativos del fondo. `fixed inset-0` para que cubran el viewport
 * incluso si la página principal hace scroll. `pointer-events-none` evita
 * interferir con la interacción de la página.
 */
function AdminBackdrop() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      <div
        className="absolute -top-32 -right-32 size-[640px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--color-warning-base) 18%, transparent) 0%, transparent 65%)'
        }}
      />
      <div
        className="absolute -bottom-40 -left-40 size-[520px] rounded-full blur-3xl opacity-60"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklab, var(--color-accent-purple, var(--color-atmosphere-aurora-3)) 14%, transparent) 0%, transparent 70%)'
        }}
      />
    </div>
  );
}

/**
 * Hero unificado para páginas admin.
 *
 * Ejemplo de uso:
 *
 * ```jsx
 * <AdminPageShell
 *   icon={Users}
 *   title="Gestión de Alumnos"
 *   description="Administración centralizada de identidades de alumnos."
 *   rightSlot={<ButtonPremium icon={<Plus />}>Nuevo Alumno</ButtonPremium>}
 * >
 *   {content}
 * </AdminPageShell>
 * ```
 *
 * @param {Object} props
 * @param {React.ComponentType} [props.icon=Shield] Icono Lucide que enmarca el header.
 * @param {string} [props.eyebrow='Dirección'] Etiqueta de rol sobre el título.
 * @param {string} props.title Título principal de la página.
 * @param {string} [props.description] Subtítulo descriptivo opcional.
 * @param {React.ReactNode} [props.rightSlot] Contenido alineado a la derecha (acciones, filtros).
 * @param {React.ReactNode} props.children Contenido principal de la página.
 * @param {string} [props.maxWidth='max-w-7xl'] Clase Tailwind del contenedor central.
 * @param {string} [props.ariaLabel] Aria-label de la sección.
 * @param {boolean} [props.withBackdrop=true] Renderizar orbes decorativos de fondo.
 * @param {string} [props.className] Clases extra para el wrapper exterior.
 */
function AdminPageShell({
  icon: Icon = Shield,
  eyebrow = 'Dirección',
  title,
  description,
  rightSlot,
  children,
  maxWidth = 'max-w-7xl',
  ariaLabel,
  withBackdrop = true,
  className = ''
}) {
  return (
    <section
      className={`p-4 sm:p-6 lg:p-8 relative ${className}`.trim()}
      aria-label={ariaLabel || title}
    >
      {withBackdrop && <AdminBackdrop />}

      <div className={`${maxWidth} mx-auto relative z-10 space-y-6`}>
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pt-14 lg:pt-0">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-xl bg-gradient-to-br from-warning-base to-warning-dark flex items-center justify-center shadow-lg shadow-warning-base/20 mt-1 flex-shrink-0">
              <Icon className="size-6 text-text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-micro uppercase tracking-[0.18em] text-warning-on-alpha font-bold mb-0.5">
                {eyebrow}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-text-primary leading-tight">
                {title}
              </h1>
              {description && (
                <p className="text-text-muted mt-1 text-sm max-w-2xl">
                  {description}
                </p>
              )}
            </div>
          </div>
          {rightSlot && (
            <div className="flex flex-col items-stretch sm:items-end gap-2 flex-shrink-0">
              {rightSlot}
            </div>
          )}
        </header>

        {children}
      </div>
    </section>
  );
}

AdminPageShell.propTypes = {
  icon: PropTypes.elementType,
  eyebrow: PropTypes.string,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  rightSlot: PropTypes.node,
  children: PropTypes.node.isRequired,
  maxWidth: PropTypes.string,
  ariaLabel: PropTypes.string,
  withBackdrop: PropTypes.bool,
  className: PropTypes.string
};

export default memo(AdminPageShell);
