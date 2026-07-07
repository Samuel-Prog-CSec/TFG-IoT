/**
 * @fileoverview Contexto de notificaciones (T-955 / mantenimiento 2026-07).
 *
 * `AppLayout` renderiza `<NotificationBell />` en DOS puntos de montaje
 * (bloque de usuario en sidebar expandida vs pill aislado en modo rail). Antes
 * cada bell llamaba a `useNotifications()` por su cuenta, así que alternar el
 * ancho del sidebar desmontaba un bell y montaba el otro → se perdía el estado,
 * se re-hacían los 2 GET iniciales (coste free-tier) y el panel abierto se
 * cerraba. Elevar el hook a un único provider hace que ambos puntos de montaje
 * compartan la misma instancia: sin refetch ni cierre de panel al alternar.
 *
 * El hook `useNotifications` ya estaba diseñado para esto ("Si en el futuro
 * varias zonas necesitan el estado, lo subimos a un contexto sin cambiar la API
 * pública").
 *
 * @module context/NotificationsContext
 */

import { createContext, useContext } from 'react';
import PropTypes from 'prop-types';
import useNotifications from '../hooks/useNotifications';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const value = useNotifications();
  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

NotificationsProvider.propTypes = {
  children: PropTypes.node
};

// eslint-disable-next-line react-refresh/only-export-components -- standard context+hook pattern
export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext debe usarse dentro de <NotificationsProvider>');
  }
  return ctx;
}

export default NotificationsContext;
