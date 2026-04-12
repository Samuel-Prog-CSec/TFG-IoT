/**
 * @fileoverview Panel lateral (drawer) de gestión de consentimiento parental.
 * Permite a un super_admin visualizar el estado del consentimiento de un alumno,
 * revocar o re-otorgar el consentimiento, exportar sus datos (Art. 20 RGPD)
 * y solicitar el borrado efectivo (Art. 17 RGPD).
 *
 * @module pages/admin/ConsentDetailPanel
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  X,
  ShieldCheck,
  ShieldX,
  Download,
  Trash2,
  Clock,
  User,
  FileText,
  Calendar,
  Scale
} from 'lucide-react';
import { usersAPI, extractErrorMessage } from '../../services/api';
import { downloadBlob } from '../../lib/utils';
import ButtonPremium from '../../components/ui/ButtonPremium';
import InputPremium from '../../components/ui/InputPremium';
import GlassCard from '../../components/ui/GlassCard';
import StatusBadge from '../../components/ui/StatusBadge';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import SkeletonShimmer from '../../components/ui/SkeletonShimmer';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Mapa de etiquetas legibles para las finalidades del consentimiento */
const PURPOSE_LABELS = {
  educational_tracking: 'Seguimiento educativo',
  performance_analytics: 'Análisis de rendimiento'
};

/**
 * Formatea una fecha ISO a cadena legible en español.
 * @param {string|Date} date - Fecha a formatear
 * @returns {string} Fecha formateada (ej. "08 de abril de 2026")
 */
function formatConsentDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Obtiene las iniciales del nombre del alumno para el avatar.
 * @param {string} name - Nombre completo
 * @returns {string} Hasta 2 iniciales en mayúscula
 */
function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// ---------------------------------------------------------------------------
// Animaciones
// ---------------------------------------------------------------------------

const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 }
};

const drawerVariants = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' }
};

const drawerTransition = { type: 'spring', damping: 30, stiffness: 300 };

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07 }
  }
};

const staggerItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// ---------------------------------------------------------------------------
// Sub-componentes internos
// ---------------------------------------------------------------------------

/**
 * Fila de información dentro del grid de datos del consentimiento.
 * @param {Object} props
 * @param {React.ReactNode} props.icon - Icono de Lucide
 * @param {string} props.label - Etiqueta descriptiva
 * @param {React.ReactNode} props.value - Valor a mostrar
 */
function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-text-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">{label}</p>
        <p className="text-sm text-text-primary mt-0.5 break-words">{value ?? '—'}</p>
      </div>
    </div>
  );
}

/**
 * Skeleton de carga que simula el contenido del panel.
 */
function PanelSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Avatar + nombre */}
      <div className="flex items-center gap-4">
        <SkeletonShimmer variant="circle" className="size-14 shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonShimmer className="h-5 w-3/4" />
          <SkeletonShimmer className="h-3 w-1/2" />
        </div>
      </div>
      {/* Badge de estado */}
      <SkeletonShimmer className="h-8 w-48" />
      {/* Grid de info */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonShimmer variant="circle" className="size-5 shrink-0" />
            <div className="flex-1 space-y-1">
              <SkeletonShimmer className="h-3 w-20" />
              <SkeletonShimmer className="h-4 w-40" />
            </div>
          </div>
        ))}
      </div>
      {/* Botones */}
      <SkeletonShimmer className="h-11 w-full" />
      <SkeletonShimmer className="h-11 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * Panel lateral (drawer) para gestionar el consentimiento parental de un alumno.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Si el panel está visible
 * @param {() => void} props.onClose - Callback para cerrar el panel
 * @param {Object|null} props.student - Datos básicos del alumno seleccionado
 * @param {() => void} props.onConsentChanged - Callback para refrescar la lista padre
 */
