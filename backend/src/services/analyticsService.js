/**
 * @fileoverview Servicio para análisis de datos y estadísticas de juego.
 * Encapsula la lógica de agregación de MongoDB para transformar datos crudos en insights.
 */

const mongoose = require('mongoose');
const GamePlay = require('../models/GamePlay');
// const User = require('../models/User'); // Podría ser necesario para enriquecer datos

/**
 * Obtiene la evolución del rendimiento de un estudiante a lo largo del tiempo.
 * Agrupa las partidas por fecha (día o semana) y calcula promedios.
 *
 * @param {string} studentId - ID del estudiante
 * @param {string} timeRange - Rango de tiempo ('7d' o '30d')
 * @returns {Promise<Array>} Array de puntos de datos para gráficos
 */
async function getStudentProgress(studentId, timeRange = '30d') {
  const now = new Date();
  const past = new Date();

  if (timeRange === '7d') {
    past.setDate(now.getDate() - 7);
  } else {
    past.setDate(now.getDate() - 30);
  }

  const pipeline = [
    {
      $match: {
        playerId: new mongoose.Types.ObjectId(studentId),
        status: 'completed',
        completedAt: { $gte: past, $lte: now }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        score: { $avg: '$score' },
        accuracy: {
          $avg: {
            $cond: [
              { $gt: ['$metrics.totalAttempts', 0] },
              {
                $multiply: [
                  { $divide: ['$metrics.correctAttempts', '$metrics.totalAttempts'] },
                  100
                ]
              },
              0
            ]
          }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        date: '$_id',
        score: { $round: ['$score', 1] },
        accuracy: { $round: ['$accuracy', 1] },
        count: 1,
        _id: 0
      }
    }
  ];

  return await GamePlay.aggregate(pipeline);
}

/**
 * Analiza las dificultades del estudiante desglosadas por mecánica y contexto.
 * Ayuda a identificar "dónde" falla más el alumno.
 *
 * @param {string} studentId - ID del estudiante
 * @returns {Promise<Object>} Objeto con análisis de dificultades
 */
async function getStudentDifficulties(studentId) {
  // Unimos con GameSession para saber mecánica y contexto
  const pipeline = [
    {
      $match: {
        playerId: new mongoose.Types.ObjectId(studentId),
        status: 'completed'
      }
    },
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: '$context' },
    {
      $lookup: {
        from: 'game_mechanics',
        localField: 'session.mechanicId',
        foreignField: '_id',
        as: 'mechanic'
      }
    },
    { $unwind: '$mechanic' },
    {
      $group: {
        _id: {
          context: '$context.name',
          mechanic: '$mechanic.name'
        },
        totalAttempts: { $sum: '$metrics.totalAttempts' },
        errorAttempts: { $sum: '$metrics.errorAttempts' },
        timeoutAttempts: { $sum: '$metrics.timeoutAttempts' }
      }
    },
    {
      $project: {
        context: '$_id.context',
        mechanic: '$_id.mechanic',
        errorRate: {
          $cond: [
            { $gt: ['$totalAttempts', 0] },
            {
              $multiply: [
                { $divide: [{ $add: ['$errorAttempts', '$timeoutAttempts'] }, '$totalAttempts'] },
                100
              ]
            },
            0
          ]
        },
        totalAttempts: 1
      }
    },
    { $sort: { errorRate: -1 } } // Los más difíciles primero
  ];

  return await GamePlay.aggregate(pipeline);
}

/**
 * Obtiene un resumen global de la clase del profesor.
 * KPIs principales: Estudiantes en riesgo, media de clase, actividad hoy.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Promise<Object>} KPIs calculados
 */
