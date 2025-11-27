/**
 * @fileoverview Seeder de usuarios (profesores y alumnos).
 * Crea 5 profesores y 20 alumnos con perfiles variados.
 * @module seeders/01-users
 */

const User = require('../src/models/User');
const logger = require('../src/utils/logger');

/**
 * Datos de profesores de prueba.
 */
const teachersData = [
  {
    name: 'María García López',
    email: 'maria.garcia@escuela.edu',
    password: 'password123',
    role: 'teacher',
    profile: {
      avatar: '👩‍🏫',
      birthdate: new Date('1985-05-15')
    },
    status: 'active'
  },
  {
    name: 'Carlos Rodríguez Pérez',
    email: 'carlos.rodriguez@escuela.edu',
    password: 'password123',
    role: 'teacher',
    profile: {
      avatar: '👨‍🏫',
      birthdate: new Date('1982-09-22')
    },
    status: 'active'
  },
  {
    name: 'Ana Martínez Sánchez',
    email: 'ana.martinez@escuela.edu',
    password: 'password123',
    role: 'teacher',
    profile: {
      avatar: '👩‍🏫',
      birthdate: new Date('1990-03-10')
    },
    status: 'active'
  },
  {
    name: 'Luis Fernández Gómez',
    email: 'luis.fernandez@escuela.edu',
    password: 'password123',
    role: 'teacher',
    profile: {
      avatar: '👨‍🏫',
      birthdate: new Date('1988-11-30')
    },
    status: 'active'
  },
  {
    name: 'Laura Torres Ruiz',
    email: 'laura.torres@escuela.edu',
    password: 'password123',
    role: 'teacher',
    profile: {
      avatar: '👩‍🏫',
      birthdate: new Date('1992-07-18')
    },
    status: 'active'
  }
];

/**
 * Genera datos de alumnos para un profesor.
 * @param {Object} teacher - Profesor creador
 * @param {number} count - Número de alumnos a generar
 * @returns {Array} Array de datos de alumnos
 */
function generateStudentsData(teacher, count) {
  const names = [
    'Sofía', 'Lucas', 'Valentina', 'Mateo', 'Emma',
    'Diego', 'Isabella', 'Santiago', 'Camila', 'Sebastián',
    'Victoria', 'Nicolás', 'Martina', 'Benjamín', 'Luciana',
    'Daniel', 'Emilia', 'Joaquín', 'Julieta', 'Gabriel'
  ];

  const classrooms = ['Aula A', 'Aula B', 'Aula C', 'Aula D'];
  const ages = [4, 5, 6]; // Edad objetivo: 4-6 años

  return Array.from({ length: count }, (_, i) => ({
    name: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
    role: 'student',
    profile: {
      age: ages[i % ages.length],
      classroom: classrooms[i % classrooms.length],
      avatar: i % 2 === 0 ? '👧' : '👦',
      birthdate: new Date(2018 - ages[i % ages.length], Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
    },
    status: 'active',
    createdBy: teacher._id,
    studentMetrics: {
      totalGamesPlayed: Math.floor(Math.random() * 20),
      totalScore: Math.floor(Math.random() * 500),
      averageScore: Math.floor(Math.random() * 50) + 20,
      bestScore: Math.floor(Math.random() * 100) + 50,
      totalCorrectAnswers: Math.floor(Math.random() * 100),
      totalErrors: Math.floor(Math.random() * 30),
      averageResponseTime: Math.floor(Math.random() * 5000) + 2000,
      lastPlayedAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000))
    }
  }));
}

/**
 * Ejecuta el seeder de usuarios.
 * @returns {Promise<Object>} Objeto con teachers y students creados
 */
async function seedUsers() {
  try {
    // Crear profesores
    const teachers = await User.insertMany(teachersData);

    // Crear 4 alumnos por cada profesor
    const studentsPromises = teachers.map(teacher =>
      User.insertMany(generateStudentsData(teacher, 4))
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
