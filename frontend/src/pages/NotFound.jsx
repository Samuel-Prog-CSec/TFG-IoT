/**
 * @fileoverview Página 404 - Ruta no encontrada
 * Se muestra cuando el usuario navega a una URL que no existe.
 *
 * @module pages/NotFound
 */

import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { ROUTES } from '../constants/routes';
import ButtonPremium from '../components/ui/ButtonPremium';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Página 404 con diseño centrado y tema oscuro
 */
export default function NotFound() {
  const navigate = useNavigate();
  useDocumentTitle('Página no encontrada');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-base px-4">
      <motion.div
        className="text-center max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-8xl font-bold text-brand-base select-none font-display">404</p>

        <h1 className="mt-4 text-2xl font-semibold text-text-primary">
          Página no encontrada
        </h1>

        <p className="mt-2 text-text-muted">
          La página que buscas no existe o ha sido movida.
        </p>

        <div className="mt-8">
          <ButtonPremium
            variant="primary"
            icon={<Home size={18} />}
            onClick={() => navigate(ROUTES.DASHBOARD)}
          >
            Volver al inicio
          </ButtonPremium>
        </div>
      </motion.div>
    </div>
  );
}
