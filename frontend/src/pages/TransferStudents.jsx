/**
 * @fileoverview Página para transferir alumnos entre profesores.
 * Incluye validaciones, confirmación y resumen del impacto.
 *
 * @module pages/TransferStudents
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, User, Users, School, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { usersAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import InputPremium from '../components/ui/InputPremium';
import SelectPremium from '../components/ui/SelectPremium';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { cn } from '../lib/utils';
import { getId, findById } from '../lib/entityId';
import AdminPageShell from '../components/admin/AdminPageHero';

export default function TransferStudents() {
  const { user } = useAuth(); // Removed isSuperAdmin as it's no longer needed for conditional logic here
  useDocumentTitle('Transferir Alumnos');
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [sourceTeacherId, setSourceTeacherId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [newClassroom, setNewClassroom] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const currentUserId = getId(user);

  const selectedStudent = useMemo(
    () => findById(students, selectedStudentId),
    [students, selectedStudentId]
  );

  const selectedTeacher = useMemo(
    () => findById(teachers, selectedTeacherId),
    [teachers, selectedTeacherId]
  );

  const loadTeachers = useCallback(async (config = {}) => {
    try {
      const teachersRes = await usersAPI.getUsers({
        role: 'teacher',
        status: 'active',
        sortBy: 'name',
        order: 'asc',
        limit: 100
      }, config);

      const teachersData = extractData(teachersRes) || [];
      setTeachers(Array.isArray(teachersData) ? teachersData : []);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      toast.error(extractErrorMessage(error));
    }
  }, []);

  const loadStudents = useCallback(async (teacherId, config = {}) => {
    if (!teacherId) {
      setStudents([]);
      return;
    }

    try {
      const studentsRes = await usersAPI.getStudentsByTeacher(teacherId, { sortBy: 'name', order: 'asc' }, config);
      const studentsData = extractData(studentsRes) || [];
      setStudents(Array.isArray(studentsData) ? studentsData : []);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      toast.error(extractErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    // eslint-disable-next-line promise/catch-or-return -- catch antes de finally, error manejado
    loadTeachers({ signal: controller.signal })
      .catch(() => { /* error manejado dentro de loadTeachers */ })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    // No need to set sourceTeacherId based on isSuperAdmin, as this page is for admins only now.
    // The admin will explicitly select the source teacher.

    return () => controller.abort();
  }, [loadTeachers]); // Removed currentUserId, isSuperAdmin dependencies

  useEffect(() => {
    if (!sourceTeacherId) return undefined; // Force selection of sourceTeacherId
    const controller = new AbortController();

    loadStudents(sourceTeacherId, { signal: controller.signal });
    return () => controller.abort();
  }, [sourceTeacherId, loadStudents]); // Removed currentUserId, isSuperAdmin dependencies

  const refetchAll = useCallback(() => {
    const teachersController = new AbortController();
    const studentsController = new AbortController();

    loadTeachers({ signal: teachersController.signal });
    if (sourceTeacherId) {
      loadStudents(sourceTeacherId, { signal: studentsController.signal });
    }

    return () => {
      teachersController.abort();
      studentsController.abort();
    };
  }, [loadTeachers, loadStudents, sourceTeacherId]);

  useRefetchOnFocus({
    refetch: refetchAll,
    isLoading: loading,
    hasData: teachers.length > 0 || students.length > 0
  });

  const resetForm = () => {
    setSelectedStudentId('');
    setSelectedTeacherId('');
    setNewClassroom('');
    setReason('');
  };

  const canSubmit = selectedStudentId && selectedTeacherId && newClassroom.trim();

  const handleTransfer = async () => {
    if (!canSubmit || submitting) return;

    try {
      setSubmitting(true);

      await usersAPI.transferStudent(selectedStudentId, {
        newTeacherId: selectedTeacherId,
        newClassroom: newClassroom.trim(),
        reason: reason.trim() || undefined
      });

      toast.success('Alumno transferido correctamente');
      setConfirmOpen(false);
      resetForm();
      await loadStudents(sourceTeacherId || currentUserId);
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const studentOptions = useMemo(
    () =>
      students.map(student => {
        const classroomLabel = student.profile?.classroom ? ` · ${student.profile.classroom}` : '';

        return {
          value: getId(student),
          label: `${student.name}${classroomLabel}`,
          icon: <User size={18} />
        };
      }),
    [students]
  );

  const teacherOptions = useMemo(
    () =>
      teachers.flatMap(teacher => {
        const id = getId(teacher);
        if (id === sourceTeacherId) return [];
        return [{
          value: id,
          label: teacher.name || teacher.email,
          icon: <Users size={18} />
        }];
      }),
    [teachers, sourceTeacherId]
  );

  if (loading) {
    return (
      <div className="min-h-full p-8">
        <div className="text-text-secondary">Cargando transferencia…</div>
      </div>
    );
  }

  return (
    <AdminPageShell
      icon={ArrowRightLeft}
      title="Transferencias de Alumnos"
      description="Reasigna alumnos entre profesores de forma centralizada."
      ariaLabel="Transferencias de alumnos"
      maxWidth="max-w-6xl"
    >
        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
          <GlassCard className="p-6 space-y-6 order-2 lg:order-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-border-subtle/50">
              <SelectPremium
                label="Profesor Origen"
                options={teachers.map(teacher => ({
                  value: getId(teacher),
                  label: teacher.name || teacher.email,
                  icon: <Users size={18} />
                }))}
                value={sourceTeacherId}
                onChange={(value) => {
                  setSourceTeacherId(value);
                  setSelectedStudentId('');
                }}
                placeholder="Selecciona el profesor actual"
                required
              />
              <SelectPremium
                label="Alumno a Transferir"
                options={studentOptions}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder={
                  (!sourceTeacherId && 'Primero elige un profesor') ||
                  (students.length === 0 && 'Este profesor no tiene alumnos') ||
                  'Selecciona un alumno'
                }
                disabled={!sourceTeacherId || students.length === 0}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <SelectPremium
                label="Nuevo Profesor"
                options={teacherOptions}
                value={selectedTeacherId}
                onChange={setSelectedTeacherId}
                placeholder="Selecciona el nuevo destino"
                disabled={!selectedStudentId}
                required
              />
              <InputPremium
                label="Nueva Clase / Aula"
                placeholder="Ej: Aula 1B"
                value={newClassroom}
                onChange={(e) => setNewClassroom(e.target.value)}
                icon={<School size={18} />}
                disabled={!selectedTeacherId}
                required
              />
            </div>

            <div className="pt-2">
              <InputPremium
                label="Motivo de la Transferencia (Opcional)"
                placeholder="Ej: Cambio de ciclo, refuerzo educativo…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
              <p className="text-xs text-text-muted italic">
                * Operación exclusiva para administradores del sistema.
              </p>
              <ButtonPremium
                variant="primary"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
                className="min-w-[200px] shadow-xl shadow-brand-base/20"
              >
                Revisar Transferencia
              </ButtonPremium>
            </div>
          </GlassCard>

          {/* order-1 lg:order-2: en mobile el resumen sube antes del form
              para que el docente vea el contexto del cambio mientras rellena
              campos (antes quedaba al pie tras stackearse). En lg vuelve a
              su lugar lateral. */}
          <GlassCard className="p-6 space-y-4 order-1 lg:order-2">
            <div className="flex items-center gap-3 text-warning-base">
              <AlertTriangle size={20} aria-hidden="true" />
              <h2 className="text-lg font-bold">Impacto del Cambio</h2>
            </div>
            <ul className="text-sm text-text-muted space-y-3">
              <li className="flex gap-2">
                <span className="text-warning-base">•</span>
                <span>El alumno pasará a depender del nuevo profesor inmediatamente.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-warning-base">•</span>
                <span>Se actualizará el campo de clase/aula en su perfil.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-warning-base">•</span>
                <span>Se conservan íntegras las métricas de juego anteriores.</span>
              </li>
            </ul>

            <div className={cn(
              'rounded-xl border p-5 text-sm transition-colors duration-300',
              selectedStudent 
                ? 'bg-brand-base/5 border-brand-base/20 text-text-primary' 
                : 'bg-background-elevated/30 border-border-subtle text-text-muted'
            )}>
              <p className="font-bold mb-3 text-xs uppercase tracking-widest">Resumen de Ejecución</p>
              {selectedStudent && selectedTeacher ? (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Alumno:</span>
                    <span className="font-bold">{selectedStudent.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Destino:</span>
                    <span className="font-bold">{selectedTeacher.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Clase:</span>
                    <span className="font-bold">{newClassroom || '—'}</span>
                  </div>
                </div>
              ) : (
                // BUG-A11Y-TRANSFER-PREVIEW (QA Sprint 0): opacity-50 sobre
                // texto sin color explícito tomaba text-text-muted al 50% =
                // 2.17:1 en light. Sin alpha + text-muted cumple AA.
                <p className="text-center py-2 italic text-text-muted">Completa los campos para previsualizar.</p>
              )}
            </div>
          </GlassCard>
        </div>

      <ConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleTransfer}
        title="Confirmar Transferencia"
        description={
          <div className="space-y-2 text-text-muted">
            <p>Estás a punto de reasignar a <span className="text-text-primary font-bold">{selectedStudent?.name}</span>.</p>
            <p>
              Profesor Destino: <span className="text-text-primary font-bold">{selectedTeacher?.name}</span>
            </p>
            <p>
              Nueva Clase: <span className="text-text-primary font-bold">{newClassroom || '—'}</span>
            </p>
          </div>
        }
        confirmText="Transferir"
        cancelText="Cancelar"
        variant="warning"
        loading={submitting}
      />
    </AdminPageShell>
  );
}