export default function ConsentDetailPanel({ isOpen, onClose, student, onConsentChanged }) {
  // ----- Estado -----
  const [detailedStudent, setDetailedStudent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRegrantForm, setShowRegrantForm] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianError, setGuardianError] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  // ----- Fetch detallado del alumno -----
  const fetchDetail = useCallback(async (studentId) => {
    setLoading(true);
    try {
      const { data } = await usersAPI.getUser(studentId);
      setDetailedStudent(data.data ?? data);
    } catch (err) {
      toast.error('Error al cargar los datos del alumno', {
        description: extractErrorMessage(err)
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Al abrirse el panel con un alumno, cargar su detalle
  useEffect(() => {
    if (isOpen && student?.id) {
      setDetailedStudent(null);
      setShowRegrantForm(false);
      setGuardianName('');
      setGuardianError('');
      fetchDetail(student.id);
    }
  }, [isOpen, student?.id, fetchDetail]);

  // Bloquear scroll del body mientras el panel está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
    return undefined;
  }, [isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape' && !actionLoading && !exportLoading) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, actionLoading, exportLoading, onClose]);

  // ----- Datos derivados -----
  const consent = detailedStudent?.consent;
  const consentHistory = detailedStudent?.consentHistory ?? [];
  const isGranted = consent?.granted === true;

  // ----- Acciones -----

  /** Revocar el consentimiento parental */
  const handleRevoke = async () => {
    setActionLoading(true);
    try {
      await usersAPI.updateConsent(student.id, { granted: false });
      toast.success('Consentimiento revocado correctamente');
      setShowRevokeConfirm(false);
      onConsentChanged?.();
      await fetchDetail(student.id);
    } catch (err) {
      toast.error('Error al revocar el consentimiento', {
        description: extractErrorMessage(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** Re-otorgar el consentimiento parental */
  const handleRegrant = async (e) => {
    e.preventDefault();
    const trimmed = guardianName.trim();
    if (trimmed.length < 2) {
      setGuardianError('El nombre del tutor debe tener al menos 2 caracteres');
      return;
    }
    setGuardianError('');
    setActionLoading(true);
    try {
      await usersAPI.updateConsent(student.id, {
        granted: true,
        grantedBy: trimmed
      });
      toast.success('Consentimiento re-otorgado correctamente');
      setShowRegrantForm(false);
      setGuardianName('');
      onConsentChanged?.();
      await fetchDetail(student.id);
    } catch (err) {
      toast.error('Error al re-otorgar el consentimiento', {
        description: extractErrorMessage(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** Exportar datos del alumno (Art. 20 RGPD) */
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const response = await usersAPI.exportStudentData(student.id);
      const blob = response.data;
      const safeName = (detailedStudent?.name ?? 'alumno')
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `datos-alumno-${safeName}-${dateStr}.json`);
      toast.success('Datos exportados correctamente');
    } catch (err) {
      toast.error('Error al exportar los datos', {
        description: extractErrorMessage(err)
      });
    } finally {
      setExportLoading(false);
    }
  };

  /** Actualizar propósitos de consentimiento individualmente (Art. 21 RGPD) */
  const handleToggleAnalytics = async () => {
    if (!consent?.granted || !consent?.grantedBy) return;

    const hasAnalytics = consent.purposes?.includes('performance_analytics');
    const newPurposes = hasAnalytics
      ? ['educational_tracking']
      : ['educational_tracking', 'performance_analytics'];

    setActionLoading(true);
    try {
      await usersAPI.updateConsent(student.id, {
        granted: true,
        grantedBy: consent.grantedBy,
        purposes: newPurposes
      });
      toast.success(
        hasAnalytics
          ? 'Analytics de rendimiento desactivado'
          : 'Analytics de rendimiento reactivado'
      );
      onConsentChanged?.();
      await fetchDetail(student.id);
    } catch (err) {
      toast.error('Error al actualizar los propósitos', {
        description: extractErrorMessage(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  /** Borrado efectivo Art. 17 RGPD */
  const handleHardDelete = async () => {
    setActionLoading(true);
    try {
      await usersAPI.hardDeleteUser(student.id);
      toast.success('Datos del alumno eliminados permanentemente');
      setShowDeleteConfirm(false);
      onConsentChanged?.();
      onClose();
    } catch (err) {
      toast.error('Error al eliminar los datos', {
        description: extractErrorMessage(err)
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ----- Render -----
  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="consent-backdrop"
            className="fixed inset-0 bg-backdrop backdrop-blur-sm z-[100]"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer */}
          <motion.aside
            key="consent-drawer"
            className="fixed right-0 inset-y-0 w-full max-w-md z-[101] flex flex-col
                       bg-glass-solid border-l border-border-default backdrop-blur-2xl"
            variants={drawerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={drawerTransition}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de consentimiento parental"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ---- Header ---- */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border-default shrink-0">
              {/* Avatar con iniciales */}
              <div className="size-10 rounded-full bg-brand-base/20 border border-brand-base/30
                              flex items-center justify-center text-brand-base font-bold text-sm shrink-0">
                {getInitials(student?.name)}
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-text-primary truncate">
                  {student?.name ?? 'Alumno'}
                </h2>
                {student?.profile?.classroom && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md
                                   bg-background-elevated text-text-secondary text-xs font-medium
                                   border border-border-subtle">
                    {student.profile.classroom}
                  </span>
                )}
              </div>

              {/* Botón cerrar */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors
                           hover:bg-border-default text-text-muted hover:text-text-primary"
                aria-label="Cerrar panel"
              >
                <X size={20} />
              </button>
            </div>

            {/* ---- Body (scrollable) ---- */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {(() => {
                if (loading) return <PanelSkeleton />;
                if (!detailedStudent) return (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-text-muted px-6">
                    <ShieldX size={40} className="opacity-40" />
                    <p className="text-sm">No se pudieron cargar los datos</p>
                    <ButtonPremium
                      variant="ghost"
                      size="sm"
                      onClick={() => student?.id && fetchDetail(student.id)}
                    >
                      Reintentar
                    </ButtonPremium>
                  </div>
                );
                return (
                <div className="p-6 space-y-6">
                  {/* ====== Estado del consentimiento ====== */}
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Estado del consentimiento
                    </h3>

                    <GlassCard variant="subtle" padding="sm" className="space-y-4">
                      {/* Badge de estado */}
                      <StatusBadge
                        status={isGranted ? 'active' : 'error'}
                        pulse={isGranted}
                        size="md"
                      >
                        {isGranted ? 'Consentimiento activo' : 'Consentimiento revocado'}
                      </StatusBadge>

                      {/* Grid de información */}
                      <div className="divide-y divide-border-subtle">
                        <InfoRow
                          icon={<User size={16} />}
                          label="Tutor"
                          value={consent?.grantedBy}
                        />
                        <InfoRow
                          icon={<Calendar size={16} />}
                          label="Fecha de concesión"
                          value={formatConsentDate(consent?.grantedAt)}
                        />
                        <InfoRow
                          icon={<FileText size={16} />}
                          label="Versión de política"
                          value={consent?.policyVersion}
                        />
                        <InfoRow
                          icon={<Scale size={16} />}
                          label="Finalidades"
                          value={
                            consent?.purposes?.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {consent.purposes.map((p) => (
                                  <span
                                    key={p}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full
                                               bg-info-dark/10 border border-info-dark/20
                                               text-info-base text-[11px] font-medium"
                                  >
                                    {PURPOSE_LABELS[p] ?? p}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              '—'
                            )
                          }
                        />
                        {consent?.withdrawnAt && (
                          <InfoRow
                            icon={<Clock size={16} />}
                            label="Fecha de revocación"
                            value={formatConsentDate(consent.withdrawnAt)}
                          />
                        )}
                      </div>
                    </GlassCard>
                  </section>

                  {/* ====== Propósitos del tratamiento (Art. 21 RGPD) ====== */}
                  {isGranted && (
                    <section>
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                        Propósitos del tratamiento
                      </h3>

                      <GlassCard variant="subtle" padding="sm" className="space-y-3">
                        {/* Seguimiento educativo — siempre activo */}
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label con htmlFor apunta al input, el texto accesible esta en los <p> hijos */}
                        <label htmlFor="purpose-educational-tracking" className="flex items-center gap-3 cursor-not-allowed opacity-80">
                          <input
                            id="purpose-educational-tracking"
                            type="checkbox"
                            checked
                            disabled
                            className="size-4 accent-brand-base rounded"
                          />
                          <div>
                            <p className="text-sm text-text-primary font-medium">
                              Seguimiento educativo
                            </p>
                            <p className="text-xs text-text-muted">
                              Obligatorio para participar en sesiones de juego
                            </p>
                          </div>
                        </label>

                        {/* Analytics de rendimiento — revocable */}
                        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- label con htmlFor apunta al input, el texto accesible esta en los <p> hijos */}
                        <label htmlFor="purpose-performance-analytics" className="flex items-center gap-3 cursor-pointer">
                          <input
                            id="purpose-performance-analytics"
                            type="checkbox"
                            checked={consent?.purposes?.includes('performance_analytics')}
                            onChange={handleToggleAnalytics}
                            disabled={actionLoading}
                            className="size-4 accent-brand-base rounded cursor-pointer"
                          />
                          <div>
                            <p className="text-sm text-text-primary font-medium">
                              Analytics de rendimiento
                            </p>
                            <p className="text-xs text-text-muted">
                              Métricas agregadas, tendencias y análisis comparativo
                            </p>
                          </div>
                        </label>

                        {/* Aviso sobre desactivación de analytics */}
                        {!consent?.purposes?.includes('performance_analytics') && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning-base/5
                                          border border-warning-base/20 mt-1">
                            <ShieldX size={16} className="text-warning-base mt-0.5 shrink-0" />
                            <p className="text-xs text-warning-base leading-relaxed">
                              Las métricas de rendimiento no se actualizarán con nuevas partidas.
                              El alumno seguirá pudiendo jugar con normalidad.
                            </p>
                          </div>
                        )}
                      </GlassCard>
                    </section>
                  )}

                  {/* ====== Acciones de consentimiento ====== */}
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Acciones
                    </h3>

                    <div className="space-y-3">
                      {isGranted ? (
                        <ButtonPremium
                          variant="danger"
                          size="md"
                          icon={<ShieldX size={18} />}
                          className="w-full"
                          onClick={() => setShowRevokeConfirm(true)}
                          disabled={actionLoading}
                        >
                          Revocar consentimiento
                        </ButtonPremium>
                      ) : (
                        <>
                          <ButtonPremium
                            variant="primary"
                            size="md"
                            icon={<ShieldCheck size={18} />}
                            className="w-full"
                            onClick={() => {
                              setShowRegrantForm(true);
                              setGuardianName('');
                              setGuardianError('');
                            }}
                            disabled={actionLoading || showRegrantForm}
                          >
                            Re-otorgar consentimiento
                          </ButtonPremium>

                          {/* Formulario inline de re-otorgamiento */}
                          <AnimatePresence>
                            {showRegrantForm && (
                              <motion.form
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                onSubmit={handleRegrant}
                                className="overflow-hidden"
                              >
                                <GlassCard variant="subtle" padding="sm" className="space-y-3">
                                  {/* eslint-disable jsx-a11y/no-autofocus -- autoFocus intencionado: al abrir el formulario de re-otorgamiento, el foco debe ir al input */}
                                  <InputPremium
                                    label="Nombre del tutor/a"
                                    placeholder="Ej. María López García"
                                    icon={<User size={16} />}
                                    value={guardianName}
                                    onChange={(e) => {
                                      setGuardianName(e.target.value);
                                      if (guardianError) setGuardianError('');
                                    }}
                                    error={guardianError}
                                    required
                                    autoFocus
                                  />
                                  {/* eslint-enable jsx-a11y/no-autofocus */}
                                  <div className="flex gap-2">
                                    <ButtonPremium
                                      variant="ghost"
                                      size="sm"
                                      type="button"
                                      onClick={() => setShowRegrantForm(false)}
                                      disabled={actionLoading}
                                    >
                                      Cancelar
                                    </ButtonPremium>
                                    <ButtonPremium
                                      variant="primary"
                                      size="sm"
                                      type="submit"
                                      loading={actionLoading}
                                      icon={<ShieldCheck size={16} />}
                                    >
                                      Confirmar
                                    </ButtonPremium>
                                  </div>
                                </GlassCard>
                              </motion.form>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                    </div>
                  </section>

                  {/* ====== Historial de consentimiento ====== */}
                  {consentHistory.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                        Historial de consentimiento
                      </h3>

                      <motion.div
                        className="relative pl-6 border-l-2 border-border-subtle space-y-4"
                        variants={staggerContainer}
                        initial="hidden"
                        animate="show"
                      >
                        {consentHistory.map((entry, idx) => {
                          const isGrant = entry.action === 'granted';
                          const Icon = isGrant ? ShieldCheck : ShieldX;
                          const iconColor = isGrant ? 'text-success-base' : 'text-error-base';
                          const iconBg = isGrant ? 'bg-success-dark/20' : 'bg-error-dark/20';

                          return (
                            <motion.div
                              key={entry._id ?? idx}
                              variants={staggerItem}
                              className="relative"
                            >
                              {/* Nodo del timeline */}
                              <div
                                className={`absolute -left-[calc(0.75rem+1px)] top-0.5
                                            size-6 rounded-full flex items-center justify-center
                                            border-2 border-background-base ${iconBg}`}
                              >
                                <Icon size={12} className={iconColor} />
                              </div>

                              {/* Contenido */}
                              <div className="ml-2">
                                <p className="text-sm font-medium text-text-primary">
                                  {isGrant ? 'Consentimiento otorgado' : 'Consentimiento revocado'}
                                </p>
                                {entry.grantedBy && (
                                  <p className="text-xs text-text-secondary mt-0.5">
                                    Tutor: {entry.grantedBy}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                                  <span className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {formatConsentDate(entry.grantedAt ?? entry.withdrawnAt)}
                                  </span>
                                  {entry.policyVersion && (
                                    <span className="flex items-center gap-1">
                                      <FileText size={12} />
                                      v{entry.policyVersion}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    </section>
                  )}

                  {/* ====== Acciones de datos ====== */}
                  <section>
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                      Acciones de datos
                    </h3>

                    <div className="space-y-3">
                      {/* Exportar datos */}
                      <ButtonPremium
                        variant="secondary"
                        size="md"
                        icon={<Download size={18} />}
                        className="w-full"
                        onClick={handleExport}
                        loading={exportLoading}
                        disabled={actionLoading}
                      >
                        Exportar datos del alumno
                      </ButtonPremium>

                      {/* Eliminar datos permanentemente */}
                      <ButtonPremium
                        variant="danger"
                        size="md"
                        icon={<Trash2 size={18} />}
                        className="w-full !bg-transparent !shadow-none border-error-base/40
                                   text-error-base hover:!bg-error-dark/10"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={actionLoading || exportLoading}
                      >
                        Eliminar datos permanentemente
                      </ButtonPremium>
                    </div>
                  </section>
                </div>
                );
              })()}
            </div>
          </motion.aside>

          {/* ---- Modales de confirmación ---- */}

          {/* Revocar consentimiento */}
          <ConfirmationModal
            open={showRevokeConfirm}
            onClose={() => setShowRevokeConfirm(false)}
            onConfirm={handleRevoke}
            title="Revocar consentimiento parental"
            description={
              <div className="space-y-2 text-sm">
                <p>
                  Al revocar el consentimiento, el alumno <strong>{detailedStudent?.name}</strong> será
                  desactivado de la plataforma y no podrá participar en sesiones de juego.
                </p>
                <p className="text-warning-base">
                  Esta acción puede revertirse re-otorgando el consentimiento posteriormente.
                </p>
              </div>
            }
            confirmText="Revocar consentimiento"
            variant="danger"
            icon={ShieldX}
            loading={actionLoading}
          />

          {/* Eliminación permanente */}
          <ConfirmationModal
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={handleHardDelete}
            title="Eliminar datos permanentemente"
            description={
              <div className="space-y-2 text-sm">
                <p>
                  En virtud del <strong>Art. 17 del RGPD</strong> (derecho de supresión), se procederá al
                  borrado efectivo e irreversible de todos los datos personales del alumno.
                </p>
                <p>Se eliminarán:</p>
                <ul className="list-disc list-inside text-text-secondary space-y-1">
                  <li>Datos de perfil y consentimiento</li>
                  <li>Historial de partidas y resultados</li>
                  <li>Registros de analíticas asociados</li>
                </ul>
                <p className="text-error-base font-medium">
                  Esta acción es irreversible. Los datos no podrán recuperarse.
                </p>
              </div>
            }
            confirmText="Eliminar permanentemente"
            variant="danger"
            icon={Trash2}
            loading={actionLoading}
          />
        </>
      )}
    </AnimatePresence>
  );
}
