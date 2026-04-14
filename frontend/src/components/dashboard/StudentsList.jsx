import { memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { staggerItem, cn } from '../../lib/utils';

/**
 * Obtiene el color RAG segun el tier del estudiante
 * @param {string} tier - risk | average | good | excellent
 * @returns {string} Clases de Tailwind para el color
 */
const getTierColor = (tier) => {
  switch (tier) {
    case 'excellent': return 'text-success-base';
    case 'good': return 'text-success-base/80';
    case 'average': return 'text-warning-base';
    case 'risk': return 'text-error-base';
    default: return 'text-text-muted';
  }
};

/**
 * Obtiene el badge de rendimiento segun el tier
 * @param {string} tier - risk | average | good | excellent
 * @returns {{ label: string, className: string }}
 */
const getTierBadge = (tier) => {
  switch (tier) {
    case 'excellent': return { label: 'Excelente', className: 'bg-success-base/15 text-success-base' };
    case 'good': return { label: 'Bueno', className: 'bg-success-base/10 text-success-base/80' };
    case 'average': return { label: 'Promedio', className: 'bg-warning-base/15 text-warning-base' };
    case 'risk': return { label: 'En riesgo', className: 'bg-error-base/15 text-error-base' };
    default: return { label: '—', className: 'bg-background-surface/50 text-text-muted' };
  }
};

/**
 * Genera las iniciales del nombre para el avatar fallback
 * @param {string} name - Nombre completo
 * @returns {string} Iniciales (max 2 caracteres)
 */
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Lista de los mejores estudiantes del profesor con datos reales de la API.
 * Muestra top 5 con score, tier badge y navegacion al perfil.
 * @param {Object} props
 * @param {Array} [props.students] - Lista de estudiantes del endpoint /classroom/students
 */
function StudentsList({ students }) {
  const navigate = useNavigate();
  const topStudents = students?.slice(0, 5) || [];
  const hasStudents = topStudents.length > 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      aria-labelledby="students-list-title"
      className={cn(
        "relative overflow-hidden",
        "bg-background-elevated/40 backdrop-blur-xl",
        "p-6 rounded-2xl",
        "border border-border-subtle",
        "h-full"
      )}
    >
      {/* Top highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden="true" />

      <header className="flex items-center justify-between mb-6">
        <h3 id="students-list-title" className="text-xl font-bold text-text-primary font-display">Mejores Estudiantes</h3>
        <span className="text-xs text-text-muted bg-background-surface/50 px-2 py-1 rounded-lg" aria-label={`Mostrando top ${topStudents.length}`}>
          Top {topStudents.length}
        </span>
      </header>

      {hasStudents ? (
        <ol aria-label="Lista de mejores estudiantes" className="space-y-3">
          {topStudents.map((student, index) => {
            const tierBadge = getTierBadge(student.tier);
            return (
              <motion.li
                key={student.studentId || student._id || index}
                variants={staggerItem}
                whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                onClick={() => navigate(`/students/${student.studentId || student._id}`)}
                className="flex items-center justify-between p-3 rounded-xl transition-colors duration-200 group cursor-pointer list-none focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:bg-background-surface/20"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/students/${student.studentId || student._id}`); }}
                aria-label={`${student.name}, puntuacion ${Math.round(student.studentMetrics?.averageScore || student.averageScore || 0)}`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank Badge */}
                  <span
                    className={cn(
                      "size-6 rounded-lg flex items-center justify-center text-xs font-bold",
                      index === 0 && "bg-warning-base/20 text-warning-base",
                      index === 1 && "bg-text-muted/10 text-text-muted",
                      index === 2 && "bg-error-base/20 text-error-base",
                      index > 2 && "bg-background-surface/50 text-text-muted"
                    )}
                    aria-label={`Posicion ${index + 1}`}
                  >
                    {index + 1}
                  </span>

                  {/* Avatar */}
                  <div
                    className="size-10 rounded-full bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center text-sm font-bold text-white shadow-lg group-hover:scale-105 transition-transform"
                    aria-label={`Avatar de ${student.name}`}
                  >
                    {student.avatar ? (
                      <img src={student.avatar} alt="" className="size-full rounded-full object-cover" />
                    ) : (
                      <span aria-hidden="true">{getInitials(student.name)}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-text-primary font-medium group-hover:text-brand-light transition-colors truncate">
                      {student.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", tierBadge.className)}>
                        {tierBadge.label}
                      </span>
                      {student.classroom && (
                        <span className="text-xs text-text-muted">{student.classroom}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div
                      className={cn("font-bold tabular-nums", getTierColor(student.tier))}
                    >
                      {Math.round(student.studentMetrics?.averageScore || student.averageScore || 0)}
                    </div>
                    <div className="text-[10px] text-text-muted">pts</div>
                  </div>
                  <ChevronRight size={14} className="text-text-muted/30 group-hover:text-text-muted transition-colors" aria-hidden="true" />
                </div>
              </motion.li>
            );
          })}
        </ol>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-text-muted text-sm">Aun no hay datos de estudiantes.</p>
          <p className="text-text-disabled text-xs mt-1">Los datos apareceran cuando los alumnos jueguen partidas.</p>
        </div>
      )}

      {hasStudents && students?.length > 5 && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/analytics/students')}
          className="w-full mt-6 py-3 rounded-xl border border-dashed border-border-default text-text-muted hover:text-text-primary hover:border-brand-base/50 hover:bg-brand-base/5 transition-[color,background-color,border-color] duration-300 focus:outline-none focus:ring-2 focus:ring-brand-base/50 text-sm font-medium"
          aria-label="Ver todos los alumnos"
        >
          Ver todos los alumnos ({students.length})
        </motion.button>
      )}
    </motion.section>
  );
}

StudentsList.propTypes = {
  students: PropTypes.arrayOf(PropTypes.shape({
    studentId: PropTypes.string,
    _id: PropTypes.string,
    name: PropTypes.string.isRequired,
    averageScore: PropTypes.number,
    tier: PropTypes.oneOf(['risk', 'average', 'good', 'excellent']),
    avatar: PropTypes.string,
    classroom: PropTypes.string,
  })),
};

export default memo(StudentsList);
