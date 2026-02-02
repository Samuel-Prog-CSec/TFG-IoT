import { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Sparkles,
  ChevronRight,
  UserCheck,
  Shield
} from 'lucide-react';
import { cn, pageVariants } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

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

  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans overflow-hidden">
      {/* Aurora Background Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/15 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px]" />
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 rounded-xl bg-slate-800/80 backdrop-blur-xl border border-white/10 text-white hover:bg-slate-700/80 transition-colors"
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
          x: sidebarOpen ? 0 : (isMobile ? -320 : 0),
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className={cn(
          'fixed lg:relative z-50',
          'w-72 h-full',
          'bg-slate-900/80 backdrop-blur-2xl',
          'border-r border-white/5',
          'flex flex-col',
          'shadow-2xl shadow-black/20'
        )}
      >
        {/* Mobile Close Button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>

        {/* Logo */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text-brand font-display">
                EduPlay
              </h1>
              <p className="text-xs text-slate-500">Portal del profesor</p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 mx-4 mt-4 rounded-xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-lg",
              isSuperAdmin 
                ? "bg-gradient-to-br from-amber-400 to-orange-500" 
                : "bg-gradient-to-br from-purple-400 to-pink-400"
            )}>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.name || 'Usuario'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {user?.email || 'Sin email'}
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20">
                <Shield size={12} className="text-amber-400" />
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          {/* Admin Navigation */}
          {isSuperAdmin && (
            <>
              <p className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Administración
              </p>
              <NavItem to={ROUTES.ADMIN_APPROVALS} icon={<UserCheck size={20} />} label="Aprobaciones" />
            </>
          )}
          
          <p className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Menú Principal
          </p>
          <NavItem to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <NavItem to="/decks" icon={<Layers size={20} />} label="Mis Mazos" />
          <NavItem to="/create-session" icon={<PlusCircle size={20} />} label="Nueva Sesión" />
        </nav>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/5 space-y-1">
          <button className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200 group">
            <Settings size={20} className="group-hover:rotate-90 transition-transform duration-300" />
            <span className="font-medium">Configuración</span>
          </button>
          <button 
            onClick={logout}
            className="flex items-center gap-3 w-full px-4 py-3 text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative custom-scrollbar">
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02] pointer-events-none" />
        
        {/* Page Content with Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10"
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
            ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/10 text-white border border-indigo-500/20'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Glow effect for active item */}
          {isActive && (
            <motion.div
              layoutId="navGlow"
              className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-xl"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          
          {/* Active indicator bar */}
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-gradient-to-b from-indigo-400 to-purple-400 rounded-r-full"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}
          
          <span className={cn(
            'relative z-10 transition-transform duration-200',
            isActive && 'text-indigo-400'
          )}>
            {icon}
          </span>
          <span className="relative z-10 font-medium">{label}</span>
        </>
      )}
    </NavLink>
  );
}
