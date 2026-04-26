/**
 * @fileoverview Componente raíz de la aplicación
 * Integra AuthProvider, Router y sistema de notificaciones.
 * 
 * @module App
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, memo } from 'react';
import PropTypes from 'prop-types';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import GuestRoute from './components/auth/GuestRoute';
import RequireRole from './components/auth/RequireRole';
import AppLayout from './components/layout/AppLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ROUTES } from './constants/routes';
import RFIDModeHandler from './components/game/RFIDModeHandler';
import TopProgressBar from './components/ui/TopProgressBar';
import { RfidModeProvider } from './context/RfidModeContext';
import { FeatureFlagsProvider } from './context/FeatureFlagsContext';

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
const ApprovalPanel = lazy(() => import('./pages/admin/ApprovalPanel'));
const StudentManagement = lazy(() => import('./pages/admin/StudentManagement'));
const AdminContexts = lazy(() => import('./pages/admin/AdminContexts'));
const FeatureFlagsPanel = lazy(() => import('./pages/admin/FeatureFlagsPanel'));

// Public pages
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

/**
 * Loading fallback component con spinner animado
 */
function PageLoader() {
  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-background-base transition-colors duration-500"
      role="status"
      aria-label="Cargando página"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div 
            className="size-16 rounded-full border-4 border-brand-base/20 animate-spin" 
            style={{ borderTopColor: 'var(--color-brand-base)' }}
            aria-hidden="true"
          />
          <div 
            className="absolute inset-0 size-16 rounded-full border-4 border-transparent animate-ping"
            style={{ borderTopColor: 'var(--color-brand-base)', opacity: 0.3 }}
            aria-hidden="true"
          />
        </div>
        <p className="text-text-muted text-sm font-medium animate-pulse">Cargando sección...</p>
      </div>
    </div>
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

          {/* Rutas exclusivas de profesor — admin redirige a su panel */}
          <Route path="decks" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><CardDecksPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/new" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><DeckCreationWizard /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><CardDeckDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId/edit" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><DeckEditPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><ContextsPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts/:contextId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><ContextDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><SessionsPage /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions/:sessionId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><SessionDetail /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions/:sessionId/edit" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><SessionEdit /></SuspenseWrapper></RequireRole>} />
          <Route path="create-session" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><CreateSession /></SuspenseWrapper></RequireRole>} />
          <Route path="board-setup" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><BoardSetup /></SuspenseWrapper></RequireRole>} />
          <Route path="board-setup/:sessionId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><BoardSetup /></SuspenseWrapper></RequireRole>} />
          <Route path="students/:studentId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><StudentProfile /></SuspenseWrapper></RequireRole>} />
          {/* Redirect /students → /analytics/students para URLs tipeadas o
              bookmarks antiguos (QA 23/04 — evita 404 innecesario). */}
          <Route path="students" element={<Navigate to="/analytics/students" replace />} />
          <Route path="analytics/students" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><StudentsAnalytics /></SuspenseWrapper></RequireRole>} />
          <Route path="analytics/insights" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><InsightsReports /></SuspenseWrapper></RequireRole>} />

          {/* Redirect del path antiguo /students/transfer al canónico /admin/students/transfer
              para no romper bookmarks externos tras la unificación de URLs admin (PROP-56). */}
          <Route path="students/transfer" element={<Navigate to="/admin/students/transfer" replace />} />

          {/* 404 dentro del layout para usuarios autenticados — preserva sidebar
              y header para que el usuario no pierda contexto de navegación (PROP-50). */}
          <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
        </Route>

        {/* RUTAS DE ADMIN */}
        <Route path="/admin" element={<ProtectedRoute><RequireRole roles="super_admin"><AppLayout /></RequireRole></ProtectedRoute>}>
          <Route path="approvals" element={<SuspenseWrapper><ApprovalPanel /></SuspenseWrapper>} />
          <Route path="students" element={<SuspenseWrapper><StudentManagement /></SuspenseWrapper>} />
          <Route path="students/transfer" element={<SuspenseWrapper><TransferStudents /></SuspenseWrapper>} />
          <Route path="contexts" element={<SuspenseWrapper><AdminContexts /></SuspenseWrapper>} />
          <Route path="flags" element={<SuspenseWrapper><FeatureFlagsPanel /></SuspenseWrapper>} />
          {/* 404 dentro del layout admin */}
          <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
        </Route>

        {/* RUTAS DE JUEGO */}
        <Route path="/game/:sessionId" element={<ProtectedRoute><SuspenseWrapper><GameSession /></SuspenseWrapper></ProtectedRoute>} />

        {/* FALLBACK — 404 standalone para usuarios sin sesión.
            Los catch-all dentro de los layouts protegidos cubren a los autenticados. */}
        <Route path="*" element={<SuspenseWrapper><NotFound /></SuspenseWrapper>} />
      </Routes>

      <AuthenticatedOnly><RFIDModeHandler /></AuthenticatedOnly>
    </>
  );
}

/**
 * Componente raíz de la aplicación
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FeatureFlagsProvider>
          <RfidModeProvider>
            <AppContent />
            <Toaster
              position="top-right"
              expand={false}
              richColors
              closeButton
              theme="dark"
              toastOptions={{
                duration: 4000,
                style: {
                  background: 'rgba(30, 41, 59, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(8px)',
                },
              }}
            />
          </RfidModeProvider>
        </FeatureFlagsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
