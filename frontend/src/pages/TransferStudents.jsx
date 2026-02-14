/**
 * @fileoverview Página para transferir alumnos entre profesores.
 * Incluye validaciones, confirmación y resumen del impacto.
 *
 * @module pages/TransferStudents
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, User, Users, School, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useRefetchOnFocus } from '../hooks';
import { usersAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ButtonPremium, GlassCard, InputPremium, SelectPremium, ConfirmationModal } from '../components/ui';
import { cn, pageVariants } from '../lib/utils';

export default function TransferStudents() {
  const { user, isSuperAdmin } = useAuth();
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

  const currentUserId = user?.id || user?._id;

  const selectedStudent = useMemo(
    () => students.find(s => (s.id || s._id) === selectedStudentId),
    [students, selectedStudentId]
  );

  const selectedTeacher = useMemo(
    () => teachers.find(t => (t.id || t._id) === selectedTeacherId),
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
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    loadTeachers({ signal: controller.signal }).finally(() => {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    });

    if (!isSuperAdmin) {
      setSourceTeacherId(currentUserId);
    }
    return () => controller.abort();
  }, [currentUserId, isSuperAdmin, loadTeachers]);

  useEffect(() => {
    if (!currentUserId) return;
    if (!isSuperAdmin && sourceTeacherId !== currentUserId) {
      setSourceTeacherId(currentUserId);
      return;
    }
    const controller = new AbortController();

    loadStudents(sourceTeacherId, { signal: controller.signal });
    return () => controller.abort();
  }, [currentUserId, isSuperAdmin, sourceTeacherId, loadStudents]);

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
          value: student.id || student._id,
          label: `${student.name}${classroomLabel}`,
          icon: <User size={18} />
        };
      }),
    [students]
  );

  const teacherOptions = useMemo(
    () =>
      teachers
        .filter(teacher => (teacher.id || teacher._id) !== (sourceTeacherId || currentUserId))
        .map(teacher => ({
          value: teacher.id || teacher._id,
          label: teacher.name || teacher.email,
          icon: <Users size={18} />
        })),
    [teachers, sourceTeacherId, currentUserId]
  );

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="text-slate-300">Cargando transferencia...</div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen p-6 lg:p-10"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-300">
              <ArrowRightLeft size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Transferencias de alumnos</h1>
              <p className="text-slate-400">Cambia el profesor responsable y la clase de forma segura.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-6">
          <GlassCard className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {isSuperAdmin && (
                <SelectPremium
                  label="Profesor origen"
                  options={teachers.map(teacher => ({
                    value: teacher.id || teacher._id,
                    label: teacher.name || teacher.email,
                    icon: <Users size={18} />
                  }))}
                  value={sourceTeacherId}
                  onChange={(value) => {
                    setSourceTeacherId(value);
                    setSelectedStudentId('');
                  }}
                  placeholder="Selecciona un profesor"
                />
              )}
              <SelectPremium
                label="Alumno"
                options={studentOptions}
                value={selectedStudentId}
                onChange={setSelectedStudentId}
                placeholder="Selecciona un alumno"
              />
              <SelectPremium
                label="Nuevo profesor"
                options={teacherOptions}
                value={selectedTeacherId}
                onChange={setSelectedTeacherId}
                placeholder="Selecciona un profesor"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputPremium
                label="Nueva clase"
                placeholder="Ej: Aula 1B"
                value={newClassroom}
                onChange={(e) => setNewClassroom(e.target.value)}
                icon={<School size={18} />}
              />
              <InputPremium
                label="Motivo (opcional)"
                placeholder="Ej: Cambio de aula"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-400">
                Solo el profesor actual o un super admin puede transferir.
              </p>
              <ButtonPremium
                variant="primary"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSubmit}
                className="min-w-[180px]"
              >
                Revisar transferencia
              </ButtonPremium>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-300">
              <AlertTriangle size={20} />
              <h2 className="text-lg font-semibold">Impacto de la transferencia</h2>
            </div>
            <ul className="text-sm text-slate-400 space-y-2">
              <li>• El alumno pasará a depender del nuevo profesor.</li>
              <li>• Se actualizará la clase del alumno.</li>
              <li>• Las métricas y partidas previas se conservan.</li>
              <li>• Se registra la transferencia para auditoría.</li>
            </ul>

            <div className={cn(
              'rounded-xl border border-white/10 p-4 text-sm',
              selectedStudent ? 'bg-white/5 text-slate-200' : 'bg-slate-800/30 text-slate-500'
            )}>
              <p className="font-semibold mb-1">Resumen</p>
              {selectedStudent && selectedTeacher ? (
                <div className="space-y-1">
                  <p>Alumno: {selectedStudent.name}</p>
                  <p>Nuevo profesor: {selectedTeacher.name}</p>
                  <p>Nueva clase: {newClassroom || '—'}</p>
                </div>
              ) : (
                <p>Selecciona un alumno y un profesor para ver el resumen.</p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      <ConfirmationModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleTransfer}
        title="Confirmar transferencia"
        description={
          <div className="space-y-2">
            <p>Vas a transferir a {selectedStudent?.name || 'este alumno'}.</p>
            <p>
              Nuevo profesor: <span className="text-white font-medium">{selectedTeacher?.name || '—'}</span>
            </p>
            <p>
              Nueva clase: <span className="text-white font-medium">{newClassroom || '—'}</span>
            </p>
          </div>
        }
        confirmText="Transferir"
        cancelText="Cancelar"
        variant="warning"
        loading={submitting}
      />
    </motion.div>
  );
}
