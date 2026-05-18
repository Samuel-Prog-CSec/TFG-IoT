/**
 * @fileoverview Tests unitarios para services/analytics/analyticsHelpers.
 * Verifica constantes exportadas, funciones de clasificación, helpers de fechas,
 * regresión lineal, generación de alertas y el framework KPI (RAG + interpretaciones).
 */

const mongoose = require('mongoose');

const {
  PERFORMANCE_TIERS,
  ALERT_TYPES,
  ALERT_SEVERITIES,
  KPI_DEFINITIONS,
  RAG,
  classifyTier,
  calcAccuracyRate,
  getStartDate,
  getPeriodDates,
  getStartOfToday,
  toObjectId,
  teacherSessionStages,
  linearRegression,
  classifyTrend,
  generateAlertId,
  classifyRAG,
  generateInterpretation,
  enrichMetric
} = require('../src/services/analytics/analyticsHelpers');

// ══════════════════════════════════════════════════════════════════════
// Constantes exportadas
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — constantes', () => {
  describe('PERFORMANCE_TIERS', () => {
    it('debe contener exactamente 4 niveles', () => {
      expect(PERFORMANCE_TIERS).toHaveLength(4);
    });

    it('debe cubrir el rango completo 0-100 sin huecos', () => {
      const tiers = [...PERFORMANCE_TIERS].sort((a, b) => a.min - b.min);

      expect(tiers[0].min).toBe(0);
      expect(tiers[tiers.length - 1].max).toBe(100);

      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].min).toBe(tiers[i - 1].max + 1);
      }
    });

    it('debe tener los nombres de tier esperados', () => {
      const names = PERFORMANCE_TIERS.map(t => t.tier);
      expect(names).toEqual(['risk', 'average', 'good', 'excellent']);
    });
  });

  describe('ALERT_TYPES', () => {
    it('debe tener 13 tipos de alerta (T-941: 6 originales + 7 nuevos)', () => {
      expect(Object.keys(ALERT_TYPES)).toHaveLength(13);
    });

    it('cada tipo debe tener label y thresholds', () => {
      for (const [, config] of Object.entries(ALERT_TYPES)) {
        expect(config).toHaveProperty('label');
        expect(config).toHaveProperty('thresholds');
        expect(typeof config.label).toBe('string');
        expect(typeof config.thresholds).toBe('object');
      }
    });

    it('incluye los detectores nuevos T-941 (plateau ya operativo + Secuencia + meta)', () => {
      const keys = Object.keys(ALERT_TYPES);
      const expectedNew = [
        'plateau_detected',
        'engagement_drop',
        'recovery_after_drop',
        'mastery_milestone',
        'mechanic_specific_struggle',
        'sequence_stagnation',
        'sequence_order_errors'
      ];
      for (const k of expectedNew) {
        expect(keys).toContain(k);
      }
    });
  });

  describe('ALERT_SEVERITIES', () => {
    it('debe contener critical, warning e info en orden de urgencia', () => {
      expect(ALERT_SEVERITIES).toEqual(['critical', 'warning', 'info']);
    });
  });

  describe('KPI_DEFINITIONS', () => {
    it('debe tener exactamente 10 KPIs definidos', () => {
      expect(Object.keys(KPI_DEFINITIONS)).toHaveLength(10);
    });

    it('cada KPI debe tener name, unit, direction, green, red, target y formula', () => {
      for (const [, def] of Object.entries(KPI_DEFINITIONS)) {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('unit');
        expect(def).toHaveProperty('direction');
        expect(def).toHaveProperty('green');
        expect(def).toHaveProperty('red');
        expect(def).toHaveProperty('target');
        expect(def).toHaveProperty('formula');
      }
    });

    it('direction solo puede ser higher_better o lower_better', () => {
      for (const def of Object.values(KPI_DEFINITIONS)) {
        expect(['higher_better', 'lower_better']).toContain(def.direction);
      }
    });
  });

  describe('RAG', () => {
    it('debe tener exactamente RED, AMBER y GREEN', () => {
      expect(RAG).toEqual({ RED: 'RED', AMBER: 'AMBER', GREEN: 'GREEN' });
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// classifyTier
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — classifyTier', () => {
  it('debe devolver risk para null', () => {
    expect(classifyTier(null)).toBe('risk');
  });

  it('debe devolver risk para undefined', () => {
    expect(classifyTier(undefined)).toBe('risk');
  });

  it('debe devolver risk para valores negativos', () => {
    expect(classifyTier(-1)).toBe('risk');
    expect(classifyTier(-100)).toBe('risk');
  });

  it('debe clasificar 0 como risk', () => {
    expect(classifyTier(0)).toBe('risk');
  });

  it('debe clasificar 49 como risk (limite superior)', () => {
    expect(classifyTier(49)).toBe('risk');
  });

  it('debe clasificar 50 como average (limite inferior)', () => {
    expect(classifyTier(50)).toBe('average');
  });

  it('debe clasificar 69 como average (limite superior)', () => {
    expect(classifyTier(69)).toBe('average');
  });

  it('debe clasificar 70 como good (limite inferior)', () => {
    expect(classifyTier(70)).toBe('good');
  });

  it('debe clasificar 89 como good (limite superior)', () => {
    expect(classifyTier(89)).toBe('good');
  });

  it('debe clasificar 90 como excellent (limite inferior)', () => {
    expect(classifyTier(90)).toBe('excellent');
  });

  it('debe clasificar 100 como excellent (limite superior)', () => {
    expect(classifyTier(100)).toBe('excellent');
  });

  it('debe devolver risk para scores por encima de 100', () => {
    expect(classifyTier(101)).toBe('risk');
  });
});

// ══════════════════════════════════════════════════════════════════════
// calcAccuracyRate
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — calcAccuracyRate', () => {
  it('debe devolver 0 cuando ambos son 0', () => {
    expect(calcAccuracyRate(0, 0)).toBe(0);
  });

  it('debe devolver 100 sin errores', () => {
    expect(calcAccuracyRate(10, 0)).toBe(100);
  });

  it('debe devolver 0 sin aciertos', () => {
    expect(calcAccuracyRate(0, 10)).toBe(0);
  });

  it('debe calcular porcentaje con un decimal', () => {
    // 7 / (7 + 3) = 0.7 = 70.0
    expect(calcAccuracyRate(7, 3)).toBeCloseTo(70.0, 1);
  });

  it('debe redondear correctamente a un decimal', () => {
    // 1 / 3 = 0.3333... = 33.3%
    expect(calcAccuracyRate(1, 2)).toBeCloseTo(33.3, 1);
  });

  it('debe tratar null como 0 en correct', () => {
    expect(calcAccuracyRate(null, 5)).toBe(0);
  });

  it('debe tratar undefined como 0 en errors', () => {
    expect(calcAccuracyRate(5, undefined)).toBe(100);
  });

  it('debe tratar ambos null como total 0 y devolver 0', () => {
    expect(calcAccuracyRate(null, null)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// getStartDate
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — getStartDate', () => {
  const fixedDate = new Date('2026-04-06T12:00:00.000Z');

  it('debe restar 7 dias para timeRange 7d', () => {
    const result = getStartDate('7d', fixedDate);
    const expected = new Date('2026-03-30T12:00:00.000Z');

    expect(result.getTime()).toBe(expected.getTime());
  });

  it('debe restar 30 dias para timeRange 30d', () => {
    const result = getStartDate('30d', fixedDate);

    // setDate opera en hora local, lo que puede causar desfase DST en UTC.
    // Verificamos que el dia del calendario sea correcto.
    expect(result.getDate()).toBe(7);
    expect(result.getMonth()).toBe(2); // marzo = 2
    expect(result.getFullYear()).toBe(2026);
  });

  it('debe restar 90 dias para timeRange 90d', () => {
    const result = getStartDate('90d', fixedDate);

    expect(result.getDate()).toBe(6);
    expect(result.getMonth()).toBe(0); // enero = 0
    expect(result.getFullYear()).toBe(2026);
  });

  it('debe usar 30 dias como fallback para timeRange invalido', () => {
    const result = getStartDate('invalid', fixedDate);

    expect(result.getDate()).toBe(7);
    expect(result.getMonth()).toBe(2); // marzo = 2
    expect(result.getFullYear()).toBe(2026);
  });

  it('debe usar new Date() como from por defecto', () => {
    const before = new Date();
    const result = getStartDate('7d');
    const after = new Date();

    // La fecha resultado debe estar ~7 dias antes de ahora
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(before.getTime() - sevenDaysMs);
    expect(result.getTime()).toBeLessThanOrEqual(after.getTime() - sevenDaysMs);
  });

  it('no debe mutar la fecha original pasada como from', () => {
    const original = new Date('2026-04-06T12:00:00.000Z');
    const originalTime = original.getTime();

    getStartDate('7d', original);

    expect(original.getTime()).toBe(originalTime);
  });
});

// ══════════════════════════════════════════════════════════════════════
// getPeriodDates
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — getPeriodDates', () => {
  it('debe devolver now, currentStart y previousStart', () => {
    const result = getPeriodDates('7d');

    expect(result).toHaveProperty('now');
    expect(result).toHaveProperty('currentStart');
    expect(result).toHaveProperty('previousStart');
    expect(result.now).toBeInstanceOf(Date);
    expect(result.currentStart).toBeInstanceOf(Date);
    expect(result.previousStart).toBeInstanceOf(Date);
  });

  it('currentStart debe estar N dias antes de now', () => {
    const result = getPeriodDates('7d');
    const diffMs = result.now.getTime() - result.currentStart.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

    expect(diffDays).toBe(7);
  });

  it('previousStart debe estar 2N dias antes de now', () => {
    const result = getPeriodDates('30d');
    const diffMs = result.now.getTime() - result.previousStart.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

    expect(diffDays).toBe(60);
  });

  it('debe usar 30 dias como fallback para timeRange invalido', () => {
    const result = getPeriodDates('invalid');
    const diffMs = result.now.getTime() - result.currentStart.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

    expect(diffDays).toBe(30);
  });
});

// ══════════════════════════════════════════════════════════════════════
// getStartOfToday
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — getStartOfToday', () => {
  it('debe devolver una fecha con hora 00:00:00.000', () => {
    const result = getStartOfToday();

    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('debe ser del dia actual', () => {
    const now = new Date();
    const result = getStartOfToday();

    expect(result.getFullYear()).toBe(now.getFullYear());
    expect(result.getMonth()).toBe(now.getMonth());
    expect(result.getDate()).toBe(now.getDate());
  });
});

// ══════════════════════════════════════════════════════════════════════
// toObjectId
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — toObjectId', () => {
  it('debe devolver una instancia de mongoose.Types.ObjectId', () => {
    const id = '507f1f77bcf86cd799439011';
    const result = toObjectId(id);

    expect(result).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('debe conservar el valor del string original', () => {
    const id = '507f1f77bcf86cd799439011';
    const result = toObjectId(id);

    expect(result.toString()).toBe(id);
  });
});

// ══════════════════════════════════════════════════════════════════════
// teacherSessionStages
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — teacherSessionStages', () => {
  it('debe devolver un array de 3 stages', () => {
    const stages = teacherSessionStages('507f1f77bcf86cd799439011');

    expect(stages).toHaveLength(3);
  });

  it('el primer stage debe ser $lookup a game_sessions', () => {
    const stages = teacherSessionStages('507f1f77bcf86cd799439011');

    expect(stages[0]).toHaveProperty('$lookup');
    expect(stages[0].$lookup.from).toBe('game_sessions');
    expect(stages[0].$lookup.localField).toBe('sessionId');
    expect(stages[0].$lookup.foreignField).toBe('_id');
    expect(stages[0].$lookup.as).toBe('session');
  });

  it('el segundo stage debe ser $unwind de session', () => {
    const stages = teacherSessionStages('507f1f77bcf86cd799439011');

    expect(stages[1]).toEqual({ $unwind: '$session' });
  });

  it('el tercer stage debe ser $match con el teacherId convertido a ObjectId', () => {
    const teacherId = '507f1f77bcf86cd799439011';
    const stages = teacherSessionStages(teacherId);

    expect(stages[2]).toHaveProperty('$match');
    expect(stages[2].$match['session.createdBy']).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(stages[2].$match['session.createdBy'].toString()).toBe(teacherId);
  });
});

