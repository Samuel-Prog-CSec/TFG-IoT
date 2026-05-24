/**
 * @fileoverview Componente raíz de la aplicación
 * Integra AuthProvider, Router y sistema de notificaciones.
 * 
 * @module App
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, memo, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Toaster } from 'sonner';
import { LazyMotion, domAnimation } from 'framer-motion';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { AtmosphereProvider } from './context/AtmosphereContext';
import { ShortcutRegistryProvider } from './context/ShortcutRegistryContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import GuestRoute from './components/auth/GuestRoute';
import RequireRole from './components/auth/RequireRole';
import AppLayout from './components/layout/AppLayout';
import GameLayout from './components/layout/GameLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ROUTES } from './constants/routes';
import RFIDModeHandler from './components/game/RFIDModeHandler';
import TopProgressBar from './components/ui/TopProgressBar';
import { RfidModeProvider } from './context/RfidModeContext';
import GlobalShortcuts from './components/system/GlobalShortcuts';
import MfaChallengeModal from './components/auth/MfaChallengeModal'; // T-905 B7
import MfaEnrollmentRedirect from './components/auth/MfaEnrollmentRedirect'; // T-905 B7

// Lazy loaded pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateSession = lazy(() => import('./pages/CreateSession'));
const BoardSetup = lazy(() => import('./pages/BoardSetup'));
const GameSession = lazy(() => import('./pages/GameSession'));
const TransferStudents = lazy(() => import('./pages/TransferStudents'));
const SessionsPage = lazy(() => import('./pages/SessionsPage'));
const SessionDetail = lazy(() => import('./pages/SessionDetail'));
const SessionEdit = lazy(() => import('./pages/SessionEdit'));

// Card Decks pages
const CardDecksPage = lazy(() => import('./pages/CardDecksPage'));
const DeckCreationWizard = lazy(() => import('./pages/DeckCreationWizard'));
const CardDeckDetailPage = lazy(() => import('./pages/CardDeckDetailPage'));
const DeckEditPage = lazy(() => import('./pages/DeckEditPage'));

// Contexts pages
const ContextsPage = lazy(() => import('./pages/ContextsPage'));
const ContextDetailPage = lazy(() => import('./pages/ContextDetailPage'));

// Analytics pages
const StudentProfile = lazy(() => import('./pages/StudentProfile'));
const StudentsAnalytics = lazy(() => import('./pages/StudentsAnalytics'));
const InsightsReports = lazy(() => import('./pages/InsightsReports'));

// Auth pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// Error pages
const NotFound = lazy(() => import('./pages/NotFound'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard')); // T-942 Fase D
const ApprovalPanel = lazy(() => import('./pages/admin/ApprovalPanel'));
const StudentManagement = lazy(() => import('./pages/admin/StudentManagement'));
const AdminContexts = lazy(() => import('./pages/admin/AdminContexts'));
const SystemAlertsPage = lazy(() => import('./pages/admin/SystemAlertsPage')); // T-942
const MfaSetupPage = lazy(() => import('./pages/admin/MfaSetup')); // T-905 B7

// Public pages
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

/**
 * Loading fallback con delay anti-flash + skeleton estructurado.
 *
 * Antes era un spinner full-screen que aparecía instantáneamente; en chunks
 * cacheados (carga <200ms) producía un "flash" molesto, y en chunks frescos
 * el "Cargando sección..." sobre fondo vacío se sentía lento y genérico.
 *
 * Ahora: durante los primeros 220ms no renderiza nada (suprime el flash en
 * navegaciones rápidas). A partir de 220ms muestra un skeleton estructural
 * (header + grid de cards + chart) que reserva el espacio sin gritar
 * "espera", reduciendo la percepción de latencia.
 */
