/**
 * @fileoverview Modal de challenge MFA (T-905 B7).
 *
 * Se monta UNA sola vez en `App.jsx` y escucha el evento global
 * `mfa:challenge-required`. Cuando salta:
 *  - Renderiza un modal con input de 6 dígitos auto-focus.
 *  - Al submit válido, llama `authAPI.mfaChallenge(code)` → recibe `mfaToken`.
 *  - Guarda token en `mfaTokenStore` y emite `mfa:token-acquired` para que
 *    el interceptor de API reintente la petición original.
 *  - Permite cancelar (emite `mfa:challenge-cancelled`).
 *  - Toggle "usar código de respaldo" — input largo, llama `mfaVerifyBackupCode`.
 *
 * Diseño minimal: input + 2 botones + toggle. Se afina en sesiones futuras
 * cuando se integren animaciones signature.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { authAPI, extractErrorMessage } from '../../services/api';
import { setMfaToken } from '../../services/mfaTokenStore';
import ButtonPremium from '../ui/ButtonPremium';
import InputPremium from '../ui/InputPremium';
import useModalA11y from '../../hooks/useModalA11y';

const MfaChallengeModal = () => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const close = useCallback(
    (cancelled = false) => {
      setOpen(false);
      setCode('');
      setUseBackup(false);
      setSubmitting(false);
      if (cancelled) {
        globalThis.dispatchEvent(new CustomEvent('mfa:challenge-cancelled'));
      }
    },
    []
  );

  useEffect(() => {
    const onChallenge = () => setOpen(true);
    globalThis.addEventListener('mfa:challenge-required', onChallenge);
    return () => globalThis.removeEventListener('mfa:challenge-required', onChallenge);
  }, []);

  // Cancelar (Escape o botón Cancelar): cierra el modal y emite el evento
  // `mfa:challenge-cancelled`. Estable para no re-suscribir el a11y del hook.
  const handleCancel = useCallback(() => close(true), [close]);

  // A11y del modal (foco inicial al input de código, focus-trap por Tab,
  // Escape→cancela, lock de scroll y restauración del foco al cerrar)
  // centralizada en el hook compartido (WCAG 2.1.2 / 2.4.3).
  useModalA11y({ isOpen: open, onClose: handleCancel, panelRef, initialFocusRef: inputRef });

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = useBackup
        ? await authAPI.mfaVerifyBackupCode(code.trim().toUpperCase())
        : await authAPI.mfaChallenge(code.trim());
      const data = res?.data?.data || res?.data;
      const mfaToken = data?.mfaToken;
      const expiresIn = data?.expiresIn || 300;
      if (!mfaToken) throw new Error('Respuesta MFA inválida');
      setMfaToken(mfaToken, expiresIn);
      globalThis.dispatchEvent(
        new CustomEvent('mfa:token-acquired', { detail: { expiresIn } })
      );
      toast.success('Verificación MFA correcta');
      close(false);
    } catch (err) {
      toast.error(extractErrorMessage(err) || 'Código MFA inválido');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mfa-challenge-title"
          aria-describedby="mfa-challenge-description"
        >
          <motion.div
            ref={panelRef}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-background-elevated border border-border-default rounded-2xl shadow-xl max-w-md w-full p-6"
          >
            <h2 id="mfa-challenge-title" className="text-xl font-semibold text-text-primary mb-2">
              Verificación MFA
            </h2>
            <p id="mfa-challenge-description" className="text-sm text-text-muted mb-4">
              Esta acción requiere doble factor.{' '}
              {useBackup
                ? 'Introduce uno de tus backup codes (formato XXXX-XXXX-XXXX-XXXX).'
                : 'Abre tu app autenticadora e introduce el código de 6 dígitos.'}
            </p>
            <form onSubmit={handleSubmit}>
              <InputPremium
                ref={inputRef}
                type="text"
                inputMode={useBackup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={useBackup ? 'XXXX-XXXX-XXXX-XXXX' : '123456'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={useBackup ? 19 : 6}
                inputClassName="text-center text-2xl tracking-widest font-mono"
                aria-label="Código de verificación MFA"
              />
              <div className="flex items-center justify-between mt-4 gap-3">
                <button
                  type="button"
                  className="text-sm text-text-muted hover:text-text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    setUseBackup(!useBackup);
                    setCode('');
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                >
                  {useBackup ? '← Usar código TOTP' : 'Usar código de respaldo →'}
                </button>
                <div className="flex gap-2">
                  <ButtonPremium
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={submitting}
                  >
                    Cancelar
                  </ButtonPremium>
                  <ButtonPremium
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={submitting}
                    disabled={submitting || code.trim().length < (useBackup ? 19 : 6)}
                  >
                    {submitting ? 'Verificando…' : 'Verificar'}
                  </ButtonPremium>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MfaChallengeModal;
