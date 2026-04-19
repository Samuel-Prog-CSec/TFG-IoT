/**
 * @fileoverview Panel de gestión de alumnos exclusivo para Super Admin.
 * Permite crear, editar y visualizar todos los alumnos del sistema.
 * 
 * @module pages/admin/StudentManagement
 */

import { useState, useEffect, useCallback, useDeferredValue } from 'react';
import {
  Users,
  UserPlus,
  Search,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  User,
  School,
  IdCard,
  MoreVertical,
  Edit,
  Trash2,
  ShieldCheck,
  Download
} from 'lucide-react';
import ConsentDetailPanel from './ConsentDetailPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { usersAPI, extractErrorMessage, isAbortError } from '../../services/api';
import ButtonPremium from '../../components/ui/ButtonPremium';
import InputPremium from '../../components/ui/InputPremium';
import SelectPremium from '../../components/ui/SelectPremium';
import GlassCard from '../../components/ui/GlassCard';
import { SkeletonCard } from '../../components/ui/SkeletonShimmer';
import EmptyState from '../../components/ui/EmptyState';
import StatusBadge from '../../components/ui/StatusBadge';
import Tooltip from '../../components/ui/Tooltip';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
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
      toast.error('Introduce el nombre y la edad del alumno');
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
      toast.success('Alumno actualizado correctamente');
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
        className="fixed inset-0 bg-backdrop backdrop-blur-sm z-[100] flex items-center justify-center p-4"
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
              <div className="size-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
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
    teacherId: '',
    consentGranted: false,
    consentGrantedBy: ''
  });

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '',
        age: '',
        classroom: '',
        teacherId: '',
        consentGranted: false,
        consentGrantedBy: ''
      });
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const parsedAge = Number.parseInt(formData.age, 10);
    if (!formData.name.trim() || !formData.teacherId || Number.isNaN(parsedAge)) {
      toast.error('Introduce nombre, edad y selecciona un profesor');
      return;
    }
    if (parsedAge < 3 || parsedAge > 99) {
      toast.error('La edad debe estar entre 3 y 99 años');
      return;
    }
    if (!formData.consentGranted) {
      toast.error('El consentimiento parental es obligatorio (Art. 8 RGPD)');
      return;
    }
    if (!formData.consentGrantedBy.trim()) {
      toast.error('Debe indicar el nombre del tutor/a legal');
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
        teacherId: formData.teacherId,
        consent: {
          granted: true,
          grantedBy: formData.consentGrantedBy.trim()
        }
      };

      await usersAPI.createUser(payload);
      toast.success('Alumno creado correctamente');
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
        className="fixed inset-0 bg-backdrop backdrop-blur-sm z-[100] flex items-center justify-center p-4"
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
              <div className="size-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
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

              {/* Consentimiento parental — Art. 8 RGPD + Art. 7 LOPDGDD */}
              <div className="rounded-xl border border-brand-base/30 bg-brand-base/5 p-4 space-y-4">
                <div className="flex items-center gap-2 text-brand-base">
                  <ShieldCheck size={20} />
                  <span className="font-semibold text-sm">Consentimiento Parental</span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  De acuerdo con el Art. 8 del RGPD y el Art. 7 de la LOPDGDD,
                  el tratamiento de datos de menores de 14 a{'\u00F1'}os requiere
                  el consentimiento del titular de la patria potestad o tutela.
                </p>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.consentGranted}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        consentGranted: e.target.checked
                      }))
                    }
                    className="mt-1 size-4 rounded border-border-primary text-brand-base
                      focus:ring-brand-base focus:ring-offset-0"
                  />
                  <span className="text-sm text-text-primary leading-relaxed">
                    Confirmo que el tutor/a legal ha otorgado consentimiento
                    expreso para el tratamiento de datos con fines de
                    seguimiento educativo y an{'\u00E1'}lisis de rendimiento.
                  </span>
                </label>

                {formData.consentGranted && (
                  <InputPremium
                    label="Nombre del tutor/a legal"
                    placeholder="Ej: Ana Garc\u00EDa L\u00F3pez"
                    value={formData.consentGrantedBy}
                    onChange={(e) =>
                      setFormData(prev => ({
                        ...prev,
                        consentGrantedBy: e.target.value
                      }))
                    }
                    icon={<ShieldCheck size={18} />}
                    required
                  />
                )}
              </div>

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
  useDocumentTitle('Gestión de Alumnos');
  const [students, setStudents] = useState([]);
  // eslint-disable-next-line sonarjs/no-unused-vars -- solo se usa el setter
  const [_teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line sonarjs/no-unused-vars -- solo se usa el setter
  const [_error, setError] = useState(null);
  // eslint-disable-next-line sonarjs/no-unused-vars -- solo se usa el setter
  const [_isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Panel de consentimiento y acciones RGPD (ADR-031/032)
  const [isConsentPanelOpen, setIsConsentPanelOpen] = useState(false);
  const [isHardDeleteModalOpen, setIsHardDeleteModalOpen] = useState(false);
  const [isHardDeleting, setIsHardDeleting] = useState(false);

  // Menu de acciones por alumno
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
        toast.error('Error al cargar datos', {
          description: 'Recarga la página o inténtalo de nuevo en unos segundos.'
        });
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

  // --- Handlers RGPD (ADR-031/032) ---

  const handleConsentClick = (student) => {
    setSelectedStudent(student);
    setIsConsentPanelOpen(true);
    setActiveMenuId(null);
  };

  const handleExportClick = async (student) => {
    const studentId = student.id || student._id;
    setActiveMenuId(null);
    try {
      const res = await usersAPI.exportStudentData(studentId);
      const date = new Date().toISOString().split('T')[0];
      const filename = `datos-alumno-${student.name.replace(/\s+/g, '-')}-${date}.json`;
      const { downloadBlob } = await import('../../lib/utils');
      downloadBlob(res.data, filename);
      toast.success('Datos exportados correctamente');
    } catch (err) {
      toast.error(extractErrorMessage(err));
    }
  };

  const handleHardDeleteClick = (student) => {
    setSelectedStudent(student);
    setIsHardDeleteModalOpen(true);
    setActiveMenuId(null);
  };

  const handleHardDeleteConfirm = async () => {
    if (!selectedStudent || isHardDeleting) return;

    setIsHardDeleting(true);
    try {
      await usersAPI.hardDeleteUser(selectedStudent.id || selectedStudent._id);
      toast.success('Datos del alumno eliminados permanentemente (Art. 17 RGPD)');
      fetchInitialData(pagination.page);
      setIsHardDeleteModalOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setIsHardDeleting(false);
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
          <div className="size-14 rounded-2xl bg-gradient-to-br from-brand-base to-brand-dark flex items-center justify-center text-white shadow-lg shadow-brand-base/20">
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

      <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 items-stretch">
        <GlassCard className="p-4 flex items-center gap-4">
          <div className="size-12 rounded-xl bg-brand-base/10 text-brand-base flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-2xl font-bold text-text-primary font-display">{pagination.total}</p>
            <p className="text-xs text-text-muted uppercase tracking-wider font-bold">Total Alumnos</p>
          </div>
        </GlassCard>

        <div className="md:col-span-3">
          <InputPremium
            placeholder="Buscar por nombre o clase…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={20} className={cn(searchQuery !== deferredSearch && "animate-pulse")} />}
            className="h-full"
          />
        </div>
      </section>

      <AnimatePresence mode="wait">
        {(() => {
          if (loading) return (
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
          );
          if (students.length === 0) return (
            <EmptyState
              key="empty"
              title={searchQuery ? "Sin resultados" : "No hay alumnos aún"}
              description={searchQuery ? "Intenta con otros términos de búsqueda o ajusta los filtros." : "Los alumnos aparecerán aquí cuando los profesores los registren en sus aulas."}
              icon={<User size={48} />}
            />
          );
          return (
            <motion.div
              key="list"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
              {students.map((student) => (
                <motion.div key={student.id || student._id} variants={staggerItem}>
                  <GlassCard className="p-5 hover:border-brand-base/40 group transition-[border-color] duration-300 relative overflow-hidden h-full flex flex-col">
                  {/* Acciones */}
                  <div className="absolute top-3 right-3 z-10">
                    <div className="relative">
                      <Tooltip content="Acciones">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(activeMenuId === (student.id || student._id) ? null : (student.id || student._id));
                          }}
                          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
                          aria-label="Acciones"
                        >
                          <MoreVertical size={16} />
                        </button>
                      </Tooltip>
                      
                      <AnimatePresence>
                        {activeMenuId === (student.id || student._id) && (
                          <>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label="Cerrar menú"
                              className="fixed inset-0 z-10"
                              onClick={() => setActiveMenuId(null)}
                              onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveMenuId(null); }}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute right-0 mt-2 w-48 bg-background-elevated border border-border-subtle rounded-xl shadow-xl z-20 py-1 overflow-hidden"
                            >
                              <button
                                onClick={() => handleEditClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2 transition-colors"
                              >
                                <Edit size={14} /> Editar
                              </button>
                              <button
                                onClick={() => handleConsentClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2 transition-colors"
                              >
                                <ShieldCheck size={14} /> Consentimiento
                              </button>
                              <button
                                onClick={() => handleExportClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-white/5 flex items-center gap-2 transition-colors"
                              >
                                <Download size={14} /> Exportar datos
                              </button>
                              <hr className="my-1 border-border-subtle" />
                              <button
                                onClick={() => handleHardDeleteClick(student)}
                                className="w-full px-4 py-2 text-left text-sm text-error-base hover:bg-error-base/10 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 size={14} /> Eliminar datos
                              </button>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="size-12 rounded-full bg-background-base border border-border-subtle flex items-center justify-center text-xl shadow-inner">
                      {student.profile?.avatar ? (
                        <img src={student.profile.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        student.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-text-primary truncate">{student.name}</h3>
                      <div className="flex items-center gap-1.5 text-text-muted text-xs">
                        <School size={12} />
                        <span className="truncate">{student.profile?.classroom || 'Sin clase'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-4 border-t border-border-subtle space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wider text-text-muted font-bold shrink-0">Profesor</span>
                      <span className="text-xs text-text-primary font-medium truncate max-w-[160px]">
                        {/* createdBy puede venir poblado ({id, name}) o como string ObjectId.
                            Si es objeto, mostramos el nombre; si es string sin populate o falta, "Sistema". */}
                        {(typeof student.createdBy === 'object' && student.createdBy?.name) || 'Sistema'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wider text-text-muted font-bold shrink-0">Estado</span>
                      <StatusBadge status={student.status === 'active' ? 'success' : 'inactive'} size="sm">
                        {student.status === 'active' ? 'Activo' : 'Inactivo'}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-wider text-text-muted font-bold shrink-0">Consentimiento</span>
                      <StatusBadge
                        status={student.consent?.granted ? 'active' : 'error'}
                        size="sm"
                        pulse={student.consent?.granted === false}
                      >
                        {student.consent?.granted ? 'Activo' : 'Revocado'}
                      </StatusBadge>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
            </motion.div>
          );
        })()}
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

      {/* Panel de consentimiento RGPD (ADR-031/032) */}
      <ConsentDetailPanel
        isOpen={isConsentPanelOpen}
        onClose={() => {
          setIsConsentPanelOpen(false);
          setSelectedStudent(null);
        }}
        student={selectedStudent}
        onConsentChanged={() => fetchInitialData(pagination.page)}
      />

      {/* Modal de borrado efectivo Art. 17 RGPD */}
      <ConfirmationModal
        open={isHardDeleteModalOpen}
        onClose={() => {
          setIsHardDeleteModalOpen(false);
          setSelectedStudent(null);
        }}
        onConfirm={handleHardDeleteConfirm}
        title="Eliminar datos permanentemente"
        description={`Esta acción eliminará de forma irreversible TODOS los datos de ${selectedStudent?.name}: perfil, historial de partidas, métricas y registros de consentimiento. Cumple con el Art. 17 RGPD (derecho de supresión). No se puede deshacer.`}
        confirmText="Eliminar permanentemente"
        variant="error"
        loading={isHardDeleting}
      />
    </motion.div>
  );
}
