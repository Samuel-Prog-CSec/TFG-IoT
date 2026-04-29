import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { NAV_ROUTES, ADMIN_NAV_ROUTES } from '../../constants/routes';
import {
  Shield, Layers, X, Menu, LogOut,
  LayoutDashboard, CalendarClock, Palette, PlusCircle,
  UserCheck, ArrowRightLeft, Users, TrendingUp, Zap, ZapOff,
  ChevronRight
} from 'lucide-react';
import EduPlayIcon from '../icons/EduPlayIcon';

const ICON_MAP = {
  LayoutDashboard,
  CalendarClock,
  Palette,
  Layers,
  PlusCircle,
  UserCheck,
  ArrowRightLeft,
  Users,
  Shield,
  TrendingUp,
};
import { useAuth } from '../../context/AuthContext';
import { cn, motionConfig } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import ConfirmationModal, { useConfirmationModal } from '../ui/ConfirmationModal';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile(1024);
  const location = useLocation();
  const { user, logout, isSuperAdmin } = useAuth();
  const { shouldReduceMotion, setUserPreference, resetUserPreference } = useReducedMotion();
  const logoutModal = useConfirmationModal();

  // Confirmacion al cerrar sesion: un click accidental pierde filtros y
  // estado de navegacion (PROP-85). Variant warning (no danger) porque es
  // reversible — re-login recupera el acceso.
  const handleLogoutClick = () => {
    logoutModal.openModal({
      title: '¿Cerrar sesión?',
      description: 'Se cerrará tu sesión actual. Tendrás que volver a iniciar sesión para acceder de nuevo.',
      variant: 'warning',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      onConfirm: logout,
    });
  };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location, isMobile]);

  let sidebarOffset = 0;
  if (!sidebarOpen) {
    sidebarOffset = isMobile ? -320 : 0;
  }

  return (
    // El scroll vive en el viewport (body/html), no en `<main>`: teclado
    // (PageDown/End/Home), "pull to refresh" mobile y capturas fullPage de
    // Playwright funcionan nativamente (QA 2026-04-24, PROP-100).
    // La sidebar se pega con `sticky top-0 h-screen` en desktop; mobile mantiene
    // `fixed` porque usa `motion.aside` con transform para abrir/cerrar.
    <div className="flex min-h-screen bg-background-base text-text-primary font-sans relative">
      {/* Pseudo-fondo de columna sidebar (desktop): extiende el color base + borde
          al alto completo del flex container. Sin esto, cuando el `<main>` supera
          la altura del viewport, la sidebar sticky (`h-screen`) deja al descubierto
          el body por debajo, lo que produce una franja visual diferente en
          páginas largas (Sessions, Dashboard, StudentProfile — QA 2026-04-29). */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute inset-y-0 left-0 w-72 bg-background-base border-r border-border-subtle pointer-events-none z-0"
      />

      {/* Banner superior para super_admin: refuerza rol y aporta firma visual.
          4px fijos arriba del viewport, no interactuable, gradient warning→accent. */}
      {isSuperAdmin && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 right-0 h-1 z-[55] bg-gradient-to-r from-warning-base via-accent-orange to-warning-base"
        />
      )}

      {/* Skip Link — accesibilidad WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-1/2 focus:-translate-x-1/2 focus:z-[60] focus:px-6 focus:py-3 focus:rounded-xl focus:bg-brand-base focus:text-white focus:font-semibold focus:shadow-lg focus:shadow-brand-glow focus:outline-none"
      >
        Ir al contenido principal
      </a>

      {/* Aurora Background Effect — opacidad reducida para mejor contraste de texto */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden mix-blend-screen opacity-25">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-base/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/15 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-indigo/10 rounded-full blur-[150px]" />
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-background-elevated/80 backdrop-blur-xl border border-border-default text-text-primary hover:bg-background-surface/80 transition-colors duration-200"
        aria-label="Abrir menú"
      >
        <Menu size={24} />
      </button>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 bg-backdrop backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          x: sidebarOffset,
        }}
        transition={motionConfig.spring}
        aria-label="Navegación principal"
        className={cn(
          // Mobile: `fixed` con animación de transform; desktop: `sticky top-0`
          // para quedarse pegada mientras el body hace scroll.
          'fixed lg:sticky lg:top-0 z-50',
          'w-72 h-screen lg:h-screen',
          'bg-background-base/90 backdrop-blur-xl',
          'border-r border-border-subtle',
          'flex flex-col flex-shrink-0',
          'shadow-2xl shadow-black/40'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className="p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <motion.div
              className="size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo flex items-center justify-center shadow-[0_4px_16px_var(--color-brand-glow)]"
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.04, 1], boxShadow: [
                '0 4px 16px var(--color-brand-glow)',
                '0 4px 20px var(--color-brand-glow)',
                '0 4px 16px var(--color-brand-glow)',
              ] }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <EduPlayIcon size={20} className="text-white" />
            </motion.div>
            <div>
              <span className="text-xl font-bold gradient-text-brand font-display tracking-tight" role="banner">
                EduPlay
              </span>
              <p className="text-xs text-text-muted font-medium">
                {isSuperAdmin ? 'Panel de administración' : 'Portal del profesor'}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 mx-4 mt-4 rounded-xl bg-background-elevated border border-border-default shadow-sm">
          <div className="flex items-center gap-3">
            <div className={cn(
              "size-10 rounded-full flex items-center justify-center text-white font-bold shadow-md",
              isSuperAdmin
                ? "bg-gradient-to-br from-warning-base to-accent-orange"
                : "bg-gradient-to-br from-brand-base to-accent-pink"
            )}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate" title={user?.name || 'Usuario'}>
                {user?.name || 'Usuario'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider',
                    isSuperAdmin
                      ? 'bg-warning-base/15 text-warning-base border border-warning-base/30'
                      : 'bg-brand-base/15 text-brand-light border border-brand-base/30'
                  )}
                >
                  {isSuperAdmin ? 'Dirección' : 'Docente'}
                </span>
                <p className="text-[10px] text-text-muted truncate" title={user?.email || 'Sin email'}>
                  {user?.email || 'Sin email'}
                </p>
              </div>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center justify-center size-6 rounded-full bg-warning-base/20">
                <Shield size={12} className="text-warning-base" aria-hidden="true" />
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overscroll-contain custom-scrollbar">
          {/* Admin Section */}
          {isSuperAdmin && (
            <>
              <p className="px-4 py-2 mt-2 text-[11px] font-semibold text-warning-base uppercase tracking-widest flex items-center gap-2">
                <Shield size={10} /> Administración
              </p>
              {ADMIN_NAV_ROUTES.map((route) => {
                const Icon = ICON_MAP[route.icon] || Shield;
                return (
                  <NavItem 
                    key={route.path} 
                    to={route.path} 
                    icon={<Icon size={20} />} 
                    label={route.label} 
                  />
                );
              })}
              
              <div className="my-4 border-t border-border-subtle/50 mx-4" />
            </>
          )}
          
          {!isSuperAdmin && (
            <>
              <p className="px-4 py-2 mt-2 text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                Menú Principal
              </p>
              {NAV_ROUTES.map((route) => {
                const Icon = ICON_MAP[route.icon] || Layers;
                return (
                  <NavItem
                    key={route.path}
                    to={route.path}
                    icon={<Icon size={20} />}
                    label={route.label}
                  />
                );
              })}
            </>
          )}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-transparent bg-gradient-to-r from-transparent via-border-default/50 to-transparent space-y-1">
          {/* Toggle de movimiento reducido (preferencia de a11y).
              Estilizado como switch en lugar de nav item para que se distinga de los enlaces. */}
          <button
            type="button"
            onClick={() => {
              if (shouldReduceMotion) {
                resetUserPreference();
              } else {
                setUserPreference('reduce');
              }
            }}
            role="switch"
            aria-checked={!shouldReduceMotion}
            aria-label="Animaciones"
            title={shouldReduceMotion ? 'Animaciones desactivadas' : 'Animaciones activadas'}
            className="flex items-center justify-between w-full px-4 py-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors duration-200"
          >
            <span className="flex items-center gap-3">
              {shouldReduceMotion ? <ZapOff size={16} aria-hidden="true" /> : <Zap size={16} aria-hidden="true" />}
              <span className="font-medium text-xs uppercase tracking-wider text-text-secondary">
                Animaciones
              </span>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                shouldReduceMotion ? 'bg-background-surface/60' : 'bg-brand-base/70'
              )}
            >
              <span
                className={cn(
                  'inline-block h-3 w-3 transform rounded-full bg-text-primary shadow transition-transform',
                  shouldReduceMotion ? 'translate-x-0.5' : 'translate-x-3'
                )}
              />
            </span>
          </button>

          <NavLink
            to="/privacy"
            className="flex items-center gap-3 w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-colors duration-200"
          >
            <Shield size={20} />
            <span className="font-medium text-sm">Privacidad</span>
          </NavLink>
          <button
            onClick={handleLogoutClick}
            className="flex items-center gap-3 w-full px-4 py-3 text-error-base hover:bg-error-base/10 rounded-xl transition-colors duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content — sin overflow propio, el scroll vive en body/html
          (PROP-100). El `pb-16` sigue reservando margen bajo el widget RFID
          flotante para que no tape la última fila de la página. */}
      <main id="main-content" className="flex-1 relative pb-16 min-w-0">
        {/* Subtle Grid Pattern for Depth */}
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

        {/* Page Content — fade-in al montar sin animación de salida.
            Se retiró AnimatePresence porque la combinación lazy-loaded Outlet +
            Suspense fallback + popLayout dejaba el motion.div saliente
            atascado en exit state (opacity:0) al navegar entre rutas /admin/*
            cuando el chunk entrante tardaba en resolver (QA 22/04/2026).
            Con key={pathname} React desmonta el motion.div anterior y monta
            uno nuevo con initial→animate; el resultado visual es un fade-in
            limpio sin riesgo de pantalla en blanco. */}
        <div className="relative z-10 w-full min-h-full">
          <motion.div
            key={location.pathname}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <Outlet />
          </motion.div>
        </div>
      </main>

      {/* Modal de confirmacion de cierre de sesion (PROP-85) */}
      <ConfirmationModal {...logoutModal.modalProps} />
    </div>
  );
}

