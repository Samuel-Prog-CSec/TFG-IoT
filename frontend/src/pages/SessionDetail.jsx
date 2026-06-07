/**
 * @fileoverview Detalle de sesión de juego (configuración).
 * Muestra configuración, estado y mapping de tarjetas.
 *
 * @module pages/SessionDetail
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Pencil,
  Map,
  Trash2,
  Layers,
  Timer,
  Award,
  AlertTriangle,
  RotateCcw,
  Minus,
  Gauge,
  Info,
  Gamepad2,
  FolderOpen,
  CreditCard,
  Calendar,
  Users,
  X,
  Settings,
  Brain,
  Link2,
  ListOrdered,
  ListChecks,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import PropTypes from 'prop-types';
import { sessionsAPI, usersAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { getId } from '../lib/entityId';
import { useAuth } from '../context/AuthContext';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import StatusBadge from '../components/ui/StatusBadge';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import SelectPremium from '../components/ui/SelectPremium';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import EmptyState from '../components/ui/EmptyState';
import Breadcrumb from '../components/ui/Breadcrumb';
import Tooltip from '../components/ui/Tooltip';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { cn, pageVariants, formatDate } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSharedLayoutTransition } from '../hooks/useSharedLayoutTransition';
import SessionDetailMemoryPanel from '../components/session/detail/SessionDetailMemoryPanel';
import SessionDetailAssociationPanel from '../components/session/detail/SessionDetailAssociationPanel';
import SessionDetailSequencePanel from '../components/session/detail/SessionDetailSequencePanel';
import { getMechanicTheme } from '../lib/mechanicTheme';

const statusToBadge = (status) => {
  switch (status) {
    case 'created':
      return { tone: 'warning', label: 'Borrador' };
    case 'active':
      return { tone: 'active', label: 'Activa' };
    case 'completed':
      return { tone: 'success', label: 'Completada' };
    default:
      return { tone: 'info', label: 'Sin estado' };
  }
};

// Helpers locales del detalle (ADR-114). Se mantienen aquí en lugar de
// extraer a otro archivo para no fragmentar la página: son piezas
// puramente presentacionales sin lógica reutilizable fuera de este detalle.
function SummaryKpi({ icon, label, value, hint }) {
  return (
    <div className="rounded-xl bg-background-elevated/40 border border-border-subtle p-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-semibold text-text-primary font-display tabular-nums mt-1">
        {value ?? '—'}
      </p>
      {/* BUG-A11Y-SESSIONDETAIL-HINT (QA Sprint 0): text-text-muted/70 daba
          3.12:1 en light. Sin alpha cumple AA. */}
      {hint && <p className="text-nano text-text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

SummaryKpi.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  hint: PropTypes.string
};

function SummaryRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <span className="text-sm text-text-muted flex items-center gap-2 flex-shrink-0">
        {icon}
        {label}
      </span>
      <span className="text-sm text-text-primary font-medium text-right">
        {value ?? '—'}
      </span>
    </div>
  );
}

SummaryRow.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  value: PropTypes.node
};

const CONFIG_TONE_BG = {
  indigo: 'bg-accent-indigo/10',
  warning: 'bg-warning-base/10',
  success: 'bg-success-base/10',
  cyan: 'bg-accent-cyan/10',
  error: 'bg-error-base/10',
  brand: 'bg-brand-base/10'
};

function ConfigCell({ tone = 'indigo', icon, label, children }) {
  return (
    <div className={cn('rounded-xl p-4', CONFIG_TONE_BG[tone] || CONFIG_TONE_BG.indigo)}>
      <div className="flex items-center gap-2 text-sm text-text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-text-primary text-xl font-semibold font-display mt-2 tabular-nums">
        {children}
      </p>
    </div>
  );
}

ConfigCell.propTypes = {
  tone: PropTypes.oneOf(Object.keys(CONFIG_TONE_BG)),
  icon: PropTypes.node,
  label: PropTypes.string.isRequired,
  children: PropTypes.node
};

