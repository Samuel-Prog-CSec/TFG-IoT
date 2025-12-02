/**
 * @fileoverview Seeder de usuarios (profesores y alumnos).
 * Crea profesores con credenciales predecibles y alumnos con métricas coherentes.
 * @module seeders/01-users
 */

const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Datos de profesores de prueba.
 * Credenciales predecibles para facilitar testing.
 */
const teachersData = [
  {
    name: 'María García López',
    email: 'maria@test.com',
    password: 'Test1234!',
    role: 'teacher',
    profile: {
      avatar: '👩‍🏫',
      birthdate: new Date('1985-05-15')
    },
    status: 'active'
  },
  {
    name: 'Carlos Rodríguez Pérez',
    email: 'carlos@test.com',
    password: 'Test1234!',
    role: 'teacher',
    profile: {
      avatar: '👨‍🏫',
      birthdate: new Date('1982-09-22')
    },
    status: 'active'
  },
  {
    name: 'Ana Martínez Sánchez',
    email: 'ana@test.com',
    password: 'Test1234!',
    role: 'teacher',
    profile: {
      avatar: '👩‍🏫',
      birthdate: new Date('1990-03-10')
    },
    status: 'active'
  },
  {
    name: 'Admin Principal',
    email: 'admin@test.com',
    password: 'Admin1234!',
    role: 'teacher',
    profile: {
      avatar: '👨‍💼',
      birthdate: new Date('1980-01-01')
    },
    status: 'active'
  }
];

/**
 * Nombres de alumnos para generación.
 */
const studentNames = [
  'Sofía García', 'Lucas Martín', 'Valentina López', 'Mateo Fernández',
  'Emma Rodríguez', 'Diego Sánchez', 'Isabella Pérez', 'Santiago Gómez',
  'Camila Díaz', 'Sebastián Torres', 'Victoria Ruiz', 'Nicolás Moreno',
  'Martina Jiménez', 'Benjamín Álvarez', 'Luciana Romero', 'Daniel Navarro',
  'Emilia Domínguez', 'Joaquín Vázquez', 'Julieta Ramos', 'Gabriel Molina'
];

/**
 * Genera métricas coherentes para un alumno.
 * Las métricas son matemáticamente consistentes entre sí.
 *
 * @param {number} gamesPlayed - Número de partidas jugadas
 * @returns {Object} Métricas del alumno
 */
function generateCoherentMetrics(gamesPlayed) {
  if (gamesPlayed === 0) {
    return {
      totalGamesPlayed: 0,
      totalScore: 0,
      averageScore: 0,
      bestScore: 0,
      totalCorrectAnswers: 0,
      totalErrors: 0,
      averageResponseTime: 0,
      lastPlayedAt: null
    };
  }

  // Configuración base por partida
  const roundsPerGame = 5;
  const pointsPerCorrect = 10;
  const penaltyPerError = 2;

  // Generar resultados coherentes
  const totalRounds = gamesPlayed * roundsPerGame;
  const accuracyRate = 0.5 + Math.random() * 0.4; // 50-90% de aciertos
  const totalCorrect = Math.floor(totalRounds * accuracyRate);
  const totalErrors = totalRounds - totalCorrect;

  // Calcular puntuación
  const totalScore = (totalCorrect * pointsPerCorrect) - (totalErrors * penaltyPerError);
  const averageScore = Math.round(totalScore / gamesPlayed);

  // Mejor puntuación (una partida perfecta o casi)
  const maxPossibleScore = roundsPerGame * pointsPerCorrect;
  const bestScore = Math.min(
    Math.round(averageScore * (1.2 + Math.random() * 0.3)),
    maxPossibleScore
  );

  // Tiempo de respuesta promedio (2-6 segundos)
  const averageResponseTime = Math.floor(2000 + Math.random() * 4000);

  // Última partida en los últimos 7 días
  const daysAgo = Math.floor(Math.random() * 7);
  const lastPlayedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  return {
    totalGamesPlayed: gamesPlayed,
    totalScore: Math.max(0, totalScore),
    averageScore: Math.max(0, averageScore),
    bestScore: Math.max(0, bestScore),
    totalCorrectAnswers: totalCorrect,
    totalErrors: totalErrors,
    averageResponseTime,
    lastPlayedAt
  };
}

/**
 * Genera datos de alumnos para un profesor.
 * @param {Object} teacher - Profesor creador
 * @param {Array<string>} names - Nombres disponibles
 * @param {number} startIndex - Índice inicial en el array de nombres
 * @param {number} count - Número de alumnos a generar
 * @returns {Array} Array de datos de alumnos
 */
function generateStudentsData(teacher, names, startIndex, count) {
  const classrooms = ['Infantil A', 'Infantil B', 'Infantil C'];
  const ages = [4, 5, 6];

  return Array.from({ length: count }, (_, i) => {
    const nameIndex = (startIndex + i) % names.length;
    const age = ages[i % ages.length];
    const gamesPlayed = Math.floor(Math.random() * 15); // 0-14 partidas

    // Calcular año de nacimiento basado en edad
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    const birthMonth = Math.floor(Math.random() * 12);
    const birthDay = Math.floor(Math.random() * 28) + 1;

    return {
      name: names[nameIndex],
      role: 'student',
      profile: {
        age,
        classroom: classrooms[i % classrooms.length],
        avatar: i % 2 === 0 ? '👧' : '👦',
        birthdate: new Date(birthYear, birthMonth, birthDay)
      },
      status: 'active',
      createdBy: teacher._id,
      studentMetrics: generateCoherentMetrics(gamesPlayed)
    };
  });
}

/**
 * Ejecuta el seeder de usuarios.
 * @returns {Promise<Object>} Objeto con teachers y students creados
 */
async function seedUsers() {
  try {
    // Crear profesores
    const teachers = await User.insertMany(teachersData);

    // Crear 5 alumnos por cada profesor (excepto admin)
    const regularTeachers = teachers.filter(t => t.email !== 'admin@test.com');
    const studentsPromises = regularTeachers.map((teacher, index) =>
      User.insertMany(generateStudentsData(
        teacher,
        studentNames,
        index * 5, // Offset para usar nombres diferentes
        5
      ))
    );

    const studentsArrays = await Promise.all(studentsPromises);
    const students = studentsArrays.flat();

    logger.info('✅ Usuarios seeded exitosamente');

    return { teachers, students };
  } catch (error) {
    logger.error('❌ Error en seedUsers:', error);
    throw error;
  }
}

module.exports = seedUsers;