function NavItem({ to, icon, label }) {
  // Rutas "hijas" que deben activar el mismo item del sidebar.
  // Ej: /students/:id es parte del area "Mis Alumnos" (listado en /analytics/students).
  const location = useLocation();
  const isParentOf = to === '/analytics/students' && location.pathname.startsWith('/students/');

  // Forzar match exacto en /admin/students para que /admin/students/transfer
  // no marque ALSO el item "Alumnos" (que comparte prefix con "Transferencias").
  const exactMatch = to === '/admin/students';

  return (
    <NavLink
      to={to}
      end={exactMatch}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 group relative overflow-hidden',
          (isActive || isParentOf)
            ? 'text-brand-light font-medium bg-brand-base/10 border border-brand-base/20'
            : 'text-text-secondary hover:text-text-primary hover:bg-background-surface/50 font-medium'
        )
      }
    >
      {({ isActive }) => {
        const active = isActive || isParentOf;
        return (
          <motion.div
            className="flex items-center gap-3 w-full"
            whileHover={!active ? { x: 4 } : {}}
            transition={motionConfig.spring}
          >
            {active && (
              <motion.div
                layoutId="activeIndicator"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-brand-light to-brand-base rounded-r-full shadow-[0_0_10px_var(--color-brand-glow)]"
                transition={motionConfig.spring}
              />
            )}

            <span className={cn(
              'relative z-10 transition-transform duration-200',
              active ? 'text-brand-light' : 'text-text-muted group-hover:text-text-primary'
            )}>
              {icon}
            </span>
            <span className="relative z-10 text-sm flex-1">{label}</span>
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 text-text-muted opacity-0 -translate-x-1 transition-[opacity,transform] duration-200',
                active ? 'opacity-60 translate-x-0 text-brand-light' : 'group-hover:opacity-70 group-hover:translate-x-0'
              )}
            >
              <ChevronRight size={14} />
            </span>
          </motion.div>
        );
      }}
    </NavLink>
  );
}

NavItem.propTypes = {
  to: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
};
