import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ChartSection from './ChartSection';
import EmptyState from '../ui/EmptyState';

export default function DifficultyHeatmap({ data }) {
  const { mechanics, contexts, processedData } = useMemo(() => {
    if (!data || data.length === 0) {
      return { mechanics: [], contexts: [], processedData: [] };
    }
    
    // Obtener ejes únicos
    const mechanicsSet = [...new Set(data.map(d => d.mechanic))];
    const contextsSet = [...new Set(data.map(d => d.context))];

    // Mapear strings a índices numéricos para Recharts
    const processed = data.map(d => ({
      ...d,
      x: mechanicsSet.indexOf(d.mechanic),
      y: contextsSet.indexOf(d.context),
      z: d.errorRate // Tamaño del punto
    }));

    return { mechanics: mechanicsSet, contexts: contextsSet, processedData: processed };
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <ChartSection title="Mapa de Calor de Dificultad (Errores)">
        <EmptyState
          title="Sin datos de errores"
          description="No hay datos de errores suficientes para generar el mapa de calor."
          className="shadow-none border-none bg-transparent"
        />
      </ChartSection>
    );
  }
  const getColor = (errorRate) => {
      if (errorRate > 50) return 'var(--color-error-base)'; // Muro
      if (errorRate > 25) return 'var(--color-warning-base)'; // Precaución
      return 'var(--color-success-base)'; // Bien
  };

  return (
    <ChartSection title="Mapa de Calor de Dificultad">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis 
                type="number" 
                dataKey="x" 
                name="Mecánica" 
                ticks={mechanics.map((_, i) => i)} 
                tickFormatter={(i) => mechanics[i] ? mechanics[i].charAt(0).toUpperCase() + mechanics[i].slice(1) : ''} 
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}
                interval={0}
            />
            <YAxis 
                type="number" 
                dataKey="y" 
                name="Contexto" 
                ticks={contexts.map((_, i) => i)} 
                tickFormatter={(i) => contexts[i]} 
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}
                width={150}
                interval={0}
            />
            <Tooltip 
                cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-border-default)' }} 
                content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                            <div className="bg-background-elevated border border-border-default p-3 rounded-lg shadow-xl backdrop-blur-md">
                                <p className="font-bold text-text-primary mb-1">{d.context} + {d.mechanic}</p>
                                <p className="text-error-base text-sm font-medium">Tasa de Error: {Math.round(d.errorRate)}%</p>
                                <p className="text-text-muted text-xs mt-1">Intentos Totales: {d.totalAttempts}</p>
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
      <p className="text-xs text-text-muted mt-6 text-center font-medium">
        Identifica qué combinaciones de <strong>Contexto + Mecánica</strong> generan más errores.
      </p>
    </ChartSection>
  );
}
