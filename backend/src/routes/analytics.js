/**
 * @fileoverview Rutas para el módulo de analíticas.
 * Define los endpoints y aplica middleware de autenticación y validación.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticate, requireRole } = require('../middlewares/auth');
const { validateParams, validateQuery } = require('../middlewares/validation');
const { emptyObjectSchema } = require('../validators/commonValidator');
const {
  analyticsStudentParamsSchema,
  analyticsTimeRangeQuerySchema
} = require('../validators/analyticsValidator');

// Todas las rutas requieren estar autenticado como profesor o super admin
router.use(authenticate, requireRole('teacher', 'super_admin'));

// Rutas de estudiante individual
router.get(
  '/student/:id/progress',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(analyticsTimeRangeQuerySchema),
  analyticsController.getStudentProgress
);
router.get(
  '/student/:id/difficulties',
  validateParams(analyticsStudentParamsSchema),
  validateQuery(emptyObjectSchema),
  analyticsController.getStudentDifficulties
);

// Rutas de clase (profesor)
router.get(
  '/classroom/summary',
  validateQuery(emptyObjectSchema),
  analyticsController.getClassroomSummary
);
router.get(
  '/classroom/comparison',
  validateQuery(analyticsTimeRangeQuerySchema),
  analyticsController.getClassroomComparison
);
router.get(
  '/classroom/difficulties',
  validateQuery(emptyObjectSchema),
  analyticsController.getClassroomDifficulties
);

module.exports = router;
