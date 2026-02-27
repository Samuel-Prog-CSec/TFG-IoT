/**
 * @fileoverview Panel de gestión de alumnos exclusivo para Super Admin.
 * Permite crear, editar y visualizar todos los alumnos del sistema.
 * 
 * @module pages/admin/StudentManagement
 */

import { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  GraduationCap, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  User,
  School,
  IdCard,
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { usersAPI, extractErrorMessage, isAbortError } from '../../services/api';
import { 
  ButtonPremium, 
  InputPremium, 
  SelectPremium, 
  GlassCard, 
  SkeletonCard, 
  EmptyState,
  StatusBadge,
  ConfirmationModal
} from '../../components/ui';
import { useRefetchOnFocus } from '../../hooks';
import { cn, pageVariants, staggerContainer, staggerItem } from '../../lib/utils';

/**
 * Modal para crear un nuevo alumno
 */
/**
 * Modal para editar un alumno existente
 */
function EditStudentModal({ isOpen, onClose, onUpdated, student }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    classroom: ''
  });

  useEffect(() => {
    if (isOpen && student) {
      setFormData({
        name: student.name || '',
        age: student.profile?.age ? String(student.profile.age) : '',
        classroom: student.profile?.classroom || ''
      });
    }
  }, [isOpen, student]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAge = Number.parseInt(formData.age, 10);
    if (!formData.name.trim() || Number.isNaN(parsedAge)) {
      toast.error('Nombre y edad son obligatorios');
      return;
    }
    if (parsedAge < 3 || parsedAge > 99) {
      toast.error('La edad debe estar entre 3 y 99 años');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        profile: {
          age: parsedAge,
          classroom: formData.classroom.trim() || undefined
        }
      };

      await usersAPI.updateUser(student.id || student._id, payload);
      toast.success('Alumno actualizado exitosamente');
      onUpdated();
      onClose();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard className="p-8" variant="solid">
            <header className="mb-6">
              <div className="w-12 h-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
                <Edit size={24} />
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Editar Alumno</h2>
              <p className="text-text-muted">Modifica los datos del alumno.</p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
              <InputPremium
                label="Nombre completo"
                placeholder="Ej: Juan Pérez"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                icon={<User size={18} />}
                required
              />

              <InputPremium
                label="Edad"
                type="number"
                min="3"
                max="99"
                placeholder="Ej: 6"
                value={formData.age}
                onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                icon={<IdCard size={18} />}
                required
              />

              <InputPremium
                label="Clase (Opcional)"
                placeholder="Ej: Aula 3B"
                value={formData.classroom}
                onChange={(e) => setFormData(prev => ({ ...prev, classroom: e.target.value }))}
                icon={<School size={18} />}
              />

              <div className="flex gap-3 pt-4">
                <ButtonPremium
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={loading}
                >
                  Guardar Cambios
                </ButtonPremium>
              </div>
            </form>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Modal para crear un nuevo alumno
 */
function CreateStudentModal({ isOpen, onClose, onCreated, teachers }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    classroom: '',
    teacherId: ''
  });

  useEffect(() => {
    if (!isOpen) {
      setFormData({ name: '', age: '', classroom: '', teacherId: '' });
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAge = Number.parseInt(formData.age, 10);
    if (!formData.name.trim() || !formData.teacherId || Number.isNaN(parsedAge)) {
      toast.error('Nombre, edad y profesor son obligatorios');
      return;
    }
    if (parsedAge < 3 || parsedAge > 99) {
      toast.error('La edad debe estar entre 3 y 99 años');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name.trim(),
        profile: {
          age: parsedAge,
          classroom: formData.classroom.trim() || undefined
        },
        teacherId: formData.teacherId
      };

      await usersAPI.createUser(payload);
      toast.success('Alumno creado exitosamente');
      onCreated();
      onClose();
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard className="p-8" variant="solid">
            <header className="mb-6">
              <div className="w-12 h-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
                <UserPlus size={24} />
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Crear Nuevo Alumno</h2>
              <p className="text-text-muted">Asigna un nuevo alumno a un profesor y clase.</p>
            </header>

            <form onSubmit={handleSubmit} className="space-y-6">
              <InputPremium
                label="Nombre completo"
                placeholder="Ej: Juan Pérez"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                icon={<User size={18} />}
                required
              />

              <InputPremium
                label="Edad"
                type="number"
                min="3"
                max="99"
                placeholder="Ej: 6"
                value={formData.age}
                onChange={(e) => setFormData(prev => ({ ...prev, age: e.target.value }))}
                icon={<IdCard size={18} />}
                required
              />

              <InputPremium
                label="Clase (Opcional)"
                placeholder="Ej: Aula 3B"
                value={formData.classroom}
                onChange={(e) => setFormData(prev => ({ ...prev, classroom: e.target.value }))}
                icon={<School size={18} />}
              />

              <SelectPremium
                label="Profesor Responsable"
                placeholder="Selecciona un profesor"
                options={teachers.map(t => ({
                  value: t.id || t._id,
                  label: t.name || t.email,
                  icon: <Users size={16} />
                }))}
                value={formData.teacherId}
                onChange={(val) => setFormData(prev => ({ ...prev, teacherId: val }))}
                required
              />

              <div className="flex gap-3 pt-4">
                <ButtonPremium
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </ButtonPremium>
                <ButtonPremium
                  type="submit"
                  variant="primary"
                  className="flex-1"
                  loading={loading}
                >
                  Crear Alumno
                </ButtonPremium>
              </div>
            </form>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Componente principal de gestión de alumnos
 */
export default function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Menú de acciones por alumno
  const [activeMenuId, setActiveMenuId] = useState(null);
  
  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [pagination, setPagination] = useState({ page: 1, limit: 12, total: 0, totalPages: 1 });

  const fetchInitialData = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, teachersRes] = await Promise.all([
        usersAPI.getUsers({ 
          role: 'student', 
          page, 
          limit: pagination.limit,
          search: deferredSearch || undefined 
        }),
        usersAPI.getUsers({ role: 'teacher', status: 'active', limit: 100 })
      ]);

      const studentsData = studentsRes.data;
      const teachersData = teachersRes.data;

      setStudents(Array.isArray(studentsData.data) ? studentsData.data : []);
      setTeachers(Array.isArray(teachersData.data) ? teachersData.data : []);
      
      setPagination(prev => ({
        ...prev,
        page: studentsData.pagination?.page || page,
        total: studentsData.pagination?.total || 0,
        totalPages: studentsData.pagination?.totalPages || 1
      }));
    } catch (err) {
      if (!isAbortError(err)) {
        setError(extractErrorMessage(err));
        toast.error('Error al cargar datos');
      }
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, pagination.limit]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useRefetchOnFocus({
    refetch: () => fetchInitialData(pagination.page),
    isLoading: loading,
    hasData: students.length > 0
  });

  const handleEditClick = (student) => {
    setSelectedStudent(student);
    setIsEditModalOpen(true);
    setActiveMenuId(null);
  };

  const handleDeleteClick = (student) => {
    setSelectedStudent(student);
    setIsDeleteModalOpen(true);
    setActiveMenuId(null);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedStudent || isDeleting) return;

    setIsDeleting(true);
    try {
      await usersAPI.deleteUser(selectedStudent.id || selectedStudent._id);
      toast.success('Alumno eliminado correctamente');
      fetchInitialData(pagination.page);
      setIsDeleteModalOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setIsDeleting(false);
      setSelectedStudent(null);
    }
  };

  return (
    <motion.div 
      className="p-6 lg:p-10 max-w-7xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-base to-brand-dark flex items-center justify-center text-white shadow-lg shadow-brand-base/20">
            <GraduationCap size={30} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-primary font-display">Gestión de Alumnos</h1>
            <p className="text-text-muted">Administración centralizada de identidades de alumnos.</p>
          </div>
        </div>

        <ButtonPremium
          onClick={() => setIsModalOpen(true)}
          icon={<UserPlus size={18} />}
          className="shadow-xl shadow-brand-base/20"
        >
          Nuevo Alumno
        </ButtonPremium>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-success-base/10 text-success-base flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-bold">Total Alumnos</p>
            <p className="text-2xl font-bold text-text-primary">{pagination.total}</p>
          </div>
        </GlassCard>

        <div className="md:col-span-3">
          <InputPremium
            placeholder="Buscar por nombre o clase..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={20} className={cn(searchQuery !== deferredSearch && "animate-pulse")} />}
            className="h-full"
          />
        </div>
      </section>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div 
            key="loading"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} className="h-48" />
            ))}
          </motion.div>
        ) : students.length === 0 ? (
          <EmptyState
            key="empty"
            title="No se encontraron alumnos"
            description={searchQuery ? "Prueba con otros términos de búsqueda." : "Aún no hay alumnos registrados en el sistema."}
            icon={<User size={48} />}
          />
        ) : (
          <motion.div
            key="list"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {students.map((student) => (
              <motion.div key={student.id || student._id} variants={staggerItem}>
                <GlassCard className="p-5 hover:border-brand-base/40 group transition-all duration-300 relative overflow-hidden h-full flex flex-col">
                  {/* Acciones */}
                  <div className="absolute top-3 right-3 z-10">
                    <div className="relative">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === (student.id || student._id) ? null : (student.id || student._id));
                        }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>
                      
                      <AnimatePresence>
                        {activeMenuId === (student.id || student._id) && (
                          <>
                            <div 
                              className="fixed inset-0 z-10" 
                              onClick={() => setActiveMenuId(null)} 
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute right-0 mt-2 w-40 bg-background-elevated border border-border-subtle rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                            >
                              <button 
                                onClick={() => handleEditClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2 transition-colors"
                              >
                                <Edit size={14} /> Editar
                              </button>
                              <button 
                                onClick={() => handleDeleteClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-error-base hover:bg-error-base/10 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 size={14} /> Eliminar
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-background-base border border-border-subtle flex items-center justify-center text-xl shadow-inner">
                      {student.profile?.avatar ? (
                        <img src={student.profile.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        student.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-text-primary truncate">{student.name}</h3>
                      <div className="flex items-center gap-1.5 text-text-muted text-xs">
                        <School size={12} />
                        <span className="truncate">{student.profile?.classroom || 'Sin clase'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-border-subtle space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-tighter text-text-muted font-bold">Profesor</span>
                      <span className="text-xs text-text-primary font-medium truncate max-w-[120px]">
                        {student.createdBy?.name || 'Sistema'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-tighter text-text-muted font-bold">Estado</span>
                      <StatusBadge status={student.status === 'active' ? 'success' : 'neutral'} size="sm">
                        {student.status === 'active' ? 'Activo' : 'Inactivo'}
                      </StatusBadge>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && pagination.totalPages > 1 && (
        <footer className="flex items-center justify-center gap-4 mt-12 bg-background-elevated/20 p-4 rounded-2xl backdrop-blur-sm border border-border-subtle">
          <ButtonPremium
            variant="ghost"
            size="sm"
            onClick={() => fetchInitialData(pagination.page - 1)}
            disabled={pagination.page <= 1}
            icon={<ChevronLeft size={16} />}
          >
            Anterior
          </ButtonPremium>
          <span className="text-sm font-medium text-text-muted">
            Página <span className="text-text-primary">{pagination.page}</span> de {pagination.totalPages}
          </span>
          <ButtonPremium
            variant="ghost"
            size="sm"
            onClick={() => fetchInitialData(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            icon={<ChevronRight size={16} />}
            iconPosition="right"
          >
            Siguiente
          </ButtonPremium>
        </footer>
      )}

      <EditStudentModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedStudent(null);
        }}
        onUpdated={() => fetchInitialData(pagination.page)}
        student={selectedStudent}
      />

      <ConfirmationModal
        open={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedStudent(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Eliminar Alumno"
        description={`¿Estás seguro de que deseas eliminar a ${selectedStudent?.name}? Esta acción no se puede deshacer y se borrarán todos sus registros de juego asociados.`}
        confirmText="Eliminar permanentemente"
        variant="error"
        loading={isDeleting}
      />
    </motion.div>
  );
}
