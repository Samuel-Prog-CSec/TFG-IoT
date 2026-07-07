/**
 * @fileoverview Tests unitarios para el servicio de analytics.
 *
 * Verifica que cada metodo del servicio invoca el endpoint correcto
 * con los parametros esperados y devuelve los datos extraidos de la
 * respuesta de la API.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted garantiza que mockGet existe antes del hoisting de vi.mock
const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
}));

// Mock del modulo api
vi.mock('../api', () => ({
  default: { get: mockGet },
  extractData: (response) => response?.data?.data ?? response?.data,
  isAbortError: () => false,
}));

import analyticsService from '../analytics';

describe('analyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────── Classroom Analytics ────────────────

  describe('Classroom Analytics', () => {
    it('getClassroomSummary llama GET /analytics/classroom/summary', async () => {
      await analyticsService.getClassroomSummary();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/summary', {
        params: {},
      });
    });

    it('getClassroomSummary reenvia los filtros como query params', async () => {
      await analyticsService.getClassroomSummary({
        timeRange: '30d',
        contextId: 'ctx-1',
        mechanicId: 'mech-1',
      });
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/summary', {
        params: { timeRange: '30d', contextId: 'ctx-1', mechanicId: 'mech-1' },
      });
    });

    it('getClassroomComparison llama GET /analytics/classroom/comparison con timeRange', async () => {
      await analyticsService.getClassroomComparison('30d');
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/comparison', {
        params: { timeRange: '30d' },
      });
    });

    it('getClassroomComparison usa timeRange por defecto 7d', async () => {
      await analyticsService.getClassroomComparison();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/comparison', {
        params: { timeRange: '7d' },
      });
    });

    it('getClassroomComparison reenvia contextId/mechanicId como query params', async () => {
      await analyticsService.getClassroomComparison('90d', {
        contextId: 'ctx-1',
        mechanicId: 'mech-1',
      });
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/comparison', {
        params: { timeRange: '90d', contextId: 'ctx-1', mechanicId: 'mech-1' },
      });
    });

    it('getClassroomTrends llama GET /analytics/classroom/trends con timeRange', async () => {
      await analyticsService.getClassroomTrends('30d');
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/trends', {
        params: { timeRange: '30d' },
      });
    });

    it('getClassroomTrends usa timeRange por defecto 7d', async () => {
      await analyticsService.getClassroomTrends();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/trends', {
        params: { timeRange: '7d' },
      });
    });

    it('getClassroomTrends reenvia contextId/mechanicId como query params', async () => {
      await analyticsService.getClassroomTrends('30d', {
        contextId: 'ctx-1',
        mechanicId: 'mech-1',
      });
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/trends', {
        params: { timeRange: '30d', contextId: 'ctx-1', mechanicId: 'mech-1' },
      });
    });

    it('getClassroomDifficulties llama GET /analytics/classroom/difficulties', async () => {
      await analyticsService.getClassroomDifficulties();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/difficulties', {});
    });

    it('getClassroomStudents llama GET /analytics/classroom/students con params', async () => {
      const params = { sort: 'name', order: 'asc', tier: 'excellent' };
      await analyticsService.getClassroomStudents(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/students', {
        params,
      });
    });

    it('getClassroomDistribution llama GET /analytics/classroom/distribution con params', async () => {
      const params = { timeRange: '30d' };
      await analyticsService.getClassroomDistribution(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/distribution', {
        params,
      });
    });

    it('getClassroomHeatmap llama GET /analytics/classroom/heatmap con timeRange', async () => {
      await analyticsService.getClassroomHeatmap('7d');
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/heatmap', {
        params: { timeRange: '7d' },
      });
    });

    it('getClassroomHeatmap usa timeRange por defecto 30d', async () => {
      await analyticsService.getClassroomHeatmap();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/heatmap', {
        params: { timeRange: '30d' },
      });
    });

    it('getClassroomRankings llama GET /analytics/classroom/rankings con timeRange y limit', async () => {
      await analyticsService.getClassroomRankings('7d', 5);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/rankings', {
        params: { timeRange: '7d', limit: 5 },
      });
    });

    it('getClassroomRankings usa valores por defecto (30d, 10)', async () => {
      await analyticsService.getClassroomRankings();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/rankings', {
        params: { timeRange: '30d', limit: 10 },
      });
    });

    it('getClassroomEngagement llama GET /analytics/classroom/engagement con params', async () => {
      const params = { timeRange: '30d', sort: 'score', order: 'desc' };
      await analyticsService.getClassroomEngagement(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/engagement', {
        params,
      });
    });

    it('getClassroomFatigue llama GET /analytics/classroom/fatigue con timeRange', async () => {
      await analyticsService.getClassroomFatigue('7d');
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/fatigue', {
        params: { timeRange: '7d' },
      });
    });

    it('getClassroomFatigue usa timeRange por defecto 30d', async () => {
      await analyticsService.getClassroomFatigue();
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/fatigue', {
        params: { timeRange: '30d' },
      });
    });
  });

  // ──────────────── Content Effectiveness ────────────────

  describe('Content Effectiveness', () => {
    it('getContentEffectiveness llama GET /analytics/classroom/content-effectiveness con params', async () => {
      const params = { timeRange: '30d', groupBy: 'context' };
      await analyticsService.getContentEffectiveness(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/content-effectiveness', {
        params,
      });
    });

    it('getCardDifficulty llama GET /analytics/classroom/card-difficulty con params', async () => {
      const params = { timeRange: '30d', contextId: 'ctx-1', threshold: 50 };
      await analyticsService.getCardDifficulty(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/card-difficulty', {
        params,
      });
    });

    it('getLearningCurves llama GET /analytics/classroom/learning-curves con params', async () => {
      const params = { timeRange: '90d', contextId: 'ctx-1', mechanicId: 'mech-1' };
      await analyticsService.getLearningCurves(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/learning-curves', {
        params,
      });
    });

    it('getCardAnalysis llama GET /analytics/classroom/card-analysis con params', async () => {
      const params = { timeRange: '30d', contextId: 'ctx-1', limit: 20 };
      await analyticsService.getCardAnalysis(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/classroom/card-analysis', {
        params,
      });
    });
  });

  // ──────────────── Student Analytics ────────────────

  describe('Student Analytics', () => {
    const studentId = 'student-123';

    it('getStudentDifficulties llama GET /analytics/student/:id/difficulties', async () => {
      await analyticsService.getStudentDifficulties(studentId);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/difficulties`,
        {}
      );
    });

    it('getStudentProgress llama GET /analytics/student/:id/progress con timeRange', async () => {
      await analyticsService.getStudentProgress(studentId, '7d');
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/progress`,
        { params: { timeRange: '7d' } }
      );
    });

    it('getStudentSummary llama GET /analytics/student/:id/summary con params', async () => {
      const params = { timeRange: '30d' };
      await analyticsService.getStudentSummary(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/summary`,
        { params }
      );
    });

    it('getStudentTrajectory llama GET /analytics/student/:id/trajectory con params', async () => {
      const params = { timeRange: '90d', granularity: 'weekly' };
      await analyticsService.getStudentTrajectory(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/trajectory`,
        { params }
      );
    });

    it('getStudentVelocity llama GET /analytics/student/:id/velocity con params', async () => {
      const params = { timeRange: '30d', windowDays: 7 };
      await analyticsService.getStudentVelocity(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/velocity`,
        { params }
      );
    });

    it('getStudentPlateaus llama GET /analytics/student/:id/plateaus con params', async () => {
      const params = { timeRange: '30d', minDays: 5 };
      await analyticsService.getStudentPlateaus(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/plateaus`,
        { params }
      );
    });

    it('getStudentEvolution llama GET /analytics/student/:id/evolution con params', async () => {
      const params = { timeRange: '30d', groupBy: 'mechanic' };
      await analyticsService.getStudentEvolution(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/evolution`,
        { params }
      );
    });

    it('getStudentStruggles llama GET /analytics/student/:id/struggles con params', async () => {
      const params = { timeRange: '30d', minConsecutiveErrors: 3 };
      await analyticsService.getStudentStruggles(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/struggles`,
        { params }
      );
    });

    it('getStudentEngagement llama GET /analytics/student/:id/engagement con params', async () => {
      const params = { timeRange: '90d' };
      await analyticsService.getStudentEngagement(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/engagement`,
        { params }
      );
    });

    it('getStudentPlayPatterns llama GET /analytics/student/:id/play-patterns con params', async () => {
      const params = { timeRange: '30d' };
      await analyticsService.getStudentPlayPatterns(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/student/${studentId}/play-patterns`,
        { params }
      );
    });
  });

  // ──────────────── Gameplay Analysis ────────────────

  describe('Gameplay Analysis', () => {
    it('getGameplayRounds llama GET /analytics/gameplay/:id/rounds', async () => {
      const gameplayId = 'gameplay-456';
      await analyticsService.getGameplayRounds(gameplayId);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/gameplay/${gameplayId}/rounds`,
        {}
      );
    });
  });

  // ──────────────── Alerts ────────────────

  describe('Alerts', () => {
    it('getAlerts llama GET /analytics/alerts con params', async () => {
      const params = { severity: 'high', type: 'declining_performance', limit: 5 };
      await analyticsService.getAlerts(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/alerts', {
        params,
      });
    });

    it('getAlertsSummary llama GET /analytics/alerts/summary', async () => {
      await analyticsService.getAlertsSummary();
      expect(mockGet).toHaveBeenCalledWith('/analytics/alerts/summary', {});
    });
  });

  // ──────────────── Reports & Export ────────────────

  describe('Reports & Export', () => {
    it('getStudentReport llama GET /analytics/reports/student/:id con params', async () => {
      const studentId = 'student-789';
      const params = { timeRange: '30d', format: 'detailed' };
      await analyticsService.getStudentReport(studentId, params);
      expect(mockGet).toHaveBeenCalledWith(
        `/analytics/reports/student/${studentId}`,
        { params }
      );
    });

    it('getClassroomReport llama GET /analytics/reports/classroom con params', async () => {
      const params = { timeRange: '30d', format: 'summary' };
      await analyticsService.getClassroomReport(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/reports/classroom', {
        params,
      });
    });

    it('getClassroomExport llama GET /analytics/reports/classroom/export con params', async () => {
      const params = { timeRange: '30d' };
      await analyticsService.getClassroomExport(params);
      expect(mockGet).toHaveBeenCalledWith('/analytics/reports/classroom/export', {
        params,
      });
    });
  });

  // ──────────────── Extraccion de datos ────────────────

  describe('Extraccion de datos', () => {
    it('devuelve los datos extraidos de la respuesta', async () => {
      const mockData = { students: [{ id: 1, name: 'Test' }], total: 1 };
      mockGet.mockResolvedValueOnce({ data: { success: true, data: mockData } });

      const result = await analyticsService.getClassroomSummary();
      expect(result).toEqual(mockData);
    });
  });
});
