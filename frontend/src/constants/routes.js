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
  STUDENT_PROFILE: (studentId) => `/students/${studentId}`,
  // Convencion unificada: rutas exclusivas de super_admin van bajo /admin/*.
  // El path antiguo /students/transfer se mantiene como redirect en App.jsx (PROP-56).
  STUDENT_TRANSFER: '/admin/students/transfer',

  // Sesiones
  SESSIONS: '/sessions',
  SESSION_DETAIL: (sessionId) => `/sessions/${sessionId}`,
  SESSION_EDIT: (sessionId) => `/sessions/${sessionId}/edit`,
  
  // Contextos
  CONTEXTS: '/contexts',
  CONTEXT_DETAIL: (contextId) => `/contexts/${contextId}`,
  
  // Gestión de Mazos de Cartas (CardDecks)
  CARD_DECKS: '/decks',
  CARD_DECKS_NEW: '/decks/new',
  CARD_DECKS_DETAIL: (deckId) => `/decks/${deckId}`,
  CARD_DECKS_EDIT: (deckId) => `/decks/${deckId}/edit`,
  
  // Analytics
  STUDENTS_ANALYTICS: '/analytics/students',
  INSIGHTS: '/analytics/insights',

  // Admin (solo super_admin)
  ADMIN_APPROVALS: '/admin/approvals',
  STUDENT_MANAGEMENT: '/admin/students',
  ADMIN_CONTEXTS: '/admin/contexts',

  // Publicas
  PRIVACY: '/privacy',
};

/**
 * Rutas de navegación del sidebar para profesores
 */
export const NAV_ROUTES = [
  {
    path: ROUTES.DASHBOARD,
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    dataTour: 'dashboard',
  },
  {
    path: ROUTES.STUDENTS_ANALYTICS,
    label: 'Mis Alumnos',
    icon: 'Users',
    dataTour: 'my-students',
  },
  {
    path: ROUTES.INSIGHTS,
    label: 'Insights',
    icon: 'TrendingUp',
    dataTour: 'insights',
  },
  {
    path: ROUTES.SESSIONS,
    label: 'Sesiones',
    icon: 'CalendarClock',
    dataTour: 'sessions',
  },
  {
    path: ROUTES.CONTEXTS,
    label: 'Contextos',
    icon: 'Palette',
    dataTour: 'contexts',
  },
  {
    path: ROUTES.CARD_DECKS,
    label: 'Mis Mazos',
    icon: 'Layers',
    dataTour: 'my-decks',
  },
  {
    path: ROUTES.CREATE_SESSION,
    label: 'Nueva Sesión',
    icon: 'PlusCircle',
    dataTour: 'new-session',
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
    dataTour: 'approvals',
  },
  {
    path: ROUTES.STUDENT_TRANSFER,
    label: 'Transferencias',
    icon: 'ArrowRightLeft',
    dataTour: 'admin-transfers',
  },
  {
    path: ROUTES.STUDENT_MANAGEMENT,
    label: 'Alumnos',
    icon: 'Users',
    dataTour: 'admin-students',
  },
  {
    path: ROUTES.ADMIN_CONTEXTS,
    label: 'Contextos',
    icon: 'Palette',
    dataTour: 'admin-contexts',
  },
];

export default ROUTES;