// ══════════════════════════════════════════════════════════════════════
// linearRegression
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — linearRegression', () => {
  it('debe devolver slope 0 e intercept 0 para array vacio', () => {
    const result = linearRegression([]);

    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
  });

  it('debe devolver slope 0 e intercept igual a y para un solo punto', () => {
    const result = linearRegression([{ x: 1, y: 42 }]);

    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(42);
  });

  it('debe calcular regresion perfecta (pendiente positiva)', () => {
    // y = 2x + 1 => slope=2, intercept=1
    const points = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 }
    ];
    const result = linearRegression(points);

    expect(result.slope).toBeCloseTo(2, 5);
    expect(result.intercept).toBeCloseTo(1, 5);
  });

  it('debe calcular regresion perfecta (pendiente negativa)', () => {
    // y = -3x + 10 => slope=-3, intercept=10
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 7 },
      { x: 2, y: 4 },
      { x: 3, y: 1 }
    ];
    const result = linearRegression(points);

    expect(result.slope).toBeCloseTo(-3, 5);
    expect(result.intercept).toBeCloseTo(10, 5);
  });

  it('debe manejar puntos con la misma x (denominador 0)', () => {
    const points = [
      { x: 5, y: 10 },
      { x: 5, y: 20 }
    ];
    const result = linearRegression(points);

    expect(result.slope).toBe(0);
    // intercept = promedio de y = 15
    expect(result.intercept).toBeCloseTo(15, 5);
  });

  it('debe calcular regresion aproximada con datos ruidosos', () => {
    const points = [
      { x: 1, y: 2.1 },
      { x: 2, y: 3.9 },
      { x: 3, y: 6.2 },
      { x: 4, y: 7.8 }
    ];
    const result = linearRegression(points);

    // Pendiente aprox ~2, intercept aprox ~0
    expect(result.slope).toBeGreaterThan(1.5);
    expect(result.slope).toBeLessThan(2.5);
  });

  it('debe manejar puntos horizontales (slope = 0)', () => {
    const points = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 }
    ];
    const result = linearRegression(points);

    expect(result.slope).toBeCloseTo(0, 5);
    expect(result.intercept).toBeCloseTo(5, 5);
  });
});

