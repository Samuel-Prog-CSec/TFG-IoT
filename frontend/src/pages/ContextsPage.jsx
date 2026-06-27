import { useState, useCallback, useMemo, useRef, useId } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { m as motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Search,
  Image as ImageIcon,
  Music,
  ChevronRight,
  AlertTriangle,
  Plus,
  X,
  Loader2,
  ShieldCheck,
  Landmark,
  PawPrint,
  Hash,
  Shapes
} from 'lucide-react';
import { toast } from 'sonner';

import GlassCard from '../components/ui/GlassCard';
import HoverLiftCard from '../components/ui/HoverLiftCard';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import ButtonPremium from '../components/ui/ButtonPremium';
import PageHeader from '../components/ui/PageHeader';
import InputPremium from '../components/ui/InputPremium';
import EmptyState from '../components/ui/EmptyState';
import CharacterMascot from '../components/game/CharacterMascot';
import { EmptyContextsIllustration } from '../components/ui/illustrations';
import ErrorState from '../components/ui/ErrorState';
import Tooltip from '../components/ui/Tooltip';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import InlineSuccessBadge from '../components/ui/InlineSuccessBadge';
import useInlineSuccess from '../hooks/useInlineSuccess';
import useModalA11y from '../hooks/useModalA11y';
import { useContexts } from '../hooks/useContexts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
import { getId } from '../lib/entityId';
import ScanlineOverlay from '../components/ui/ScanlineOverlay';
import { listContainerVariants, motionConfig, DURATION, EASING } from '../lib/utils';
import { getContextTheme } from '../lib/contextTheme';

// Resuelve un "kind" de icono a partir del contexto; el render usa un switch
// JSX directo para evitar la regla `react-hooks/static-components` que marca
// cualquier asignación a variable PascalCase como "componente creado en render".
const resolveContextIconKind = context => {
  const id = context?.contextId;
  if (id === 'geography-europe') return 'landmark';
  if (id === 'animals-farm') return 'pawprint';
  if (id === 'colors-basic') return 'palette';
  if (id === 'numbers-1-6') return 'hash';
  if (id === 'shapes-basic') return 'shapes';
  const name = (context?.name || '').toLowerCase();
  if (/pa[ií]s|geograf|europ|bandera/.test(name)) return 'landmark';
  if (/animal|granja|zoo/.test(name)) return 'pawprint';
  if (/color/.test(name)) return 'palette';
  if (/n[uú]mero|d[ií]gito/.test(name)) return 'hash';
  if (/forma|geometr/.test(name)) return 'shapes';
  return 'palette';
};

function ContextIcon({ context }) {
  const kind = resolveContextIconKind(context);
  const iconProps = { size: 24, className: 'text-accent-indigo' };
  if (kind === 'landmark') return <Landmark {...iconProps} />;
  if (kind === 'pawprint') return <PawPrint {...iconProps} />;
  if (kind === 'hash') return <Hash {...iconProps} />;
  if (kind === 'shapes') return <Shapes {...iconProps} />;
  return <Palette {...iconProps} />;
}
ContextIcon.propTypes = {
  context: PropTypes.shape({
    contextId: PropTypes.string,
    name: PropTypes.string
  })
};

// Mapea un tema de contexto a uno de los glowTints soportados por HoverLiftCard
// para que cada contexto tenga un hover signature propio pero dentro de la paleta.
const CONTEXT_THEME_TO_GLOW = {
  default: 'indigo',
  geography: 'cyan',
  animals: 'warning',
  colors: 'pink',
  numbers: 'success',
  shapes: 'cyan',
};

const resolveContextGlow = (context) => {
  const theme = getContextTheme(context?.contextId || context?.slug || context?.name);
  // Derivar la key desde la primaryVar (ej: '--color-theme-animals' -> 'animals')
  const themeKey = theme?.primaryVar?.replace('--color-theme-', '').replace('--color-accent-', '') || 'default';
  return CONTEXT_THEME_TO_GLOW[themeKey] || 'indigo';
};

