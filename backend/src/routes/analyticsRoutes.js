/**
 * @fileoverview Rutas para el módulo de analíticas.
 * Define los endpoints y aplica middleware de autenticación y validación.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { verifyToken, isTeacher } = require('../middlewares/auth');

// Todas las rutas requieren estar autenticado como profesor
router.use(verifyToken, isTeacher);

// Rutas de estudiante individual
router.get('/student/:id/progress', analyticsController.getStudentProgress);
router.get('/student/:id/difficulties', analyticsController.getStudentDifficulties);

// Rutas de clase (profesor)
router.get('/classroom/summary', analyticsController.getClassroomSummary);
router.get('/classroom/comparison', analyticsController.getClassroomComparison);
router.get('/classroom/difficulties', analyticsController.getClassroomDifficulties);

module.exports = router;
