/**
 * @fileoverview Página de gestión de sesiones de juego (configuración).
 * Lista sesiones del profesor con filtros, paginación y acciones seguras.
 *
 * @module pages/SessionsPage
 */

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock,
  PlusCircle,
  Filter,
  RefreshCw,
  Play,
  Eye,
  Pencil,
  Trash2,
  LayoutGrid,
  Layers,
  Timer,
  Award,
  RotateCcw,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, mechanicsAPI, extractErrorMessage, extractData, isAbortError } from '../services/api';
import { useContexts } from '../hooks/useContexts';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ROUTES } from '../constants/routes';
import { getId, sameId, findById } from '../lib/entityId';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import HoverLiftCard from '../components/ui/HoverLiftCard';
import SelectPremium from '../components/ui/SelectPremium';
import StatusBadge from '../components/ui/StatusBadge';
import { SkeletonGrid } from '../components/ui/SkeletonShimmer';
import Tooltip from '../components/ui/Tooltip';
import EmptyState from '../components/ui/EmptyState';
import CharacterMascot from '../components/game/CharacterMascot';
import { EmptySessionsIllustration } from '../components/ui/illustrations';
import ErrorState from '../components/ui/ErrorState';
import ActiveFiltersBar from '../components/ui/ActiveFiltersBar';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import PageHeader from '../components/ui/PageHeader';
import ScanlineOverlay from '../components/ui/ScanlineOverlay';
import SessionSparkline from '../components/common/SessionSparkline';
import InlineEditableText from '../components/ui/InlineEditableText';
import { cn, listContainerVariants, motionConfig, DURATION, EASING, toTitleCaseEs } from '../lib/utils';
import { formatRelativeTime } from '../lib/dateUtils';

// Mapeo de dificultad a indicador visual lateral derecho (PROP-5).
// Se aplica como `after:bg-*` para no chocar con el `border-l-*` que indica el estado.
const DIFFICULTY_INDICATOR_CLASSES = {
  easy: 'after:bg-success-base/60',
  medium: 'after:bg-warning-base/60',
  hard: 'after:bg-error-base/60',
  custom: 'after:bg-brand-base/60'
};

const DIFFICULTY_LABELS_ES = {
  easy: 'Fácil',
  medium: 'Normal',
  hard: 'Difícil',
  custom: 'Personalizada'
};

// Variants locales con settle en entrada y "papel volando" en exit para reforzar
// el leitmotiv Tactile+Paper en las tarjetas de lista.
const buildSessionCardVariants = (shouldReduceMotion) => {
  if (shouldReduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }
  return {
    hidden: { opacity: 0, y: -12, scale: 0.94 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: motionConfig.springGame,
    },
    exit: {
      opacity: 0,
      x: -24,
      scale: 0.92,
      rotate: -2,
      transition: { duration: DURATION.exit, ease: EASING.outQuart },
    },
  };
};
import { getPrimaryActionForSession, getPlayRouteForSession } from '../lib/sessionHelpers';

const STATUS_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'created', label: 'Borrador' },
  { value: 'active', label: 'Activa' },
  { value: 'completed', label: 'Completada' }
];

// Derivado de DIFFICULTY_LABELS_ES para mantener una única fuente de verdad:
// las cards y el detalle muestran 'Normal' para `medium`, así el filtro coincide.
const DIFFICULTY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'easy', label: DIFFICULTY_LABELS_ES.easy },
  { value: 'medium', label: DIFFICULTY_LABELS_ES.medium },
  { value: 'hard', label: DIFFICULTY_LABELS_ES.hard }
];

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

const extractSessionItems = ({ payload, extracted }) => {
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(extracted)) {
    return extracted;
  }
  if (Array.isArray(extracted?.data)) {
    return extracted.data;
  }
  return [];
};

const BORDER_CLASSES = {
  created: 'border-l-warning-base/70',
  active: 'border-l-success-base/70',
  completed: 'border-l-success-base/40',
};

