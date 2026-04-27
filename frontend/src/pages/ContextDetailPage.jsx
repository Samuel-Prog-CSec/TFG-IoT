import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Image as ImageIcon,
  Music,
  Plus,
  Upload,
  X,
  Check,
  AlertTriangle,
  Trash2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

import GlassCard from '../components/ui/GlassCard';
import ButtonPremium from '../components/ui/ButtonPremium';
import InputPremium from '../components/ui/InputPremium';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioMiniPlayer from '../components/ui/AudioMiniPlayer';
import AudioUploadModal from '../components/ui/AudioUploadModal';
import ConfirmationModal, { useConfirmationModal } from '../components/ui/ConfirmationModal';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import Breadcrumb from '../components/ui/Breadcrumb';

const TAB_BUTTON_VARIANTS = {
  active: 'bg-accent-indigo text-text-primary shadow-md',
  inactive: 'text-text-muted hover:text-text-primary'
};

const DROPZONE_VARIANTS = {
  withFile: 'border-accent-indigo bg-accent-indigo/5',
  empty: 'border-background-surface bg-background-elevated/30 hover:border-text-muted hover:bg-background-elevated'
};

export default function ContextDetailPage() {
  const { contextId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  useDocumentTitle('Detalle del Contexto');

  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isDeletingAsset, setIsDeletingAsset] = useState(null);
  const [isDeletingAudio, setIsDeletingAudio] = useState(null);
  const [audioModalAsset, setAudioModalAsset] = useState(null); // asset para AudioUploadModal

  // Confirmaciones de borrado (BUG-8 QA pre-release v0.5.0): el borrado de
  // assets toca Supabase Storage y un eventual mazo activo, así que pedimos
  // confirmación explícita. La de audio comparte el mismo flujo para evitar
  // el "deshacer imposible" tras un click accidental.
  const deleteAssetConfirm = useConfirmationModal();
  const deleteAudioConfirm = useConfirmationModal();

  const fetchContext = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await contextsAPI.getContextById(contextId);
      const data = extractData(res);
      setContext(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Eliminar asset completo (imagen + audio)
  const performDeleteAsset = async (asset) => {
    const contextDocId = context._id || context.id;

    setIsDeletingAsset(asset.key);
    try {
      // deleteImage elimina el asset completo incluyendo audio si lo tiene
      await contextsAPI.deleteImage(contextDocId, asset.key);
      toast.success(`Asset "${asset.value}" eliminado`);
      await fetchContext();
    } catch (err) {
      const msg = extractErrorMessage(err);
      if (err?.response?.status === 409) {
        toast.error('No se puede eliminar: el asset está en uso por un mazo activo', { description: msg });
      } else {
        toast.error('Error al eliminar el asset', { description: msg });
      }
    } finally {
      setIsDeletingAsset(null);
    }
  };

  const handleDeleteAsset = (asset) => {
    deleteAssetConfirm.openModal({
      title: 'Eliminar asset',
      description: `Vas a eliminar "${asset.value}" (${asset.key}). Se borrará la imagen, los audios asociados y los archivos en Supabase Storage. Si está en uso por un mazo activo, la operación se rechazará.`,
      confirmText: 'Eliminar definitivamente',
      cancelText: 'Cancelar',
      variant: 'destructive',
      onConfirm: () => performDeleteAsset(asset),
    });
  };

  // Eliminar solo el audio de un asset (conservar imagen)
  const performDeleteAudio = async (asset) => {
    const contextDocId = context._id || context.id;

    setIsDeletingAudio(asset.key);
    try {
      await contextsAPI.deleteAudio(contextDocId, asset.key);
      toast.success(`Audio de "${asset.value}" eliminado`);
      await fetchContext();
    } catch (err) {
      toast.error('Error al eliminar el audio', { description: extractErrorMessage(err) });
    } finally {
      setIsDeletingAudio(null);
    }
  };

  const handleDeleteAudio = (asset) => {
    deleteAudioConfirm.openModal({
      title: 'Eliminar audio',
      description: `Se eliminará el audio asociado a "${asset.value}". La imagen se mantiene.`,
      confirmText: 'Eliminar audio',
      cancelText: 'Cancelar',
      variant: 'destructive',
      onConfirm: () => performDeleteAudio(asset),
    });
  };

  useEffect(() => {
    fetchContext();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchContext is not memoized; only re-run when contextId changes
  }, [contextId]);

  if (loading) {
    return (
      <div className="min-h-full bg-background-deep p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-32 bg-background-elevated rounded animate-pulse mb-6" />
          <div className="h-24 bg-background-elevated rounded-2xl animate-pulse mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {Array.from({ length: 6 }, (_, i) => `ctx-detail-skeleton-${i}`).map(id => <SkeletonCard key={id} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="min-h-full bg-background-deep p-4 lg:p-8 flex items-center justify-center">
        <GlassCard className="p-8 text-center max-w-md">
          <AlertTriangle size={48} className="text-error-base mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Error</h2>
          <p className="text-text-muted mb-6">{error || 'Contexto no encontrado'}</p>
          <ButtonPremium onClick={() => navigate(ROUTES.CONTEXTS)}>
            Volver a Contextos
          </ButtonPremium>
        </GlassCard>
      </div>
    );
  }

  const assets = context.assets || [];

  return (
    <div className="min-h-full bg-background-deep p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-8"
      >
        <Breadcrumb items={[
          { label: 'Contextos', to: ROUTES.CONTEXTS },
          { label: context.name },
        ]} />

        <GlassCard className="p-6 md:p-8 border-accent-indigo/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center shadow-lg shadow-accent-indigo/20">
                <Palette size={32} className="text-text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-text-primary tracking-tight">{context.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-sm font-mono text-text-muted bg-background-elevated/50 px-2.5 py-1 rounded-md">
                    {context.contextId}
                  </span>
                  <span className="text-sm text-text-muted">
                    {assets.length} assets en total
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
              {/* La gestion del contexto (editar/eliminar) vive en /admin/contexts (super_admin).
                  Aqui los profesores solo pueden subir nuevos assets. */}
              <ButtonPremium
                onClick={() => setShowUploadModal(true)}
                icon={<Plus size={18} />}
                className="flex-1 md:flex-none"
              >
                Añadir imagen
              </ButtonPremium>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Grid de Assets */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-text-primary mb-6">Contenido del Contexto</h2>
        
        {assets.length === 0 ? (
          <GlassCard className="p-12 text-center border-dashed border-2 bg-background-base/50">
            <Upload size={48} className="mx-auto text-text-disabled mb-4" />
            <h3 className="text-lg font-medium text-text-primary mb-2">Este contexto está vacío</h3>
            <p className="text-text-muted mb-6">Añade imágenes o audios para usarlos en los mazos de cartas.</p>
            <ButtonPremium onClick={() => setShowUploadModal(true)} variant="secondary">
              Añadir el primer asset
            </ButtonPremium>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence>
              {assets.map((asset, i) => (
                <AssetCard
                  key={asset.key}
                  asset={asset}
                  index={i}
                  contextId={context._id || context.id}
                  onDelete={handleDeleteAsset}
                  isDeleting={isDeletingAsset === asset.key}
                  onDeleteAudio={handleDeleteAudio}
                  isDeletingAudio={isDeletingAudio === asset.key}
                  onManageAudio={(a) => setAudioModalAsset(a)}
                  currentUserId={currentUser?.id || currentUser?._id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modales */}
      <AnimatePresence>
        {showUploadModal && (
          <UploadAssetModal
            context={context}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              fetchContext();
            }}
          />
        )}
        {audioModalAsset && (
          <AudioUploadModal
            assetKey={audioModalAsset.key}
            assetValue={audioModalAsset.value}
            contextId={context._id || context.id}
            currentAudioUrl={audioModalAsset.audioUrl || null}
            onClose={() => setAudioModalAsset(null)}
            onSuccess={() => {
              setAudioModalAsset(null);
              fetchContext();
            }}
          />
        )}
      </AnimatePresence>

      {/* Confirmaciones destructivas para borrado de assets/audios */}
      <ConfirmationModal {...deleteAssetConfirm.modalProps} />
      <ConfirmationModal {...deleteAudioConfirm.modalProps} />
    </div>
  );
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

// Politica de ownership (ver ADR-053):
//  - solo el creador del asset puede gestionarlo (delete / replace audio)
//  - assets sin uploadedBy son "del sistema" y nadie puede eliminarlos individualmente;
//    para borrarlos hay que eliminar el contexto entero desde /admin/contexts (super_admin)
//  - el super_admin no tiene override sobre assets individuales: su rol es gestionar
//    contextos como "carpetas", no el contenido subido por profesores
function computeAssetOwnership(asset, currentUserId) {
  const ownerId = asset.uploadedBy?.id || null;
  const ownerName = asset.uploadedBy?.name || null;
  const isOwner = Boolean(currentUserId && ownerId && ownerId === currentUserId);

  if (isOwner) {
    return {
      canManage: true,
      ownershipLabel: 'Subido por ti',
      ownershipTooltip: 'Eres el creador del asset y puedes gestionarlo.'
    };
  }

  if (ownerName) {
    return {
      canManage: false,
      ownershipLabel: `Subido por ${ownerName}`,
      ownershipTooltip: `Solo ${ownerName} puede eliminar o reemplazar este asset.`
    };
  }

  return {
    canManage: false,
    ownershipLabel: 'Asset del sistema',
    ownershipTooltip:
      'Este asset es parte de la base del contexto y no puede eliminarse individualmente. Para borrarlo, elimina el contexto entero desde el panel de administración.'
  };
}

function AssetCardAudioSection({
  asset,
  canManage,
  audioActionsTooltip,
  onManageAudio,
  onDeleteAudio,
  isDeletingAudio
}) {
  if (!asset.audioUrl) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); if (canManage) onManageAudio(asset); }}
        disabled={!canManage}
        aria-disabled={!canManage}
        title={canManage ? 'Adjuntar un archivo de audio MP3/OGG a este asset' : audioActionsTooltip}
        className={cn(
          'flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border border-dashed transition-colors duration-200',
          canManage
            ? 'border-border-default text-text-muted hover:border-accent-indigo/50 hover:text-accent-indigo hover:bg-accent-indigo/5'
            : 'border-border-subtle text-text-disabled cursor-not-allowed opacity-60'
        )}
      >
        <Music size={12} />
        Añadir audio
      </button>
    );
  }

  const replaceClass = canManage
    ? 'text-text-muted hover:text-accent-indigo hover:bg-accent-indigo/10'
    : 'text-text-disabled cursor-not-allowed opacity-60';
  const deleteAudioClass = canManage
    ? 'text-text-muted hover:text-error-base hover:bg-error-base/10'
    : 'text-text-disabled cursor-not-allowed opacity-60';

  return (
    <div className="space-y-1.5">
      <AudioMiniPlayer audioUrl={asset.audioUrl} size="md" variant="solid" />
      <div className="flex items-center gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); if (canManage) onManageAudio(asset); }}
          disabled={!canManage}
          aria-disabled={!canManage}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
            replaceClass
          )}
          title={canManage ? 'Reemplazar audio' : audioActionsTooltip}
        >
          <RefreshCw size={10} />
          Reemplazar
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (canManage) onDeleteAudio(asset); }}
          disabled={isDeletingAudio || !canManage}
          aria-disabled={!canManage}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50',
            deleteAudioClass
          )}
          title={canManage ? 'Eliminar solo el audio' : audioActionsTooltip}
        >
          {isDeletingAudio ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
          Audio
        </button>
      </div>
    </div>
  );
}