// Variants locales con settle spring en entrada y "papel volando" en exit.
const buildContextCardVariants = (shouldReduceMotion) => {
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

export default function ContextsPage() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  const { isSuperAdmin } = useAuth();
  useDocumentTitle('Contextos');

  // Super_admin ve todos los contextos (activos e inactivos)
  const { contexts, loading, error, refetch } = useContexts({
    autoLoad: true,
    showInactive: isSuperAdmin
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filtro local por nombre o contextId. Memoizado para no re-filtrar (ni
  // re-bajar a minúsculas toda la lista) en cada render del input controlado.
  const filteredContexts = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return contexts.filter(
      ctx =>
        ctx.name.toLowerCase().includes(q) ||
        ctx.contextId.toLowerCase().includes(q)
    );
  }, [contexts, searchTerm]);

  // Stats globales: dependen solo de la lista (no del término de búsqueda).
  // Una sola pasada en vez de 3 reduce con filter anidado (O(contextos×assets)).
  const { totalAssets, totalAudio, totalImages } = useMemo(() => {
    let assets = 0;
    let audio = 0;
    let images = 0;
    for (const ctx of contexts) {
      assets += ctx.assetsCount || ctx.assets?.length || 0;
      audio += ctx.audioCount ?? ctx.assets?.filter(a => a.audioUrl)?.length ?? 0;
      images += ctx.imageCount ?? ctx.assets?.filter(a => a.imageUrl)?.length ?? 0;
    }
    return { totalAssets: assets, totalAudio: audio, totalImages: images };
  }, [contexts]);

  const handleCreateSuccess = useCallback(
    newContext => {
      setShowCreateModal(false);
      refetch();
      // Navegar al detalle del contexto recién creado
      const destId = getId(newContext);
      if (destId) {
        navigate(ROUTES.CONTEXT_DETAIL(destId));
      }
    },
    [navigate, refetch]
  );

  return (
    <div className="page-container py-[var(--space-fluid-section)]">
      {/* Header y Stats */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <PageHeader
          icon={<Palette size={28} />}
          iconClassName="size-14 bg-gradient-to-br from-accent-indigo to-brand-base shadow-lg shadow-accent-indigo/20 text-text-primary"
          title="Contextos Temáticos"
          subtitle="Explora y gestiona los recursos multimedia para los juegos"
          actions={isSuperAdmin ? (
            <ButtonPremium
              onClick={() => setShowCreateModal(true)}
              icon={<Plus size={18} />}
              className="w-full md:w-auto"
            >
              Nuevo Contexto
            </ButtonPremium>
          ) : undefined}
          className="mb-8"
        />

        {/* Stats globales */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-[var(--space-fluid-gutter)] mb-8">
          {/* El flex va en un div interno, NO en el className de GlassCard
              (envuelve sus children → las clases de layout no alineaban los
              hijos y el icono quedaba desplazado, mismo fix que Mazos). QA 2026-06-04. */}
          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-accent-indigo/10 flex items-center justify-center shrink-0">
                <Palette size={22} className="text-accent-indigo" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-text-primary font-display">{contexts.length}</p>
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Contextos</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-success-base/10 flex items-center justify-center shrink-0">
                <ImageIcon size={22} className="text-success-base" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-text-primary font-display">{totalImages}</p>
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Imágenes</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              {/* Tile neutro cuando no hay audios: amarillo sugiere warning y
                  aquí es solo un contador informativo (QA 22/04/2026). */}
              <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${totalAudio > 0 ? 'bg-warning-base/10' : 'bg-background-surface/60'}`}>
                <Music size={22} className={totalAudio > 0 ? 'text-warning-base' : 'text-text-muted'} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-text-primary font-display">{totalAudio}</p>
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Audios</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-xl bg-brand-base/10 flex items-center justify-center shrink-0">
                <ImageIcon size={22} className="text-brand-light" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold text-text-primary font-display">{totalAssets}</p>
                <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Recursos totales</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <InputPremium
            placeholder="Buscar por nombre o ID…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            icon={<Search size={18} />}
            className="md:w-96"
            data-global-search="true"
          />
        </div>
      </motion.div>

      {/* Contenido */}
      <div>
        {(() => {
          if (loading) return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--space-fluid-gutter)]">
              {Array.from({ length: 6 }, (_, i) => `ctx-skeleton-${i}`).map(id => (
                <SkeletonCard key={id} className="h-64" />
              ))}
            </div>
          );
          if (error) return (
            <ErrorState
              title="No pudimos cargar tus contextos"
              message={`${error} Pulsa Reintentar o recarga la página.`}
              onRetry={refetch}
              className="max-w-lg mx-auto mt-12"
            />
          );
          if (filteredContexts.length === 0) return (
            <EmptyState
              illustration={searchTerm ? <EmptyContextsIllustration size={180} /> : undefined}
              mascot={searchTerm ? undefined : <CharacterMascot mood="encouraging" size="sm" noBubble />}
              variant={searchTerm ? 'filtered' : 'first-use'}
              title={searchTerm ? 'Nada coincide con tu búsqueda' : 'Aún no hay contextos'}
              description={
                searchTerm
                  ? 'Prueba con otro término o limpia la búsqueda para ver todos los contextos disponibles.'
                  : 'Los contextos agrupan tarjetas por temática (animales, países, profesiones…). Cuando haya alguno creado, lo verás aquí.'
              }
              action={
                isSuperAdmin && !searchTerm ? (
                  <ButtonPremium onClick={() => setShowCreateModal(true)} icon={<Plus size={16} />}>
                    Crear el primer contexto
                  </ButtonPremium>
                ) : undefined
              }
            />
          );
          {
            const cardVariants = buildContextCardVariants(shouldReduceMotion);
            return (
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--space-fluid-gutter)]"
                variants={shouldReduceMotion ? {} : listContainerVariants(0.06)}
                initial={shouldReduceMotion ? false : "hidden"}
                animate="visible"
              >
                <AnimatePresence>
                  {filteredContexts.map((context) => {
                    const contextResId = getId(context);
                    return (
                      <motion.div
                        key={contextResId}
                        // T-954 Fase B: shared layout id para hero
                        // transition al detalle del contexto.
                        layoutId={`context-${contextResId}`}
                        variants={cardVariants}
                        exit="exit"
                      >
                        <ContextCard
                          context={context}
                          onClick={() => navigate(ROUTES.CONTEXT_DETAIL(contextResId))}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            );
          }
        })()}
      </div>

      {/* Modal crear contexto (solo super_admin) */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateContextModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={handleCreateSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// TARJETA DE CONTEXTO
// ============================================

function ContextCard({ context, onClick }) {
  const assetCount = context.assetsCount ?? context.assets?.length ?? 0;
  const imagesCount = context.imageCount ?? context.assets?.filter(a => a.imageUrl)?.length ?? 0;
  const audioCount = context.audioCount ?? context.assets?.filter(a => a.audioUrl)?.length ?? 0;
  // Galería (2026-06-04): las IMÁGENES reales de los recursos (banderas, formas,
  // números…) son la identidad del contexto y van como banda héroe arriba.
  // Antes eran chips de TEXTO que truncaban ("Cuadrado"→"Cuadr…", QA 2026-06-04).
  const HERO_TILES = 4;
  const tiles = context.assets?.slice(0, HERO_TILES) || [];
  const hiddenAssets = Math.max(0, assetCount - tiles.length);
  const glowTint = resolveContextGlow(context);

  return (
    <HoverLiftCard
      glowTint={glowTint}
      onClick={onClick}
      ariaLabel={`Ver detalles del contexto ${context.name}`}
      className="group cursor-pointer h-full"
    >
      <GlassCard className="relative overflow-hidden h-full p-5 transition-colors hover:bg-background-elevated/40 hover:border-accent-indigo/30">
        {/* Scanline signature con visibilidad CSS-controlled via group-hover. */}
        <ScanlineOverlay className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* HERO: imágenes reales de los recursos del contexto. Sin icono
            genérico — el contenido ES la identidad (galería, como en Mazos). */}
        {tiles.length > 0 && (
          <div className="relative mb-4 overflow-hidden rounded-xl p-3 bg-background-elevated/50 ring-1 ring-inset ring-border-subtle">
            <div className="flex items-center gap-2">
              {tiles.map((asset, i) => {
                const label = asset.display || asset.value || '?';
                const initials = (() => {
                  if (!label || label === '?') return label;
                  if (/\p{Emoji}/u.test(label)) return label;
                  const words = label.trim().split(/\s+/);
                  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
                  return label.slice(0, 2).toUpperCase();
                })();
                return (
                  <div
                    key={asset.key || i}
                    className="size-12 rounded-xl border border-white/10 flex items-center justify-center text-2xl overflow-hidden shadow-[var(--shadow-inset-card)] ring-1 ring-black/5 flex-shrink-0"
                    style={{ backgroundColor: asset.dominantColor || 'var(--color-background-elevated)' }}
                    title={label}
                  >
                    <CardAssetPreview
                      asset={asset}
                      className="w-full h-full rounded-xl"
                      showSkeleton={false}
                      fallbackLabel={initials}
                      fallbackClassName={!asset.imageUrl ? 'p-0.5 text-white/90 font-bold' : undefined}
                    />
                  </div>
                );
              })}
              {hiddenAssets > 0 && (
                <div className="size-12 rounded-xl bg-background-base/60 border border-border-default flex items-center justify-center text-sm font-bold text-text-secondary flex-shrink-0">
                  +{hiddenAssets}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nombre + afordancia "Ver detalles". h2: la página tiene h1
            "Contextos Temáticos"; saltar a h3 viola heading-order (WCAG 1.3.1). */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 className="min-w-0 text-xl font-semibold text-text-primary tracking-tight line-clamp-1 truncate" title={context.name}>
            {context.name}
          </h2>
          <span className="shrink-0 flex items-center gap-1 text-text-muted group-hover:text-accent-indigo transition-colors">
            <span className="text-sm font-medium">Ver detalles</span>
            <ChevronRight size={16} />
          </span>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {context.isActive ? (
            // BUG-A11Y-CONTRAST-CONTEXT-ACTIVE-A: text-success-on-alpha cumple AA
            // en ambos temas sobre bg-success-base/10.
            <span className="text-xs font-medium text-success-on-alpha bg-success-base/10 px-2 py-1 rounded-full">
              Activo
            </span>
          ) : (
            <span className="text-xs font-medium text-text-muted bg-background-elevated/80 px-2 py-1 rounded-full">
              Inactivo
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border-subtle">
          <div className="flex items-center gap-3 text-sm text-text-muted">
            {/* Tooltip "{N} recursos en total" coincide con el texto visible
                "{N} total" (WCAG 2.5.3 label-content-name-mismatch). */}
            <Tooltip content={`${assetCount} ${assetCount === 1 ? 'recurso' : 'recursos'} en total`}>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-text-secondary">{assetCount}</span> total
              </div>
            </Tooltip>
            <div className="size-1 rounded-full bg-background-surface" />
            <Tooltip content="Imágenes">
              <div className="flex items-center gap-1.5">
                <ImageIcon size={14} className="text-text-muted" />
                <span>{imagesCount}</span>
              </div>
            </Tooltip>
            <Tooltip content="Audios">
              <div className="flex items-center gap-1.5">
                <Music size={14} className="text-text-muted" />
                <span>{audioCount}</span>
              </div>
            </Tooltip>
          </div>
        </div>
      </GlassCard>
    </HoverLiftCard>
  );
}

// ============================================
// MODAL CREAR CONTEXTO (super_admin)
// ============================================

/**
 * Genera un slug válido para contextId a partir del nombre.
 * Ej: "Animales del Bosque" → "animales-del-bosque"
 */
function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

function CreateContextModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [contextId, setContextId] = useState('');
  const [contextIdManuallyEdited, setContextIdManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // T-955: feedback inline. El modal queda visible 1.1s tras el éxito para
  // que el badge sea perceptible antes de cerrar y refrescar el grid.
  const saveBadge = useInlineSuccess({ duration: 1500 });

  // A11y del modal (foco inicial al primer campo, focus-trap por Tab, Escape
  // para cerrar, lock de scroll y restauración de foco) centralizada en el
  // hook compartido. El modal solo se monta cuando está abierto → isOpen true.
  const titleId = useId();
  const panelRef = useRef(null);
  const firstFieldRef = useRef(null);
  useModalA11y({ isOpen: true, onClose, panelRef, initialFocusRef: firstFieldRef, escapeDisabled: isSubmitting });

  const handleNameChange = e => {
    const newName = e.target.value;
    setName(newName);
    // Auto-generar contextId solo si el usuario no lo ha editado manualmente
    if (!contextIdManuallyEdited) {
      setContextId(slugify(newName));
    }
  };

  const handleContextIdChange = e => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    setContextId(value);
    setContextIdManuallyEdited(true);
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!name.trim() || !contextId.trim()) {
      toast.error('El nombre y el ID son obligatorios');
      return;
    }
    if (contextId.length < 2) {
      toast.error('El ID debe tener al menos 2 caracteres');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await contextsAPI.createContext({
        name: name.trim(),
        contextId: contextId.trim()
      });
      const created = extractData(response);
      saveBadge.trigger();
      toast.success(`Contexto "${name}" creado correctamente`);
      // Pequeño respiro para mostrar el badge antes de cerrar el modal.
      setTimeout(() => onSuccess(created), 1100);
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (msg?.toLowerCase().includes('ya existe')) {
        toast.error('El ID del contexto ya está en uso', {
          description: 'Elige un identificador diferente.'
        });
      } else {
        toast.error('No pudimos crear el contexto', { description: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-sm">
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-background-base border border-border-default rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-accent-indigo/20 flex items-center justify-center">
              <ShieldCheck size={20} className="text-accent-indigo" />
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-semibold text-text-primary">Nuevo Contexto</h3>
              <p className="text-xs text-text-muted">Los assets se añaden después</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg hover:bg-border-default transition-colors text-text-muted disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-5">
          <InputPremium
            ref={firstFieldRef}
            label="Nombre del contexto"
            placeholder="ej: Animales del Bosque"
            value={name}
            onChange={handleNameChange}
            required
            disabled={isSubmitting}
            info="Nombre descriptivo que verán los profesores"
          />

          <div>
            <InputPremium
              label="Identificador único (contextId)"
              placeholder="ej: animales-bosque"
              value={contextId}
              onChange={handleContextIdChange}
              required
              disabled={isSubmitting}
              info="Solo minúsculas, números, guiones y guiones bajos. Se genera automáticamente desde el nombre."
            />
            {contextId && (
              <p className="text-xs text-text-muted mt-1 font-mono">
                Ruta: <span className="text-accent-indigo">/contexts/{contextId}</span>
              </p>
            )}
          </div>

          <div className="bg-warning-base/10 border border-warning-base/20 rounded-xl p-3 flex gap-3">
            <AlertTriangle size={16} className="text-warning-base flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning-base">
              El contexto se creará vacío. Los profesores podrán añadir imágenes y audios desde la
              página de detalle del contexto.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <ButtonPremium
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </ButtonPremium>
            <div className="relative">
              <ButtonPremium
                type="submit"
                loading={isSubmitting}
                disabled={!name.trim() || !contextId.trim() || contextId.length < 2}
                icon={isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              >
                Crear Contexto
              </ButtonPremium>
              <InlineSuccessBadge visible={saveBadge.visible} label="Contexto creado" placement="left" />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

