/**
 * Rutas de la aplicación
 * Centraliza todas las rutas para evitar strings mágicos
 */

export const ROUTES = {
  // Públicas (sin autenticación)
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  
  // Protegidas (requieren autenticación)
  DASHBOARD: '/dashboard',
  CREATE_SESSION: '/create-session',
  BOARD_SETUP: '/board-setup',
  BOARD_SETUP_WITH_ID: (sessionId) => `/board-setup/${sessionId}`,
  GAME: (sessionId) => `/game/${sessionId}`,
  
  // Admin (solo super_admin)
  ADMIN_APPROVALS: '/admin/approvals',
};

/**
 * Rutas de navegación del sidebar para profesores
 */
export const NAV_ROUTES = [
  {
    path: ROUTES.DASHBOARD,
    label: 'Dashboard',
    icon: 'LayoutDashboard',
  },
  {
    path: ROUTES.CREATE_SESSION,
    label: 'Nueva Sesión',
    icon: 'PlusCircle',
  },
];

/**
 * Rutas de navegación del sidebar para super_admin
 */
export const ADMIN_NAV_ROUTES = [
  {
    path: ROUTES.ADMIN_APPROVALS,
    label: 'Aprobaciones',
    icon: 'UserCheck',
  },
  {
    path: ROUTES.DASHBOARD,
    label: 'Dashboard',
    icon: 'LayoutDashboard',
  },
];

export default ROUTES;
