import DistributionChart from './DistributionChart';
import ChartSection from './ChartSection';

// Este componente ahora es más sencillo porque la lógica de distribución
// podría venir del backend o calcularse aquí.
// Por ahora reutilizamos DistributionChart con datos reales o calculados.

export default function ClassroomOverview({ summary, distribution }) {
    // Si no tenemos distribución real del backend, podemos inferirla o mostrar loading
    // Por simplicidad, asumimos que 'distribution' se pasa calculado desde el Dashboard
    // o usamos datos placeholder si no está disponible, pero idealmente debería ser real.

    // Mock fallback si no hay distribution data calculada
    const safeDistribution = distribution || [
        { range: '0-49', count: 0 },
        { range: '50-69', count: 0 },
        { range: '70-89', count: 0 },
        { range: '90-100', count: 0 },
    ];

    return (
        <ChartSection title="Distribución de Rendimiento Global">
            <div className="h-[300px] w-full">
               <DistributionChart data={safeDistribution} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/5">
                <div className="text-center">
                    <p className="text-2xl font-bold text-white">{summary?.averageScore || 0}%</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Promedio</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-white">{summary?.totalGames || 0}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Partidas</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-white">{summary?.gamesToday || 0}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mt-1">Hoy</p>
                </div>
            </div>
        </ChartSection>
    );
}
