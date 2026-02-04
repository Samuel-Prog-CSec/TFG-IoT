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
const DeckEditPage = lazy(() => import('./pages/DeckEditPage'));

// Auth pages
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

// Admin pages
const ApprovalPanel = lazy(() => import('./pages/admin/ApprovalPanel'));

/**
 * Loading fallback component con spinner animado
 */
function PageLoader() {
  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-slate-950"
      role="status"
      aria-label="Cargando página"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div 
            className="w-16 h-16 rounded-full border-4 border-purple-500/20 animate-spin" 
            style={{ borderTopColor: '#8b5cf6' }}
            aria-hidden="true"
          />
          <div 
            className="absolute inset-0 w-16 h-16 rounded-full border-4 border-transparent animate-ping"
            style={{ borderTopColor: 'rgba(139, 92, 246, 0.3)' }}
            aria-hidden="true"
          />
        </div>
        <p className="text-slate-400 text-sm animate-pulse">Cargando...</p>
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
 * Componente de rutas de la aplicación
 */
function AppRoutes() {
  return (
    <Routes>
      {/* ============================================ */}
      {/* RUTAS PÚBLICAS (solo para usuarios NO autenticados) */}
      {/* ============================================ */}
      <Route 
        path="/login" 
        element={
          <GuestRoute>
            <SuspenseWrapper><Login /></SuspenseWrapper>
          </GuestRoute>
        } 
      />
      <Route 
        path="/register" 
        element={
          <GuestRoute>
            <SuspenseWrapper><Register /></SuspenseWrapper>
          </GuestRoute>
        } 
      />

      {/* ============================================ */}
      {/* RUTAS PROTEGIDAS (requieren autenticación) */}
      {/* ============================================ */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
        <Route path="dashboard" element={<SuspenseWrapper><Dashboard /></SuspenseWrapper>} />
        
        {/* Gestión de Mazos de Cartas */}
        <Route path="decks" element={<SuspenseWrapper><CardDecksPage /></SuspenseWrapper>} />
        <Route path="decks/new" element={<SuspenseWrapper><DeckCreationWizard /></SuspenseWrapper>} />
        <Route path="decks/:deckId/edit" element={<SuspenseWrapper><DeckEditPage /></SuspenseWrapper>} />

        {/* Sesiones de juego (configuración) */}
        <Route path="sessions" element={<SuspenseWrapper><SessionsPage /></SuspenseWrapper>} />
        <Route path="sessions/:sessionId" element={<SuspenseWrapper><SessionDetail /></SuspenseWrapper>} />
        <Route path="sessions/:sessionId/edit" element={<SuspenseWrapper><SessionEdit /></SuspenseWrapper>} />
        
        <Route path="create-session" element={<SuspenseWrapper><CreateSession /></SuspenseWrapper>} />
        <Route path="board-setup" element={<SuspenseWrapper><BoardSetup /></SuspenseWrapper>} />
        <Route path="board-setup/:sessionId" element={<SuspenseWrapper><BoardSetup /></SuspenseWrapper>} />
        <Route path="students/transfer" element={
          <RequireRole roles={['teacher', 'super_admin']}>
            <SuspenseWrapper><TransferStudents /></SuspenseWrapper>
          </RequireRole>
        } />
      </Route>

      {/* ============================================ */}
      {/* RUTAS DE ADMIN (solo para super_admin) */}
      {/* ============================================ */}
      <Route 
        path="/admin" 
        element={
          <ProtectedRoute>
            <RequireRole roles="super_admin">
              <AppLayout />
            </RequireRole>
          </ProtectedRoute>
        }
      >
        <Route path="approvals" element={<SuspenseWrapper><ApprovalPanel /></SuspenseWrapper>} />
      </Route>

      {/* ============================================ */}
      {/* RUTAS DE JUEGO (pantalla completa, sin layout) */}
      {/* ============================================ */}
      <Route 
        path="/game/:sessionId" 
        element={
          <ProtectedRoute>
            <SuspenseWrapper><GameSession /></SuspenseWrapper>
          </ProtectedRoute>
        } 
      />

      {/* ============================================ */}
      {/* FALLBACK - Redirigir a home */}
      {/* ============================================ */}
      <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
    </Routes>
  );
}

/**
 * Componente raíz de la aplicación
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        
        {/* Sistema de notificaciones toast */}
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
      </AuthProvider>
    </BrowserRouter>
  );
}