// ══════════════════════════════════════════════════════════════════════
// classifyTrend
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — classifyTrend', () => {
  describe('direction', () => {
    it('debe ser improving para slope > 0.5', () => {
      expect(classifyTrend(0.6, 5).direction).toBe('improving');
    });

    it('debe ser declining para slope < -0.5', () => {
      expect(classifyTrend(-0.6, 5).direction).toBe('declining');
    });

    it('debe ser stable para slope = 0', () => {
      expect(classifyTrend(0, 5).direction).toBe('stable');
    });

    it('debe ser stable para slope = 0.5 (limite exacto)', () => {
      expect(classifyTrend(0.5, 5).direction).toBe('stable');
    });

    it('debe ser stable para slope = -0.5 (limite exacto)', () => {
      expect(classifyTrend(-0.5, 5).direction).toBe('stable');
    });
  });

  describe('confidence', () => {
    it('debe ser high con >=7 puntos y |slope| > 1.0', () => {
      expect(classifyTrend(1.5, 7).confidence).toBe('high');
    });

    it('debe ser medium con >=4 puntos (slope bajo)', () => {
      expect(classifyTrend(0.2, 4).confidence).toBe('medium');
    });

    it('debe ser medium con |slope| > 0.5 (pocos puntos)', () => {
      expect(classifyTrend(0.6, 2).confidence).toBe('medium');
    });

    it('debe ser low con pocos puntos y slope bajo', () => {
      expect(classifyTrend(0.1, 2).confidence).toBe('low');
    });

    it('debe ser medium (no high) con 7 puntos pero |slope| = 1.0 exacto', () => {
      // |slope| > 1.0 requiere estrictamente mayor, 1.0 no califica para high
      expect(classifyTrend(1.0, 7).confidence).toBe('medium');
    });

    it('debe ser high con slope negativo grande y muchos puntos', () => {
      expect(classifyTrend(-2.0, 10).confidence).toBe('high');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// generateAlertId
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — generateAlertId', () => {
  it('debe devolver un string que empieza con "alert_"', () => {
    const id = generateAlertId('declining_performance', 'student123', '2026-04-06');

    expect(id).toMatch(/^alert_/);
  });

  it('debe ser determinista (mismos inputs = mismo output)', () => {
    const id1 = generateAlertId('inactivity', 'abc', '2026-01-01');
    const id2 = generateAlertId('inactivity', 'abc', '2026-01-01');

    expect(id1).toBe(id2);
  });

  it('debe producir IDs distintos para tipos diferentes', () => {
    const id1 = generateAlertId('inactivity', 'abc', '2026-01-01');
    const id2 = generateAlertId('declining_performance', 'abc', '2026-01-01');

    expect(id1).not.toBe(id2);
  });

  it('debe producir IDs distintos para estudiantes diferentes', () => {
    const id1 = generateAlertId('inactivity', 'student1', '2026-01-01');
    const id2 = generateAlertId('inactivity', 'student2', '2026-01-01');

    expect(id1).not.toBe(id2);
  });

  it('debe producir IDs distintos para fechas diferentes', () => {
    const id1 = generateAlertId('inactivity', 'abc', '2026-01-01');
    const id2 = generateAlertId('inactivity', 'abc', '2026-01-02');

    expect(id1).not.toBe(id2);
  });

  it('debe usar la fecha de hoy como fallback cuando no se pasa dateStr', () => {
    const today = new Date().toISOString().split('T')[0];
    const idWithDate = generateAlertId('inactivity', 'abc', today);
    const idWithoutDate = generateAlertId('inactivity', 'abc');

    expect(idWithDate).toBe(idWithoutDate);
  });
});

// ══════════════════════════════════════════════════════════════════════
// classifyRAG
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — classifyRAG', () => {
  describe('KPI higher_better (score)', () => {
    it('debe ser GREEN para valor >= umbral green', () => {
      const result = classifyRAG('score', 70);
      expect(result.status).toBe('GREEN');
    });

    it('debe ser GREEN para valor muy por encima del umbral green', () => {
      const result = classifyRAG('score', 95);
      expect(result.status).toBe('GREEN');
    });

    it('debe ser RED para valor < umbral red', () => {
      const result = classifyRAG('score', 49);
      expect(result.status).toBe('RED');
    });

    it('debe ser AMBER para valor entre red y green', () => {
      const result = classifyRAG('score', 60);
      expect(result.status).toBe('AMBER');
    });

    it('debe ser AMBER en el limite inferior exacto de red (score=50)', () => {
      // score: red=50. value=50, NOT < 50, so AMBER
      const result = classifyRAG('score', 50);
      expect(result.status).toBe('AMBER');
    });
  });

  describe('KPI lower_better (abandonmentRate)', () => {
    it('debe ser GREEN para valor <= umbral green', () => {
      const result = classifyRAG('abandonmentRate', 10);
      expect(result.status).toBe('GREEN');
    });

    it('debe ser GREEN para valor muy bajo', () => {
      const result = classifyRAG('abandonmentRate', 2);
      expect(result.status).toBe('GREEN');
    });

    it('debe ser RED para valor > umbral red', () => {
      const result = classifyRAG('abandonmentRate', 30);
      expect(result.status).toBe('RED');
    });

    it('debe ser AMBER para valor entre green y red', () => {
      const result = classifyRAG('abandonmentRate', 20);
      expect(result.status).toBe('AMBER');
    });

    it('debe ser AMBER en el limite exacto de red (abandonmentRate=25)', () => {
      // abandonmentRate: red=25. value=25, NOT > 25, so AMBER
      const result = classifyRAG('abandonmentRate', 25);
      expect(result.status).toBe('AMBER');
    });
  });

  describe('KPI desconocido', () => {
    it('debe devolver AMBER para un kpiKey inexistente', () => {
      const result = classifyRAG('unknownKpi', 50);
      expect(result.status).toBe('AMBER');
    });

    it('debe devolver thresholds vacio para un kpiKey inexistente', () => {
      const result = classifyRAG('unknownKpi', 50);
      expect(result.thresholds).toEqual({});
    });
  });

  it('debe incluir thresholds green, red y target en el resultado', () => {
    const result = classifyRAG('score', 75);

    expect(result.thresholds).toEqual({
      green: 70,
      red: 50,
      target: 75
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// generateInterpretation
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — generateInterpretation', () => {
  it('debe devolver whatHappened, soWhat y nowWhat', () => {
    const result = generateInterpretation('score', 75);

    expect(result).toHaveProperty('whatHappened');
    expect(result).toHaveProperty('soWhat');
    expect(result).toHaveProperty('nowWhat');
  });

  it('debe usar "El alumno" como nombre por defecto', () => {
    const result = generateInterpretation('score', 75);

    expect(result.whatHappened).toContain('El alumno');
  });

  it('debe usar studentName del contexto cuando se proporciona', () => {
    const result = generateInterpretation('score', 75, { studentName: 'Maria' });

    expect(result.whatHappened).toContain('Maria');
  });

  it('debe redondear el valor a 1 decimal', () => {
    const result = generateInterpretation('score', 75.456);

    // 75.456 -> 75.5
    expect(result.whatHappened).toContain('75.5');
  });

  it('debe generar interpretacion distinta para GREEN y RED del mismo KPI', () => {
    const greenResult = generateInterpretation('score', 90);
    const redResult = generateInterpretation('score', 30);

    expect(greenResult.soWhat).not.toBe(redResult.soWhat);
    expect(greenResult.nowWhat).not.toBe(redResult.nowWhat);
  });

  it('debe devolver fallback para KPI desconocido', () => {
    const result = generateInterpretation('unknownKpi', 42);

    expect(result.whatHappened).toContain('42');
    expect(result.soWhat).toBe('');
    expect(result.nowWhat).toBe('');
  });

  it('debe generar interpretacion para accuracy GREEN', () => {
    const result = generateInterpretation('accuracy', 80);

    expect(result.whatHappened).toContain('80');
    expect(result.soWhat).toBeTruthy();
    expect(result.nowWhat).toBeTruthy();
  });

  it('debe generar interpretacion para responseTime (convierte ms a s)', () => {
    const result = generateInterpretation('responseTime', 3000);

    // 3000ms = 3 segundos
    expect(result.whatHappened).toContain('3');
    expect(result.whatHappened.toLowerCase()).toContain('segundo');
  });

  it('debe generar interpretacion para abandonmentRate RED', () => {
    const result = generateInterpretation('abandonmentRate', 30);

    expect(result.soWhat.toLowerCase()).toContain('abandono');
  });
});

// ══════════════════════════════════════════════════════════════════════
// enrichMetric
// ══════════════════════════════════════════════════════════════════════

describe('analyticsHelpers — enrichMetric', () => {
  it('debe devolver value, rag, interpretation y kpiMeta', () => {
    const result = enrichMetric('score', 75);

    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('rag');
    expect(result).toHaveProperty('interpretation');
    expect(result).toHaveProperty('kpiMeta');
  });

  it('debe redondear value a 1 decimal', () => {
    const result = enrichMetric('score', 75.456);

    expect(result.value).toBeCloseTo(75.5, 1);
  });

  it('rag debe contener status y thresholds', () => {
    const result = enrichMetric('score', 75);

    expect(result.rag).toHaveProperty('status');
    expect(result.rag).toHaveProperty('thresholds');
    expect(result.rag.status).toBe('GREEN');
  });

  it('interpretation debe tener whatHappened, soWhat y nowWhat', () => {
    const result = enrichMetric('score', 75);

    expect(result.interpretation).toHaveProperty('whatHappened');
    expect(result.interpretation).toHaveProperty('soWhat');
    expect(result.interpretation).toHaveProperty('nowWhat');
  });

  it('kpiMeta debe tener name, unit, target y formula para KPI conocido', () => {
    const result = enrichMetric('score', 75);

    expect(result.kpiMeta).toHaveProperty('name');
    expect(result.kpiMeta).toHaveProperty('unit');
    expect(result.kpiMeta).toHaveProperty('target');
    expect(result.kpiMeta).toHaveProperty('formula');
  });

  it('kpiMeta debe ser null para KPI desconocido', () => {
    const result = enrichMetric('unknownKpi', 50);

    expect(result.kpiMeta).toBeNull();
  });

  it('debe pasar el contexto a generateInterpretation', () => {
    const result = enrichMetric('score', 75, { studentName: 'Carlos' });

    expect(result.interpretation.whatHappened).toContain('Carlos');
  });

  it('debe manejar value no numerico sin romper', () => {
    const result = enrichMetric('score', 'abc');

    expect(result.value).toBe('abc');
  });
});
