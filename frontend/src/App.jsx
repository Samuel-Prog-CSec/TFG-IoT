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
import { ThemeProvider, useTheme } from './context/ThemeContext';
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

// Public pages
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

/**
 * Loading fallback component con spinner animado
 */
function PageLoader() {
  return (
    <output
      className="block min-h-screen flex items-center justify-center bg-background-base transition-colors duration-500"
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

          {/* Rutas exclusivas de profesor — admin redirige a su panel */}
          <Route path="decks" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><CardDecksPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/new" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><DeckCreationWizard /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><CardDeckDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="decks/:deckId/edit" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><DeckEditPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><ContextsPage /></SuspenseWrapper></RequireRole>} />
          <Route path="contexts/:contextId" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><ContextDetailPage /></SuspenseWrapper></RequireRole>} />
          <Route path="sessions" element={<RequireRole roles="teacher" redirectTo={ROUTES.ADMIN_APPROVALS}><SuspenseWrapper><SessionsPage /></SuspenseWrapper></RequireRole>} />
          {/* Redirect /sessions/new → /create-session para URLs intuitivas
              (QA 04/05 — el patrón /sessions/:id capturaba "new" como id y
              caía en SessionDetail con error 400 "Parámetros de ruta inválidos"). */}
          <Route path="sessions/new" element={<Navigate to="/create-session" replace />} />
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
    <ThemeProvider>
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
              <ThemeAwareToaster />
            </ShortcutRegistryProvider>
          </RfidModeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
