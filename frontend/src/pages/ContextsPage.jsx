import { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
import ButtonPremium from '../components/ui/ButtonPremium';
import PageHeader from '../components/ui/PageHeader';
import InputPremium from '../components/ui/InputPremium';
import EmptyState from '../components/ui/EmptyState';
import { EmptyContextsIllustration } from '../components/ui/illustrations';
import ErrorState from '../components/ui/ErrorState';
import Tooltip from '../components/ui/Tooltip';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import { useContexts } from '../hooks/useContexts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../context/AuthContext';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
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

  // Filtro local por nombre o contextId
  const filteredContexts = contexts.filter(
    ctx =>
      ctx.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ctx.contextId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats globales
  const totalAssets = contexts.reduce((acc, ctx) => acc + (ctx.assetsCount || ctx.assets?.length || 0), 0);
  const totalAudio = contexts.reduce(
    (acc, ctx) => acc + (ctx.audioCount ?? ctx.assets?.filter(a => a.audioUrl)?.length ?? 0),
    0
  );
  const totalImages = contexts.reduce(
    (acc, ctx) => acc + (ctx.imageCount ?? ctx.assets?.filter(a => a.imageUrl)?.length ?? 0),
    0
  );

  const handleCreateSuccess = useCallback(
    newContext => {
      setShowCreateModal(false);
      refetch();
      // Navegar al detalle del contexto recién creado
      const destId = newContext?.id || newContext?._id;
      if (destId) {
        navigate(ROUTES.CONTEXT_DETAIL(destId));
      }
    },
    [navigate, refetch]
  );

  return (
    <div className="min-h-full bg-background-deep p-4 lg:p-8">
      {/* Header y Stats */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto mb-8"
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <GlassCard className="p-4 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-accent-indigo/10 flex items-center justify-center">
              <Palette size={22} className="text-accent-indigo" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary font-display">{contexts.length}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Contextos</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-success-base/10 flex items-center justify-center">
              <ImageIcon size={22} className="text-success-base" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary font-display">{totalImages}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Imágenes</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            {/* Tile neutro cuando no hay audios: amarillo sugiere warning y
                aquí es solo un contador informativo (QA 22/04/2026). */}
            <div className={`size-12 rounded-xl flex items-center justify-center ${totalAudio > 0 ? 'bg-warning-base/10' : 'bg-background-surface/60'}`}>
              <Music size={22} className={totalAudio > 0 ? 'text-warning-base' : 'text-text-muted'} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary font-display">{totalAudio}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Audios</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-brand-base/10 flex items-center justify-center">
              <ImageIcon size={22} className="text-brand-light" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-text-primary font-display">{totalAssets}</p>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider">Assets totales</p>
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
          />
        </div>
      </motion.div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto">
        {(() => {
          if (loading) return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <SkeletonCard key={i} className="h-64" />
              ))}
            </div>
          );
          if (error) return (
            <ErrorState
              title="Error al cargar contextos"
              message={`${error} Pulsa Reintentar o recarga la página.`}
              onRetry={refetch}
              className="max-w-lg mx-auto mt-12"
            />
          );
          if (filteredContexts.length === 0) return (
            <EmptyState
              illustration={<EmptyContextsIllustration size={180} />}
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
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                variants={shouldReduceMotion ? {} : listContainerVariants(0.06)}
                initial={shouldReduceMotion ? false : "hidden"}
                animate="visible"
              >
                <AnimatePresence>
                  {filteredContexts.map((context) => (
                    <motion.div
                      key={context._id || context.id}
                      variants={cardVariants}
                      exit="exit"
                    >
                      <ContextCard
                        context={context}
                        onClick={() => navigate(ROUTES.CONTEXT_DETAIL(context._id || context.id))}
                      />
                    </motion.div>
                  ))}
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
  const previews = context.assets?.filter(a => a.display)?.slice(0, 5).map(a => a.display) || [];
  const glowTint = resolveContextGlow(context);

  return (
    <HoverLiftCard
      glowTint={glowTint}
      onClick={onClick}
      className="group cursor-pointer h-full"
    >
      <GlassCard className="relative overflow-hidden h-full p-6 transition-colors hover:bg-background-elevated/40 hover:border-accent-indigo/30">
        {/* Scanline signature con visibilidad CSS-controlled via group-hover. */}
        <ScanlineOverlay className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="flex justify-between items-start mb-6">
          <div className="size-12 rounded-xl bg-accent-indigo/10 flex items-center justify-center border border-accent-indigo/20 group-hover:bg-accent-indigo/20 transition-colors">
            <ContextIcon context={context} />
          </div>
          <div className="flex items-center gap-1 text-text-muted group-hover:text-accent-indigo transition-colors">
            <span className="text-sm font-medium">Ver detalles</span>
            <ChevronRight size={16} />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-text-primary tracking-tight mb-2 line-clamp-1">
          {context.name}
        </h3>

        <div className="flex items-center gap-2 mb-6">
          {/* Slug técnico (`geography-europe`) se mantiene solo en la vista admin
              (`/admin/contexts`) porque es útil como identificador; en la vista
              teacher resulta ruido visual y mezcla español con kebab-case (QA 22/04/2026). */}
          {context.isActive ? (
            <span className="text-xs font-medium text-success-base bg-success-base/10 px-2 py-1 rounded-full">
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
            <Tooltip content="Total Assets">
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

        {previews.length > 0 && (
          <div
            className="mt-4 flex gap-1.5 pt-4 border-t border-border-subtle overflow-hidden relative"
            title={context.assets?.filter(a => a.display).map(a => a.display).join(', ')}
          >
            {previews.map((preview, i) => (
              <span
                key={i}
                className="text-2xl max-w-[80px] truncate inline-block leading-none"
              >
                {preview}
              </span>
            ))}
            {assetCount > previews.length && (
              <div className="flex items-center justify-center size-8 rounded-full bg-background-elevated/50 text-xs text-text-muted ml-1 shrink-0">
                +{assetCount - previews.length}
              </div>
            )}
            {/* Gradiente de fade a la derecha para indicar visualmente que el
                listado continúa cuando el contenido supera el ancho disponible. */}
            <div className="pointer-events-none absolute right-0 top-[calc(1rem+1px)] bottom-0 w-8 bg-gradient-to-l from-background-elevated/80 to-transparent" />
          </div>
        )}
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
      toast.success(`Contexto "${name}" creado correctamente`);
      onSuccess(created);
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (msg?.toLowerCase().includes('ya existe')) {
        toast.error('El ID del contexto ya está en uso', {
          description: 'Elige un identificador diferente.'
        });
      } else {
        toast.error('Error al crear el contexto', { description: msg });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-backdrop backdrop-blur-sm">
      <motion.div
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
              <h3 className="text-lg font-semibold text-text-primary">Nuevo Contexto</h3>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <InputPremium
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
            <ButtonPremium
              type="submit"
              loading={isSubmitting}
              disabled={!name.trim() || !contextId.trim() || contextId.length < 2}
              icon={isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            >
              Crear Contexto
            </ButtonPremium>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