async function getClassroomSummary(teacherId) {
  // Primero obtenemos los estudiantes del profesor
  // Nota: Esto asume que userController o userService tiene un método para obtener estudiantes por profesor
  // o hacemos un match en Users.
  // Para optimizar, hacemos el análisis desde GamePlay filtrando por sesiones creadas por el teacher

  const pipeline = [
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $match: {
        'session.createdBy': new mongoose.Types.ObjectId(teacherId)
      }
    },
    {
      $facet: {
        // Riesgo: Estudiantes con media < 50 en los últimos 5 juegos
        studentsInRisk: [
          { $sort: { completedAt: -1 } },
          {
            $group: {
              _id: '$playerId',
              recentScore: { $avg: '$score' },
              lastPlayed: { $max: '$completedAt' }
            }
          },
          { $match: { recentScore: { $lt: 50 } } },
          { $count: 'count' }
        ],
        // Promedio global y tendencia
        globalStats: [
          {
            $group: {
              _id: null,
              avgScore: { $avg: '$score' },
              totalGames: { $sum: 1 }
            }
          }
        ],
        // Actividad de hoy
        todayActivity: [
          {
            $match: {
              completedAt: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                $lt: new Date(new Date().setHours(23, 59, 59, 999))
              }
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ];

  const results = await GamePlay.aggregate(pipeline);
  const data = results[0];

  return {
    studentsInRisk: data.studentsInRisk[0] ? data.studentsInRisk[0].count : 0,
    averageScore: data.globalStats[0] ? Math.round(data.globalStats[0].avgScore) : 0,
    totalGames: data.globalStats[0] ? data.globalStats[0].totalGames : 0,
    gamesToday: data.todayActivity[0] ? data.todayActivity[0].count : 0
  };
}

/**
 * Compara el rendimiento del estudiante con la media general de la clase
 * para un periodo de tiempo.
 *
 * @param {string} teacherId - ID del profesor (para contexto de clase)
 * @param {string} timeRange - '7d'
 */
async function getClassroomComparison(teacherId) {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  // Obtener promedio diario de TODOS los alumnos del profesor
  const pipeline = [
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $match: {
        'session.createdBy': new mongoose.Types.ObjectId(teacherId),
        status: 'completed',
        completedAt: { $gte: lastWeek }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        classAverage: { $avg: '$score' }
      }
    },
    { $sort: { _id: 1 } }
  ];

  return await GamePlay.aggregate(pipeline);
}

/**
 * Analiza las dificultades globales de la clase (contexto/mecánica).
 * @param {string} teacherId
 */
async function getClassroomDifficulties(teacherId) {
  const pipeline = [
    {
      $lookup: {
        from: 'game_sessions',
        localField: 'sessionId',
        foreignField: '_id',
        as: 'session'
      }
    },
    { $unwind: '$session' },
    {
      $match: {
        'session.createdBy': new mongoose.Types.ObjectId(teacherId),
        status: 'completed'
      }
    },
    {
      $lookup: {
        from: 'game_contexts',
        localField: 'session.contextId',
        foreignField: '_id',
        as: 'context'
      }
    },
    { $unwind: '$context' },
    {
      $lookup: {
        from: 'game_mechanics',
        localField: 'session.mechanicId',
        foreignField: '_id',
        as: 'mechanic'
      }
    },
    { $unwind: '$mechanic' },
    {
      $group: {
        _id: {
          context: '$context.name',
          mechanic: '$mechanic.name'
        },
        totalAttempts: { $sum: '$metrics.totalAttempts' },
        errorAttempts: { $sum: '$metrics.errorAttempts' },
        timeoutAttempts: { $sum: '$metrics.timeoutAttempts' }
      }
    },
    {
      $project: {
        context: '$_id.context',
        mechanic: '$_id.mechanic',
        errorRate: {
          $cond: [
            { $gt: ['$totalAttempts', 0] },
            {
              $multiply: [
                { $divide: [{ $add: ['$errorAttempts', '$timeoutAttempts'] }, '$totalAttempts'] },
                100
              ]
            },
            0
          ]
        },
        totalAttempts: 1,
        _id: 0
      }
    },
    { $sort: { errorRate: -1 } }
  ];

  return await GamePlay.aggregate(pipeline);
}

module.exports = {
  getStudentProgress,
  getStudentDifficulties,
  getClassroomSummary,
  getClassroomComparison,
  getClassroomDifficulties
};
