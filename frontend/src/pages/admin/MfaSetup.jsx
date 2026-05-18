/**
 * @fileoverview Wizard de setup MFA TOTP para super_admin (T-905 B7).
 *
 * Flujo de 3 pasos:
 *  1. Inicio: explicación + botón "Empezar".
 *  2. QR + entry manual del secret + input código TOTP de confirmación.
 *  3. Backup codes (mostrados UNA SOLA VEZ) + botón descargar + confirmación.
 *
 * Tras step 3, el backend revocó todas las sesiones (revokeAllUserTokens) →
 * el siguiente request fallará con 401, el AuthContext redirigirá a /login.
 *
 * Diseño minimal compatible con el sistema visual del proyecto. Polish futuro.
 */

import { useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { authAPI, extractErrorMessage } from '../../services/api';

// T-907 Fase B: qrcode.react solo se necesita en el paso Step.QR (uno de cuatro
// pasos del wizard). Lazificarlo evita cargar la lib (~12 KB gzipped) durante
// los pasos INTRO/BACKUP/DONE. El chunk `qrcode` queda definido en vite.config
// `manualChunks` para asegurar el split.
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((mod) => ({ default: mod.QRCodeSVG }))
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

const MfaSetupPage = () => {
  const [step, setStep] = useState(Step.INTRO);
  // Shape esperada: { otpauthUrl, secret, accountName, issuer }
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
      toast.error('Introduce los 6 dígitos del código TOTP');
      return;
    }
    setBusy(true);
    try {
      const res = await authAPI.mfaSetupVerify(code.trim());
      const data = res?.data?.data || res?.data;
      setBackupCodes(data?.backupCodes || []);
      setStep(Step.BACKUP);
      toast.success('MFA habilitado');
    } catch (err) {
      toast.error(extractErrorMessage(err) || 'Código TOTP inválido');
    } finally {
      setBusy(false);
    }
  };

  const downloadBackupCodes = () => {
    const codesList = backupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const lines = [
      'EduPlay RFID - Backup Codes MFA',
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
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-text-primary mb-2">Configurar MFA</h1>
      <p className="text-text-muted mb-8">
        El doble factor protege acciones críticas: eliminación de usuarios, purgas RGPD, etc.
      </p>

      {step === Step.INTRO && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-3 text-text-primary">Antes de empezar</h2>
          <ul className="space-y-2 text-text-muted mb-6 list-disc pl-5">
            <li>Necesitas una app de autenticación (Google Authenticator, Authy, 1Password…).</li>
            <li>Tras habilitar MFA tu sesión se cerrará y deberás volver a iniciar sesión.</li>
            <li>Recibirás 8 códigos de respaldo de un solo uso — guárdalos en lugar seguro.</li>
          </ul>
          <button
            type="button"
            onClick={startSetup}
            disabled={busy}
            className="px-5 py-2 bg-brand-base text-white rounded-lg hover:bg-brand-strong disabled:opacity-50"
          >
            {busy ? 'Generando…' : 'Empezar configuración'}
          </button>
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
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-lg border border-border-default bg-background-base text-text-primary text-center text-2xl tracking-widest font-mono"
                aria-label="Código TOTP de verificación"
              />
              <button
                type="button"
                onClick={verifyCode}
                disabled={busy || code.length !== 6}
                className="w-full px-5 py-2 bg-brand-base text-white rounded-lg hover:bg-brand-strong disabled:opacity-50"
              >
                {busy ? 'Verificando…' : 'Verificar y habilitar MFA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === Step.BACKUP && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2 text-text-primary">3 · Códigos de respaldo</h2>
          <p className="text-sm text-text-muted mb-4">
            Cada código sirve una sola vez. <strong>Guárdalos ahora</strong> — no se mostrarán de
            nuevo. Si pierdes el dispositivo y los códigos, no podrás acceder.
          </p>
          <div className="grid grid-cols-2 gap-2 bg-background-base border border-border-default rounded-lg p-4 font-mono text-sm mb-4">
            {backupCodes.map((c) => (
              <code key={c} className="select-all">
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={downloadBackupCodes}
              className="px-4 py-2 border border-border-default rounded-lg text-text-primary hover:bg-background-base"
            >
              Descargar .txt
            </button>
            <button
              type="button"
              onClick={() => setStep(Step.DONE)}
              className="px-4 py-2 bg-brand-base text-white rounded-lg hover:bg-brand-strong"
            >
              He guardado los códigos
            </button>
          </div>
        </div>
      )}

      {step === Step.DONE && (
        <div className="bg-background-elevated border border-border-default rounded-2xl p-6 shadow-sm text-center">
          <h2 className="text-xl font-semibold mb-3 text-text-primary">
            MFA configurado correctamente
          </h2>
          <p className="text-text-muted mb-6">
            Tu sesión se cerrará automáticamente. Vuelve a iniciar sesión para confirmar.
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.assign('/login');
            }}
            className="px-5 py-2 bg-brand-base text-white rounded-lg hover:bg-brand-strong"
          >
            Ir al login
          </button>
        </div>
      )}
    </div>
  );
};

export default MfaSetupPage;
