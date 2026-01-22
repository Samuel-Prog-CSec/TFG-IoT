import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Gamepad2, Trophy, Calendar } from 'lucide-react';
import { staggerContainer, staggerItem } from '../lib/utils';
import { useDocumentTitle } from '../hooks';
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
  useDocumentTitle('Dashboard');

  return (
    <main 
      className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8"
      aria-label="Panel principal del dashboard"
    >
      <Header />
      
      {/* Stats Grid with Stagger Animation */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">Estadísticas generales</h2>
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6"
          role="list"
          aria-label="Tarjetas de estadísticas"
        >
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Total Estudiantes" 
              value="1,234" 
              trend="+12%" 
              icon={<Users className="text-white" size={24} aria-hidden="true" />} 
              color="bg-blue-500" 
            />
          </motion.div>
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Sesiones Activas" 
              value="42" 
              trend="+5%" 
              icon={<Gamepad2 className="text-white" size={24} aria-hidden="true" />} 
              color="bg-purple-500" 
            />
          </motion.div>
          <motion.div variants={staggerItem} role="listitem">
            <StatCard 
              title="Puntaje Promedio" 
              value="86%" 
              trend="+2.4%" 
              icon={<Trophy className="text-white" size={24} aria-hidden="true" />} 
              color="bg-emerald-500" 
            />
          </motion.div>
        </motion.div>
      </section>

      {/* Charts and Lists Grid */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8" aria-label="Gráficos y listas">
        <div className="xl:col-span-2">
          <ChartSection title="Rendimiento de Clase">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={classPerformanceData} aria-label="Gráfico de rendimiento semanal">
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }} 
                  dy={10} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(30, 41, 59, 0.95)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(10px)'
                  }}
                  itemStyle={{ color: '#fff' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 500 }}
                />
                <Area 
                  type="monotone" 
                  dataKey="score" 
                  stroke="#8b5cf6" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorScore)"
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#a855f7', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>
        </div>

        <aside aria-label="Lista de mejores estudiantes">
          <StudentsList />
        </aside>
      </section>
    </main>
  );
}

function Header() {
  const today = new Date().toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <motion.header 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 pt-4 lg:pt-0"
    >
      <div>
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-bold text-white mb-2 font-display"
        >
          <span aria-hidden="true">¡Bienvenido de nuevo! 👋</span>
          <span className="sr-only">¡Bienvenido de nuevo!</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-400"
        >
          Aquí tienes un resumen de la actividad de hoy
        </motion.p>
      </div>
      <motion.time 
        dateTime={new Date().toISOString().split('T')[0]}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/5"
      >
        <Calendar size={16} className="text-purple-400" aria-hidden="true" />
        <span className="capitalize">{today}</span>
      </motion.time>
    </motion.header>
  );
}
