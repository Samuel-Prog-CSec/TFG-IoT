/**
 * @fileoverview Listener global del evento `mfa:enrollment-required` (T-905 B7).
 *
 * Se monta UNA sola vez en `App.jsx`, junto al `MfaChallengeModal`. Cuando el
 * backend responde 428 con `MFA_ENROLLMENT_REQUIRED` (super_admin sin MFA
 * habilitado que intenta una acción protegida por `requireMfa`), el interceptor
 * de `services/api.js` emite el evento `mfa:enrollment-required` y este
 * componente:
 *
 *  1. Muestra un toast warning explicando por qué se redirige.
 *  2. Navega a `/admin/mfa-setup` si no estamos ya en esa ruta.
 *
 * Esto cierra la UX del flujo MFA: el usuario no se queda mirando un error
 * críptico en consola, sino que aterriza directamente en el wizard de setup.
 */

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ROUTES } from '../../constants/routes';

const MfaEnrollmentRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Evita disparar toasts/navegaciones duplicadas si el interceptor emite
  // varios eventos seguidos (ej. dos requests paralelos que fallen ambos con
  // MFA_ENROLLMENT_REQUIRED antes de que el primero redirija).
  const lastFiredAt = useRef(0);

  useEffect(() => {
    const handler = () => {
      const now = Date.now();
      if (now - lastFiredAt.current < 1500) return;
      lastFiredAt.current = now;

      if (location.pathname === ROUTES.ADMIN_MFA_SETUP) {
        return;
      }

      toast.warning('Configura el doble factor para continuar', {
        description: 'Esta acción requiere MFA habilitado. Te llevamos al asistente.',
        duration: 5000,
      });
      navigate(ROUTES.ADMIN_MFA_SETUP);
    };

    globalThis.addEventListener('mfa:enrollment-required', handler);
    return () => globalThis.removeEventListener('mfa:enrollment-required', handler);
  }, [navigate, location.pathname]);

  return null;
};

export default MfaEnrollmentRedirect;
