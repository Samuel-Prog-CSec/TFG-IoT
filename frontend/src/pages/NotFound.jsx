/**
 * @fileoverview Página 404 - Ruta no encontrada
 * Se muestra cuando el usuario navega a una URL que no existe.
 *
 * @module pages/NotFound
 */

import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { ROUTES } from '../constants/routes';

/**
 * Página 404 con diseño centrado y tema oscuro
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background-base px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-bold text-brand-base select-none">404</p>

        <h1 className="mt-4 text-2xl font-semibold text-text-primary">
          Página no encontrada
        </h1>

        <p className="mt-2 text-text-muted">
          La página que buscas no existe o ha sido movida.
        </p>

        <Link
          to={ROUTES.DASHBOARD}
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-brand-base px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-hover transition-colors"
        >
          <Home size={18} />
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
