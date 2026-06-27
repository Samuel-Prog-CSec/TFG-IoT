import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ButtonPremium from '../ui/ButtonPremium';

/**
 * Error Boundary para graficos y secciones de analytics.
 * Captura errores de renderizado (Recharts, datos malformados) y muestra fallback amigable.
 */
export default class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center bg-background-elevated/40 rounded-2xl border border-border-subtle min-h-[200px]">
          <AlertTriangle size={32} className="text-error-on-alpha mb-3" />
          <p className="text-text-primary font-medium mb-1">No pudimos mostrar este gráfico</p>
          <p className="text-text-muted text-sm mb-4">Los datos pueden estar en un formato inesperado.</p>
          <ButtonPremium variant="secondary" size="sm" onClick={this.handleReset}>
            <RefreshCw size={14} className="mr-1.5" />
            Reintentar
          </ButtonPremium>
        </div>
      );
    }
    return this.props.children;
  }
}