// Jerarquía de juego: las sesiones accionables (borrador listo para jugar y
// partida activa) "flotan" con una sombra brand tenue; las completadas quedan
// planas y, por contraste, recogidas — sin atenuar opacidad ni tocar el
// contraste del texto (eso rompería WCAG AA). El borrador suma el drop-shadow
// brand sobre su borde discontinuo (sigue comunicando "borrador") para señalar
// "esta es la que puedes lanzar"; la activa ya destaca con su anillo + glow.
const STATUS_CARD_CLASSES = {
  created: 'border-dashed border-warning-base/30 shadow-[0_10px_28px_-16px_var(--color-brand-glow)]',
  active: 'ring-1 ring-brand-base/30 shadow-[0_0_12px_var(--color-brand-glow)]',
  completed: 'border-b-2 border-b-success-base/40',
};

// Bloque de stats con sparkline. Extraido para reducir la complejidad ciclomatica
// del SessionCard (regla sonarjs/cyclomatic-complexity).
function SessionPlayStats({ playStats }) {
  if (!playStats || (playStats.playsCount ?? 0) <= 0) return null;
  const playedLabel = playStats.playsCount === 1 ? 'partida jugada' : 'partidas jugadas';
  const showSparkline =
    Array.isArray(playStats.recentScores) && playStats.recentScores.length >= 2;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-background-surface/50 px-3 py-2 text-xs text-text-muted">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className="text-text-muted/70 flex-shrink-0" />
        <span>
          {playStats.playsCount} {playedLabel}
          {playStats.averageScore != null && (
            <> · {playStats.averageScore} pts promedio</>
          )}
        </span>
      </div>
      {/* PROP-5: tiempo desde la ultima partida en formato relativo. */}
      {playStats.lastPlayedAt && (
        <p className="text-micro text-text-muted/80">
          Última partida: {formatRelativeTime(playStats.lastPlayedAt)}
        </p>
      )}
      {/* PROP-5: sparkline solo si hay >=2 puntuaciones. */}
      {showSparkline && (
        <SessionSparkline data={playStats.recentScores} height={42} />
      )}
    </div>
  );
}

SessionPlayStats.propTypes = {
  playStats: PropTypes.shape({
    playsCount: PropTypes.number,
    averageScore: PropTypes.number,
    lastPlayedAt: PropTypes.string,
    recentScores: PropTypes.array
  })
};

