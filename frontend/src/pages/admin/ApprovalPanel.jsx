/**
 * @fileoverview Panel de administración para aprobar/rechazar profesores pendientes
 * Solo accesible para usuarios con rol super_admin.
 * 
 * @module pages/admin/ApprovalPanel
 */

import { useState, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  Mail, 
  Calendar,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { adminAPI, extractData, extractErrorMessage, isAbortError } from '../../services/api';
import { ButtonPremium, InputPremium, GlassCard, StatusBadge, SkeletonCard, EmptyState } from '../../components/ui';
import { useRefetchOnFocus } from '../../hooks';
import { cn } from '../../lib/utils';

/**
 * Modal de confirmación para aprobar/rechazar
 * Incluye focus trap y cierre con Escape para accesibilidad
 */
function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  type, 
  user, 
  isLoading 
}) {
  const [reason, setReason] = useState('');
  const modalRef = useRef(null);
  const firstFocusableRef = useRef(null);
  const lastFocusableRef = useRef(null);

  // Resetear razón cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      setReason('');
    }
  }, [isOpen]);

  // Focus trap y manejo de Escape
  useEffect(() => {
    if (!isOpen) return;

    // Guardar el elemento que tenía el foco antes de abrir el modal
    const previouslyFocused = document.activeElement;

    // Focus en el primer elemento enfocable del modal
    const timer = setTimeout(() => {
      firstFocusableRef.current?.focus();
    }, 100);

    // Manejar tecla Escape para cerrar
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap: Tab y Shift+Tab
      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        if (!focusableElements || focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          // Shift + Tab desde el primer elemento: ir al último
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          // Tab desde el último elemento: ir al primero
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      // Restaurar el foco al cerrar el modal
      previouslyFocused?.focus();
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const isApprove = type === 'approve';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <GlassCard className="p-6" variant="solid">
              {/* Icono */}
              <div className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4',
                isApprove 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'bg-rose-500/10 text-rose-400'
              )}>
                {isApprove ? (
                  <UserCheck className="w-8 h-8" />
                ) : (
                  <UserX className="w-8 h-8" />
                )}
              </div>

              {/* Título */}
              <h3 
                id="modal-title"
                className="text-xl font-semibold text-white text-center mb-2"
              >
                {isApprove ? 'Aprobar Profesor' : 'Rechazar Profesor'}
              </h3>

              {/* Descripción */}
              <p className="text-slate-400 text-center mb-4">
                {isApprove 
                  ? `¿Estás seguro de aprobar a ${user?.name}? Podrá acceder a la plataforma.`
                  : `¿Estás seguro de rechazar a ${user?.name}? No podrá acceder a la plataforma.`
                }
              </p>

              {/* Info del usuario */}
              <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                    {user?.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user?.name}</p>
                    <p className="text-slate-400 text-sm">{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Campo de razón (solo para rechazo) */}
              {!isApprove && (
                <div className="mb-4">
                  <InputPremium
                    label="Razón del rechazo (opcional)"
                    placeholder="Ej: Información incompleta..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3">
                <ButtonPremium
                  ref={firstFocusableRef}
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  ref={lastFocusableRef}
                  variant={isApprove ? 'success' : 'danger'}
                  className="flex-1"
                  onClick={() => onConfirm(reason)}
                  loading={isLoading}
                  disabled={isLoading}
                >
                  {isApprove ? 'Aprobar' : 'Rechazar'}
                </ButtonPremium>
              </div>
            </GlassCard>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

ConfirmationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  type: PropTypes.oneOf(['approve', 'reject']),
  user: PropTypes.shape({
    _id: PropTypes.string,
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
  }),
  isLoading: PropTypes.bool,
};

/**
 * Card de profesor pendiente
 */
function PendingTeacherCard({ teacher, onApprove, onReject }) {
  const createdAt = new Date(teacher.createdAt).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      layout
    >
      <GlassCard className="p-5 hover:border-white/20 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Avatar y nombre */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-purple-500/20 flex-shrink-0">
              {teacher.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            
            <div className="min-w-0 flex-1">
              <h3 className="text-white font-semibold truncate">
                {teacher.name}
              </h3>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{teacher.email}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500 text-xs mt-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>Registrado el {createdAt}</span>
              </div>
            </div>
          </div>

          {/* Badge de estado */}
          <div className="flex items-center gap-3 sm:flex-shrink-0">
            <StatusBadge status="warning">
              <Clock className="w-3.5 h-3.5" />
              Pendiente
            </StatusBadge>
          </div>

          {/* Acciones */}
          <div className="flex items-center gap-2 sm:flex-shrink-0">
            <ButtonPremium
              variant="success"
              size="sm"
              onClick={() => onApprove(teacher)}
              icon={<UserCheck className="w-4 h-4" />}
            >
              Aprobar
            </ButtonPremium>
            <ButtonPremium
              variant="danger"
              size="sm"
              onClick={() => onReject(teacher)}
              icon={<UserX className="w-4 h-4" />}
            >
              Rechazar
            </ButtonPremium>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

PendingTeacherCard.propTypes = {
  teacher: PropTypes.shape({
    _id: PropTypes.string,
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    createdAt: PropTypes.string,
  }).isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

/**
 * Skeleton de carga
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <SkeletonCard key={i} className="h-24" />
      ))}
    </div>
  );
}

/**
 * Panel de Aprobación de Profesores
 */
export default function ApprovalPanel() {
  // Estado
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Usar useDeferredValue para debounce nativo de React
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const requestRef = useRef(null);

  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    type: null, // 'approve' | 'reject'
    user: null,
    isLoading: false,
  });

  /**
   * Cargar profesores pendientes
   */
  const fetchPendingTeachers = useCallback(async (page = 1) => {
    if (requestRef.current) {
      requestRef.current.abort();
    }

    const controller = new AbortController();
    requestRef.current = controller;

    if (teachers.length === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await adminAPI.getPendingTeachers({
        page,
        limit: pagination.limit,
      }, { signal: controller.signal });

      const data = extractData(response);
      
      setTeachers(data.users || data.data || []);
      setPagination((prev) => ({
        ...prev,
        page: data.pagination?.page || page,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 1,
      }));
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      const message = extractErrorMessage(err);
      setError(message);
      toast.error('Error al cargar solicitudes');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [pagination.limit, teachers.length]);

  // Cargar al montar
  useEffect(() => {
    fetchPendingTeachers();
    return () => requestRef.current?.abort();
  }, [fetchPendingTeachers]);

  useRefetchOnFocus({
    refetch: () => fetchPendingTeachers(pagination.page),
    isLoading: loading,
    hasData: teachers.length > 0,
    hasError: Boolean(error)
  });

  /**
   * Abrir modal de confirmación
   */
  const openModal = (type, user) => {
    setModalState({
      isOpen: true,
      type,
      user,
      isLoading: false,
    });
  };

  /**
   * Cerrar modal
   */
  const closeModal = () => {
    setModalState({
      isOpen: false,
      type: null,
      user: null,
      isLoading: false,
    });
  };

  /**
   * Confirmar acción (aprobar/rechazar)
   */
  const handleConfirm = async (reason = '') => {
    const { type, user } = modalState;
    
    setModalState((prev) => ({ ...prev, isLoading: true }));

    try {
      if (type === 'approve') {
        await adminAPI.approveTeacher(user._id || user.id);
        toast.success(`${user.name} ha sido aprobado correctamente`, {
          icon: <CheckCircle className="w-5 h-5 text-emerald-400" />,
        });
      } else {
        await adminAPI.rejectTeacher(user._id || user.id, reason);
        toast.success(`${user.name} ha sido rechazado`, {
          icon: <XCircle className="w-5 h-5 text-rose-400" />,
        });
      }

      // Actualizar lista
      setTeachers((prev) => prev.filter((t) => (t._id || t.id) !== (user._id || user.id)));
      setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      
      closeModal();
    } catch (err) {
      const message = extractErrorMessage(err);
      toast.error(message);
      setModalState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  /**
   * Filtrar profesores por búsqueda (usa valor diferido para debounce)
   */
  const filteredTeachers = teachers.filter((teacher) => {
    if (!deferredSearchQuery.trim()) return true;
    const query = deferredSearchQuery.toLowerCase();
    return (
      teacher.name?.toLowerCase().includes(query) ||
      teacher.email?.toLowerCase().includes(query)
    );
  });
  
  // Indicador visual de que la búsqueda está pendiente
  const isSearchPending = searchQuery !== deferredSearchQuery;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Fondo decorativo */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div 
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-display text-white">
                Panel de Administración
              </h1>
              <p className="text-slate-400">
                Gestiona las solicitudes de nuevos profesores
              </p>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-400">Solicitudes pendientes</p>
                  <p className="text-2xl font-bold text-white">{pagination.total}</p>
                </div>
              </div>
              
              <ButtonPremium
                variant="ghost"
                size="sm"
                onClick={() => fetchPendingTeachers(pagination.page)}
                disabled={loading}
                icon={<RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />}
              >
                Actualizar
              </ButtonPremium>
            </div>
          </GlassCard>
        </motion.div>

        {/* Barra de búsqueda */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 relative"
        >
          <InputPremium
            placeholder="Buscar por nombre o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search className={cn('w-5 h-5', isSearchPending && 'animate-pulse')} />}
          />
          {isSearchPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            </div>
          )}
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6"
            >
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-rose-300 font-medium">Error al cargar datos</p>
                  <p className="text-rose-400/80 text-sm mt-1">{error}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de profesores */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {loading ? (
            <LoadingSkeleton />
          ) : filteredTeachers.length === 0 ? (
            <EmptyState
              title="No hay solicitudes pendientes"
              description="Todas las solicitudes de profesores han sido procesadas. Vuelve mas tarde para revisar nuevas solicitudes."
              icon={<Inbox className="w-10 h-10" />}
              className="bg-transparent"
            />
          ) : (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {filteredTeachers.map((teacher) => (
                  <PendingTeacherCard
                    key={teacher._id || teacher.id}
                    teacher={teacher}
                    onApprove={() => openModal('approve', teacher)}
                    onReject={() => openModal('reject', teacher)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Paginación */}
        {!loading && pagination.totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-4 mt-8"
          >
            <ButtonPremium
              variant="secondary"
              size="sm"
              onClick={() => fetchPendingTeachers(pagination.page - 1)}
              disabled={pagination.page <= 1}
              icon={<ChevronLeft className="w-4 h-4" />}
            >
              Anterior
            </ButtonPremium>
            
            <span className="text-slate-400 text-sm">
              Página {pagination.page} de {pagination.totalPages}
            </span>
            
            <ButtonPremium
              variant="secondary"
              size="sm"
              onClick={() => fetchPendingTeachers(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              icon={<ChevronRight className="w-4 h-4" />}
              iconPosition="right"
            >
              Siguiente
            </ButtonPremium>
          </motion.div>
        )}
      </div>

      {/* Modal de confirmación */}
      <ConfirmationModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onConfirm={handleConfirm}
        type={modalState.type}
        user={modalState.user}
        isLoading={modalState.isLoading}
      />
    </div>
  );
}
