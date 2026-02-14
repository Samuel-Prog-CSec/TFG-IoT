/**
 * @fileoverview Componente de ruta para invitados (no autenticados)
 * Redirige a dashboard si el usuario ya está autenticado.
 * 
 * @module components/auth/GuestRoute
 */

import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLoader } from '../common';
import { ROUTES } from '../../constants/routes';

/**
 * Componente de ruta para invitados
 * Redirige a dashboard/admin si ya está autenticado
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Componente a renderizar si no autenticado
 */
export default function GuestRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras verifica
  if (isLoading) {
    return <AuthLoader message="Cargando..." />;
  }

  // Redirigir si ya está autenticado
  if (isAuthenticated && user) {
    // Determinar destino según rol
    const destination = user.role === 'super_admin' 
      ? ROUTES.ADMIN_APPROVALS 
      : ROUTES.DASHBOARD;

    // Obtener ruta original si existe
    const from = location.state?.from?.pathname || destination;

    return <Navigate to={from} replace />;
  }

  return children;
}

GuestRoute.propTypes = {
  /** Componente a renderizar si no autenticado */
  children: PropTypes.node.isRequired,
};
