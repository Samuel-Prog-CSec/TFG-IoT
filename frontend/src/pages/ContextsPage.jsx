import { useState, useCallback } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

import {
  GlassCard,
  ButtonPremium,
  InputPremium,
  SkeletonCard
} from '../components/ui';
import { useContexts, useReducedMotion } from '../hooks';
import { useAuth } from '../context/AuthContext';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';

export default function ContextsPage() {
  const navigate = useNavigate();
  const { shouldReduceMotion } = useReducedMotion();
  const { isSuperAdmin } = useAuth();

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
    (acc, ctx) => acc + (ctx.assets?.filter(a => a.audioUrl)?.length || 0),
    0
  );
  const totalImages = contexts.reduce(
    (acc, ctx) => acc + (ctx.assets?.filter(a => a.imageUrl)?.length || 0),
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
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
      {/* Header y Stats */}
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto mb-8"
      >
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Palette size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Contextos Temáticos</h1>
              <p className="text-slate-400 mt-1">
                Explora y gestiona los recursos multimedia para los juegos
              </p>
            </div>
          </div>

          {/* Botón crear — solo super_admin */}
          {isSuperAdmin && (
            <ButtonPremium
              onClick={() => setShowCreateModal(true)}
              icon={<Plus size={18} />}
              className="w-full md:w-auto"
            >
              Nuevo Contexto
            </ButtonPremium>
          )}
        </div>

        {/* Stats globales */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <GlassCard className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center">
              <Palette size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{contexts.length}</p>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Contextos</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center">
              <ImageIcon size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{totalImages}</p>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Imágenes</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center">
              <Music size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{totalAudio}</p>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Audios</p>
            </div>
          </GlassCard>

          <GlassCard className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center">
              <ImageIcon size={20} className="text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{totalAssets}</p>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Assets totales</p>
            </div>
          </GlassCard>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <InputPremium
            placeholder="Buscar por nombre o ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            icon={<Search size={18} />}
            className="md:w-96"
          />
        </div>
      </motion.div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} className="h-64" />
            ))}
          </div>
        ) : error ? (
          <GlassCard className="p-8 text-center max-w-lg mx-auto mt-12">
            <AlertTriangle size={48} className="mx-auto text-rose-500 mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">Error al cargar contextos</h3>
            <p className="text-slate-400 mb-6">{error}</p>
            <ButtonPremium onClick={refetch} variant="secondary">
              Reintentar
            </ButtonPremium>
          </GlassCard>
        ) : filteredContexts.length === 0 ? (
          <GlassCard className="p-12 text-center mt-8 border-dashed border-2 bg-slate-900/50">
            <Palette size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">No se encontraron contextos</h3>
            <p className="text-slate-400 mb-6">
              {searchTerm
                ? 'Intenta usar otros términos de búsqueda.'
                : 'Aún no hay contextos temáticos disponibles.'}
            </p>
            {isSuperAdmin && !searchTerm && (
              <ButtonPremium onClick={() => setShowCreateModal(true)} icon={<Plus size={16} />}>
                Crear el primer contexto
              </ButtonPremium>
            )}
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredContexts.map((context, index) => (
                <ContextCard
                  key={context._id || context.id}
                  context={context}
                  index={index}
                  reducedMotion={shouldReduceMotion}
                  onClick={() => navigate(ROUTES.CONTEXT_DETAIL(context._id || context.id))}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
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

function ContextCard({ context, onClick, index, reducedMotion }) {
  const assetCount = context.assetsCount ?? context.assets?.length ?? 0;
  const imagesCount = context.assets?.filter(a => a.imageUrl)?.length ?? 0;
  const audioCount = context.assets?.filter(a => a.audioUrl)?.length ?? 0;
  const previews = context.assets?.filter(a => a.display)?.slice(0, 5).map(a => a.display) || [];

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
      transition={{ delay: reducedMotion ? 0 : index * 0.05 }}
      whileHover={reducedMotion ? {} : { y: -4 }}
      onClick={onClick}
      className="group cursor-pointer"
    >
      <GlassCard className="h-full p-6 transition-colors hover:bg-slate-800/40 hover:border-indigo-500/30">
        <div className="flex justify-between items-start mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/20 transition-colors">
            <Palette size={24} className="text-indigo-400" />
          </div>
          <div className="flex items-center gap-1 text-slate-500 group-hover:text-indigo-400 transition-colors">
            <span className="text-sm font-medium">Ver detalles</span>
            <ChevronRight size={16} />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-white tracking-tight mb-2 line-clamp-1">
          {context.name}
        </h3>

        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs font-mono text-slate-500 bg-slate-800/50 px-2 py-1 rounded-md">
            {context.contextId}
          </span>
          {context.isActive ? (
            <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
              Activo
            </span>
          ) : (
            <span className="text-xs font-medium text-slate-400 bg-slate-800/80 px-2 py-1 rounded-full">
              Inactivo
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="flex items-center gap-1.5" title="Total Assets">
              <span className="font-medium text-slate-300">{assetCount}</span> total
            </div>
            <div className="w-1 h-1 rounded-full bg-slate-700" />
            <div className="flex items-center gap-1.5" title="Imágenes">
              <ImageIcon size={14} className="text-slate-500" />
              <span>{imagesCount}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Audios">
              <Music size={14} className="text-slate-500" />
              <span>{audioCount}</span>
            </div>
          </div>
        </div>

        {previews.length > 0 && (
          <div className="mt-4 flex gap-1 pt-4 border-t border-white/5 overflow-hidden">
            {previews.map((preview, i) => (
              <span key={i} className="text-2xl">
                {preview}
              </span>
            ))}
            {assetCount > 5 && (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/50 text-xs text-slate-400 ml-1">
                +{assetCount - 5}
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </motion.div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <ShieldCheck size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Nuevo Contexto</h3>
              <p className="text-xs text-slate-500">Los assets se añaden después</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 disabled:opacity-50"
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
              <p className="text-xs text-slate-500 mt-1 font-mono">
                Ruta: <span className="text-indigo-400">/contexts/{contextId}</span>
              </p>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex gap-3">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
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

