/**
 * @fileoverview Componente de ruta protegida que requiere autenticación
 * Redirige a login si el usuario no está autenticado.
 * 
 * @module components/auth/ProtectedRoute
 */

import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLoader } from '../common';
import { ROUTES } from '../../constants/routes';

/**
 * Componente de ruta protegida
 * Redirige a login si no está autenticado
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componente a renderizar si autenticado
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica
  if (isLoading) {
    return <AuthLoader message="Verificando sesión..." />;
  }

  // Redirigir a login si no autenticado
  if (!isAuthenticated) {
    return (
      <Navigate 
        to={ROUTES.LOGIN} 
        state={{ from: location }} 
        replace 
      />
    );
  }

  return children;
}

ProtectedRoute.propTypes = {
  /** Componente a renderizar si autenticado */
  children: PropTypes.node.isRequired,
};
