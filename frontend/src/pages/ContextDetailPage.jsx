import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Palette, 
  Image as ImageIcon, 
  Music, 
  Plus, 
  Upload, 
  X,
  Check,
  Play,
  Pause,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

import { 
  GlassCard, 
  ButtonPremium, 
  InputPremium,
  SkeletonCard 
} from '../components/ui';
import { contextsAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';

export default function ContextDetailPage() {
  const { contextId } = useParams();
  const navigate = useNavigate();
  
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  
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

  useEffect(() => {
    fetchContext();
  }, [contextId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="h-8 w-32 bg-slate-800 rounded animate-pulse mb-6" />
          <div className="h-24 bg-slate-800 rounded-2xl animate-pulse mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 lg:p-8 flex items-center justify-center">
        <GlassCard className="p-8 text-center max-w-md">
          <AlertTriangle size={48} className="text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
          <p className="text-slate-400 mb-6">{error || 'Contexto no encontrado'}</p>
          <ButtonPremium onClick={() => navigate(ROUTES.CONTEXTS)}>
            Volver a Contextos
          </ButtonPremium>
        </GlassCard>
      </div>
    );
  }

  const assets = context.assets || [];

  return (
    <div className="min-h-screen bg-slate-950 p-4 lg:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto mb-8"
      >
        <button
          onClick={() => navigate(ROUTES.CONTEXTS)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          Volver a Contextos
        </button>
        
        <GlassCard className="p-6 md:p-8 border-indigo-500/20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Palette size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">{context.name}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-sm font-mono text-slate-400 bg-slate-800/50 px-2.5 py-1 rounded-md">
                    {context.contextId}
                  </span>
                  <span className="text-sm text-slate-400">
                    {assets.length} assets en total
                  </span>
                </div>
              </div>
            </div>
            
            <ButtonPremium 
              onClick={() => setShowUploadModal(true)}
              icon={<Plus size={18} />}
              className="w-full md:w-auto"
            >
              Añadir Asset
            </ButtonPremium>
          </div>
        </GlassCard>
      </motion.div>

      {/* Grid de Assets */}
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl font-semibold text-white mb-6">Contenido del Contexto</h2>
        
        {assets.length === 0 ? (
          <GlassCard className="p-12 text-center border-dashed border-2 bg-slate-900/50">
            <Upload size={48} className="mx-auto text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Este contexto está vacío</h3>
            <p className="text-slate-400 mb-6">Añade imágenes o audios para usarlos en los mazos de cartas.</p>
            <ButtonPremium onClick={() => setShowUploadModal(true)} variant="secondary">
              Añadir el primer asset
            </ButtonPremium>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence>
              {assets.map((asset, i) => (
                <AssetCard key={asset.key} asset={asset} index={i} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Modal Subida */}
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
      </AnimatePresence>
    </div>
  );
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

function AssetCard({ asset, index }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const toggleAudio = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4 }}
      className="group"
    >
      <GlassCard className="h-full overflow-hidden flex flex-col relative border-white/5 hover:border-indigo-500/30 transition-colors">
        {/* Preview Container */}
        <div className="aspect-square w-full bg-slate-800/50 relative overflow-hidden flex items-center justify-center">
          {asset.imageUrl || asset.thumbnailUrl ? (
            <img 
              src={asset.thumbnailUrl || asset.imageUrl} 
              alt={asset.value} 
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              loading="lazy"
            />
          ) : asset.display ? (
            <span className="text-6xl filter drop-shadow-md">{asset.display}</span>
          ) : (
            <Palette size={40} className="text-slate-600" />
          )}

          {/* Type Badge */}
          <div className="absolute top-2 right-2 flex gap-1">
            {(asset.imageUrl || asset.thumbnailUrl) && (
              <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center">
                <ImageIcon size={12} className="text-emerald-400" />
              </div>
            )}
            {asset.audioUrl && (
              <div className="w-6 h-6 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center">
                <Music size={12} className="text-amber-400" />
              </div>
            )}
          </div>
          
          {/* Audio Overlay Play Button */}
          {asset.audioUrl && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button 
                onClick={toggleAudio}
                className="w-12 h-12 rounded-full bg-indigo-500 text-white flex items-center justify-center hover:scale-110 transition-transform shadow-xl"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
              </button>
            </div>
          )}
        </div>

        {/* Detalles */}
        <div className="p-3 bg-slate-900/40 border-t border-white/5 flex-1 flex flex-col">
          <h4 className="font-medium text-white truncate" title={asset.value}>
            {asset.value}
          </h4>
          <p className="text-xs text-slate-500 font-mono mt-1 truncate" title={asset.key}>
            {asset.key}
          </p>
        </div>

        {/* Audio helper */}
        {asset.audioUrl && (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <audio 
            ref={audioRef} 
            src={asset.audioUrl} 
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        )}
      </GlassCard>
    </motion.div>
  );
}

function UploadAssetModal({ context, onClose, onSuccess }) {
  const [type, setType] = useState('image'); // 'image' | 'audio'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    display: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;

    setFile(selected);

    // Generar preview si es imagen
    if (selected.type.startsWith('image/')) {
      const url = URL.createObjectURL(selected);
      setPreview(url);
    } else {
      setPreview(null);
    }
    
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

      if (type === 'image') {
        await contextsAPI.uploadImage(context._id || context.contextId, data);
        toast.success('Imagen subida correctamente');
      } else {
        await contextsAPI.uploadAudio(context._id || context.contextId, data);
        toast.success('Audio subido correctamente');
      }
      
      onSuccess();
    } catch (err) {
      toast.error(type === 'image' ? 'Error al subir imagen' : 'Error al subir audio', {
        description: extractErrorMessage(err)
      });
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
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <Upload size={20} className="text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Añadir Asset</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Tabs Tipo */}
          <div className="flex bg-slate-800/50 rounded-xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setType('image'); setFile(null); setPreview(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                type === 'image' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <ImageIcon size={16} /> Imagen
            </button>
            <button
              type="button"
              onClick={() => { setType('audio'); setFile(null); setPreview(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                type === 'audio' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Music size={16} /> Audio
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* File Dropzone */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors relative overflow-hidden ${
                file ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              <input 
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept={type === 'image' ? "image/*" : "audio/*"}
                className="hidden"
              />
              
              {preview && type === 'image' ? (
                <>
                  <img src={preview} alt="Preview" className="w-full h-full object-contain opacity-40 blur-sm absolute" />
                  <img src={preview} alt="Preview focus" className="h-full object-contain z-10 drop-shadow-lg" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 z-20 flex justify-between items-end">
                    <span className="text-xs text-white truncate max-w-[80%]">{file.name}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }} className="text-rose-400 hover:text-rose-300">
                      <X size={16} />
                    </button>
                  </div>
                </>
              ) : file ? (
                <div className="text-center z-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <Check size={24} />
                  </div>
                  <p className="text-sm font-medium text-white truncate mb-1">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              ) : (
                <div className="text-center px-4">
                  {type === 'image' ? <ImageIcon size={32} className="mx-auto text-slate-500 mb-3" /> : <Music size={32} className="mx-auto text-slate-500 mb-3" />}
                  <p className="text-sm font-medium text-white mb-1">Click para seleccionar archivo</p>
                  <p className="text-xs text-slate-500">
                    {type === 'image' ? 'PNG, JPG, WEBP (Max 5MB)' : 'MP3, OGG, WAV (Max 10MB)'}
                  </p>
                </div>
              )}
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

            <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-6">
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
