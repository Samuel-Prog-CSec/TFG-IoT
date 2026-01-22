import { createBrowserRouter } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import AppLayout from './components/layout/AppLayout';
import { ErrorBoundary } from './components/common';

// Lazy loaded pages for better performance
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CreateSession = lazy(() => import('./pages/CreateSession'));
const BoardSetup = lazy(() => import('./pages/BoardSetup'));
const GameSession = lazy(() => import('./pages/GameSession'));

/**
 * Loading fallback component con spinner animado
 */
const PageLoader = () => (
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

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <SuspenseWrapper><Dashboard /></SuspenseWrapper>,
      },
      {
        path: 'dashboard',
        element: <SuspenseWrapper><Dashboard /></SuspenseWrapper>,
      },
      {
        path: 'create-session',
        element: <SuspenseWrapper><CreateSession /></SuspenseWrapper>,
      },
      {
        path: 'board-setup',
        element: <SuspenseWrapper><BoardSetup /></SuspenseWrapper>,
      },
      {
        path: 'board-setup/:sessionId',
        element: <SuspenseWrapper><BoardSetup /></SuspenseWrapper>,
      },
    ],
  },
  {
    path: '/game/:sessionId',
    element: <SuspenseWrapper><GameSession /></SuspenseWrapper>,
  },
]);

export default router;