const SessionCard = memo(function SessionCard({
  session,
  cloneLoading,
  onClone,
  onDelete,
  onNavigate,
  onRename,
}) {
  const statusInfo = statusToBadge(session.status);
  // Normalizamos a Title Case español para que la lista sea visualmente
  // coherente aunque el usuario/seed haya guardado nombres con casing
  // inconsistente (QA 22/04/2026).
  const rawTitle = session.name || session.deck?.name || 'Sesión sin mazo asignado';
  const title = toTitleCaseEs(rawTitle);

  // Handler de rename estable por card. `onRename` es la versión currificada
  // estable del padre; la aplicamos a esta `session` una sola vez (useMemo) en
  // vez de currificar en el call site del padre, donde se recreaba en cada
  // render y rompía el `memo()` de SessionCard al teclear en la búsqueda.
  const handleRenameSave = useMemo(
    () => (onRename ? onRename(session) : undefined),
    [onRename, session]
  );
  const mechanicLabel = session.mechanic?.displayName || session.mechanic?.name || 'Mecánica';
  // Memoria usa parejas (no rondas independientes). Adaptamos el copy del KPI
  // para no confundir al profesor cuando revisa sesiones guardadas.
  const isMemoryMechanic = String(session.mechanic?.name || '').toLowerCase() === 'memory';
  const roundsOrPairsLabel = isMemoryMechanic ? 'Parejas' : 'Rondas';
  const contextLabel = session.context?.name || 'Contexto';
  const sessionId = getId(session);
  const canEdit = session.status === 'created';
  const canDelete = session.status === 'created';
  const borderClass = BORDER_CLASSES[session.status] || 'border-l-background-surface/50';
  const primary = getPrimaryActionForSession(session);
  // Tint del glow segun dificultad configurada. Para sesiones activas damos
  // prioridad al tint brand (ya tienen ring-1 en STATUS_CARD_CLASSES).
  const glowTint = (() => {
    if (session.status === 'active') return 'brand';
    const d = (session.difficulty || '').toLowerCase();
    if (d === 'easy') return 'success';
    if (d === 'hard') return 'error';
    return 'cyan';
  })();

  // PROP-5: indicador lateral derecho que comunica la dificultad sin pelearse
  // con el `border-l-4` que ya marca el estado de la sesión.
  const difficultyKey = (session.difficulty || '').toLowerCase();
  const difficultyIndicator =
    DIFFICULTY_INDICATOR_CLASSES[difficultyKey] || 'after:bg-text-muted/30';
  const difficultyLabel = DIFFICULTY_LABELS_ES[difficultyKey] || null;

  return (
    <HoverLiftCard glowTint={glowTint} className="group h-full">
      <GlassCard className={cn(
        // `@container`: la card es contenedor de consulta para que los botones
        // de acción se adapten al ANCHO DE LA CARD (no del viewport) y no se
        // corten en rejillas estrechas (3 columnas) — QA 2026-06-04.
        '@container relative overflow-hidden p-6 flex flex-col gap-5 h-full hover:border-border-strong transition-[border-color] border-l-4',
        // PROP-5: pseudo-elemento derecho coloreado por dificultad (1px de ancho).
        'after:absolute after:top-0 after:right-0 after:bottom-0 after:w-[3px] after:rounded-r',
        borderClass,
        difficultyIndicator,
        STATUS_CARD_CLASSES[session.status]
      )}
      title={difficultyLabel ? `Dificultad: ${difficultyLabel}` : undefined}
      >
        {/* Scanline signature: refuerza el leitmotiv "tactile/scan" en hover.
            Visibilidad controlada via group-hover para no necesitar state JS. */}
        <ScanlineOverlay className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* min-h reserva espacio para títulos de 1 o 2 líneas y mantiene la
                altura del resto del card alineada entre items del grid (QA 22/04/2026).
                Las sesiones en estado `created` admiten rename inline (T-952 Fase C);
                las activas/completas mantienen el h3 estático para evitar editar
                un nombre que ya está referenciado en partidas en curso. */}
            {onRename && session.status === 'created' ? (
              <div className="min-h-[3.5rem]">
                <InlineEditableText
                  value={session.name || session.deck?.name || ''}
                  onSave={handleRenameSave}
                  validate={(v) => {
                    const trimmed = (v || '').trim();
                    if (!trimmed) return 'El nombre no puede estar vacío.';
                    if (trimmed.length > 100) return 'Máximo 100 caracteres.';
                    return null;
                  }}
                  ariaLabel={`nombre de la sesión ${title}`}
                  maxLength={100}
                  className="block w-full"
                  textClassName="text-lg font-semibold text-text-primary line-clamp-2 block"
                  inputClassName="text-lg font-semibold w-full"
                  as="h2"
                />
              </div>
            ) : (
              // h2 (no h3): el <h1> es "Sesiones de juego"; saltar a h3 viola
              // WCAG 1.3.1 / Lighthouse heading-order — cada card es la segunda
              // jerarquía bajo el header de página (auditoría 24/05/2026).
              <h2 className="text-lg font-semibold text-text-primary line-clamp-2 min-h-[3.5rem]">{title}</h2>
            )}
            {/* BUG-A11Y-CONTRAST-SESSIONCARD-A (QA Sprint 0 post-v0.5.0):
                text-text-muted sobre card bg daba 3.92:1. text-secondary
                pasa AA y mantiene jerarquía visual. */}
            <p className="text-sm text-text-secondary">{mechanicLabel} · {contextLabel}</p>
          </div>
          <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
          <div className="bg-accent-indigo/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-indigo/15 flex items-center justify-center flex-shrink-0">
              <Layers size={14} className="text-accent-indigo" />
            </div>
            <div>
              <p className="text-text-muted">Tarjetas</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.numberOfCards || session.cardMappingsCount}</p>
            </div>
          </div>
          <div className="bg-accent-cyan/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-accent-cyan/15 flex items-center justify-center flex-shrink-0">
              <RotateCcw size={14} className="text-accent-cyan" />
            </div>
            <div>
              <p className="text-text-muted">{roundsOrPairsLabel}</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.numberOfRounds}</p>
            </div>
          </div>
          <div className="bg-warning-base/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-warning-base/15 flex items-center justify-center flex-shrink-0">
              <Timer size={14} className="text-warning-base" />
            </div>
            <div>
              <p className="text-text-muted">Tiempo</p>
              <p className="text-text-primary font-semibold font-display">{session.config?.timeLimit}s</p>
            </div>
          </div>
          <div className="bg-success-base/5 rounded-lg p-3 flex items-center gap-3">
            <div className="size-8 rounded-lg bg-success-base/15 flex items-center justify-center flex-shrink-0">
              <Award size={14} className="text-success-base" />
            </div>
            <div>
              <p className="text-text-muted">Puntos</p>
              <p className="text-text-primary font-semibold font-display">+{session.config?.pointsPerCorrect}</p>
            </div>
          </div>
        </div>

        <SessionPlayStats playStats={session.playStats} />

        <div className="mt-auto pt-4 border-t border-border-subtle space-y-3">
          {/* Los botones se apilan (1 col) cuando la card es estrecha y van en
              fila (2 cols) cuando hay sitio. `@[24rem]` consulta el ancho de la
              CARD (container query), no el viewport, así que se adaptan bien en
              cualquier nº de columnas/resolución (QA 2026-06-04). */}
          <div className="grid grid-cols-1 @[24rem]:grid-cols-2 gap-3">
            <ButtonPremium
              variant="secondary"
              onClick={() => onNavigate(ROUTES.SESSION_DETAIL(sessionId))}
              className="w-full"
            >
              <Eye size={16} />
              Ver detalle
            </ButtonPremium>
            {primary.action === 'play' ? (
              <ButtonPremium
                variant="primary"
                onClick={() => onNavigate(getPlayRouteForSession(session))}
                className="w-full"
              >
                <Play size={16} />
                <span className="truncate">{primary.label}</span>
              </ButtonPremium>
            ) : (
              <ButtonPremium
                variant="primary"
                onClick={() => onClone(session)}
                disabled={cloneLoading}
                className="w-full"
              >
                <RefreshCw size={16} />
                <span className="truncate">{primary.label}</span>
              </ButtonPremium>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-glass-bg rounded-lg p-1">
              {/* QA 2026-05-06 (ADR-114): el "tablero / mapping" sólo aplica
                  a Memoria, donde simula el orden físico de las tarjetas en
                  el tablero digital. En Asociación y Secuencia no hay
                  posición espacial relevante (Asociación elige una respuesta;
                  Secuencia sigue un plan). Mostrarlo confundía al docente. */}
              {isMemoryMechanic && (
                <Tooltip content="Ver tablero y mapping">
                  <ButtonPremium
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
                    aria-label="Ver tablero y mapping de tarjetas"
                  >
                    <LayoutGrid size={14} />
                  </ButtonPremium>
                </Tooltip>
              )}
              {/* Tooltip dinamico: explica el motivo cuando los botones estan disabled
                  para que el usuario sepa que solo las sesiones en borrador son editables. */}
              <Tooltip content={canEdit ? 'Editar sesión' : 'Las sesiones jugadas no se pueden editar; clónala para crear una nueva en borrador'}>
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate(ROUTES.SESSION_EDIT(sessionId))}
                  disabled={!canEdit}
                  aria-label={canEdit ? 'Editar sesión' : 'Editar sesión (deshabilitado: ya tiene partidas)'}
                >
                  <Pencil size={14} />
                </ButtonPremium>
              </Tooltip>
              <Tooltip content={canDelete ? 'Eliminar sesión' : 'Las sesiones jugadas no se pueden eliminar; archivalas en su lugar'}>
                <ButtonPremium
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(session)}
                  disabled={!canDelete}
                  aria-label={canDelete ? 'Eliminar sesión' : 'Eliminar sesión (deshabilitado: ya tiene partidas)'}
                >
                  <Trash2 size={14} />
                </ButtonPremium>
              </Tooltip>
            </div>
          </div>
        </div>

      </GlassCard>
    </HoverLiftCard>
  );
});