function AssetCard({ asset, index, onDelete, isDeleting = false, onDeleteAudio, isDeletingAudio = false, onManageAudio, currentUserId }) {
  const { canManage, ownershipLabel, ownershipTooltip } = computeAssetOwnership(asset, currentUserId);
  const deleteTooltip = canManage ? 'Eliminar asset completo' : ownershipTooltip;
  const audioActionsTooltip = canManage ? null : ownershipTooltip;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <GlassCard
        className={cn(
          "h-full overflow-hidden flex flex-col relative border-border-subtle transition-[border-color,box-shadow] duration-300",
          "hover:border-accent-indigo/30"
        )}
        style={asset.dominantColor ? { '--card-glow': asset.dominantColor } : undefined}
      >
        {/* Preview Container */}
        <div className="aspect-square w-full bg-background-elevated/50 relative overflow-hidden flex items-center justify-center group-hover:shadow-[0_0_24px_var(--card-glow,transparent)]">
          <CardAssetPreview
            asset={asset}
            alt={asset.value}
            className="w-full h-full"
            imageClassName="group-hover:scale-110 transition-transform duration-500"
            fit="cover"
            fallbackIcon={<Palette size={40} className="text-text-disabled" />}
          />

          {/* Type Badges */}
          <div className="absolute top-2 right-2 flex gap-1">
            {(asset.imageUrl || asset.thumbnailUrl) && (
              <div className="size-6 rounded-full bg-backdrop backdrop-blur-md flex items-center justify-center">
                <ImageIcon size={12} className="text-success-base" />
              </div>
            )}
            {asset.audioUrl && (
              <div className="size-6 rounded-full bg-backdrop backdrop-blur-md flex items-center justify-center">
                <Music size={12} className="text-warning-base" />
              </div>
            )}
          </div>
        </div>

        {/* Detalles + Audio Management */}
        <div className="p-3 bg-background-base/40 border-t border-border-subtle flex-1 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <h4 className="font-medium text-text-primary truncate" title={asset.value}>
                {asset.value}
              </h4>
              <p className="text-xs text-text-muted font-mono mt-1 truncate" title={asset.key}>
                {asset.key}
              </p>
            </div>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); if (canManage) onDelete(asset); }}
                disabled={isDeleting || !canManage}
                aria-disabled={!canManage}
                className={cn(
                  'flex-shrink-0 p-1.5 rounded-lg transition-colors',
                  canManage
                    ? 'text-text-muted hover:text-error-base hover:bg-error-base/10'
                    : 'text-text-disabled cursor-not-allowed opacity-60'
                )}
                title={deleteTooltip}
                aria-label={canManage ? 'Eliminar asset completo' : `Bloqueado: ${ownershipTooltip}`}
              >
                {isDeleting
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Trash2 size={14} />}
              </button>
            )}
          </div>

          {/* Linea de autoría (ADR-052): muestra quien subio el asset */}
          <p
            className="text-[10px] text-text-muted truncate"
            title={ownershipTooltip}
          >
            {ownershipLabel}
          </p>

          {/* Audio: player + acciones, o boton añadir.
              Solo el creador o el super_admin puede modificar/eliminar (ADR-052). */}
          <AssetCardAudioSection
            asset={asset}
            canManage={canManage}
            audioActionsTooltip={audioActionsTooltip}
            onManageAudio={onManageAudio}
            onDeleteAudio={onDeleteAudio}
            isDeletingAudio={isDeletingAudio}
          />
        </div>
      </GlassCard>
    </motion.div>
  );
}

