/**
 * @fileoverview Página /admin/mfa-setup para super_admin (T-905 B7).
 *
 * Doble función según el estado actual del MFA del usuario:
 *
 *  - `enabled: false` → wizard de enrollment (init → QR + verify → backup codes).
 *  - `enabled: true`  → panel de gestión: estado, últimas fechas, número de
 *    backup codes restantes y acciones (regenerar codes, deshabilitar MFA).
 *
 * Ambas vistas comparten el header y la card raíz; el contenido cambia según
 * `/api/auth/mfa/status`. Las acciones que requieren `requireMfa` en backend
 * disparan automáticamente el `MfaChallengeModal` global vía el interceptor.
 */

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { m as motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  RefreshCw,
  CalendarClock,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import { authAPI, extractErrorMessage } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import ButtonPremium from '../../components/ui/ButtonPremium';
import AdminPageShell from '../../components/admin/AdminPageHero';
import ConfirmationModal, {
  useConfirmationModal
} from '../../components/ui/ConfirmationModal';

// qrcode.react se carga solo cuando entramos en Step.QR — ahorra ~12 KB
// gzipped en los demás flujos (gestión, intro, backup, done).
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then(mod => ({ default: mod.QRCodeSVG }))
);
const QRPlaceholder = () => (
  <div
    className="bg-white p-3 rounded-lg border border-border-default"
    style={{ width: 210, height: 210 }}
    aria-label="Generando código QR"
  />
);

const Step = {
  INTRO: 'intro',
  QR: 'qr',
  BACKUP: 'backup',
  DONE: 'done'
};

// =============================================================================
// Helpers de formateo
// =============================================================================

const DATETIME_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short'
});

const formatDateTime = value => (value ? DATETIME_FORMATTER.format(new Date(value)) : null);

const formatRelative = value => {
  if (!value) return null;
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'hace unos segundos';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} día${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `hace ${months} mes${months === 1 ? '' : 'es'}`;
};

// =============================================================================
// Panel de GESTIÓN — visible cuando mfa.enabled === true
// =============================================================================

