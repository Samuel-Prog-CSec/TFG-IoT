import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ChartSection from './ChartSection';

export default function DifficultyHeatmap({ data }) {
  if (!data || data.length === 0) {
    return (
        <ChartSection title="Mapa de Calor de Dificultad (Errores)">
          <div className="h-[300px] w-full flex items-center justify-center text-slate-500">
            No hay datos de errores suficientes
          </div>
        </ChartSection>
    );
  }

  // Transformar datos para ScatterPlot simulando un Heatmap
  // Eje X: Mecánica, Eje Y: Contexto, Tamaño/Color: Tasa de Error
  
  // Obtener ejes únicos
  const mechanics = [...new Set(data.map(d => d.mechanic))];
  const contexts = [...new Set(data.map(d => d.context))];

  // Mapear strings a índices numéricos para Recharts
  const processedData = data.map(d => ({
    ...d,
    x: mechanics.indexOf(d.mechanic),
    y: contexts.indexOf(d.context),
    z: d.errorRate // Tamaño del punto
  }));

  const getColor = (errorRate) => {
      if (errorRate > 50) return '#ef4444'; // Rojo (Muro)
      if (errorRate > 25) return '#f59e0b'; // Ámbar (Precaución)
      return '#10b981'; // Verde (Bien)
  };

  return (
    <ChartSection title="Mapa de Calor de Dificultad">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
            <XAxis 
                type="number" 
                dataKey="x" 
                name="Mecánica" 
                ticks={mechanics.map((_, i) => i)} 
                tickFormatter={(i) => mechanics[i]} 
                tick={{ fill: '#64748b', fontSize: 10 }}
                interval={0}
            />
            <YAxis 
                type="number" 
                dataKey="y" 
                name="Contexto" 
                ticks={contexts.map((_, i) => i)} 
                tickFormatter={(i) => contexts[i]} 
                tick={{ fill: '#64748b', fontSize: 10 }}
                width={80}
                interval={0}
            />
            <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                            <div className="bg-slate-900 border border-white/10 p-3 rounded-lg shadow-xl backdrop-blur-md">
                                <p className="font-bold text-white mb-1">{d.context} + {d.mechanic}</p>
                                <p className="text-rose-400 text-sm">Tasa de Error: {Math.round(d.errorRate)}%</p>
                                <p className="text-slate-400 text-xs">Intentos Totales: {d.totalAttempts}</p>
                            </div>
                        );
                    }
                    return null;
                }}
            />
            <Scatter name="Dificultades" data={processedData}>
                {processedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getColor(entry.errorRate)} />
                ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-slate-500 mt-4 text-center">
        Identifica qué combinaciones de <strong>Contexto + Mecánica</strong> generan más errores.
      </p>
    </ChartSection>
  );
}