function UploadAssetModal({ context, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    display: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadConfig, setUploadConfig] = useState({
    image: { maxInputSizeMB: 8, allowedFormats: ['PNG', 'JPG', 'JPEG', 'GIF', 'WebP'] }
  });

  useEffect(() => {
    let isMounted = true;

    const loadUploadConfig = async () => {
      try {
        const response = await contextsAPI.getUploadConfig();
        const configData = extractData(response);
        if (isMounted && configData) {
          setUploadConfig(configData);
        }
      } catch {
        // Se mantienen defaults locales si falla la carga
      }
    };

    loadUploadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    const maxSizeMB = uploadConfig?.image?.maxInputSizeMB || 8;
    if (selected.size > maxSizeMB * 1024 * 1024) {
      toast.error(`El archivo excede el máximo permitido de ${maxSizeMB}MB`);
      return;
    }

    if (!selected.type.startsWith('image/')) {
      toast.error('Formato inválido: selecciona una imagen válida');
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));

    // Auto-completar campos según el archivo si están vacíos
    if (!formData.key) {
      const nameWithoutExt = selected.name.split('.')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const capitalize = nameWithoutExt.charAt(0).toUpperCase() + nameWithoutExt.slice(1).replace(/_/g, ' ');
      setFormData(prev => ({ ...prev, key: nameWithoutExt }));
      if (!formData.value) {
        setFormData(prev => ({ ...prev, value: capitalize }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      toast.error('Selecciona un archivo primero');
      return;
    }
    
    if (!formData.key.trim() || !formData.value.trim()) {
      toast.error('La clave (key) y el valor (value) son requeridos');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('key', formData.key.trim().toLowerCase());
      data.append('value', formData.value.trim());
      if (formData.display.trim()) {
        data.append('display', formData.display.trim());
      }

      // El endpoint espera el _id de Mongo en la URL. El DTO
      // `toGameContextDTOV1` expone `id` (no `_id`), por lo que sin este
      // fallback el upload caia al `contextId` (slug) y el backend respondia
      // 400 "ID de MongoDB invalido" (QA 26/04/2026).
      await contextsAPI.uploadImage(context._id || context.id || context.contextId, data);
      toast.success('Imagen subida correctamente');
      onSuccess();
    } catch (err) {
      toast.error('Error al subir imagen', {
        description: extractErrorMessage(err)
      });
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
        className="bg-background-base border border-border-default rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-accent-indigo/20 flex items-center justify-center">
              <Upload size={20} className="text-accent-indigo" />
            </div>
            <h3 className="text-lg font-semibold text-text-primary">Subir imagen</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-border-default transition-colors text-text-muted"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* File Dropzone */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              className={cn(
                'w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden',
                file ? DROPZONE_VARIANTS.withFile : DROPZONE_VARIANTS.empty
              )}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".png,.jpg,.jpeg,.gif,.webp,image/*"
                className="hidden"
              />
              
              {/* Contenido del area de subida */}
              {(() => {
                if (preview) return (
                  <>
                    <img src={preview} alt="Preview" className="w-full h-full object-contain opacity-40 blur-sm absolute" />
                    <img src={preview} alt="Preview focus" className="h-full object-contain z-10 drop-shadow-lg" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 z-20 flex justify-between items-end">
                      <span className="text-xs text-text-primary truncate max-w-[80%]">{file.name}</span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }} className="text-error-base hover:text-error-base/80">
                        <X size={16} />
                      </button>
                    </div>
                  </>
                );
                if (file) return (
                  <div className="text-center z-10 px-4">
                    <div className="size-12 rounded-full bg-success-base/20 text-success-base flex items-center justify-center mx-auto mb-3">
                      <Check size={24} />
                    </div>
                    <p className="text-sm font-medium text-text-primary truncate mb-1">{file.name}</p>
                    <p className="text-xs text-text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                );
                return (
                  <div className="text-center px-4">
                    <ImageIcon size={32} className="mx-auto text-text-muted mb-3" />
                    <p className="text-sm font-medium text-text-primary mb-1">Click para seleccionar imagen</p>
                    <p className="text-xs text-text-muted">
                      {uploadConfig?.image?.allowedFormats?.join(', ')} (Max {uploadConfig?.image?.maxInputSizeMB}MB)
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <InputPremium
                label="Identificador Único (Key)"
                placeholder="ej: cow"
                value={formData.key}
                onChange={e => setFormData(prev => ({ ...prev, key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
                required
                info="Clave en minúsculas sin espacios (ej: dog, cat). Debe ser única en este contexto."
              />
              <InputPremium
                label="Nombre Visible (Value)"
                placeholder="ej: Vaca"
                value={formData.value}
                onChange={e => setFormData(prev => ({ ...prev, value: e.target.value }))}
                required
                info="Nombre que leerán los usuarios"
              />
            </div>
            
            <InputPremium
              label="Emoji (Opcional)"
              placeholder="ej: 🐄"
              value={formData.display}
              onChange={e => setFormData(prev => ({ ...prev, display: e.target.value }))}
              info="Un emoji representativo visible en las listas"
            />

            <div className="pt-4 flex justify-end gap-3 border-t border-border-subtle mt-6">
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
                disabled={!file || !formData.key || !formData.value}
                icon={<Upload size={16} />}
              >
                Subir Archivo
              </ButtonPremium>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
