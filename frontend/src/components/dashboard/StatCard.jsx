import { ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';

export default function StatCard({ title, value, trend, icon, color }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -5 }}
      className="bg-slate-800/40 backdrop-blur-md p-6 rounded-2xl border border-white/5 relative overflow-hidden group"
    >
      <div className={`absolute top-0 right-0 p-3 rounded-bl-2xl opacity-80 ${color}`}>
        {icon}
      </div>
      <div className="relative z-10">
        <h3 className="text-slate-400 font-medium mb-1">{title}</h3>
        <div className="text-3xl font-bold text-white mb-2">{value}</div>
        <div className="flex items-center gap-1 text-emerald-400 text-sm font-medium">
          <ArrowUpRight size={16} />
          <span>{trend}</span>
          <span className="text-slate-500 ml-1">vs semana pasada</span>
        </div>
      </div>
      
      {/* Glow effect */}
      <div className={clsx("absolute -bottom-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 transition-opacity duration-500 group-hover:opacity-40", color)}></div>
    </motion.div>
  );
}
