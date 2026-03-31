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
      avatar: null,
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
      avatar: null,
      birthdate: new Date('1982-09-22')
    },
    status: 'active'
  }
];

const studentFirstNames = [
  'Sofía',
  'Lucas',
  'Valentina',
  'Mateo',
  'Emma',
  'Diego',
  'Isabella',
  'Santiago',
  'Camila',
  'Sebastián',
  'Victoria',
  'Nicolás',
  'Martina',
  'Benjamín',
  'Luciana',
  'Daniel',
  'Emilia',
  'Joaquín',
  'Julieta',
  'Gabriel',
  'Paula',
  'Hugo',
  'Carla',
  'Adrián',
  'Elena',
  'Leo',
  'Claudia',
  'Álvaro',
  'Irene',
  'Bruno'
];

const studentLastNames = [
  'García',
  'Martín',
  'López',
  'Fernández',
  'Rodríguez',
  'Sánchez',
  'Pérez',
  'Gómez',
  'Díaz',
  'Torres',
  'Ruiz',
  'Moreno',
  'Jiménez',
  'Álvarez',
  'Romero',
  'Navarro',
  'Domínguez',
  'Vázquez',
  'Ramos',
  'Molina'
];

function buildStudentNames(count, offset) {
  const names = [];
  let index = 0;

  while (names.length < count) {
    const first = studentFirstNames[(offset + index) % studentFirstNames.length];
    const last = studentLastNames[index % studentLastNames.length];
    const fullName = `${first} ${last}`;
    if (!names.includes(fullName)) {
      names.push(fullName);
    }
    index += 1;
  }

  return names;
}

/**
 * Genera métricas coherentes para un alumno.
 * Las métricas son matemáticamente consistentes entre sí.
 *
 * @param {number} gamesPlayed - Número de partidas jugadas
 * @returns {Object} Métricas del alumno
 */
function getEmptyMetrics() {
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

/**
 * Genera datos de alumnos para un profesor.
 * @param {Object} teacher - Profesor creador
 * @param {Array<string>} names - Nombres disponibles
 * @param {number} startIndex - Índice inicial en el array de nombres
 * @param {number} count - Número de alumnos a generar
 * @returns {Array} Array de datos de alumnos
 */
function generateStudentsData(teacher, names, count, indexOffset) {
  const classrooms = ['Infantil A', 'Infantil B', 'Infantil C'];
  const ages = [4, 5, 6];

  return Array.from({ length: count }, (_, i) => {
    const nameIndex = (indexOffset + i) % names.length;
    const age = ages[i % ages.length];

    // Calcular fecha de nacimiento determinista basada en indice
    const currentYear = new Date().getFullYear();
    const birthYear = currentYear - age;
    const birthMonth = (i * 3 + indexOffset) % 12;
    const birthDay = ((i * 7) % 28) + 1;

    return {
      name: names[nameIndex],
      role: 'student',
      profile: {
        age,
        classroom: classrooms[i % classrooms.length],
        avatar: null,
        birthdate: new Date(birthYear, birthMonth, birthDay)
      },
      status: 'active',
      createdBy: teacher._id,
      assignedTeacher: teacher._id,
      studentMetrics: getEmptyMetrics()
    };
  });
}

/**
 * Ejecuta el seeder de usuarios.
 * @returns {Promise<Object>} Objeto con teachers y students creados
 */
async function seedUsers() {
  try {
    // Crear profesores (usar create/save para aplicar hooks de password)
    const teachers = [];
    for (const teacherData of teachersData) {
      // Asegurar que quedan aprobados en seed
      const teacher = await User.create({
        ...teacherData,
        role: 'teacher',
        accountStatus: 'approved',
        status: 'active'
      });
      teachers.push(teacher);
    }

    // Crear 15-20 alumnos por cada profesor
    const studentsArrays = [];
    for (const [index, teacher] of teachers.entries()) {
      const studentsCount = 18;
      const studentNames = buildStudentNames(studentsCount, index * studentsCount);
      const studentsData = generateStudentsData(teacher, studentNames, studentsCount, 0);
      const createdStudents = await User.create(studentsData);
      studentsArrays.push(createdStudents);
    }

    const students = studentsArrays.flat();

    logger.info('Usuarios seeded exitosamente');

    return { teachers, students };
  } catch (error) {
    logger.error('Error en seedUsers:', error);
    throw error;
  }
}

module.exports = seedUsers;
