/**
 * @fileoverview Panel de gestión de alumnos exclusivo para Super Admin.
 * Permite crear, editar y visualizar todos los alumnos del sistema.
 * 
 * @module pages/admin/StudentManagement
 */

import { useState, useEffect, useCallback, useDeferredValue, useRef } from 'react';
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
import { m as motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { usersAPI, extractErrorMessage, isAbortError } from '../../services/api';
import { getId } from '../../lib/entityId';
import ButtonPremium from '../../components/ui/ButtonPremium';
import InputPremium from '../../components/ui/InputPremium';
import SelectPremium from '../../components/ui/SelectPremium';
import GlassCard from '../../components/ui/GlassCard';
import { SkeletonCard } from '../../components/ui/SkeletonShimmer';
import EmptyState from '../../components/ui/EmptyState';
import { EmptyStudentsIllustration } from '../../components/ui/illustrations';
import StatusBadge from '../../components/ui/StatusBadge';
import Tooltip from '../../components/ui/Tooltip';
import AdminPageShell from '../../components/admin/AdminPageHero';
import ConfirmationModal from '../../components/ui/ConfirmationModal';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useVirtualizedList } from '../../hooks/useVirtualizedList';
import useModalA11y from '../../hooks/useModalA11y';
import { cn } from '../../lib/utils';