function PageLoader() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 220);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <output
      className="block w-full p-6 lg:p-8 space-y-6"
      aria-label="Cargando página"
    >
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-xl bg-background-elevated/40 animate-pulse" aria-hidden="true" />
        <div className="space-y-2 flex-1 max-w-md">
          <div className="h-3 w-24 rounded-full bg-background-elevated/40 animate-pulse" aria-hidden="true" />
          <div className="h-6 w-64 rounded-md bg-background-elevated/40 animate-pulse" aria-hidden="true" />
        </div>
      </div>

      {/* KPI grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={`pl-kpi-${i}`}
            className="h-24 rounded-2xl bg-background-elevated/30 border border-border-subtle/40 animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-2 h-64 rounded-2xl bg-background-elevated/30 border border-border-subtle/40 animate-pulse"
          aria-hidden="true"
        />
        <div
          className="h-64 rounded-2xl bg-background-elevated/30 border border-border-subtle/40 animate-pulse"
          aria-hidden="true"
        />
      </div>
    </output>
  );
}

/**
 * Suspense wrapper con ErrorBoundary para lazy loading seguro
 */
function SuspenseWrapper({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Renderiza children solo si el usuario esta autenticado (sin redirect)
 */
const AuthenticatedOnly = memo(function AuthenticatedOnly({ children }) {
  const { isAuthenticated, isLoading, isSuperAdmin } = useAuth();
  if (isLoading || !isAuthenticated || isSuperAdmin) return null;
  return children;
});

AuthenticatedOnly.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * Componente que envuelve el contenido de la aplicación para poder usar useLocation
 */
function AppContent() {
  return (
    <>
      {/* Barra de progreso superior durante navegacion entre rutas (estilo NProgress) */}
      <TopProgressBar />

      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<GuestRoute><SuspenseWrapper><Login /></SuspenseWrapper></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><SuspenseWrapper><Register /></SuspenseWrapper></GuestRoute>} />
        <Route path="/privacy" element={<SuspenseWrapper><PrivacyPage /></SuspenseWrapper>} />

        {/* RUTAS PROTEGIDAS (profesor + admin comparten layout) */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
          <Route path="dashboard" element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />

          {/* Rutas exclusivas de profesor — admin redirige a su Dashboard
              (T-942 Fase D: ya no a /admin/approvals). */}
          <Route path="decks" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><CardDecksPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/new" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><DeckCreationWizard /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><CardDeckDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId/edit" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><DeckEditPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><ContextsPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts/:contextId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><ContextDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><SessionsPage /></SuspenseWrapper></RequireRole>} />
          {/* Redirect /sessions/new → /create-session para URLs intuitivas
              (QA 04/05 — el patrón /sessions/:id capturaba "new" como id y
              caía en SessionDetail con error 400 "Parámetros de ruta inválidos"). */}
          <Route path="sessions/new" element={<Navigate to="/create-session" replace />} />
          <Route path="sessions/:sessionId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><SessionDetail /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions/:sessionId/edit" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><SessionEdit /></SuspenseWrapper></RequireRole>} />
          <Route path="create-session" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><CreateSession /></SuspenseWrapper></RequireRole>} />
          <Route path="board-setup" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><BoardSetup /></SuspenseWrapper></RequireRole>} />
          <Route path="board-setup/:sessionId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><BoardSetup /></SuspenseWrapper></RequireRole>} />
          <Route path="students/:studentId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><StudentProfile /></SuspenseWrapper></RequireRole>} />
          {/* Redirect /students → /analytics/students para URLs tipeadas o
              bookmarks antiguos (QA 23/04 — evita 404 innecesario). */}
          <Route path="students" element={<Navigate to="/analytics/students" replace />} />
          <Route path="analytics/students" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><StudentsAnalytics /></SuspenseWrapper></RequireRole>} />
          <Route path="analytics/insights" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_DASHBOARD}><SuspenseWrapper><InsightsReports /></SuspenseWrapper></RequireRole>} />

          {/* Redirect del path antiguo /students/transfer al canónico /admin/students/transfer
              para no romper bookmarks externos tras la unificación de URLs admin (PROP-56). */}
          <Route path="students/transfer" element={<Navigate to="/admin/students/transfer" replace />} />

          {/* 404 dentro del layout para usuarios autenticados — preserva sidebar
              y header para que el usuario no pierda contexto de navegación (PROP-50). */}
          <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
        </Route>

        {/* RUTAS DE ADMIN */}
        <Route path="/admin" element={<ProtectedRoute><RequireRole roles="super_admin"><AppLayout /></RequireRole></ProtectedRoute>}>
          {/* /admin sin sub-ruta redirige al Dashboard del centro (T-942 Fase D):
              el super_admin aterriza en una vista de KPIs agregados, no en la
              cola de aprobaciones. Mantiene Aprobaciones a un click desde el
              sidebar. Antes redirigía a /admin/approvals (BUG-ADMIN-1). */}
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<SuspenseWrapper><AdminDashboard /></SuspenseWrapper>} />
          <Route path="approvals" element={<SuspenseWrapper><ApprovalPanel /></SuspenseWrapper>} />
          <Route path="students" element={<SuspenseWrapper><StudentManagement /></SuspenseWrapper>} />
          <Route path="students/transfer" element={<SuspenseWrapper><TransferStudents /></SuspenseWrapper>} />
          <Route path="contexts" element={<SuspenseWrapper><AdminContexts /></SuspenseWrapper>} />
          <Route path="system-alerts" element={<SuspenseWrapper><SystemAlertsPage /></SuspenseWrapper>} />
          <Route path="mfa-setup" element={<SuspenseWrapper><MfaSetupPage /></SuspenseWrapper>} />
          {/* 404 dentro del layout admin */}
          <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
        </Route>

        {/* RUTAS DE JUEGO */}
        <Route path="/game" element={<ProtectedRoute><GameLayout /></ProtectedRoute>}>
          <Route path=":sessionId" element={<SuspenseWrapper><GameSession /></SuspenseWrapper>} />
        </Route>

        {/* FALLBACK — 404 standalone para usuarios sin sesión.
            Los catch-all dentro de los layouts protegidos cubren a los autenticados. */}
        <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
      </Routes>

      <AuthenticatedOnly><RFIDModeHandler /></AuthenticatedOnly>
    </>
  );
}