// eslint-disable-next-line sonarjs/cyclomatic-complexity -- pagina de detalle con multiples secciones, modales y estados
export default function SessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();
  useDocumentTitle('Detalle de Sesión');
  // T-954 Fase B: receptor del shared layout id emitido por SessionCard.
  const heroLayoutId = useSharedLayoutTransition('session', sessionId);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);

  // Estado para el modal de seleccion de alumno antes de jugar
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);

  const loadSession = useCallback(async (signal) => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const response = await sessionsAPI.getSessionById(sessionId, signal ? { signal } : {});
      const data = extractData(response);
      setSession(data);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudo cargar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  useRefetchOnFocus({
    refetch: () => loadSession(),
    isLoading: loading,
    hasData: Boolean(session)
  });

  const handleDelete = async () => {
    if (!session) return;

    setDeleteLoading(true);
    try {
      await sessionsAPI.deleteSession(getId(session));
      toast.success('Sesión eliminada');
      deleteModal.close();
      navigate(ROUTES.SESSIONS);
    } catch (err) {
      toast.error('No se pudo eliminar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleClone = async () => {
    if (!session) return;

    setCloneLoading(true);
    try {
      const response = await sessionsAPI.cloneSession(getId(session));
      const clonedSession = extractData(response);
      const clonedSessionId = getId(clonedSession);
      const clonedMechanicName = (clonedSession?.mechanic?.name || '').toString().toLowerCase();

      toast.success('Sesión clonada', {
        description: 'Se creó una nueva sesión en borrador para volver a jugar.'
      });
      cloneModal.close();

      if (clonedSessionId) {
        if (clonedMechanicName === 'memory') {
          navigate(ROUTES.BOARD_SETUP_WITH_ID(clonedSessionId));
        } else {
          navigate(ROUTES.SESSION_DETAIL(clonedSessionId));
        }
      }
    } catch (err) {
      toast.error('No se pudo clonar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      setCloneLoading(false);
    }
  };

  const handleOpenPlayerModal = useCallback(async () => {
    setPlayerModalOpen(true);
    setSelectedStudentId('');

    const teacherId = getId(user);
    if (!teacherId) {
      toast.error('No se pudo determinar el profesor.');
      return;
    }

    setLoadingStudents(true);
    try {
      const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, {
        sortBy: 'name',
        order: 'asc'
      });
      const students = extractData(studentsRes) || [];
      setAvailableStudents(Array.isArray(students) ? students : []);
    } catch (err) {
      toast.error('No se pudieron cargar los alumnos', {
        description: extractErrorMessage(err)
      });
    } finally {
      setLoadingStudents(false);
    }
  }, [user]);

  const handleStartWithPlayer = useCallback(() => {
    if (!selectedStudentId) {
      toast.warning('Selecciona un alumno antes de iniciar.');
      return;
    }
    const sid = getId(session);
    setPlayerModalOpen(false);
    navigate(`${ROUTES.GAME(sid)}?playerId=${encodeURIComponent(selectedStudentId)}`);
  }, [selectedStudentId, session, navigate]);

  const statusInfo = statusToBadge(session?.status);
  const canEdit = session?.status === 'created';
  const canDelete = session?.status === 'created';
  const canPlayDirectly = session?.status === 'created' || session?.status === 'active';
  const mechanicKey = (session?.mechanic?.name || '').toString().toLowerCase();
  const isAssociationSession = mechanicKey === 'association';
  const isMemorySession = mechanicKey === 'memory';
  const isSequenceSession = mechanicKey === 'sequence';
  const hasMemoryBoardConfigured = Array.isArray(session?.boardLayout) && session.boardLayout.length > 0;

  const mappingCards = useMemo(() => session?.cardMappings || [], [session]);

  // ADR-114: tabs por mecánica. La sección "específica" cambia su nombre y
  // contenido según el tipo de sesión — Memoria muestra el tablero,
  // Asociación el plan de retos, Secuencia el plan de secuencias.
  const [activeTab, setActiveTab] = useState('summary');
  const mechanicTheme = mechanicKey ? getMechanicTheme(mechanicKey) : null;
  const specificTabConfig = (() => {
    if (isMemorySession) {
      return { id: 'memory', label: 'Tablero', icon: Brain };
    }
    if (isAssociationSession) {
      return { id: 'association', label: 'Plan de retos', icon: Link2 };
    }
    if (isSequenceSession) {
      return { id: 'sequence', label: 'Plan de secuencias', icon: ListOrdered };
    }
    return null;
  })();
  const tabs = [
    { id: 'summary', label: 'Resumen', icon: Info },
    { id: 'configuration', label: 'Configuración', icon: Settings },
    ...(specificTabConfig ? [specificTabConfig] : []),
    { id: 'cards', label: 'Tarjetas del mazo', icon: ListChecks }
  ];

  // maxScore teórico para mostrar en configuración. Calculado en cliente
  // con la misma fórmula que el backend persiste (gamePlayService.createPlay).
  const theoreticalMaxScore = (() => {
    const rounds = Number(session?.config?.numberOfRounds) || 1;
    const points = Number(session?.config?.pointsPerCorrect) || 10;
    const sequencePlan = Array.isArray(session?.sequencePlan) ? session.sequencePlan : [];
    const totalSequenceCards = sequencePlan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
    if (totalSequenceCards > 0) return Math.max(1, totalSequenceCards * points);
    if (hasMemoryBoardConfigured) {
      return Math.max(1, Math.floor(session.boardLayout.length / 2) * points);
    }
    return Math.max(1, rounds * points);
  })();

  if (loading && !session) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <SkeletonCard className="h-32" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
          <SkeletonCard className="lg:col-span-2 h-72" />
          <SkeletonCard className="h-72" />
        </div>
        <SkeletonCard className="h-64" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState
          title="Sesión no encontrada"
          description="La sesión solicitada no existe o no está disponible."
          icon={<Layers size={28} />}
          action={(
            <ButtonPremium variant="secondary" onClick={() => navigate(ROUTES.SESSIONS)}>
              <ArrowLeft size={16} />
              Volver a sesiones
            </ButtonPremium>
          )}
        />
      </div>
    );
  }

  return (
    <motion.div
      layoutId={heroLayoutId}
      className="p-6 lg:p-8 max-w-6xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[
          { label: 'Sesiones', to: ROUTES.SESSIONS },
          { label: session.name || session.deck?.name || 'Sesión de juego' },
        ]} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary font-display">
              {session.name || session.deck?.name || 'Sesión de juego'}
            </h1>
            <p className="text-text-muted">
              {session.mechanic?.displayName || session.mechanic?.name} · {session.context?.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
            {/* QA 2026-05-06 (ADR-114): "Ver mapping" sólo tiene sentido en
                Memoria — el "mapping" es el layout 2D del tablero digital
                que simula la disposición física de las tarjetas. En
                Asociación y Secuencia las tarjetas no tienen posición
                espacial (la respuesta se elige o se reproduce una secuencia
                temporal definida por el plan). */}
            {isMemorySession && (
              <ButtonPremium
                variant="secondary"
                onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(getId(session)))}
              >
                <Map size={16} />
                Ver mapping
              </ButtonPremium>
            )}
            {/* Botón de juego: navegar directamente si no se ha jugado, clonar si ya finalizó */}
            {canPlayDirectly ? (
              <ButtonPremium
                variant="primary"
                onClick={() => {
                  const sid = getId(session);
                  if (isMemorySession) {
                    navigate(ROUTES.BOARD_SETUP_WITH_ID(sid));
                  } else {
                    handleOpenPlayerModal();
                  }
                }}
              >
                <Gamepad2 size={16} />
                Jugar
              </ButtonPremium>
            ) : (
              <ButtonPremium
                variant="primary"
                onClick={cloneModal.open}
                disabled={cloneLoading}
              >
                <Timer size={16} />
                <span className="sm:hidden">Clonar</span>
                <span className="hidden sm:inline">Volver a jugar</span>
              </ButtonPremium>
            )}
            <div className="border-l border-border-default h-8 mx-1" />
            <div className="flex items-center gap-1 bg-glass-bg rounded-lg p-1">
              {/* BUG-A11Y-SESSIONDETAIL-ACTIONS (QA Sprint 0): los botones
                  solo tenían icono; cuando están disabled, axe los marcaba
                  sin nombre accesible (Tooltip aporta describedby, no label).
                  Añadidos aria-label explícitos. */}
              <Tooltip content="Editar sesión">
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(ROUTES.SESSION_EDIT(getId(session)))}
                  disabled={!canEdit}
                  aria-label="Editar sesión"
                >
                  <Pencil size={14} aria-hidden="true" />
                </ButtonPremium>
              </Tooltip>
              <Tooltip content="Eliminar sesión">
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={deleteModal.open}
                  disabled={!canDelete}
                  aria-label="Eliminar sesión"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </ButtonPremium>
              </Tooltip>
            </div>
          </div>
        </header>

        {canEdit && isAssociationSession && session.requiresAssociationPlanConfiguration && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base" contentClassName="flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0" />
            Esta sesión es un clon con borrador de retos precargado. Revísalo y guarda la configuración antes de iniciar.
          </GlassCard>
        )}

        {canEdit && isMemorySession && !hasMemoryBoardConfigured && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base" contentClassName="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} />
              Esta sesión de memoria requiere configurar el tablero antes de iniciar.
            </div>
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(getId(session)))}
            >
              <Map size={16} />
              Configurar tablero
            </ButtonPremium>
          </GlassCard>
        )}

        {/* Tabs por mecánica (ADR-114). La pestaña central específica
            cambia: Memoria=Tablero, Asociación=Plan de retos,
            Secuencia=Plan de secuencias. "Tarjetas del mazo" es común a
            las tres como inventario base. */}
        <nav
          className="flex flex-wrap gap-2 border-b border-border-subtle pb-3"
          aria-label="Secciones del detalle de sesión"
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2 focus-visible:ring-offset-background-base',
                  isActive
                    ? cn(
                        'border',
                        mechanicTheme?.accentBgSoftClass,
                        mechanicTheme?.accentBorderClass,
                        mechanicTheme?.accentClass
                      )
                    : 'text-text-muted hover:text-text-primary hover:bg-glass-bg border border-transparent'
                )}
                aria-pressed={isActive}
              >
                <Icon size={14} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
            <GlassCard className="p-6 lg:col-span-2 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Vista rápida</h2>
                <p className="text-sm text-text-muted mt-1">
                  {mechanicTheme?.intro || 'Configuración general de la sesión.'}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--space-fluid-gutter)]">
                <SummaryKpi
                  icon={<Layers size={15} className="text-accent-indigo" />}
                  label="Tarjetas"
                  value={session.config?.numberOfCards}
                />
                <SummaryKpi
                  icon={<Timer size={15} className="text-warning-base" />}
                  label={isMemorySession ? 'Tiempo total' : 'Tiempo por ronda'}
                  value={`${session.config?.timeLimit}s`}
                />
                <SummaryKpi
                  icon={<RotateCcw size={15} className="text-accent-cyan" />}
                  label={isMemorySession ? 'Parejas' : 'Rondas'}
                  value={
                    isMemorySession
                      ? Math.floor((session?.boardLayout?.length || 0) / 2) || session.config?.numberOfRounds
                      : session.config?.numberOfRounds
                  }
                />
                <SummaryKpi
                  icon={<Award size={15} className="text-success-base" />}
                  label="Máx. puntos"
                  value={theoreticalMaxScore}
                  hint="Score máximo teórico"
                />
              </div>
            </GlassCard>

            <GlassCard className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">Resumen</h2>
              <div className="divide-y divide-border-subtle">
                <SummaryRow icon={<Info size={14} />} label="Estado" value={<StatusBadge status={statusInfo.tone} size="sm">{statusInfo.label}</StatusBadge>} />
                <SummaryRow icon={<Gamepad2 size={14} />} label="Mecánica" value={session.mechanic?.displayName || session.mechanic?.name} />
                <SummaryRow icon={<FolderOpen size={14} />} label="Contexto" value={session.context?.name} />
                <SummaryRow icon={<CreditCard size={14} />} label="Mazo" value={session.deck?.name} />
                <SummaryRow icon={<Calendar size={14} />} label="Creada" value={formatDate(session.createdAt, 'short')} />
              </div>
              {!canEdit && (
                <div className="text-xs text-text-muted border border-border-default rounded-lg p-3">
                  Solo las sesiones en borrador pueden editarse o eliminarse.
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {activeTab === 'configuration' && (
          <GlassCard className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Settings size={18} className="text-brand-base" />
                Configuración detallada
              </h2>
              <p className="text-sm text-text-muted mt-1">
                Reglas de juego configuradas en el wizard. Editables sólo mientras la sesión esté en borrador.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <ConfigCell tone="indigo" icon={<Layers size={15} className="text-accent-indigo" />} label="Tarjetas">
                {session.config?.numberOfCards}
              </ConfigCell>
              <ConfigCell tone="warning" icon={<Timer size={15} className="text-warning-base" />} label={isMemorySession ? 'Tiempo total' : 'Tiempo por ronda'}>
                {session.config?.timeLimit}s
              </ConfigCell>
              <ConfigCell tone="success" icon={<Award size={15} className="text-success-base" />} label="Puntos por acierto">
                +{session.config?.pointsPerCorrect}
              </ConfigCell>
              <ConfigCell tone="cyan" icon={<RotateCcw size={15} className="text-accent-cyan" />} label={isMemorySession ? 'Parejas' : 'Rondas'}>
                {session.config?.numberOfRounds}
              </ConfigCell>
              <ConfigCell tone="error" icon={<Minus size={15} className="text-error-base" />} label="Penalización por error">
                {session.config?.penaltyPerError}
              </ConfigCell>
              <ConfigCell tone="brand" icon={<Gauge size={15} className="text-brand-base" />} label="Dificultad">
                {{ easy: 'Fácil', medium: 'Normal', hard: 'Difícil', custom: 'Personalizada' }[session.difficulty] || session.difficulty}
              </ConfigCell>
            </div>
            {/* maxScore teórico — ADR-114. Se muestra el techo absoluto
                de la partida para que el docente entienda la magnitud
                de los rankings y comparaciones de score. */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-success-base/5 border border-success-base/20">
              <Sparkles size={18} className="text-success-base flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  Score máximo teórico:{' '}
                  <span className="tabular-nums text-success-base">{theoreticalMaxScore} pts</span>
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Es el techo de puntos que un alumno puede sacar sin penalizaciones. Las estrellas (1-3⭐) se calculan por % de aciertos, no por score absoluto, para no desvirtuar el ranking entre sesiones.
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {activeTab === 'memory' && isMemorySession && (
          <SessionDetailMemoryPanel session={session} />
        )}
        {activeTab === 'association' && isAssociationSession && (
          <SessionDetailAssociationPanel session={session} />
        )}
        {activeTab === 'sequence' && isSequenceSession && (
          <SessionDetailSequencePanel session={session} />
        )}

        {activeTab === 'cards' && (
          <GlassCard className="p-6">
            <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <ListChecks size={18} className="text-accent-indigo" />
                  Tarjetas del mazo
                </h2>
                <p className="text-sm text-text-muted mt-1">
                  Inventario de tarjetas vinculadas a esta sesión. Las posiciones / orden / consigna se definen en la pestaña específica de cada mecánica.
                </p>
              </div>
              <span className="text-xs text-text-muted bg-glass-bg rounded-full px-3 py-1 tabular-nums">
                {mappingCards.length} {mappingCards.length === 1 ? 'tarjeta' : 'tarjetas'}
              </span>
            </div>
            {mappingCards.length === 0 ? (
              <EmptyState
                title="Sin tarjetas asignadas"
                description="Aún no hay tarjetas vinculadas a esta sesión."
                icon={<Layers size={26} />}
                className="bg-transparent border border-border-subtle"
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {mappingCards.map((mapping) => {
                  const display = mapping.displayData?.display || mapping.displayData?.emoji || '🪪';
                  const label = mapping.displayData?.value || mapping.assignedValue || mapping.uid;
                  return (
                    <motion.div
                      key={mapping.id || mapping.uid}
                      className={cn(
                        'group rounded-2xl border border-accent-indigo/15 p-4 bg-glass-bg',
                        'flex flex-col items-center justify-center gap-2 text-center'
                      )}
                      whileHover={{ scale: 1.04, y: -2 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <div className="relative">
                        <CardAssetPreview
                          asset={mapping.displayData}
                          alt={label}
                          className="size-14 rounded-xl"
                          fit="cover"
                          fallbackLabel={display}
                        />
                        {mapping.displayData?.audioUrl && (
                          <AudioPlayBadge
                            audioUrl={mapping.displayData.audioUrl}
                            size="xs"
                            className="absolute -top-1 -right-1"
                          />
                        )}
                      </div>
                      <p className="text-sm text-text-primary font-semibold">{label}</p>
                      <p className="text-xs text-text-muted font-mono" title={mapping.uid}>{mapping.uid}</p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        )}
      </div>

      <ConfirmationModal
        open={cloneModal.isOpen}
        onClose={cloneModal.close}
        onConfirm={handleClone}
        title="Volver a jugar"
        description="Se creará una sesión nueva en borrador con datos resincronizados del mazo actual. La sesión original no se modifica."
        confirmText="Clonar sesión"
        cancelText="Cancelar"
        variant="info"
        loading={cloneLoading}
      />

      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={handleDelete}
        title="Eliminar sesión"
        description="¿Seguro que quieres eliminar esta configuración? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={deleteLoading}
      />

      {/* Modal de seleccion de alumno antes de iniciar partida */}
      <AnimatePresence>
        {playerModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPlayerModalOpen(false)}
          >
            <motion.div
              className="bg-background-elevated border border-border-default rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-accent-indigo/10">
                    <Users size={20} className="text-accent-indigo" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary font-display">
                      Seleccionar alumno
                    </h3>
                    <p className="text-sm text-text-muted">
                      Elige quién va a jugar esta partida.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPlayerModalOpen(false)}
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-glass-bg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {loadingStudents && (
                <div className="flex items-center justify-center py-8 text-text-muted text-sm">
                  Cargando alumnos…
                </div>
              )}
              {!loadingStudents && availableStudents.length === 0 && (
                <div className="text-center py-6 text-text-muted text-sm">
                  Aún no tienes alumnos en tu aula. La dirección del centro puede asignártelos desde el Panel de dirección.
                </div>
              )}
              {!loadingStudents && availableStudents.length > 0 && (
                <SelectPremium
                  value={selectedStudentId}
                  onChange={(val) => setSelectedStudentId(val)}
                  placeholder="Seleccionar alumno..."
                  label="Alumno"
                  options={availableStudents.map(student => ({
                    value: getId(student),
                    label: student.name
                  }))}
                  className="w-full"
                />
              )}

              <div className="flex justify-end gap-3 mt-6">
                <ButtonPremium
                  variant="secondary"
                  onClick={() => setPlayerModalOpen(false)}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  variant="primary"
                  onClick={handleStartWithPlayer}
                  disabled={!selectedStudentId || loadingStudents}
                >
                  <Gamepad2 size={16} />
                  Iniciar partida
                </ButtonPremium>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
