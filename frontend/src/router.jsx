import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import CreateSession from './pages/CreateSession';
import BoardSetup from './pages/BoardSetup';
import GameSession from './pages/GameSession';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: <Dashboard />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'create-session',
        element: <CreateSession />,
      },
      {
        path: 'board-setup',
        element: <BoardSetup />,
      },
      {
        path: 'board-setup/:sessionId',
        element: <BoardSetup />,
      },
    ],
  },
  {
    path: '/game/:sessionId',
    element: <GameSession />,
  },
]);

export default router;
