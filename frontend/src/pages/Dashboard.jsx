import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Gamepad2, Trophy } from 'lucide-react';
import StatCard from '../components/dashboard/StatCard';
import ChartSection from '../components/dashboard/ChartSection';
import StudentsList from '../components/dashboard/StudentsList';

// Mock Data
const classPerformanceData = [
  { name: 'Lun', score: 65 },
  { name: 'Mar', score: 72 },
  { name: 'Mie', score: 68 },
  { name: 'Jue', score: 85 },
  { name: 'Vie', score: 82 },
  { name: 'Sab', score: 90 },
  { name: 'Dom', score: 88 },
];

export default function Dashboard() {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <Header />
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          title="Total Estudiantes" 
          value="1,234" 
          trend="+12%" 
          icon={<Users className="text-white" size={24} />} 
          color="bg-blue-500" 
        />
        <StatCard 
          title="Sesiones Activas" 
          value="42" 
          trend="+5%" 
          icon={<Gamepad2 className="text-white" size={24} />} 
          color="bg-purple-500" 
        />
        <StatCard 
          title="Puntaje Promedio" 
          value="86%" 
          trend="+2.4%" 
          icon={<Trophy className="text-white" size={24} />} 
          color="bg-emerald-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
            <ChartSection title="Rendimiento de Clase">
                <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={classPerformanceData}>
                        <defs>
                            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                    </AreaChart>
                </ResponsiveContainer>
            </ChartSection>
        </div>

        <div>
           <StudentsList />
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-between items-end"
    >
      <div>
        <h1 className="text-3xl font-bold text-white mb-2 font-display">Resumen del Dashboard</h1>
        <p className="text-slate-400">Bienvenido de nuevo, Profesor. Aquí tienes lo que está pasando hoy.</p>
      </div>
      <div className="text-sm text-slate-500 bg-slate-800/50 px-4 py-2 rounded-lg border border-white/5">
        Actualizado: Hace un momento
      </div>
    </motion.header>
  );
}
