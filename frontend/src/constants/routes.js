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
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_APPROVALS: '/admin/approvals',
  STUDENT_MANAGEMENT: '/admin/students',
  ADMIN_CONTEXTS: '/admin/contexts',
  ADMIN_SYSTEM_ALERTS: '/admin/system-alerts',
  ADMIN_MFA_SETUP: '/admin/mfa-setup',

  // Publicas
  PRIVACY: '/privacy',
};

/**
 * Whitelist de rutas internas válidas para `redirect_to` / `from` post-login.
 * Cualquier path que NO empiece por estos prefijos se considera externo y se
 * ignora (defensa contra open redirect: `?from=//evil.com`, `javascript:...`,
 * `data:...`).
 *
 * T-905 B6.
 */
const SAFE_REDIRECT_PREFIXES = [
  '/dashboard',
  '/create-session',
  '/board-setup',
  '/game',
  '/sessions',
  '/contexts',
  '/decks',
  '/students',
  '/analytics',
  '/admin',
  '/privacy'
];

/**
 * Determina si una ruta `from` es segura para redirigir post-login.
 *
 * Reglas:
 * - Debe ser un string no vacío.
 * - Debe empezar por `/` y NO por `//` (que sería protocol-relative externa).
 * - No puede contener esquemas peligrosos (`javascript:`, `data:`, `file:`, `vbscript:`).
 * - Debe coincidir con uno de los prefijos en {@link SAFE_REDIRECT_PREFIXES} o ser exactamente
 *   `/login`/`/register` (se rechazan más adelante explícitamente).
 *
 * @param {unknown} path
 * @returns {boolean}
 */
export const isSafeRedirectPath = path => {
  if (typeof path !== 'string' || path.length === 0) {
    return false;
  }
  // Cualquier scheme peligroso (non-capturing group para silenciar regexp/no-unused-capturing-group)
  if (/^\s*(?:javascript|data|file|vbscript|about):/i.test(path)) {
    return false;
  }
  // Protocol-relative externa (//evil.com)
  if (path.startsWith('//') || path.startsWith('\\\\')) {
    return false;
  }
  // Debe ser absoluta interna
  if (!path.startsWith('/')) {
    return false;
  }
  // Whitelist por prefijo
  return SAFE_REDIRECT_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
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
    label: 'Análisis',
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
 * Rutas de navegación del sidebar para super_admin.
 *
 * `Dashboard` es la nueva landing del super_admin (T-942 Fase D): muestra
 * KPIs agregados del centro educativo. `Aprobaciones` mantiene la posición
 * #2 y queda preparada para mostrar un badge contador con `pendingTeachers`
 * (campo `badgeKey: 'pendingTeachers'`) cuando AppLayout inyecte ese dato.
 * El render del badge requiere que el padre pase un mapa `badgeCounts` al
 * NavItem; mientras no exista, la propiedad se ignora silenciosamente.
 */
export const ADMIN_NAV_ROUTES = [
  {
    path: ROUTES.ADMIN_DASHBOARD,
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    dataTour: 'admin-dashboard',
  },
  {
    path: ROUTES.ADMIN_APPROVALS,
    label: 'Aprobaciones',
    icon: 'UserCheck',
    dataTour: 'approvals',
    badgeKey: 'pendingTeachers',
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
  {
    path: ROUTES.ADMIN_SYSTEM_ALERTS,
    label: 'Alertas y avisos',
    icon: 'ShieldAlert',
    dataTour: 'admin-system-alerts',
  },
  {
    path: ROUTES.ADMIN_MFA_SETUP,
    label: 'Seguridad de la cuenta',
    icon: 'KeyRound',
    dataTour: 'admin-mfa',
  },
];

