/**
 * @fileoverview Formulario MVP para desbloquear cuentas (Sprint post-v0.5.0).
 *
 * Diseño:
 *  - Input email + botón "Desbloquear cuenta".
 *  - El backend `POST /admin/lockouts/unlock` exige MFA reciente. Si el
 *    super_admin no tiene `X-MFA-Token` vigente, el interceptor Axios
 *    intercepta el 428 `MFA_TOKEN_REQUIRED` y dispara
 *    `mfa:challenge-required` que el `MfaChallengeModal` global captura.
 *    Tras la verificación, el request se reintenta automáticamente.
 *  - Sin lista de cuentas bloqueadas — el backend no expone aún GET
 *    `/admin/lockouts`. Esta funcionalidad se diferirá a una versión
 *    posterior si los profesores reportan necesitarla.
 *
 * @module components/admin/LockoutUnlockForm
 */

import { useState } from 'react';
import { Unlock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI, extractErrorMessage } from '../../services/api';
import ButtonPremium from '../ui/ButtonPremium';
import InputPremium from '../ui/InputPremium';
import GlassCard from '../ui/GlassCard';

// Validación email a nivel cliente: una mención de @, un dominio con
// punto. El backend hace la validación profunda con Zod; aquí solo
// queremos bloquear el botón hasta que el input tenga forma de email.
// Regex partido en dos pasadas para evitar el catastrophic backtracking
// que detecta regexp/no-super-linear-backtracking al combinar `[^\s@]+`
// dos veces con un `\.+` en medio.
const tieneFormaDeEmail = (valor) => {
  const partes = valor.split('@');
  if (partes.length !== 2) return false;
  const [local, dominio] = partes;
  return local.length > 0 && dominio.includes('.') && !/\s/.test(dominio);
};

export default function LockoutUnlockForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const emailNormalizado = email.trim().toLowerCase();
  const emailValido = tieneFormaDeEmail(emailNormalizado);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!emailValido) {
      toast.error('Introduce un email válido');
      return;
    }
    setLoading(true);
    try {
      const respuesta = await adminAPI.unlockAccount(emailNormalizado);
      const desbloqueado = respuesta?.data?.unlocked ?? respuesta?.data?.data?.unlocked;
      if (desbloqueado) {
        toast.success(`Cuenta de ${emailNormalizado} desbloqueada`);
        setEmail('');
      } else {
        // El backend devuelve `unlocked: false` cuando no había bloqueo
        // activo (idempotencia). No es un error, pero conviene informarlo.
        toast.info(`La cuenta de ${emailNormalizado} no estaba bloqueada`);
      }
    } catch (err) {
      // El interceptor MFA ya gestiona los 428 disparando el modal global.
      // Cualquier otro error (404 usuario inexistente, 403, etc.) cae aquí.
      toast.error(extractErrorMessage(err) || 'No se pudo desbloquear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="lockouts-titulo" className="space-y-6">
      <header className="space-y-2">
        <h2
          id="lockouts-titulo"
          className="text-xl font-bold text-text-primary font-display"
        >
          Desbloquear cuenta
        </h2>
        <p className="text-sm text-text-secondary max-w-2xl">
          Las cuentas se bloquean automáticamente tras 5 intentos fallidos de
          login en 15 minutos (T-905). Usa este formulario para reactivarlas
          manualmente. La acción requiere un código MFA reciente y se
          registra en el audit log.
        </p>
      </header>

      <GlassCard variant="default" padding="md" className="max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <InputPremium
            label="Email de la cuenta bloqueada"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="profesor@centro.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-text-muted inline-flex items-center gap-1.5">
              <ShieldCheck size={14} aria-hidden="true" />
              Te pediremos el código MFA al confirmar
            </span>
            <ButtonPremium
              type="submit"
              variant="primary"
              size="md"
              icon={<Unlock size={16} />}
              disabled={!emailValido || loading}
              loading={loading}
            >
              Desbloquear cuenta
            </ButtonPremium>
          </div>
        </form>
      </GlassCard>
    </section>
  );
}
