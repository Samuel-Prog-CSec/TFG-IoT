/**
 * @fileoverview Componente raíz de la aplicación
 * Integra AuthProvider, Router y sistema de notificaciones.
 * 
 * @module App
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, GuestRoute, RequireRole } from './components/auth';
import AppLayout from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common';
import { ROUTES } from './constants/routes';
import RFIDModeHandler from './components/game/RFIDModeHandler';
import { RfidModeProvider } from './context';

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

// Auth pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// Admin pages
const ApprovalPanel = lazy(() => import('./pages/admin/ApprovalPanel'));
const StudentManagement = lazy(() => import('./pages/admin/StudentManagement'));

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
            className="w-16 h-16 rounded-full border-4 border-brand-base/20 animate-spin" 
            style={{ borderTopColor: 'var(--color-brand-base)' }}
            aria-hidden="true"
          />
          <div 
            className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent animate-ping"
            style={{ borderTopColor: 'var(--color-brand-base)', opacity: 0.3 }}
            aria-hidden="true"
          />
        </div>
        <p className="text-text-muted text-sm font-medium animate-pulse">Cargando plataforma...</p>
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
 * Componente que envuelve el contenido de la aplicación para poder usar useLocation
 */
function AppContent() {
  return (
    <>
      <Routes>
        {/* RUTAS PÚBLICAS */}
        <Route path="/login" element={<GuestRoute><SuspenseWrapper><Login /></SuspenseWrapper></GuestRoute>} />
        <Route path="/register" element={<GuestRoute><SuspenseWrapper><Register /></SuspenseWrapper></GuestRoute>} />

        {/* RUTAS PROTEGIDAS */}
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
          <Route path="dashboard" element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
          <Route path="decks" element={<SuspenseWrapper><CardDecksPage /></SuspenseWrapper>} />
          <Route path="decks/new" element={<SuspenseWrapper><DeckCreationWizard /></SuspenseWrapper>} />
          <Route path="decks/:deckId" element={<SuspenseWrapper><CardDeckDetailPage /></SuspenseWrapper>} />
          <Route path="decks/:deckId/edit" element={<SuspenseWrapper><DeckEditPage /></SuspenseWrapper>} />
          <Route path="contexts" element={<SuspenseWrapper><ContextsPage /></SuspenseWrapper>} />
          <Route path="contexts/:contextId" element={<SuspenseWrapper><ContextDetailPage /></SuspenseWrapper>} />
          <Route path="sessions" element={<SuspenseWrapper><SessionsPage /></SuspenseWrapper>} />
          <Route path="sessions/:sessionId" element={<SuspenseWrapper><SessionDetail /></SuspenseWrapper>} />
          <Route path="sessions/:sessionId/edit" element={<SuspenseWrapper><SessionEdit /></SuspenseWrapper>} />
          <Route path="create-session" element={<SuspenseWrapper><CreateSession /></SuspenseWrapper>} />
          <Route path="board-setup" element={<SuspenseWrapper><BoardSetup /></SuspenseWrapper>} />
          <Route path="board-setup/:sessionId" element={<SuspenseWrapper><BoardSetup /></SuspenseWrapper>} />
          <Route path="students/transfer" element={
            <RequireRole roles="super_admin">
              <SuspenseWrapper><TransferStudents /></SuspenseWrapper>
            </RequireRole>
          } />
        </Route>

        {/* RUTAS DE ADMIN */}
        <Route path="/admin" element={<ProtectedRoute><RequireRole roles="super_admin"><AppLayout /></RequireRole></ProtectedRoute>}>
          <Route path="approvals" element={<SuspenseWrapper><ApprovalPanel /></SuspenseWrapper>} />
          <Route path="students" element={<SuspenseWrapper><StudentManagement /></SuspenseWrapper>} />
        </Route>

        {/* RUTAS DE JUEGO */}
        <Route path="/game/:sessionId" element={<ProtectedRoute><SuspenseWrapper><GameSession /></SuspenseWrapper></ProtectedRoute>} />

        {/* FALLBACK */}
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
      
      <RFIDModeHandler />
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
      </AuthProvider>
    </BrowserRouter>
  );
}