// Plantilla de columnas compartida por la cabecera y cada fila de la tabla de
// alumnos: Alumno (flexible) · Profesor (flexible) · Estado · Consentimiento ·
// Acciones. Las dos primeras usan minmax(0,fr) para truncar en vez de desbordar.
const STUDENT_ROW_GRID =
  'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_7rem_8.5rem_2.5rem] items-center gap-3';

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
  // Andamiaje accesible inline (datos de menores): foco inicial al primer
  // campo, focus-trap por Tab, cierre con Escape, restauracion de foco y
  // bloqueo de scroll del body mientras el modal esta abierto.
  const panelRef = useRef(null);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (isOpen && student) {
      setFormData({
        name: student.name || '',
        age: student.profile?.age ? String(student.profile.age) : '',
        classroom: student.profile?.classroom || ''
      });
    }
  }, [isOpen, student]);

  // Foco inicial, focus-trap, Escape, bloqueo de scroll y restauracion de foco.
  useModalA11y({ isOpen, onClose, panelRef, initialFocusRef: firstFieldRef, escapeDisabled: loading });

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

      await usersAPI.updateUser(getId(student), payload);
      toast.success('Alumno actualizado correctamente');
      onUpdated();
      // Pequeña pausa para que el usuario perciba el toast antes de que
      // el modal desaparezca (evita sensación de accion "sin respuesta").
      setTimeout(onClose, 350);
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
          ref={panelRef}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-student-title"
        >
          <GlassCard className="p-8" variant="solid">
            <header className="mb-6">
              <div className="size-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
                <Edit size={24} />
              </div>
              <h2 id="edit-student-title" className="text-2xl font-bold text-text-primary">Editar Alumno</h2>
              <p className="text-text-muted">Modifica los datos del alumno.</p>
            </header>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              <InputPremium
                ref={firstFieldRef}
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
                inputMode="numeric"
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
  // Andamiaje accesible inline (datos de menores): foco inicial al primer
  // campo, focus-trap por Tab, cierre con Escape, restauracion de foco y
  // bloqueo de scroll del body mientras el modal esta abierto.
  const panelRef = useRef(null);
  const firstFieldRef = useRef(null);

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

  // Foco inicial, focus-trap, Escape, bloqueo de scroll y restauracion de foco.
  useModalA11y({ isOpen, onClose, panelRef, initialFocusRef: firstFieldRef, escapeDisabled: loading });

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
          ref={panelRef}
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-lg"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-student-title"
        >
          <GlassCard className="p-8" variant="solid">
            <header className="mb-6">
              <div className="size-12 rounded-xl bg-brand-base/20 flex items-center justify-center text-brand-base mb-4">
                <UserPlus size={24} />
              </div>
              <h2 id="create-student-title" className="text-2xl font-bold text-text-primary">Crear Nuevo Alumno</h2>
              <p className="text-text-muted">Asigna un nuevo alumno a un profesor y clase.</p>
            </header>

            <form onSubmit={handleSubmit} noValidate className="space-y-6">
              <InputPremium
                ref={firstFieldRef}
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
                inputMode="numeric"
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
                  value: getId(t),
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
                  el tratamiento de datos de menores de 14 años requiere
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
                    className="mt-1 size-4 rounded border-border-strong text-brand-base
                      focus-visible:ring-2 focus-visible:ring-brand-base focus-visible:ring-offset-2"
                  />
                  <span className="text-sm text-text-primary leading-relaxed">
                    Confirmo que el tutor/a legal ha otorgado consentimiento
                    expreso para el tratamiento de datos con fines de
                    seguimiento educativo y análisis de rendimiento.
                  </span>
                </label>

                {formData.consentGranted && (
                  <InputPremium
                    label="Nombre del tutor/a legal"
                    placeholder="Ej: Ana García López"
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
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
  // BUG-STUDENTS-CREATE-A (QA Sprint 0 post-v0.5.0): antes era `const [, setIsModalOpen]`
  // descartando el state value y además el componente `CreateStudentModal` ni siquiera
  // estaba montado en el JSX. Resultado: el botón "Nuevo Alumno" no abría nada.
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  // Virtualización condicional (T-952 Fase B). Cuando un centro tiene
  // >=50 alumnos en la página actual (configurable vía limit), el grid
  // CSS clásica se sustituye por una lista virtualizada vertical para
  // mantener el scroll fluido aunque haya 1000+ filas sintéticas. Si la
  // página tiene menos items, el grid CSS sigue siendo la mejor opción.
  const virtual = useVirtualizedList({
    count: students.length,
    enableAt: 50,
    estimateSize: 232,
  });

  // D.1 (pre-v1.0.0): AbortController propagado. La navegación rápida en
  // el sidebar admin dejaba dos requests `/api/users` colgadas — no graves
  // pero pulidas para que el contador de comandos Redis no infle.
  const fetchInitialData = useCallback(async (page = 1, signal) => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, allTeachers] = await Promise.all([
        usersAPI.getUsers(
          {
            role: 'student',
            page,
            limit: pagination.limit,
            search: deferredSearch || undefined
          },
          { signal }
        ),
        // Cargar TODOS los profesores activos paginando hasta agotar (el backend
        // capa a 100/página). Antes se pedía UNA sola página de 100 → con >100
        // profesores activos el resto no aparecía en el selector y no se les
        // podía asignar alumnos. SelectPremium ya filtra client-side, así que
        // basta con tener la lista completa para que la búsqueda los encuentre.
        (async () => {
          const TEACHERS_PAGE_SIZE = 100;
          const collected = [];
          let tPage = 1;
          let tTotalPages = 1;
          do {
            const res = await usersAPI.getUsers(
              { role: 'teacher', status: 'active', page: tPage, limit: TEACHERS_PAGE_SIZE },
              { signal }
            );
            const body = res.data;
            if (Array.isArray(body.data)) collected.push(...body.data);
            tTotalPages = body.pagination?.totalPages || 1;
            tPage += 1;
          } while (tPage <= tTotalPages);
          return collected;
        })()
      ]);

      const studentsData = studentsRes.data;

      setStudents(Array.isArray(studentsData.data) ? studentsData.data : []);
      setTeachers(allTeachers);
      
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

  // En React StrictMode (dev) este effect se monta dos veces y dispara
  // dos fetchs idénticos a /api/users. En producción ocurre una sola vez.
  // No hay bug funcional, es el comportamiento documentado de StrictMode.
  // D.1: AbortController para que la segunda llamada del StrictMode (o la
  // navegación rápida) no deje requests colgadas en background.
  useEffect(() => {
    const controller = new AbortController();
    fetchInitialData(1, controller.signal);
    return () => controller.abort();
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
    const studentId = getId(student);
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
      await usersAPI.hardDeleteUser(getId(selectedStudent));
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

  // Fila de la tabla de alumnos. El super_admin gestiona muchos alumnos: una
  // tabla escaneable es la afordancia profesional (y coherente con "Mis Alumnos"
  // del docente) frente a un grid de cards idénticas. role="row"/"cell" da
  // semántica de tabla al layout en grid. Captura handlers + state via closure.
  const renderStudentRow = (student) => {
    const id = getId(student);
    const teacherName =
      (typeof student.createdBy === 'object' && student.createdBy?.name) || 'Sistema';
    const classroom = student.profile?.classroom || 'Sin clase';
    return (
      <div
        key={id}
        role="row"
        className={cn(
          STUDENT_ROW_GRID,
          'group relative px-3 py-2.5 rounded-xl transition-colors hover:bg-background-elevated/50'
        )}
      >
        {/* Alumno: avatar + nombre + aula */}
        <div role="cell" className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-background-base border border-border-subtle flex items-center justify-center text-base font-semibold text-text-secondary shadow-inner shrink-0 overflow-hidden">
            {student.profile?.avatar ? (
              <img
                src={student.profile.avatar}
                alt=""
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              student.name.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text-primary truncate">{student.name}</p>
            <p className="flex items-center gap-1 text-text-muted text-xs">
              <School size={12} className="shrink-0" />
              <span className="truncate">{classroom}</span>
            </p>
          </div>
        </div>

        {/* Profesor */}
        <div role="cell" className="min-w-0 text-sm text-text-secondary truncate" title={teacherName}>
          {teacherName}
        </div>

        {/* Estado */}
        <div role="cell">
          <StatusBadge status={student.status === 'active' ? 'success' : 'inactive'} size="sm">
            {student.status === 'active' ? 'Activo' : 'Inactivo'}
          </StatusBadge>
        </div>

        {/* Consentimiento */}
        <div role="cell">
          <StatusBadge
            status={student.consent?.granted ? 'active' : 'error'}
            size="sm"
            pulse={student.consent?.granted === false}
          >
            {student.consent?.granted ? 'Activo' : 'Revocado'}
          </StatusBadge>
        </div>

        {/* Acciones */}
        <div role="cell" className="relative flex justify-end">
          <Tooltip content="Acciones">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(activeMenuId === id ? null : id);
              }}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-background-surface transition-colors opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Acciones para ${student.name}`}
              aria-haspopup="menu"
              aria-expanded={activeMenuId === id}
            >
              <MoreVertical size={16} />
            </button>
          </Tooltip>

          <AnimatePresence>
            {activeMenuId === id && (
                <>
                  <button
                    type="button"
                    aria-label="Cerrar menú"
                    className="fixed inset-0 z-20 cursor-default border-0 bg-transparent p-0"
                    onClick={() => setActiveMenuId(null)}
                    onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveMenuId(null); }}
                  />
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, scale: 0.96, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -6 }}
                    transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full mt-1 w-48 bg-background-elevated border border-border-subtle rounded-xl shadow-xl z-30 py-1"
                  >
                    <button
                      role="menuitem"
                      onClick={() => handleEditClick(student)}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-surface flex items-center gap-2 transition-colors"
                    >
                      <Edit size={14} /> Editar
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleConsentClick(student)}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-surface flex items-center gap-2 transition-colors"
                    >
                      <ShieldCheck size={14} /> Consentimiento
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => handleExportClick(student)}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-background-surface flex items-center gap-2 transition-colors"
                    >
                      <Download size={14} /> Exportar datos
                    </button>
                    <hr className="my-1 border-border-subtle" />
                    <button
                      role="menuitem"
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
    );
  };

  // Cabecera de la tabla (mismo grid que las filas).
  const studentTableHeader = (
    <div role="row" className={cn(STUDENT_ROW_GRID, 'px-3 pb-2.5 mb-1 border-b border-border-subtle')}>
      <span role="columnheader" className="text-xs uppercase tracking-wider text-text-muted font-bold">Alumno</span>
      <span role="columnheader" className="text-xs uppercase tracking-wider text-text-muted font-bold">Profesor</span>
      <span role="columnheader" className="text-xs uppercase tracking-wider text-text-muted font-bold">Estado</span>
      <span role="columnheader" className="text-xs uppercase tracking-wider text-text-muted font-bold">Consentimiento</span>
      <span role="columnheader" className="sr-only">Acciones</span>
    </div>
  );

  return (
    <AdminPageShell
      icon={GraduationCap}
      title="Gestión de Alumnos"
      description="Administración centralizada de identidades de alumnos del centro."
      ariaLabel="Gestión de alumnos"
      rightSlot={
        <ButtonPremium
          onClick={() => setIsModalOpen(true)}
          icon={<UserPlus size={18} />}
          className="shadow-xl shadow-brand-base/20"
        >
          Nuevo Alumno
        </ButtonPremium>
      }
    >

      {/* Barra de herramientas: total (pill compacto) · buscador (principal) ·
          alumnos por página. Antes era un grid 4-col que mezclaba una card ALTA
          de KPI (2 líneas) con inputs sin label y un select CON label encima →
          alturas y baselines distintos que parecían colocados al azar. Ahora un
          flex alineado a la misma altura (QA 2026-06-04). */}
      <section className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex items-center gap-2.5 px-4 py-3 sm:py-0 rounded-xl bg-background-elevated/40 border border-border-subtle shrink-0">
          <div className="size-8 rounded-lg bg-brand-base/10 text-brand-base flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <p className="text-sm text-text-secondary whitespace-nowrap">
            <span className="font-bold text-text-primary tabular-nums">{pagination.total}</span> alumnos
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <InputPremium
            placeholder="Buscar por nombre o clase…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={20} className={cn(searchQuery !== deferredSearch && "animate-pulse")} />}
            className="h-full"
            data-global-search="true"
          />
        </div>

        {/* Alumnos por página. Sin label visible (el valor "12 por página" ya es
            autoexplicativo) → alinea con el buscador. 50/100/200 activan la vista
            compacta virtualizada (T-952 Fase B, threshold 50). */}
        <SelectPremium
          aria-label="Alumnos por página"
          value={String(pagination.limit)}
          onChange={(value) => setPagination(prev => ({ ...prev, limit: Number(value), page: 1 }))}
          options={[
            { value: '12', label: '12 por página' },
            { value: '50', label: '50 por página' },
            { value: '100', label: '100 por página' },
            { value: '200', label: '200 por página' },
          ]}
          className="h-full shrink-0 sm:w-48"
        />
      </section>

      <AnimatePresence mode="wait">
        {(() => {
          if (loading) return (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <GlassCard padding="none" className="overflow-hidden">
                <div className="p-2 space-y-1.5">
                  {Array.from({ length: 8 }, (_, i) => `student-skeleton-${i}`).map(id => (
                    <SkeletonCard key={id} className="h-14" />
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          );
          if (students.length === 0) return (
            <EmptyState
              key="empty"
              illustration={<EmptyStudentsIllustration size={180} />}
              variant={searchQuery ? 'filtered' : 'first-use'}
              title={searchQuery ? 'Ningún alumno coincide con la búsqueda' : 'Sin alumnos registrados todavía'}
              description={
                searchQuery
                  ? 'Prueba con otro nombre, aula o edad. Recuerda que los filtros acumulan criterios.'
                  : 'Los alumnos aparecerán aquí cuando los profesores los registren. Puedes aprobar nuevas altas desde el panel de solicitudes.'
              }
            />
          );
          // Rama "list": grid CSS clásica para listados pequeños; lista
          // virtualizada vertical cuando hay >=50 alumnos (T-952 Fase B).
          // El switch automático mantiene UX óptima para 99% de aulas (<30
          // alumnos) y rendimiento constante en centros grandes (1000+).
          if (virtual.shouldVirtualize) {
            return (
              <motion.div
                key="list-virtualized"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl bg-background-elevated/20 border border-border-subtle overflow-hidden"
              >
                <p className="px-4 py-2 text-xs text-text-muted border-b border-border-subtle">
                  Vista compacta activa: {students.length} alumnos cargados. Desplázate para verlos todos.
                </p>
                <div className="px-4 pt-2" role="table" aria-label="Tabla de alumnos del centro">
                  {studentTableHeader}
                </div>
                <div
                  ref={virtual.scrollElementRef}
                  className="overflow-y-auto custom-scrollbar"
                  style={{ maxHeight: '70vh' }}
                >
                  <div style={{ height: virtual.totalSize, position: 'relative' }}>
                    {virtual.virtualItems.map((vItem) => {
                      const student = students[vItem.index];
                      if (!student) return null;
                      return (
                        <div
                          key={getId(student)}
                          data-index={vItem.index}
                          ref={virtual.measureElement}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${vItem.start}px)`,
                            padding: '6px 16px',
                          }}
                        >
                          {renderStudentRow(student)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            );
          }
          return (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <GlassCard padding="none" className="overflow-visible">
                <div className="p-2" role="table" aria-label="Tabla de alumnos del centro">
                  {studentTableHeader}
                  <div role="rowgroup">
                    {students.map((student) => renderStudentRow(student))}
                  </div>
                </div>
              </GlassCard>
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

      <CreateStudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => fetchInitialData(pagination.page)}
        teachers={teachers}
      />

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
    </AdminPageShell>
  );
}
