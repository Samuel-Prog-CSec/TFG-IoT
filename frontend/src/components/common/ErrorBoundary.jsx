import { Component } from 'react';
import PropTypes from 'prop-types';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import ButtonPremium from '../ui/ButtonPremium';
import { captureException } from '../../lib/sentry';

/**
 * Error Boundary Component
 * Captura errores en componentes hijos y muestra una UI de fallback
 *
 * @example
 * <ErrorBoundary fallback={<CustomError />}>
 *   <MyComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Actualizar estado para mostrar UI de fallback
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Enviar error a Sentry
    captureException(error, { react: { componentStack: errorInfo.componentStack } });
    
    // Registrar error local de forma segura
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    globalThis.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Renderizar UI de fallback personalizada si se proporciona
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // UI de fallback por defecto
      return (
        <div 
          role="alert"
          aria-live="assertive"
          className="min-h-screen flex items-center justify-center p-4 bg-background-base"
        >
          <div className="max-w-md w-full text-center">
            {/* Icono de error */}
            <div className="mb-6">
              <div className="size-20 mx-auto rounded-full bg-error-base/20 flex items-center justify-center">
                <AlertTriangle
                  size={40}
                  className="text-error-base"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Mensaje principal */}
            <h1 className="text-2xl font-bold text-text-primary mb-2 font-display">
              ¡Ups! Algo salió mal
            </h1>
            <p className="text-text-muted mb-2">
              Ha ocurrido un error inesperado. Por favor, intenta de nuevo.
            </p>
            <p className="text-text-disabled text-sm mb-6">
              Si el problema persiste, recarga la página o contacta al soporte.
            </p>

            {/* Detalles del error (solo en desarrollo) */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-sm text-text-disabled cursor-pointer hover:text-text-muted">
                  Ver detalles del error
                </summary>
                <pre className="mt-2 p-4 bg-background-elevated/50 rounded-lg text-xs text-error-base overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            {/* Acciones */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <ButtonPremium
                variant="primary"
                onClick={this.handleReset}
                icon={<RefreshCw size={18} aria-hidden="true" />}
              >
                Intentar de nuevo
              </ButtonPremium>
              <ButtonPremium
                variant="secondary"
                onClick={this.handleGoHome}
                icon={<Home size={18} aria-hidden="true" />}
              >
                Ir al inicio
              </ButtonPremium>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.node,
  onError: PropTypes.func,
  onReset: PropTypes.func,
};

export default ErrorBoundary;
