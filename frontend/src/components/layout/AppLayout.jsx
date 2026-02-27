import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ROUTES, NAV_ROUTES, ADMIN_NAV_ROUTES } from '../../constants/routes';
import * as LucideIcons from 'lucide-react';
import { Shield, Layers, X, Menu, Sparkles, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn, pageVariants } from '../../lib/utils';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();
  const { user, logout, isSuperAdmin } = useAuth();

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(globalThis.innerWidth < 1024);
    checkMobile();
    globalThis.addEventListener('resize', checkMobile);
    return () => globalThis.removeEventListener('resize', checkMobile);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location, isMobile]);

  let sidebarOffset = 0;
  if (!sidebarOpen) {
    sidebarOffset = isMobile ? -320 : 0;
  }

  return (
    <div className="flex h-screen bg-background-base text-text-primary font-sans overflow-hidden">
      {/* Aurora Background Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden mix-blend-screen opacity-60">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-base/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/15 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-indigo/10 rounded-full blur-[150px]" />
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-background-elevated/80 backdrop-blur-xl border border-border-default text-text-primary hover:bg-background-surface/80 transition-colors"
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
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          x: sidebarOffset,
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={cn(
          'fixed lg:relative z-50',
          'w-72 h-full',
          'bg-background-base/60 backdrop-blur-2xl',
          'border-r border-border-subtle',
          'flex flex-col',
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-base to-accent-indigo flex items-center justify-center shadow-[0_4px_16px_var(--color-brand-glow)]">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text-brand font-display tracking-tight">
                EduPlay
              </h1>
              <p className="text-xs text-text-muted font-medium">Portal del profesor</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 mx-4 mt-4 rounded-xl bg-background-elevated border border-border-default shadow-sm">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-md",
              isSuperAdmin 
                ? "bg-gradient-to-br from-warning-base to-accent-orange" 
                : "bg-gradient-to-br from-brand-base to-accent-pink"
            )}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.name || 'Usuario'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {user?.email || 'Sin email'}
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-warning-base/20">
                <Shield size={12} className="text-warning-base" />
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {/* Admin Section */}
          {isSuperAdmin && (
            <>
              <p className="px-4 py-2 mt-2 text-[10px] font-semibold text-warning-base uppercase tracking-widest flex items-center gap-2">
                <Shield size={10} /> Administración
              </p>
              {ADMIN_NAV_ROUTES.map((route) => {
                const Icon = LucideIcons[route.icon] || Shield;
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
          
          <p className="px-4 py-2 mt-2 text-[10px] font-semibold text-text-muted uppercase tracking-widest">
            Menú Principal
          </p>
          {NAV_ROUTES.map((route) => {
            const Icon = LucideIcons[route.icon] || Layers;
            return (
              <NavItem 
                key={route.path} 
                to={route.path} 
                icon={<Icon size={20} />} 
                label={route.label} 
              />
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border-subtle space-y-1">
          <button className="flex items-center gap-3 w-full px-4 py-3 text-text-muted hover:text-text-primary hover:bg-background-elevated rounded-xl transition-all duration-200 group">
            <Settings size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            <span className="font-medium text-sm">Configuración</span>
          </button>
          <button 
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-3 text-error-base hover:bg-error-base/10 rounded-xl transition-all duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative custom-scrollbar">
        {/* Subtle Grid Pattern for Depth */}
        <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />
        
        {/* Page Content with Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10 w-full h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden',
          isActive
            ? 'text-brand-light font-medium bg-brand-base/10 border border-brand-base/20'
            : 'text-text-secondary hover:text-text-primary hover:bg-background-surface/50 font-medium'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active indicator bar - kept for Framer Motion layoutId magic */}
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-brand-light to-brand-base rounded-r-full shadow-[0_0_10px_var(--color-brand-glow)]"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          
          <span className={cn(
            'relative z-10 transition-transform duration-200',
            isActive ? 'text-brand-light' : 'text-text-muted group-hover:text-text-primary'
          )}>
            {icon}
          </span>
          <span className="relative z-10 text-sm">{label}</span>
        </>
      )}
    </NavLink>
  );
}

NavItem.propTypes = {
  to: PropTypes.string.isRequired,
  icon: PropTypes.node.isRequired,
  label: PropTypes.string.isRequired,
};
