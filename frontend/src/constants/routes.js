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

  // Alumnos
  STUDENT_TRANSFER: '/students/transfer',

  // Sesiones
  SESSIONS: '/sessions',
  SESSION_DETAIL: (sessionId) => `/sessions/${sessionId}`,
  SESSION_EDIT: (sessionId) => `/sessions/${sessionId}/edit`,
  
  // Gestión de Mazos de Cartas (CardDecks)
  CARD_DECKS: '/decks',
  CARD_DECKS_NEW: '/decks/new',
  CARD_DECKS_DETAIL: (deckId) => `/decks/${deckId}`,
  CARD_DECKS_EDIT: (deckId) => `/decks/${deckId}/edit`,
  
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
    path: ROUTES.SESSIONS,
    label: 'Sesiones',
    icon: 'CalendarClock',
  },
  {
    path: ROUTES.STUDENT_TRANSFER,
    label: 'Transferencias',
    icon: 'ArrowRightLeft',
  },
  {
    path: ROUTES.CARD_DECKS,
    label: 'Mis Mazos',
    icon: 'Layers',
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
