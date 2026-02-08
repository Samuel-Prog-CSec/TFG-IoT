/**
 * @fileoverview Componente que requiere un rol específico para acceder
 * Redirige a página principal si el usuario no tiene el rol requerido.
 * 
 * @module components/auth/RequireRole
 */

import PropTypes from 'prop-types';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

/**
 * Componente que requiere un rol específico
 * 
 * @param {Object} props
 * @param {string|string[]} props.roles - Rol(es) permitido(s)
 * @param {React.ReactNode} props.children - Componente a renderizar si autorizado
 * @param {string} props.redirectTo - Ruta de redirección si no autorizado (default: dashboard)
 */
export default function RequireRole({ 
  roles, 
  children, 
  redirectTo = ROUTES.DASHBOARD 
}) {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Esperar a que se verifique la autenticación
  if (isLoading) {
    return null;
  }

  // Si no está autenticado, ProtectedRoute ya manejará la redirección
  if (!isAuthenticated || !user) {
    return null;
  }

  // Normalizar roles a array
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  // Verificar si el usuario tiene alguno de los roles permitidos
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

RequireRole.propTypes = {
  /** Rol(es) permitido(s) para acceder */
  roles: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.arrayOf(PropTypes.string),
  ]).isRequired,
  /** Componente a renderizar si autorizado */
  children: PropTypes.node.isRequired,
  /** Ruta de redirección si no autorizado */
  redirectTo: PropTypes.string,
};
