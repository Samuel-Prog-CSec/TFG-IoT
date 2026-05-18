import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { toast } from 'sonner';
import { NAV_ROUTES, ADMIN_NAV_ROUTES, ROUTES } from '../../constants/routes';
import {
  Shield, Layers, X, Menu, LogOut,
  LayoutDashboard, CalendarClock, Palette, PlusCircle,
  UserCheck, ArrowRightLeft, Users, TrendingUp, Zap, ZapOff,
  ChevronRight, GraduationCap, PanelLeftClose, PanelLeft, Keyboard,
  KeyRound
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
  KeyRound,
};
import { useAuth } from '../../context/AuthContext';
import { cn, motionConfig } from '../../lib/utils';
import { useSidebarMode } from '../../hooks/useSidebarMode';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useNavigationDirection } from '../../hooks/useNavigationDirection';
import { useRouteAtmosphere } from '../../hooks/useRouteAtmosphere';
import ThemeToggle from '../ui/ThemeToggle';
import NotificationBell from '../notifications/NotificationBell';
import OnboardingOverlay from '../onboarding/OnboardingOverlay';
import { useOnboarding } from '../../hooks/useOnboarding';
import { getTrackForRole } from '../../constants/onboardingTracks';
import { useRegisterShortcutSource, useShortcutRegistry } from '../../context/ShortcutRegistryContext';

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- layout principal con sidebar, hooks de tema, atajos, onboarding, modal y mascota
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebar = useSidebarMode();
  const isDrawer = sidebar.layout === 'drawer';
  const isCompact = sidebar.layout === 'rail';
  const location = useLocation();
  const { user, deferLogout, undoLogout, isLoggingOut, isSuperAdmin } = useAuth();
  const { shouldReduceMotion, setUserPreference, resetUserPreference } = useReducedMotion();
  const navDirection = useNavigationDirection();
  // T-954 Fase A: sincroniza la atmósfera del contexto activo con
  // `<html data-atmosphere>`. El hook resuelve el contexto del recurso de
  // la URL (deck/session/context) y empuja la atmósfera al provider.
  useRouteAtmosphere();
  // T-954 Fase D: scroll parallax sobre el aurora. Cada orbe se desplaza
  // verticalmente a una velocidad distinta cuando el scroll avanza,
  // generando profundidad sin animar layout (sólo transform). En
  // reduced-motion el desplazamiento queda anclado a 0. El scroll vive en
  // body/html (PROP-100), por eso `useScroll()` sin container hace lo
  // correcto: lee `window.scrollY` directamente.
  const { scrollY } = useScroll();
  const auroraOffset1 = useTransform(scrollY, [0, 800], [0, -60]);
  const auroraOffset2 = useTransform(scrollY, [0, 800], [0, -40]);
  const auroraOffset3 = useTransform(scrollY, [0, 800], [0, -90]);

  // Onboarding interactivo (T-951 Fase 4). El track se selecciona por
  // rol — devuelve null para roles sin tour disponible (ej. estudiante).
  // El hook se sincroniza con backend (profile.onboarding) y migra el
  // flag legacy localStorage automáticamente al primer mount.
  const onboardingTrack = getTrackForRole(user?.role);
  const onboarding = useOnboarding({ totalSteps: onboardingTrack?.length ?? 0 });

  // Atajos contextuales del layout (T-952 Fase 1). Los atajos verdaderamente
  // globales (Shift+T tema, Shift+? overlay, Escape) los gestiona
  // <GlobalShortcuts /> montado en App.jsx, para que funcionen también en
  // Login/Register/GameLayout. Aquí solo registramos los que dependen del
  // sidebar y de la sesión autenticada (navegación interna, nueva sesión,
  // toggle del tamaño de la sidebar).
  const navigate = useNavigate();

  // Importante: el dep array debe incluir solo `sidebar.toggle` (estable
  // useCallback) y NO el objeto `sidebar` completo, porque
  // `useSidebarMode` retorna un nuevo objeto wrapper en cada render — si
  // dependiéramos del objeto, useMemo se invalidaría siempre y el effect
  // del ShortcutRegistry haría setSources continuamente → "Maximum update
  // depth exceeded".
  const sidebarToggle = sidebar.toggle;
  // T-952 Fase 1bis: el state del overlay vive en el contexto para que el
  // botón "Atajos" del sidebar pueda abrirlo sin depender del atajo Shift+?.
  const { openShortcuts } = useShortcutRegistry();
  const layoutShortcutSections = useMemo(
    () =>
      isSuperAdmin
        ? [
            {
              title: 'Navegación (dirección del centro)',
              shortcuts: [
                { key: 'g x', description: 'Ir a Aprobaciones', handler: () => navigate(ROUTES.ADMIN_APPROVALS) },
                { key: 'g a', description: 'Ir al alumnado del centro', handler: () => navigate(ROUTES.STUDENT_MANAGEMENT) },
                { key: 'g c', description: 'Ir a Contextos', handler: () => navigate(ROUTES.ADMIN_CONTEXTS) },
              ],
            },
            {
              title: 'Notificaciones',
              // Shift+B y Shift+G se manejan dentro del NotificationBell con un
              // listener `window.keydown`. Esta entrada sirve solo para que el
              // overlay Shift+? los muestre como atajos disponibles. T-955.
              shortcuts: [
                { key: 'Shift+B', description: 'Abrir notificaciones', handler: () => {} },
              ],
            },
            {
              title: 'Vista',
              shortcuts: [
                { key: '[', description: 'Alternar tamaño de la sidebar', handler: () => sidebarToggle() },
              ],
            },
          ]
        : [
            {
              title: 'Navegación',
              shortcuts: [
                { key: 'g d', description: 'Ir al Dashboard', handler: () => navigate(ROUTES.DASHBOARD) },
                { key: 'g s', description: 'Ir a Sesiones', handler: () => navigate(ROUTES.SESSIONS) },
                { key: 'g m', description: 'Ir a Mis Mazos', handler: () => navigate(ROUTES.CARD_DECKS) },
                { key: 'g a', description: 'Ir a Mis Alumnos', handler: () => navigate(ROUTES.STUDENTS_ANALYTICS) },
                { key: 'g c', description: 'Ir a Contextos', handler: () => navigate(ROUTES.CONTEXTS) },
                { key: 'g i', description: 'Ir a Insights', handler: () => navigate(ROUTES.INSIGHTS) },
              ],
            },
            {
              title: 'Acciones',
              shortcuts: [
                { key: 'Shift+N', description: 'Nueva sesión', handler: () => navigate(ROUTES.CREATE_SESSION) },
              ],
            },
            {
              title: 'Notificaciones',
              // Shift+B se enlaza dentro del NotificationBell. Esta sección
              // existe solo para descubribilidad en el overlay Shift+?. T-955.
              shortcuts: [
                { key: 'Shift+B', description: 'Abrir notificaciones', handler: () => {} },
              ],
            },
            {
              title: 'Vista',
              shortcuts: [
                { key: '[', description: 'Alternar tamaño de la sidebar', handler: () => sidebarToggle() },
              ],
            },
          ],
    [isSuperAdmin, navigate, sidebarToggle],
  );

  // Registra esta fuente de atajos en el ShortcutRegistry. GlobalShortcuts
  // consume el registro entero y mantiene UN único listener keydown; el
  // overlay Shift+? agrega todas las secciones en orden estable.
  useRegisterShortcutSource(
    isSuperAdmin ? 'app-layout-admin' : 'app-layout-teacher',
    layoutShortcutSections,
  );

  // T-957: cierre de sesión con "Deshacer" en lugar de modal de confirmación.
  // Filosofía: el modal de PROP-85 protegía contra clics accidentales pero
  // rompía el flujo del docente con una pregunta cada vez. Un toast
  // persistente durante 5 s ofrece la misma red de seguridad sin interrumpir.
  // Mientras `isLoggingOut === true` el botón queda deshabilitado para evitar
  // disparar varios deferLogout en paralelo (el hook ya es idempotente, pero
  // el feedback visual ayuda).
  const handleLogoutClick = () => {
    if (isLoggingOut) return;
    const scheduled = deferLogout({ delayMs: 5000 });
    if (!scheduled) return;
    toast.success('Sesión cerrada', {
      description: 'Volverás al login en unos segundos.',
      duration: 5000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          if (undoLogout()) {
            toast.success('Sigues conectado');
          }
        },
      },
    });
  };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isDrawer) setDrawerOpen(false);
  }, [location, isDrawer]);

  // En modo drawer, la sidebar entra/sale con transform; en rail/expanded
  // siempre x:0 (el ancho lo controla la prop CSS sidebarWidth).
  const sidebarWidth = isCompact ? 'var(--sidebar-w-rail)' : 'var(--sidebar-w-expanded)';
  const sidebarOffset = isDrawer && !drawerOpen ? -320 : 0;

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
        className="hidden lg:block absolute inset-y-0 left-0 bg-background-base border-r border-border-subtle pointer-events-none z-0 transition-[width] duration-200 ease-out"
        style={{ width: sidebarWidth }}
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

      {/* Aurora Background Effect — los colores y el mix-blend cambian por
          tema (T-951 Fase 1). Desde T-954 las orbes consumen los tokens
          atmosféricos `--color-atmosphere-aurora-{1,2,3}`, que por defecto
          apuntan a `--color-aurora-*` y se reescriben cuando el `<html>`
          tiene `[data-atmosphere="geography|animals|colors|numbers|shapes"]`.
          La clase `.aurora-layer` aplica el modo de mezcla correcto: `screen`
          en dark, `multiply` en light (evita las manchas grises del screen
          sobre fondo claro). */}
      <div className="aurora-layer fixed inset-0 pointer-events-none overflow-hidden opacity-25">
        <motion.div
          className="absolute top-0 left-1/4 size-96 rounded-full blur-[128px] opacity-80"
          style={{
            backgroundColor: 'var(--color-atmosphere-aurora-1)',
            y: shouldReduceMotion ? 0 : auroraOffset1
          }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 size-96 rounded-full blur-[128px] opacity-60"
          style={{
            backgroundColor: 'var(--color-atmosphere-aurora-2)',
            y: shouldReduceMotion ? 0 : auroraOffset2
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[150px] opacity-50 size-[clamp(320px,40vw,600px)]"
          style={{
            backgroundColor: 'var(--color-atmosphere-aurora-3)',
            y: shouldReduceMotion ? 0 : auroraOffset3
          }}
        />
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-background-elevated/80 backdrop-blur-xl border border-border-default text-text-primary hover:bg-background-surface/80 transition-colors duration-200"
        aria-label="Abrir menú"
      >
        <Menu size={24} />
      </button>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="lg:hidden fixed inset-0 bg-backdrop backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ x: sidebarOffset }}
        transition={motionConfig.spring}
        aria-label="Navegación principal"
        style={{ width: sidebarWidth }}
        className={cn(
          'fixed lg:sticky lg:top-0 z-50',
          'h-screen lg:h-screen',
          'bg-background-base/90 backdrop-blur-xl',
          'border-r border-border-subtle',
          'flex flex-col flex-shrink-0',
          'shadow-[var(--shadow-lg)]',
          'transition-[width] duration-200 ease-out'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className={cn('border-b border-border-subtle', isCompact ? 'p-4' : 'p-6')}>
          <div className={cn('flex items-center', isCompact ? 'justify-center' : 'gap-3')}>
            <motion.div
              className="size-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo flex items-center justify-center shadow-[0_4px_16px_var(--color-brand-glow)] flex-shrink-0"
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.04, 1], boxShadow: [
                '0 4px 16px var(--color-brand-glow)',
                '0 4px 20px var(--color-brand-glow)',
                '0 4px 16px var(--color-brand-glow)',
              ] }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <EduPlayIcon size={20} className="text-white" />
            </motion.div>
            {!isCompact && (
              <div className="min-w-0">
                <span className="text-xl font-bold gradient-text-brand font-display tracking-tight">
                  EduPlay
                </span>
                <p className="text-xs text-text-muted font-medium truncate">
                  {isSuperAdmin
                    ? 'Panel de dirección'
                    : `Aula de ${user?.name?.split(' ')[0] ?? 'EduPlay'}`}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Toggle expand/compact (solo visible en ≥lg, no en drawer).
            QA 2026-05-12: en modo expandido el boton vivia como fila propia
            entre Logo y User Info, desplazando todo el contenido hacia
            abajo. Ahora flota absolutamente sobre el borde derecho del
            sidebar (alineado con el centro vertical del logo) — no roba
            espacio al flujo vertical. En modo compact se mantiene como
            item de rail centrado para no romper la geometria del rail. */}
        <button
          type="button"
          onClick={sidebar.toggle}
          title={`Sidebar: ${sidebar.preference} (clic o tecla [ para alternar)`}
          aria-label="Alternar tamaño de sidebar"
          className={cn(
            'hidden lg:flex items-center justify-center text-text-muted hover:text-text-primary transition-colors',
            isCompact
              ? 'mx-3 mt-2 mb-1 p-2 rounded-lg hover:bg-background-surface/50'
              : cn(
                  // Floating: pegado al borde derecho del sidebar, centrado
                  // sobre la linea del borde (translate-x-1/2 le hace
                  // sobresalir mitad-mitad). z alto para vencer el card
                  // user-info adyacente. Tamano sm + circulo para que se
                  // lea como "control de panel" y no como item de menu.
                  'absolute top-7 right-0 translate-x-1/2 z-30',
                  'size-7 rounded-full bg-background-elevated',
                  'border border-border-default shadow-[var(--shadow-md)]',
                  'hover:bg-background-surface hover:border-border-emphasis'
                )
          )}
        >
          {isCompact ? <PanelLeft size={16} /> : <PanelLeftClose size={14} />}
        </button>

        {/* User Info — oculto en rail (modo compact). Incluye NotificationBell
            a la derecha del bloque (T-955). En rail, el bell vive en su
            propio item bajo el toggle de sidebar — ver más abajo. */}
        {!isCompact && (
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
              <NotificationBell />
              {isSuperAdmin && (
                <div className="flex items-center justify-center size-6 rounded-full bg-warning-base/20" aria-hidden="true">
                  <Shield size={12} className="text-warning-base" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bell aislado en modo rail (la card de usuario está oculta). */}
        {isCompact && (
          <div className="flex justify-center mt-3 mb-1">
            <NotificationBell compact />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overscroll-contain custom-scrollbar">
          {/* Admin Section */}
          {isSuperAdmin && (
            <>
              {!isCompact && (
                <p className="px-4 py-2 mt-2 text-[11px] font-semibold text-warning-base uppercase tracking-widest flex items-center gap-2">
                  <Shield size={10} /> Gestión del centro
                </p>
              )}
              {ADMIN_NAV_ROUTES.map((route) => {
                const Icon = ICON_MAP[route.icon] || Shield;
                return (
                  <NavItem
                    key={route.path}
                    to={route.path}
                    icon={<Icon size={20} />}
                    label={route.label}
                    dataTour={route.dataTour}
                    compact={isCompact}
                  />
                );
              })}

              <div className="my-4 border-t border-border-subtle/50 mx-4" />
            </>
          )}

          {!isSuperAdmin && (
            <>
              {!isCompact && (
                <p className="px-4 py-2 mt-2 text-[11px] font-semibold text-text-muted uppercase tracking-widest">
                  Menú Principal
                </p>
              )}
              {NAV_ROUTES.map((route) => {
                const Icon = ICON_MAP[route.icon] || Layers;
                return (
                  <NavItem
                    key={route.path}
                    to={route.path}
                    icon={<Icon size={20} />}
                    label={route.label}
                    dataTour={route.dataTour}
                    compact={isCompact}
                  />
                );
              })}
            </>
          )}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-transparent bg-gradient-to-r from-transparent via-border-default/50 to-transparent space-y-1">
          {/* Selector de tema — segmented Auto/Claro/Oscuro (T-951 Fase 2,
              ajustado post-QA). Layout vertical: label arriba en su
              propia línea + control compact (solo iconos) debajo. Antes
              el segmented con texto se desbordaba del ancho de la
              sidebar de 288px. */}
          {!isCompact && (
            <div className="px-4 py-2">
              <span className="block mb-2 font-medium text-[11px] uppercase tracking-widest text-text-muted">
                Tema
              </span>
              <ThemeToggle compact />
            </div>
          )}

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
            title={shouldReduceMotion ? 'Activar animaciones' : 'Reducir animaciones'}
            className={cn(
              // py-3 (antes py-2) para igualar la altura visual del resto de
              // items del footer (Tutorial, Atajos, Privacidad, Cerrar
              // sesión). Sin esto, en modo rail el toggle queda más bajo y
              // su icono se ve "minúsculo" al lado del resto (QA 2026-05-16).
              'flex items-center w-full px-4 py-3 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors duration-200',
              isCompact ? 'justify-center' : 'justify-between'
            )}
          >
            <span className={cn('flex items-center', isCompact ? '' : 'gap-3')}>
              {/* size=20 alinea con GraduationCap/Keyboard/Shield/LogOut
                  del resto de items del footer. Antes era 16 → se veía
                  "minúsculo" en modo rail (QA 2026-05-16). */}
              {/* `shrink-0` evita que el SVG se aplaste cuando es hijo
                  directo de un contenedor flex sin texto al lado (modo rail).
                  Sin esto, el icono renderizaba a 7px de ancho en lugar de
                  20px porque flex-shrink default lo encogía (QA 2026-05-16). */}
              {shouldReduceMotion ? (
                <ZapOff size={20} aria-hidden="true" className="shrink-0" />
              ) : (
                <Zap size={20} aria-hidden="true" className="shrink-0" />
              )}
              {!isCompact && (
                <span className="font-medium text-xs uppercase tracking-wider text-text-secondary">
                  Animaciones
                </span>
              )}
            </span>
            {!isCompact && (
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
            )}
          </button>

          {/* Reanudar el tutorial — solo si el rol del usuario tiene
              tour disponible (T-951 Fase 4). El hook se encarga de
              resetear paso y mostrar el overlay. */}
          {onboardingTrack && (
            <button
              type="button"
              onClick={onboarding.resetOnboarding}
              title="Vuelve a ver el tutorial desde el principio"
              className={cn(
                'flex items-center w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-colors duration-200',
                isCompact ? 'justify-center' : 'gap-3'
              )}
            >
              <GraduationCap size={20} className="shrink-0" />
              {!isCompact && <span className="font-medium text-sm">Ver tutorial</span>}
            </button>
          )}

          {/* Atajos de teclado — botón visible para descubribilidad (T-952
              Fase 1bis). El overlay también se abre con Shift+?. Las
              secciones que muestra dependen del rol porque `AppLayout`
              registra distintos `sourceId` (app-layout-admin vs
              app-layout-teacher) en `ShortcutRegistry`; un super_admin no
              ve los atajos `g s`/`g m`/Shift+N del docente y viceversa. */}
          <button
            type="button"
            onClick={openShortcuts}
            title="Ver lista de atajos de teclado (Shift + ?)"
            aria-haspopup="dialog"
            className={cn(
              'flex items-center w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-colors duration-200',
              isCompact ? 'justify-center' : 'gap-3'
            )}
          >
            <Keyboard size={20} className="shrink-0" />
            {!isCompact && (
              <span className="flex items-center justify-between flex-1">
                <span className="font-medium text-sm">Atajos de teclado</span>
                <kbd
                  className="ml-2 hidden md:inline-flex items-center px-1.5 py-0.5 rounded-md border border-border-default bg-background-elevated/60 font-mono text-[10px] text-text-muted"
                  aria-hidden="true"
                >
                  ⇧?
                </kbd>
              </span>
            )}
          </button>

          <NavLink
            to="/privacy"
            title="Privacidad"
            className={cn(
              'flex items-center w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-xl transition-colors duration-200',
              isCompact ? 'justify-center' : 'gap-3'
            )}
          >
            <Shield size={20} className="shrink-0" />
            {!isCompact && <span className="font-medium text-sm">Privacidad</span>}
          </NavLink>
          <button
            onClick={handleLogoutClick}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            title={isLoggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            className={cn(
              'flex items-center w-full px-4 py-3 text-error-base hover:bg-error-base/10 rounded-xl transition-colors duration-200',
              isCompact ? 'justify-center' : 'gap-3',
              isLoggingOut && 'opacity-60 cursor-not-allowed pointer-events-none'
            )}
          >
            <LogOut size={20} className="shrink-0" />
            {!isCompact && (
              <span className="font-medium text-sm">
                {isLoggingOut ? 'Cerrando sesión…' : 'Cerrar Sesión'}
              </span>
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main Content — sin overflow propio, el scroll vive en body/html
          (PROP-100). El `pb-16` sigue reservando margen bajo el widget RFID
          flotante para que no tape la última fila de la página. */}
      <main id="main-content" className="flex-1 relative pb-16 min-w-0">
        {/* Subtle Grid Pattern for Depth */}
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

        {/* Page Content — transición direccional según `useNavigationDirection`:
            - forward (PUSH): entra desde la derecha (x: 12 → 0).
            - back (POP detectado como atrás): entra desde la izquierda (x: -12 → 0).
            - replace o navegación inicial: fade-in sin desplazamiento horizontal.
            Sigue siendo un fade-in al montar (sin AnimatePresence ni exit) para
            evitar el bug de motion.div atascado entre chunks lazy + Suspense
            (QA 22/04/2026). El offset horizontal es pequeño (12px) — no compite
            con la lectura, sólo refuerza la dirección espacial. */}
        <div className="relative z-10 w-full min-h-full overflow-x-clip">
          <motion.div
            key={location.pathname}
            initial={(() => {
              if (shouldReduceMotion) return false;
              if (navDirection === 'back') return { opacity: 0, x: -12, y: 4 };
              if (navDirection === 'replace') return { opacity: 0, y: 4 };
              return { opacity: 0, x: 12, y: 4 };
            })()}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <Outlet />
          </motion.div>
        </div>
      </main>

      {/* Onboarding interactivo (T-951 Fase 4) — montado a nivel de
          AppLayout para cubrir teacher y super_admin desde cualquier
          ruta autenticada. El track viene del rol del usuario; si es
          null, no se renderiza nada. */}
      {onboardingTrack && (
        <OnboardingOverlay
          isVisible={onboarding.isVisible}
          currentStep={onboarding.currentStep}
          track={onboardingTrack}
          onNext={onboarding.nextStep}
          onPrev={onboarding.prevStep}
          onComplete={onboarding.completeOnboarding}
          onSkip={onboarding.skipOnboarding}
        />
      )}

      {/* El overlay de atajos de teclado vive en <GlobalShortcuts /> (App.jsx)
          para estar disponible también en Login/Register/GameLayout. Este
          layout sólo aporta sus secciones contextuales vía el ShortcutRegistry. */}
    </div>
  );
}

function NavItem({ to, icon, label, dataTour, compact = false }) {
  // Rutas "hijas" que deben activar el mismo item del sidebar.
  const location = useLocation();
  const isParentOf = to === '/analytics/students' && location.pathname.startsWith('/students/');
  const exactMatch = to === '/admin/students';

  return (
    <NavLink
      to={to}
      end={exactMatch}
      data-tour={dataTour}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-xl transition-colors duration-200 group relative overflow-hidden',
          compact ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3',
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
            className={cn('flex items-center w-full', compact ? 'justify-center' : 'gap-3')}
            whileHover={!active && !compact ? { x: 4 } : {}}
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
            {!compact && (
              <>
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
              </>
            )}
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
  dataTour: PropTypes.string,
  compact: PropTypes.bool,
};