const StatTile = ({ icon: Icon, label, value, hint, tone = 'default' }) => {
  const toneClasses = {
    default: 'text-text-primary',
    warning: 'text-warning-base',
    success: 'text-success-base'
  };
  return (
    <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-background-base border border-border-default">
      <div className="flex items-center gap-2 text-text-muted text-xs uppercase tracking-wide font-medium">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`text-lg font-semibold ${toneClasses[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-text-muted">{hint}</div>}
    </div>
  );
};

const MfaManagementPanel = ({ status, onChange }) => {
  const regenerateModal = useConfirmationModal();
  const [disableOpen, setDisableOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busyAction, setBusyAction] = useState(null);

  const remaining = status.backupCodesRemaining ?? 0;
  const total = status.backupCodesTotal || 8;
  const lowBackup = remaining > 0 && remaining < 3;
  const exhaustedBackup = remaining === 0;
  const backupTone = exhaustedBackup || lowBackup ? 'warning' : 'default';
  const backupPlural = remaining === 1 ? '' : 's';

  const getBackupHint = () => {
    if (exhaustedBackup) return 'Regenera ya — no tienes códigos disponibles';
    if (lowBackup) return 'Quedan pocos — considera regenerar';
    return 'Códigos de respaldo single-use';
  };

  // Acción regenerar — confirmación dura porque invalida los codes actuales.
  const handleRegenerateRequest = () => {
    regenerateModal.openModal({
      title: 'Regenerar códigos de respaldo',
      variant: 'warning',
      icon: RefreshCw,
      message: (
        <>
          Se generarán <strong>8 códigos nuevos</strong> y los actuales dejarán de ser válidos.
          Asegúrate de guardar los nuevos en un lugar seguro tras la confirmación.
        </>
      ),
      confirmText: 'Generar nuevos códigos',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        setBusyAction('regenerate');
        try {
          const res = await authAPI.mfaRegenerateBackupCodes();
          const data = res?.data?.data || res?.data;
          const codes = data?.backupCodes || [];
          onChange({ regeneratedCodes: codes });
        } catch (err) {
          if (err?.code !== 'MFA_CANCELLED') {
            toast.error(extractErrorMessage(err) || 'No se pudieron regenerar los códigos');
          }
        } finally {
          setBusyAction(null);
        }
      }
    });
  };

  const handleDisableSubmit = async event => {
    event.preventDefault();
    if (!password) {
      toast.error('Introduce tu contraseña actual para confirmar');
      return;
    }
    setBusyAction('disable');
    try {
      await authAPI.mfaDisable(password);
      toast.success('Verificación en dos pasos desactivada. Vuelve a iniciar sesión.');
      // El backend ha revocado todas las sesiones del usuario — el próximo request
      // devolverá 401 y AuthContext redirigirá. Forzamos la redirección inmediata.
      // Mantenemos `busyAction` para que el botón siga mostrando "Deshabilitando…"
      // hasta el redirect, evitando que el usuario re-clique el form.
      setTimeout(() => window.location.assign('/login'), 1200);
    } catch (err) {
      // MFA_CANCELLED = el usuario cerró el modal MFA antes de verificar. No es
      // un error real, pero igualmente hay que liberar el botón. Cualquier otro
      // error muestra toast.
      if (err?.code !== 'MFA_CANCELLED') {
        toast.error(extractErrorMessage(err) || 'No se pudo desactivar la verificación en dos pasos');
      }
      setBusyAction(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6"
    >
      {/* HERO: estado activo */}
      <section
        className="relative overflow-hidden rounded-2xl border border-success-base/30 bg-background-elevated p-6 shadow-sm"
        aria-labelledby="mfa-active-title"
      >
        {/* Fondo signature: gradient soft + glow esquina */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-success-base/10 via-transparent to-accent-cyan/5 pointer-events-none"
        />
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-48 rounded-full bg-success-base/15 blur-3xl pointer-events-none"
        />

        <div className="relative flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 size-12 rounded-xl bg-success-base/15 border border-success-base/30 flex items-center justify-center">
              <ShieldCheck className="size-6 text-success-base" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2 text-success-base text-xs uppercase tracking-wider font-semibold mb-1">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full rounded-full bg-success-base opacity-75 animate-ping" />
                  <span className="relative inline-flex size-2 rounded-full bg-success-base" />
                </span>
                Protección activa
              </div>
              <h2
                id="mfa-active-title"
                className="text-xl font-semibold text-text-primary"
              >
                Verificación en dos pasos activada
              </h2>
              <p className="text-sm text-text-muted mt-1 max-w-md">
                Las acciones críticas (eliminar usuarios, purgas RGPD, desbloquear cuentas) te
                pedirán un código de tu app cuando entres a ejecutarlas.
              </p>
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile
            icon={CalendarClock}
            label="Activo desde"
            value={formatDateTime(status.enabledAt) || '—'}
            hint={status.enabledAt ? formatRelative(status.enabledAt) : null}
          />
          <StatTile
            icon={Clock}
            label="Último uso"
            value={
              status.lastUsedAt ? formatDateTime(status.lastUsedAt) : 'Sin uso reciente'
            }
            hint={status.lastUsedAt ? formatRelative(status.lastUsedAt) : null}
          />
          <StatTile
            icon={KeyRound}
            label="Códigos restantes"
            value={`${remaining}/${total}`}
            hint={getBackupHint()}
            tone={backupTone}
          />
        </div>

        {(lowBackup || exhaustedBackup) && (
          <div className="relative mt-4 flex items-start gap-2 p-3 rounded-lg bg-warning-base/10 border border-warning-base/30 text-warning-on-alpha text-sm">
            <AlertTriangle className="size-4 flex-shrink-0 mt-0.5 text-warning-base" aria-hidden />
            <span>
              {exhaustedBackup
                ? 'Has consumido todos los códigos de respaldo. Sin ellos, si pierdes el móvil con la app no podrás acceder. Genera nuevos cuanto antes.'
                : `Solo te quedan ${remaining} código${backupPlural} de respaldo. Te recomendamos regenerarlos.`}
            </span>
          </div>
        )}
      </section>

      {/* Acciones de mantenimiento */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <article className="rounded-2xl border border-border-default bg-background-elevated p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-info-base/15 border border-info-base/25 flex items-center justify-center">
              <RefreshCw className="size-5 text-info-base" aria-hidden />
            </div>
            <h3 className="text-base font-semibold text-text-primary">
              Regenerar códigos de respaldo
            </h3>
          </div>
          <p className="text-sm text-text-muted">
            Genera 8 nuevos códigos de un solo uso. Los actuales quedarán invalidados al instante.
            Te pediremos un código de tu app de autenticación para confirmar.
          </p>
          <ButtonPremium
            type="button"
            variant="secondary"
            size="md"
            onClick={handleRegenerateRequest}
            disabled={busyAction !== null}
            className="self-start"
          >
            {busyAction === 'regenerate' ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Regenerando…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" aria-hidden /> Generar nuevos códigos
              </>
            )}
          </ButtonPremium>
        </article>

        <article className="rounded-2xl border border-error-base/25 bg-background-elevated p-5 shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-error-base/15 border border-error-base/30 flex items-center justify-center">
              <ShieldOff className="size-5 text-error-base" aria-hidden />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Desactivar la verificación en dos pasos</h3>
          </div>
          <p className="text-sm text-text-muted">
            Quita el segundo paso de seguridad de tu cuenta. Las acciones críticas dejarán de pedir
            código y tu sesión se cerrará automáticamente. Requiere tu contraseña y un código reciente.
          </p>

          {!disableOpen ? (
            <ButtonPremium
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setDisableOpen(true)}
              disabled={busyAction !== null}
              // BUG-A11Y-MFA-DISABLE-BTN (QA Sprint 0): text-error-base sobre
              // card dark daba 3.87:1. red-300 (dark) + error-dark (light).
              className="self-start text-error-on-alpha hover:bg-error-base/10"
            >
              <ShieldOff className="size-4" aria-hidden /> Quiero desactivarla
            </ButtonPremium>
          ) : (
            <form onSubmit={handleDisableSubmit} noValidate className="space-y-3">
              <label
                htmlFor="mfa-disable-password"
                className="block text-xs font-medium uppercase tracking-wide text-text-muted"
              >
                Confirma con tu contraseña
              </label>
              <div className="relative">
                <input
                  id="mfa-disable-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border border-border-default bg-background-base text-text-primary focus:outline-none focus:ring-2 focus:ring-error-base/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-text-muted hover:text-text-primary"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonPremium
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => {
                    setDisableOpen(false);
                    setPassword('');
                    setShowPassword(false);
                  }}
                  disabled={busyAction !== null}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  type="submit"
                  variant="danger"
                  size="md"
                  disabled={busyAction !== null || !password}
                  className="flex-1 min-w-0"
                >
                  {busyAction === 'disable' ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden /> Desactivando…
                    </>
                  ) : (
                    <>
                      <ShieldOff className="size-4" aria-hidden /> Desactivar
                    </>
                  )}
                </ButtonPremium>
              </div>
            </form>
          )}
        </article>
      </section>

      <ConfirmationModal {...regenerateModal.modalProps} loading={busyAction === 'regenerate'} />
    </motion.div>
  );
};

// =============================================================================
// Wizard de SETUP — visible cuando mfa.enabled === false
// =============================================================================

const MfaSetupWizard = ({ onCompleted }) => {
  const [step, setStep] = useState(Step.INTRO);
  const [setupData, setSetupData] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = await authAPI.mfaSetupInit();
      setSetupData(res?.data?.data || res?.data);
      setStep(Step.QR);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error('Introduce los 6 dígitos del código');
      return;
    }
    setBusy(true);
    try {
      const res = await authAPI.mfaSetupVerify(code.trim());
      const data = res?.data?.data || res?.data;
      setBackupCodes(data?.backupCodes || []);
      setStep(Step.BACKUP);
      toast.success('Verificación en dos pasos activada');
    } catch (err) {
      toast.error(extractErrorMessage(err) || 'Código inválido');
    } finally {
      setBusy(false);
    }
  };

  const downloadBackupCodes = () => {
    const codesList = backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const lines = [
      'EduPlay RFID - Códigos de respaldo',
      `Cuenta: ${setupData?.accountName || ''}`,
      `Generados: ${new Date().toISOString()}`,
      '',
      'IMPORTANTE: cada código se puede usar UNA SOLA VEZ. Guárdalos en lugar seguro.',
      '',
      codesList
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eduplay-mfa-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {step === Step.INTRO && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3 text-text-primary">Antes de empezar</h2>
          <ul className="space-y-2 text-text-muted mb-6 list-disc pl-5">
            <li>Necesitas una app de autenticación (Google Authenticator, Authy, 1Password…).</li>
            <li>Tras activar la verificación en dos pasos tu sesión se cerrará y deberás volver a iniciar sesión.</li>
            <li>Recibirás 8 códigos de respaldo de un solo uso. Guárdalos en lugar seguro.</li>
          </ul>
          <ButtonPremium
            type="button"
            variant="primary"
            size="md"
            onClick={startSetup}
            disabled={busy}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Generando…
              </>
            ) : (
              'Empezar configuración'
            )}
          </ButtonPremium>
        </div>
      )}

      {step === Step.QR && setupData && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3 text-text-primary">1 · Escanea el QR</h2>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <Suspense fallback={<QRPlaceholder />}>
              <div className="bg-white p-3 rounded-lg border border-border-default">
                <QRCodeSVG value={setupData.otpauthUrl} size={192} level="M" />
              </div>
            </Suspense>
            <div className="flex-1 space-y-3">
              <p className="text-sm text-text-muted">
                ¿No puedes escanear? Introduce el siguiente código manualmente en tu app:
              </p>
              <code className="block bg-background-base border border-border-default rounded px-3 py-2 font-mono text-sm break-all">
                {setupData.secret}
              </code>
              <h3 className="text-text-primary font-semibold mt-4">2 · Verifica con el código</h3>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-lg border border-border-default bg-background-base text-text-primary text-center text-2xl tracking-widest font-mono"
                aria-label="Código de verificación"
              />
              <ButtonPremium
                type="button"
                variant="primary"
                size="md"
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="w-full"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Verificando…
                  </>
                ) : (
                  'Verificar y activar'
                )}
              </ButtonPremium>
            </div>
          </div>
        </div>
      )}

      {step === Step.BACKUP && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2 text-text-primary">3 · Códigos de respaldo</h2>
          <p className="text-sm text-text-muted mb-4">
            Cada código sirve una sola vez. <strong>Guárdalos ahora</strong>: no se mostrarán de
            nuevo. Si pierdes el dispositivo y los códigos, no podrás acceder.
          </p>
          <div className="grid grid-cols-2 gap-2 bg-background-base border border-border-default rounded-lg p-4 font-mono text-sm mb-4">
            {backupCodes.map(c => (
              <code key={c} className="select-all">
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-3">
            <ButtonPremium type="button" variant="secondary" size="md" onClick={downloadBackupCodes}>
              Descargar .txt
            </ButtonPremium>
            <ButtonPremium
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                setStep(Step.DONE);
                onCompleted?.();
              }}
            >
              He guardado los códigos
            </ButtonPremium>
          </div>
        </div>
      )}

      {step === Step.DONE && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="size-12 rounded-full bg-success-base/15 border border-success-base/30 flex items-center justify-center">
              <CheckCircle2 className="size-6 text-success-base" aria-hidden />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">Verificación en dos pasos configurada</h2>
            <p className="text-text-muted max-w-md">
              Tu sesión se cerrará automáticamente. Vuelve a iniciar sesión para confirmar.
            </p>
            <ButtonPremium
              type="button"
              variant="primary"
              size="md"
              onClick={() => window.location.assign('/login')}
            >
              Ir al login
            </ButtonPremium>
          </div>
        </div>
      )}
    </>
  );
};

// =============================================================================
// Página raíz: decide entre wizard y panel
// =============================================================================

const MfaSetupPage = () => {
  // useDocumentTitle: el resto de páginas admin actualizan el <title> via
  // este hook. MfaSetup quedaba como "EduPlay - Juegos Educativos RFID"
  // (auditoría 24/05/2026).
  useDocumentTitle('Seguridad de la cuenta');
  const [status, setStatus] = useState(null); // null=loading, object=loaded
  const [error, setError] = useState(null);
  const [regeneratedCodes, setRegeneratedCodes] = useState(null);

  // D.1 (pre-v1.0.0): AbortController propagado para que una navegación
  // fuera de /admin/mfa-setup no deje pendiente la request de status.
  const refetch = useCallback(async (signal) => {
    try {
      const res = await authAPI.mfaStatus({ signal });
      const data = res?.data?.data || res?.data;
      setStatus(data);
      setError(null);
    } catch (err) {
      if (err?.code === 'ERR_CANCELED') return;
      setError(extractErrorMessage(err) || 'No se pudo cargar el estado de seguridad');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refetch(controller.signal);
    return () => controller.abort();
  }, [refetch]);

  const handleManagementChange = useCallback(
    payload => {
      if (payload?.regeneratedCodes) {
        setRegeneratedCodes(payload.regeneratedCodes);
      }
      refetch();
    },
    [refetch]
  );

  return (
    <AdminPageShell
      icon={ShieldCheck}
      title="Seguridad de la cuenta"
      description="La verificación en dos pasos protege acciones críticas: eliminación de usuarios, purgas RGPD y desbloqueo de cuentas. Solo aplica a tu cuenta de dirección."
      ariaLabel="Configuración de seguridad de la cuenta"
      maxWidth="max-w-3xl"
    >

      {status === null && !error && (
        <div className="flex items-center gap-3 p-6 rounded-2xl border border-border-default bg-background-elevated text-text-muted">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <span>Cargando estado de seguridad…</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-2xl border border-error-base/30 bg-error-base/10 text-error-base"
        >
          <AlertTriangle className="size-5 flex-shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">{error}</p>
            <button
              type="button"
              onClick={refetch}
              className="mt-1 text-sm underline hover:text-error-on-alpha"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {status && status.enabled && (
        <>
          <MfaManagementPanel status={status} onChange={handleManagementChange} />
          {regeneratedCodes && (
            <RegeneratedCodesPanel
              codes={regeneratedCodes}
              onDismiss={() => setRegeneratedCodes(null)}
            />
          )}
        </>
      )}

      {status && !status.enabled && (
        <MfaSetupWizard onCompleted={refetch} />
      )}
    </AdminPageShell>
  );
};

// =============================================================================
// Panel "Nuevos códigos generados" — visible UNA vez tras regen exitoso
// =============================================================================

const RegeneratedCodesPanel = ({ codes, onDismiss }) => {
  const handleDownload = () => {
    const list = codes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const blob = new Blob(
      [
        'EduPlay RFID - Códigos de respaldo (regenerados)',
        `Generados: ${new Date().toISOString()}`,
        '',
        'IMPORTANTE: cada código se puede usar UNA SOLA VEZ.',
        '',
        list
      ].join('\n'),
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eduplay-mfa-backup-codes-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-6 rounded-2xl border border-success-base/30 bg-background-elevated p-6 shadow-sm"
      aria-labelledby="new-codes-title"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="size-10 rounded-lg bg-success-base/15 border border-success-base/30 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="size-5 text-success-base" aria-hidden />
        </div>
        <div>
          <h3 id="new-codes-title" className="text-lg font-semibold text-text-primary">
            Códigos regenerados
          </h3>
          <p className="text-sm text-text-muted">
            Guárdalos ahora — no podremos volver a mostrarlos. Los anteriores ya no son válidos.
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-2 bg-background-base border border-border-default rounded-lg p-4 font-mono text-sm mb-4"
        role="list"
        aria-label="Códigos de respaldo regenerados"
      >
        {codes.map(c => (
          <code key={c} className="select-all" role="listitem">
            {c}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ButtonPremium type="button" variant="secondary" size="md" onClick={handleDownload}>
          Descargar .txt
        </ButtonPremium>
        <ButtonPremium type="button" variant="primary" size="md" onClick={onDismiss}>
          He guardado los nuevos códigos
        </ButtonPremium>
      </div>
    </motion.aside>
  );
};

export default MfaSetupPage;
