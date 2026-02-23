import { memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { staggerItem, cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { ROUTES } from '../../constants/routes';

// Mock Data temporarily here, eventually from props or API
const studentProgressData = [
  { id: 1, name: 'Alex Johnson', progress: 92, status: 'Activo', avatar: '🦊' },
  { id: 2, name: 'Sarah Williams', progress: 88, status: 'Activo', avatar: '🐰' },
  { id: 3, name: 'Michael Brown', progress: 76, status: 'Desconectado', avatar: '🐻' },
  { id: 4, name: 'Emily Davis', progress: 95, status: 'Activo', avatar: '🦋' },
  { id: 5, name: 'James Wilson', progress: 62, status: 'Desconectado', avatar: '🐢' },
];

/**
 * Obtiene la clase de color según el progreso del estudiante
 * @param {number} progress - Porcentaje de progreso (0-100)
 * @returns {string} Clase de Tailwind para el color
 */
const getProgressColorClass = (progress) => {
  if (progress >= 90) return "text-success-base";
  if (progress >= 70) return "text-warning-base";
  return "text-text-muted";
};

function StudentsList({ students = studentProgressData }) {
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();

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
        <span className="text-xs text-text-muted bg-background-surface/50 px-2 py-1 rounded-lg" aria-label="Mostrando top 5">Top 5</span>
      </header>

      <ol 
        aria-label="Lista de mejores estudiantes"
        className="space-y-3"
      >
        {students.map((student, index) => (
          <motion.li 
            key={student.id} 
            variants={staggerItem}
            whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
            className="flex items-center justify-between p-3 rounded-xl transition-all duration-200 group cursor-pointer list-none"
          >
            <div className="flex items-center gap-3">
              {/* Rank Badge */}
              <span 
                className={cn(
                  "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold",
                  index === 0 && "bg-warning-base/20 text-warning-base",
                  index === 1 && "bg-text-muted/10 text-text-muted",
                  index === 2 && "bg-error-base/20 text-error-base",
                  index > 2 && "bg-background-surface/50 text-text-muted"
                )}
                aria-label={`Posición ${index + 1}`}
              >
                {index + 1}
              </span>
              
              {/* Avatar */}
              <div 
                className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-lg shadow-lg group-hover:scale-105 transition-transform"
                aria-label={`Avatar de ${student.name}`}
              >
                <span aria-hidden="true">{student.avatar}</span>
              </div>
              
              <div>
                <div className="text-text-primary font-medium group-hover:text-brand-light transition-colors">{student.name}</div>
                <div className="flex items-center gap-2">
                  <span 
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      student.status === 'Activo' ? "bg-success-base" : "bg-text-muted"
                    )} 
                    aria-hidden="true"
                  />
                  <span className="text-xs text-text-muted">{student.status}</span>
                </div>
              </div>
            </div>
            
            <div className="text-right">
              <div 
                className={cn(
                  "font-bold tabular-nums",
                  getProgressColorClass(student.progress)
                )}
                aria-label={`Progreso: ${student.progress}%`}
              >
                {student.progress}%
              </div>
            </div>
          </motion.li>
        ))}
      </ol>

      {isSuperAdmin && (
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(ROUTES.STUDENT_MANAGEMENT)}
          className="w-full mt-6 py-3 rounded-xl border border-dashed border-border-default text-text-muted hover:text-text-primary hover:border-brand-base/50 hover:bg-brand-base/5 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-base/50 text-sm font-medium"
          aria-label="Ir a gestión de alumnos"
        >
          Gestionar Todos los Alumnos
        </motion.button>
      )}
    </motion.section>
  );
}

StudentsList.propTypes = {
  students: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    progress: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    avatar: PropTypes.string,
  })),
};

export default memo(StudentsList);