SessionCard.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    status: PropTypes.string,
    deck: PropTypes.shape({
      name: PropTypes.string,
    }),
    mechanic: PropTypes.shape({
      name: PropTypes.string,
      displayName: PropTypes.string,
    }),
    context: PropTypes.shape({
      name: PropTypes.string,
    }),
    config: PropTypes.shape({
      numberOfCards: PropTypes.number,
      numberOfRounds: PropTypes.number,
      timeLimit: PropTypes.number,
      pointsPerCorrect: PropTypes.number,
    }),
    cardMappingsCount: PropTypes.number,
    playStats: PropTypes.shape({
      playsCount: PropTypes.number,
      averageScore: PropTypes.number,
    }),
  }).isRequired,
  cloneLoading: PropTypes.bool.isRequired,
  onClone: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onRename: PropTypes.func,
};

const renderSessionsContent = ({
  loading,
  sessions,
  navigate,
  cloneLoading,
  handleClone,
  handleDelete,
  handleRename,
  hasActiveFilters,
  clearFilters,
  shouldReduceMotion,
}) => {
  if (loading && sessions.length === 0) {
    return <SkeletonGrid count={6} columns={3} />;
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        illustration={hasActiveFilters ? <EmptySessionsIllustration size={180} /> : undefined}
        mascot={hasActiveFilters ? undefined : <CharacterMascot mood="encouraging" size="sm" noBubble />}
        variant={hasActiveFilters ? 'filtered' : 'first-use'}
        title={hasActiveFilters ? 'Ninguna sesión coincide con tus filtros' : 'Aún no tienes sesiones'}
        description={
          hasActiveFilters
            ? 'Prueba a quitar algún filtro o amplía los criterios de búsqueda.'
            : 'Diseña tu primera sesión, elige una mecánica y un mazo, y tus alumnos estarán listos para jugar en minutos.'
        }
        action={hasActiveFilters ? (
          <ButtonPremium variant="secondary" onClick={clearFilters}>
            Limpiar filtros
          </ButtonPremium>
        ) : (
          <ButtonPremium variant="primary" onClick={() => navigate(ROUTES.CREATE_SESSION)}>
            <PlusCircle size={18} />
            Crear mi primera sesión
          </ButtonPremium>
        )}
      />
    );
  }

  const cardVariants = buildSessionCardVariants(shouldReduceMotion);

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
      variants={listContainerVariants(0.04)}
      initial="hidden"
      animate="visible"
    >
      {/* mode="popLayout" elimina el reflow del exit cuando se borra
          una sesión: el item saliente sale de flujo inmediatamente, los
          hermanos colapsan vía animación de layout sin saltar (T-952 Fase 2). */}
      <AnimatePresence mode="popLayout">
        {sessions.map((session) => {
          const sessionId = getId(session);
          return (
            <motion.div
              key={sessionId}
              // T-954 Fase B: shared layout id para hero transition al detalle.
              // Sólo en sessions navegables (status `created` o `active`).
              // El receptor está en SessionDetail.jsx con el mismo prefix.
              layoutId={`session-${sessionId}`}
              layout
              variants={cardVariants}
              exit="exit"
            >
              <SessionCard
                session={session}
                cloneLoading={cloneLoading}
                onClone={handleClone}
                onDelete={handleDelete}
                onNavigate={navigate}
                onRename={handleRename}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};

const filtersInitialState = {
  statusFilter: '',
  difficultyFilter: '',
  mechanicFilter: '',
  contextFilter: '',
};

function filtersReducer(state, action) {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, statusFilter: action.payload };
    case 'SET_DIFFICULTY':
      return { ...state, difficultyFilter: action.payload };
    case 'SET_MECHANIC':
      return { ...state, mechanicFilter: action.payload };
    case 'SET_CONTEXT':
      return { ...state, contextFilter: action.payload };
    case 'RESET_FILTERS':
      return filtersInitialState;
    default:
      return state;
  }
}

export default function SessionsPage() {
  const navigate = useNavigate();
  const { contexts } = useContexts({ autoLoad: true, onlyActive: true });
  const { shouldReduceMotion } = useReducedMotion();
  useDocumentTitle('Sesiones');

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, dispatchFilters] = useReducer(filtersReducer, filtersInitialState);

  const [mechanics, setMechanics] = useState([]);
  const sessionsAbortRef = useRef(null);
  const mechanicsAbortRef = useRef(null);
  const loadMoreAbortRef = useRef(null);
  const deleteModal = useConfirmationModal();
  const cloneModal = useConfirmationModal();
  const [selectedSession, setSelectedSession] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [cloneLoading, setCloneLoading] = useState(false);
  const mechanicOptions = useMemo(() => [
    { value: '', label: 'Todas' },
    ...mechanics.map((mechanic) => ({
      value: getId(mechanic),
      label: mechanic.displayName || mechanic.name
    }))
  ], [mechanics]);

  const contextOptions = useMemo(() => [
    { value: '', label: 'Todos' },
    ...contexts.map((context) => ({
      value: getId(context),
      label: context.name
    }))
  ], [contexts]);

  const loadMechanics = useCallback(async (signal) => {
    try {
      const response = await mechanicsAPI.getMechanics({ isActive: true }, signal ? { signal } : {});
      const data = extractData(response) || [];
      setMechanics(Array.isArray(data) ? data : []);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudieron cargar las mecánicas', {
        description: extractErrorMessage(err)
      });
    }
  }, []);

  const buildParams = useCallback((pageValue) => {
    const params = {
      page: pageValue,
      limit: 9,
      sortBy: 'createdAt',
      order: 'desc'
    };

    if (filters.statusFilter) params.status = filters.statusFilter;
    if (filters.difficultyFilter) params.difficulty = filters.difficultyFilter;
    if (filters.mechanicFilter) params.mechanicId = filters.mechanicFilter;
    if (filters.contextFilter) params.contextId = filters.contextFilter;

    return params;
  }, [filters]);

  const loadSessions = useCallback(async ({ reset = true, signal, pageOverride } = {}) => {
    try {
      if (reset) {
        setLoading(true);
        setPage(1);
      } else {
        setLoadingMore(true);
      }
      setError(null);

      const pageToUse = reset ? 1 : pageOverride;
      const params = buildParams(pageToUse);
      const response = await sessionsAPI.getSessions(params, signal ? { signal } : {});
      const payload = response?.data || {};
      const extracted = extractData(response);
      const items = extractSessionItems({ payload, extracted });
      const pagination = payload.pagination || extracted?.pagination || {};

      if (reset) {
        setSessions(items);
      } else {
        setSessions((prev) => [...prev, ...items]);
      }

      setHasMore(pagination.page < pagination.totalPages);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const message = extractErrorMessage(err);
      setError(message);
      toast.error('No pudimos cargar tus sesiones', { description: message });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildParams]);

  useEffect(() => {
    mechanicsAbortRef.current?.abort();
    const controller = new AbortController();
    mechanicsAbortRef.current = controller;
    loadMechanics(controller.signal);

    return () => controller.abort();
  }, [loadMechanics]);

  useEffect(() => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    loadSessions({ reset: true, signal: controller.signal });

    return () => controller.abort();
  }, [loadSessions]);

  const refetchSessions = useCallback(() => {
    sessionsAbortRef.current?.abort();
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    loadSessions({ reset: true, signal: controller.signal });
  }, [loadSessions]);

  useRefetchOnFocus({
    refetch: refetchSessions,
    isLoading: loading,
    hasData: sessions.length > 0,
    hasError: Boolean(error)
  });

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadMoreAbortRef.current?.abort();
      const controller = new AbortController();
      loadMoreAbortRef.current = controller;
      loadSessions({ reset: false, signal: controller.signal, pageOverride: nextPage });
    }
  };

  const handleDelete = useCallback((session) => {
    setSelectedSession(session);
    deleteModal.open();
  }, [deleteModal]);

  const handleClone = useCallback((session) => {
    setSelectedSession(session);
    cloneModal.open();
  }, [cloneModal]);

  // Inline rename — solo aplicable a sesiones en estado `created`. El
  // InlineEditableText commitea (o autoguarda debounced) y dispara este
  // handler. Optimistic update + rollback en error para que el usuario
  // vea el cambio instantáneamente.
  const handleRename = useCallback(
    (session) => async (newName) => {
      const sessionId = getId(session);
      if (!sessionId) return;
      const previousName = session.name || session.deck?.name || '';
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === previousName) return;
      setSessions((current) =>
        current.map((s) =>
          sameId(s, sessionId) ? { ...s, name: trimmed } : s,
        ),
      );
      try {
        await sessionsAPI.updateSession(sessionId, { name: trimmed });
        toast.success('Nombre guardado', {
          description: `Renombrada a "${trimmed}".`,
        });
      } catch (err) {
        setSessions((current) =>
          current.map((s) =>
            sameId(s, sessionId) ? { ...s, name: previousName } : s,
          ),
        );
        toast.error('No se pudo guardar el nombre', {
          description: extractErrorMessage(err),
        });
        throw err;
      }
    },
    [],
  );

  const confirmDelete = async () => {
    if (!selectedSession) return;

    setDeleteLoading(true);
    try {
      await sessionsAPI.deleteSession(getId(selectedSession));
      toast.success('Sesión eliminada', {
        description: 'La configuración se eliminó correctamente.'
      });
      deleteModal.close();
      setSelectedSession(null);
      loadSessions({ reset: true });
    } catch (err) {
      toast.error('No se pudo eliminar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmClone = async () => {
    if (!selectedSession) return;

    setCloneLoading(true);
    try {
      const response = await sessionsAPI.cloneSession(getId(selectedSession));
      const clonedSession = extractData(response);
      const clonedSessionId = getId(clonedSession);
      const clonedMechanicName = (clonedSession?.mechanic?.name || '').toString().toLowerCase();

      toast.success('Sesión clonada', {
        description: 'La nueva sesión se creó en borrador y está lista para revisar.'
      });

      cloneModal.close();
      setSelectedSession(null);

      if (clonedSessionId) {
        if (clonedMechanicName === 'memory') {
          navigate(ROUTES.BOARD_SETUP_WITH_ID(clonedSessionId));
        } else {
          navigate(ROUTES.SESSION_DETAIL(clonedSessionId));
        }
      } else {
        loadSessions({ reset: true });
      }
    } catch (err) {
      toast.error('No se pudo clonar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      setCloneLoading(false);
    }
  };

  const clearFilters = () => {
    dispatchFilters({ type: 'RESET_FILTERS' });
  };

  const hasActiveFilters = filters.statusFilter || filters.difficultyFilter || filters.mechanicFilter || filters.contextFilter;

  // Los DTOs de mecánica y contexto exponen `id` (no `_id`); buscar por `_id`
  // dejaba el chip de filtro activo en "Desconocida"/"Desconocido" aunque el
  // filtro sí se aplicaba (al backend se envía el id correcto).
  const mechanicMatch = findById(mechanics, filters.mechanicFilter);
  const contextMatch = findById(contexts, filters.contextFilter);

  const activeFilterChips = [
    filters.statusFilter && {
      key: 'status',
      label: `Estado: ${STATUS_OPTIONS.find((o) => o.value === filters.statusFilter)?.label || filters.statusFilter}`,
      onRemove: () => dispatchFilters({ type: 'SET_STATUS', payload: '' }),
    },
    filters.difficultyFilter && {
      key: 'difficulty',
      label: `Dificultad: ${DIFFICULTY_OPTIONS.find((o) => o.value === filters.difficultyFilter)?.label || filters.difficultyFilter}`,
      onRemove: () => dispatchFilters({ type: 'SET_DIFFICULTY', payload: '' }),
    },
    filters.mechanicFilter && {
      key: 'mechanic',
      label: `Mecánica: ${mechanicMatch?.displayName || mechanicMatch?.name || 'Desconocida'}`,
      onRemove: () => dispatchFilters({ type: 'SET_MECHANIC', payload: '' }),
    },
    filters.contextFilter && {
      key: 'context',
      label: `Contexto: ${contextMatch?.name || 'Desconocido'}`,
      onRemove: () => dispatchFilters({ type: 'SET_CONTEXT', payload: '' }),
    },
  ].filter(Boolean);

  const sessionsContent = renderSessionsContent({
    loading,
    sessions,
    navigate,
    cloneLoading,
    handleClone,
    handleDelete,
    handleRename,
    hasActiveFilters,
    clearFilters,
    shouldReduceMotion,
  });

  let loadMoreLabel = 'No hay más sesiones';
  if (loadingMore) {
    loadMoreLabel = 'Cargando…';
  } else if (hasMore) {
    loadMoreLabel = 'Cargar más';
  }

  return (
    <div
      className="page-container py-[var(--space-fluid-section)]"
    >
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={<CalendarClock size={24} />}
          iconClassName="bg-accent-indigo/20 text-accent-indigo"
          title="Sesiones de juego"
          subtitle="Configura y gestiona tus sesiones antes de jugar."
          actions={<>
            <ButtonPremium
              variant="secondary"
              onClick={() => setShowFilters((prev) => !prev)}
            >
              <Filter size={18} />
              {showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
            </ButtonPremium>
            <ButtonPremium variant="primary" onClick={() => navigate(ROUTES.CREATE_SESSION)}>
              <PlusCircle size={18} />
              Crear sesión
            </ButtonPremium>
          </>}
        />

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 md:grid-cols-4 gap-4"
              >
                <SelectPremium
                  label="Estado"
                  options={STATUS_OPTIONS}
                  value={filters.statusFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_STATUS', payload: val })}
                  placeholder="Todos"
                />
                <SelectPremium
                  label="Dificultad"
                  options={DIFFICULTY_OPTIONS}
                  value={filters.difficultyFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_DIFFICULTY', payload: val })}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Mecánica"
                  options={mechanicOptions}
                  value={filters.mechanicFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_MECHANIC', payload: val })}
                  placeholder="Todas"
                />
                <SelectPremium
                  label="Contexto"
                  options={contextOptions}
                  value={filters.contextFilter}
                  onChange={(val) => dispatchFilters({ type: 'SET_CONTEXT', payload: val })}
                  placeholder="Todos"
                />
                {hasActiveFilters && (
                  <div className="md:col-span-4">
                    <ButtonPremium variant="ghost" onClick={clearFilters}>
                      <RefreshCw size={16} />
                      Limpiar filtros
                    </ButtonPremium>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        {activeFilterChips.length > 0 && (
          <ActiveFiltersBar filters={activeFilterChips} onClearAll={clearFilters} />
        )}

        {error && (
          <ErrorState
            title="No pudimos cargar tus sesiones"
            message={`${error} Pulsa Reintentar o recarga la página.`}
            onRetry={refetchSessions}
          />
        )}

        {sessionsContent}

        {sessions.length > 0 && (
          <div className="flex justify-center">
            <ButtonPremium
              variant="secondary"
              onClick={handleLoadMore}
              disabled={!hasMore || loadingMore}
            >
              {loadMoreLabel}
            </ButtonPremium>
          </div>
        )}
      </div>

      <ConfirmationModal
        open={cloneModal.isOpen}
        onClose={cloneModal.close}
        onConfirm={confirmClone}
        title="Volver a jugar"
        description={
          <div className="space-y-2">
            <p>Se creará una nueva sesión en borrador con la configuración resincronizada desde el mazo actual.</p>
            <p className="text-text-muted text-sm">No se modifica la sesión original ni sus partidas.</p>
          </div>
        }
        confirmText="Clonar sesión"
        cancelText="Cancelar"
        variant="info"
        loading={cloneLoading}
      />

      <ConfirmationModal
        open={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirm={confirmDelete}
        title="Eliminar sesión"
        description={
          <div className="space-y-2">
            <p>Esta acción eliminará la configuración de la sesión seleccionada.</p>
            <p className="text-text-muted text-sm">Solo se puede eliminar si está en borrador.</p>
          </div>
        }
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}
