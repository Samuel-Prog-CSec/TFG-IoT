import { memo } from 'react';
import { m as motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Medal, Trophy, Award, Users } from 'lucide-react';
import PropTypes from 'prop-types';
import { staggerItem, staggerContainer, cn } from '../../lib/utils';

/**
 * Estilos para el podio: oro/plata/bronce para los tres primeros puestos.
 * Lenguaje universal en rankings educativos — refuerza la metafora
 * de logro sin inventar tratamiento visual.
 */
const PODIUM_STYLES = [
  {
    icon: Trophy,
    rankClass: 'bg-[var(--color-podium-gold)]/20 text-[var(--color-podium-gold)] ring-1 ring-inset ring-[var(--color-podium-gold-glow)]',
    glow: 'shadow-[0_0_18px_var(--color-podium-gold-glow)]',
  },
  {
    icon: Medal,
    rankClass: 'bg-[var(--color-podium-silver)]/15 text-[var(--color-podium-silver)] ring-1 ring-inset ring-[var(--color-podium-silver-glow)]',
    glow: '',
  },
  {
    icon: Award,
    rankClass: 'bg-[var(--color-podium-bronze)]/20 text-[var(--color-podium-bronze)] ring-1 ring-inset ring-[var(--color-podium-bronze-glow)]',
    glow: '',
  },
];

/**
 * Obtiene el color RAG segun el tier del estudiante
 * @param {string} tier - risk | average | good | excellent
 * @returns {string} Clases de Tailwind para el color
 */
// Tokens `-on-alpha` (calibrados AA en ambos temas) — antes usaba `-base` y
// `-base/80`, que en el badge "Bueno" caían a ~4.08:1 (sub-AA para 10px).
const getTierColor = (tier) => {
  switch (tier) {
    case 'excellent': return 'text-success-on-alpha';
    case 'good': return 'text-success-on-alpha';
    case 'average': return 'text-warning-on-alpha';
    case 'risk': return 'text-error-on-alpha';
    default: return 'text-text-muted';
  }
};

/**
 * Obtiene el badge de rendimiento segun el tier
 * @param {string} tier - risk | average | good | excellent
 * @returns {{ label: string, className: string }}
 */
// Todos los badges usan tokens `-on-alpha` (AA 5:1+ sobre bg-{tono}/alpha en
// ambos temas). Antes 'good' usaba `text-success-base/80` → 4.08:1 (sub-AA).
const getTierBadge = (tier) => {
  switch (tier) {
    case 'excellent': return { label: 'Excelente', className: 'bg-success-base/15 text-success-on-alpha' };
    case 'good': return { label: 'Bueno', className: 'bg-success-base/10 text-success-on-alpha' };
    case 'average': return { label: 'Promedio', className: 'bg-warning-base/15 text-warning-on-alpha' };
    case 'risk': return { label: 'En riesgo', className: 'bg-error-base/15 text-error-on-alpha' };
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
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border-strong/40 to-transparent" aria-hidden="true" />

      <header className="flex items-center justify-between mb-6">
        <h3 id="students-list-title" className="text-lg font-semibold text-text-primary font-display">Mejores Estudiantes</h3>
        <span className="text-xs text-text-muted bg-background-surface/50 px-2 py-1 rounded-lg" aria-label={`Mostrando top ${topStudents.length}`}>
          Top {topStudents.length}
        </span>
      </header>

      {hasStudents ? (
        // BUG-A11Y-LIST-A (QA Sprint 0 post-v0.5.0): el <ol> tenía hijos con
        // role="button", lo que rompe la regla axe "ol must only contain li".
        // Cambiado a div role="list" + div role="listitem button" que respeta
        // tanto la semántica de lista como la naturaleza interactiva de cada fila.
        <motion.div
          role="list"
          aria-label="Lista de mejores estudiantes"
          className="space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {topStudents.map((student, index) => {
            const tierBadge = getTierBadge(student.tier);
            const podium = PODIUM_STYLES[index];
            const PodiumIcon = podium?.icon;
            // El endpoint /classroom/students entrega el id del alumno en `id`
            // (analyticsService: id = _id.toString()). Mantener _id/studentId como
            // fallback defensivo evita navegar a /students/undefined si la fuente cambia.
            const studentId = student.id || student._id || student.studentId;
            return (
              <motion.div
                key={studentId || index}
                variants={staggerItem}
                whileHover={{ x: 4 }}
                onClick={() => navigate(`/students/${studentId}`)}
                className="flex items-center justify-between p-3 rounded-xl transition-colors duration-200 group cursor-pointer hover:bg-background-surface/40 focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:bg-background-surface/20"
                role="listitem"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/students/${studentId}`); }}
                aria-label={`${student.name}, puntuación ${Math.round(student.studentMetrics?.averageScore || student.averageScore || 0)}, posición ${index + 1}`}
              >
                <div className="flex items-center gap-3">
                  {/* Rank Badge: pódium oro/plata/bronce para top 3; neutro resto */}
                  <span
                    className={cn(
                      "size-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
                      podium ? podium.rankClass : "bg-background-surface/50 text-text-muted",
                      index === 0 && podium?.glow
                    )}
                    aria-hidden="true"
                  >
                    {PodiumIcon ? (
                      <PodiumIcon size={14} strokeWidth={2.5} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </span>

                  {/* Avatar — BUG-A11Y-AVATAR-A (QA Sprint 0 post-v0.5.0):
                      aria-label sin role provoca aria-prohibited-attr. Añadir
                      role="img" para que el avatar (decorativo + iniciales)
                      tenga un nombre accesible válido. */}
                  <div
                    role="img"
                    className="size-10 rounded-full bg-gradient-to-br from-accent-indigo to-brand-base flex items-center justify-center text-sm font-bold text-white shadow-lg group-hover:scale-105 transition-transform"
                    aria-label={`Avatar de ${student.name}`}
                  >
                    {student.avatar ? (
                      // D.4 (pre-v1.0.0): width/height HTML attrs evitan
                      // CLS al cargar la imagen — el contenedor reserva
                      // layout box pre-load.
                      <img
                        src={student.avatar}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        className="size-full rounded-full object-cover"
                      />
                    ) : (
                      <span aria-hidden="true">{getInitials(student.name)}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="text-text-primary font-medium group-hover:text-brand-light transition-colors truncate">
                      {student.name}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-nano font-semibold px-1.5 py-0.5 rounded-md", tierBadge.className)}>
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
                      {/* averageScore es % real tras ADR-201 (antes puntos crudos). */}
                      {Math.round(student.studentMetrics?.averageScore || student.averageScore || 0)}%
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-text-muted/30 group-hover:text-text-muted transition-colors" aria-hidden="true" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-background-elevated/80 border border-border-default mb-4 text-text-muted">
            <Users size={28} aria-hidden="true" />
          </div>
          <p className="text-text-primary text-sm font-semibold">Aún no hay datos de estudiantes.</p>
          <p className="text-text-muted text-xs mt-1">Los datos aparecerán cuando los alumnos jueguen partidas.</p>
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
    id: PropTypes.string,
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
