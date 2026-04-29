import DistributionChart from './DistributionChart';
import ChartSection from './ChartSection';
import { SkeletonChart } from '../ui/SkeletonShimmer';

/**
 * Vista de distribucion de rendimiento de la clase con KPIs resumidos.
 * Consume datos reales del endpoint /classroom/distribution.
 * @param {Object} props
 * @param {Object} props.summary - KPIs resumidos (averageScore, totalGames, gamesToday)
 * @param {Array} props.distribution - Distribucion [{range, count, percentage}] del backend
 */
export default function ClassroomOverview({ summary, distribution }) {
    const hasDistribution = Array.isArray(distribution) && distribution.length > 0;

    return (
        <ChartSection title="Distribución de Rendimiento Global">
            <div className="h-[200px] sm:h-[240px] w-full mt-2 -ml-4 sm:ml-0 min-h-[200px] sm:min-h-[240px]">
               {hasDistribution ? (
                 <DistributionChart data={distribution} />
               ) : (
                 <SkeletonChart height={200} />
               )}
            </div>
            <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-border-default">
                <div className="text-center">
                    <p className="text-2xl font-bold text-text-primary">{summary?.averageScore || 0}%</p>
                    <p className="text-xs text-text-muted font-medium uppercase tracking-wider mt-1">Promedio</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-text-primary">{summary?.totalGames || 0}</p>
                    <p className="text-xs text-text-muted font-medium uppercase tracking-wider mt-1">Partidas</p>
                </div>
                <div className="text-center">
                    <p className="text-2xl font-bold text-text-primary">{summary?.gamesToday || 0}</p>
                    <p className="text-xs text-text-muted font-medium uppercase tracking-wider mt-1">Hoy</p>
                </div>
            </div>
        </ChartSection>
    );
}
