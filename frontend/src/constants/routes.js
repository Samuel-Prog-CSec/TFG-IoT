/**
 * Rutas de la aplicación
 * Centraliza todas las rutas para evitar strings mágicos
 */

export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  CREATE_SESSION: '/create-session',
  BOARD_SETUP: '/board-setup',
  BOARD_SETUP_WITH_ID: (sessionId) => `/board-setup/${sessionId}`,
  GAME: (sessionId) => `/game/${sessionId}`,
};

/**
 * Rutas de navegación del sidebar
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

export default ROUTES;