/**
 * Toaster envuelto que consume el tema actual para que las notificaciones
 * Sonner se rendericen en claro u oscuro según la elección del usuario.
 * Sin esto, los toasts aparecían siempre con fondo oscuro encima del
 * tema claro y rompían la coherencia (T-951 Fase 1).
 */
function ThemeAwareToaster() {
  const { resolvedTheme } = useTheme();
  // El "background" se delega a Sonner según el tema. Mantenemos una
  // ligera personalización (border y blur) que aplica en ambos.
  return (
    <Toaster
      // bottom-right libera el top-right para el ThemeToggle de auth
      // (Login, Register) que necesita estar visible en el primer
      // plano de visión del usuario al entrar a la app — fix QA
      // 2026-05-10. El bottom-right también queda fuera del flujo de
      // lectura del docente y reserva el área principal a contenido.
      position="bottom-right"
      expand={false}
      richColors
      closeButton
      theme={resolvedTheme}
      toastOptions={{
        duration: 4000,
        style: {
          backdropFilter: 'blur(8px)',
        },
      }}
    />
  );
}

/**
 * Componente raíz de la aplicación
 */
export default function App() {
  return (
    /*
     * T-907 INT2: LazyMotion + features={domAnimation} carga ~25 KB del bundle
     * de Framer Motion en lugar de los ~50 KB del bundle completo. La
     * migración de `motion.X` → `m.X` se hizo via alias `m as motion` en los
     * imports (28 archivos) para no tocar el JSX existente; el componente
     * subyacente es ahora la versión "light" `m`, que cumple con LazyMotion.
     * Sin `strict` por seguridad: si algún archivo usa `motion.X` directo en
     * lugar del alias, Framer carga el bundle completo dinámicamente en lugar
     * de lanzar error en runtime — degradación graceful.
     */
    <LazyMotion features={domAnimation}>
      <ThemeProvider>
        <AtmosphereProvider>
          <BrowserRouter>
            <AuthProvider>
              <RfidModeProvider>
                {/* ShortcutRegistry centraliza secciones de atajos para que el
                    overlay `Shift+?` agregue global + contextuales. GlobalShortcuts
                    vive dentro del registry para registrar la sección "Sistema"
                    (Shift+T, Shift+?, Escape) y poner UN ÚNICO listener keydown
                    que escucha cualquier atajo de cualquier fuente — funciona en
                    Login, Register, AppLayout y GameLayout sin acoplarse a un
                    layout concreto. */}
                <ShortcutRegistryProvider>
                  <GlobalShortcuts />
                  <AppContent />
                  <MfaChallengeModal />
                  <MfaEnrollmentRedirect />
                  <ThemeAwareToaster />
                </ShortcutRegistryProvider>
              </RfidModeProvider>
            </AuthProvider>
          </BrowserRouter>
        </AtmosphereProvider>
      </ThemeProvider>
    </LazyMotion>
  );
}
