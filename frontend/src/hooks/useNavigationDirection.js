/**
 * @fileoverview useNavigationDirection — devuelve la dirección de la
 * navegación entre páginas para alimentar transiciones direccionales
 * en `AppLayout`.
 *
 * React Router 7 expone `useNavigationType()` que distingue:
 *   - `PUSH`     → click en `<Link>` o `navigate(...)` que añade al stack.
 *   - `REPLACE`  → `navigate(..., { replace: true })`.
 *   - `POP`      → botón atrás/adelante del navegador, o `navigate(-1)`.
 *
 * Para separar "atrás" de "adelante" dentro de POP no hay API oficial;
 * inferimos la dirección comparando el pathname actual con un stack que
 * mantenemos en sessionStorage. Si el nuevo pathname coincide con el
 * elemento anterior del stack ⇒ atrás. Si no ⇒ adelante.
 *
 * @module hooks/useNavigationDirection
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_KEY = 'eduplay:nav-stack';
const MAX_STACK = 16;

function readStack() {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStack(stack) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
  } catch {
    // sessionStorage puede estar deshabilitado — ignorar silenciosamente.
  }
}

/**
 * Devuelve la dirección de navegación de la última transición.
 * Valores: `'forward'` (default), `'back'`, `'replace'`.
 *
 * En el primer mount devuelve siempre `'forward'` para que el fade-in
 * inicial de la app no se trate como "atrás".
 */
export function useNavigationDirection() {
  const location = useLocation();
  const navType = useNavigationType();
  const [direction, setDirection] = useState('forward');
  const stackRef = useRef(readStack());
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      // Primer render — inicializa el stack y reporta forward sin animación
      // direccional para no romper el fade-in inicial de la app.
      isFirstMount.current = false;
      const init = [location.pathname + location.search];
      stackRef.current = init;
      writeStack(init);
      return;
    }

    const stack = stackRef.current;
    const prev = stack[stack.length - 2];
    const current = location.pathname + location.search;

    if (navType === 'REPLACE') {
      setDirection('replace');
      // Replace mantiene el stack (sustituye el último, pero la
      // experiencia visual no es ni back ni forward).
      const next = [...stack.slice(0, -1), current];
      stackRef.current = next;
      writeStack(next);
      return;
    }

    if (navType === 'POP' && prev === current) {
      // El usuario fue atrás: el nuevo path coincide con el anterior.
      setDirection('back');
      const next = stack.slice(0, -1);
      stackRef.current = next;
      writeStack(next);
      return;
    }

    // PUSH o POP-forward (raro): añade al stack y trata como forward.
    setDirection('forward');
    const next = [...stack, current];
    stackRef.current = next;
    writeStack(next);
  }, [location.pathname, location.search, navType]);

  return direction;
}

