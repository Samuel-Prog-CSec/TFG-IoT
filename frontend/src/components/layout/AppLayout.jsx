import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Settings, LogOut } from 'lucide-react';

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-slate-900 text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-800/50 backdrop-blur-xl border-r border-white/10 flex flex-col">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent font-display">
            TFG IoT
          </h1>
          <p className="text-xs text-slate-400 mt-1">Portal de profesores</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavItem to="/dashboard" icon={<LayoutDashboard size={20} />} label="Dashboard" />
          <NavItem to="/create-session" icon={<PlusCircle size={20} />} label="Crear sesión de juego" />
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button className="flex items-center gap-3 w-full px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200">
            <Settings size={20} />
            <span className="font-medium">Configuración</span>
          </button>
           <button className="flex items-center gap-3 w-full px-4 py-3 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-all duration-200">
            <LogOut size={20} />
            <span className="font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative">
         <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02] pointer-events-none"></div>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
          isActive
            ? 'bg-indigo-500/10 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)] border border-indigo-500/20'
            : 'text-slate-400 hover:text-white hover:bg-white/5'
        }`
      }
    >
      {icon}
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}
