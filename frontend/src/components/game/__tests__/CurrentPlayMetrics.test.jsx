/**
 * @fileoverview Tests de CurrentPlayMetrics (barra de métricas en partida).
 *
 * Regresión del rediseño: cada dato es distinto y la etiqueta SIEMPRE coincide
 * con su valor. En concreto, en Secuencia ya NO existe el pill "Ronda" que
 * mostraba los aciertos (confusión reportada), ni se duplica "Puntos" (que vive
 * en el marcador de la cabecera).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CurrentPlayMetrics from '../CurrentPlayMetrics';

describe('CurrentPlayMetrics', () => {
  it('Secuencia: muestra Cartas correctas / Fallos / Racha y NO "Ronda" ni "Puntos"', () => {
    render(
      <CurrentPlayMetrics mode="sequence" correctAnswers={4} totalErrors={2} streak={3} attempts={7} />
    );
    expect(screen.getByText('Cartas correctas')).toBeInTheDocument();
    expect(screen.getByText('Fallos')).toBeInTheDocument();
    expect(screen.getByText('Racha')).toBeInTheDocument();
    // La etiqueta "Ronda" del footer era engañosa (mostraba aciertos): eliminada.
    expect(screen.queryByText('Ronda')).toBeNull();
    // El marcador de puntos vive en la cabecera, no se duplica aquí.
    expect(screen.queryByText('Puntos')).toBeNull();
    // Valores distintos por dato (no se repite la misma variable).
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('Memoria: muestra Parejas / Intentos / Fallos', () => {
    render(
      <CurrentPlayMetrics mode="memory" correctAnswers={4} totalErrors={2} streak={3} attempts={7} />
    );
    expect(screen.getByText('Parejas')).toBeInTheDocument();
    expect(screen.getByText('Intentos')).toBeInTheDocument();
    expect(screen.getByText('Fallos')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument(); // intentos
    expect(screen.queryByText('Racha')).toBeNull();
  });

  it('Asociación: muestra Aciertos / Fallos / Racha', () => {
    render(
      <CurrentPlayMetrics mode="association" correctAnswers={4} totalErrors={2} streak={3} attempts={0} />
    );
    expect(screen.getByText('Aciertos')).toBeInTheDocument();
    expect(screen.getByText('Fallos')).toBeInTheDocument();
    expect(screen.getByText('Racha')).toBeInTheDocument();
  });
});
