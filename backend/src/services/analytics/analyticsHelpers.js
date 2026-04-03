/**
 * @fileoverview Utilidades compartidas para los sub-servicios de analytics avanzados.
 * Proporciona constantes, funciones de clasificación y helpers de fechas
 * reutilizados por todos los sub-servicios de analytics/.
 *
 * NOTA: Las funciones idénticas (PERFORMANCE_TIERS, classifyTier, calcAccuracyRate)
 * también existen en analyticsService.js (servicio original). No se refactorizan
 * allí para mantener zero regresión — ver ADR-026.
 *
 * @module services/analytics/analyticsHelpers
 */

const mongoose = require('mongoose');

// ══════════════════════════════════════════════════════════════════════
// Constantes de clasificación
// ══════════════════════════════════════════════════════════════════════

/**
 * Rangos de rendimiento para clasificación de estudiantes.
 * Coinciden con los definidos en analyticsService.js (ADR-017).
 */
const PERFORMANCE_TIERS = [
  { tier: 'risk', label: 'Riesgo (0-49)', min: 0, max: 49 },
  { tier: 'average', label: 'Promedio (50-69)', min: 50, max: 69 },
  { tier: 'good', label: 'Bueno (70-89)', min: 70, max: 89 },
  { tier: 'excellent', label: 'Excelente (90-100)', min: 90, max: 100 }
];

/**
 * Tipos de alerta soportados con su configuración por defecto.
 */
const ALERT_TYPES = {
  declining_performance: {
    label: 'Rendimiento en descenso',
    thresholds: { warning: 10, critical: 20 }
  },
  inactivity: {
    label: 'Inactividad',
    thresholds: { info: 7, warning: 14 }
  },
  sudden_score_drop: {
    label: 'Caída repentina de puntuación',
    thresholds: { warning: 30 }
  },
  consistent_timeout: {
    label: 'Timeouts consistentes',
    thresholds: { warning: 0.3 }
  },
  improving_fast: {
    label: 'Mejora rápida',
    thresholds: { info: 15 }
  },
  plateau_detected: {
    label: 'Estancamiento detectado',
    thresholds: { info: 5 }
  },
  high_abandonment: {
    label: 'Alto abandono',
    thresholds: { warning: 0.25 }
  }
};

/**
 * Severidades de alertas, ordenadas de mayor a menor urgencia.
 */
const ALERT_SEVERITIES = ['critical', 'warning', 'info'];

// ══════════════════════════════════════════════════════════════════════
// Funciones de clasificación
// ══════════════════════════════════════════════════════════════════════

/**
 * Clasifica un score en un tier de rendimiento.
 *
 * @param {number|null|undefined} score - Score promedio del estudiante (0-100)
 * @returns {string} Tier: 'risk', 'average', 'good', 'excellent'
 */
const classifyTier = score => {
  if (score === null || score === undefined || score < 0) {
    return 'risk';
  }
  const found = PERFORMANCE_TIERS.find(t => score >= t.min && score <= t.max);
  return found ? found.tier : 'risk';
};

/**
 * Calcula la tasa de precisión (accuracy rate) como porcentaje.
 *
 * @param {number} correct - Respuestas correctas
 * @param {number} errors - Respuestas incorrectas
 * @returns {number} Porcentaje de precisión (0-100, un decimal)
 */
const calcAccuracyRate = (correct, errors) => {
  const total = (correct || 0) + (errors || 0);
  if (total === 0) {
    return 0;
  }
  return Math.round(((correct || 0) / total) * 100 * 10) / 10;
};

// ══════════════════════════════════════════════════════════════════════
// Helpers de fechas y rangos temporales
// ══════════════════════════════════════════════════════════════════════

/**
 * Calcula la fecha de inicio según un rango temporal.
 *
 * @param {string} timeRange - '7d', '30d' o '90d'
 * @param {Date} [from=new Date()] - Fecha base (por defecto, ahora)
 * @returns {Date} Fecha de inicio del rango
 */
const getStartDate = (timeRange, from = new Date()) => {
  const start = new Date(from);
  const days = { '7d': 7, '30d': 30, '90d': 90 };
  start.setDate(start.getDate() - (days[timeRange] || 30));
  return start;
};

/**
 * Calcula ambas fechas (inicio del periodo actual e inicio del periodo anterior)
 * para comparaciones período-sobre-período.
 *
 * @param {string} timeRange - '7d', '30d' o '90d'
 * @returns {{ currentStart: Date, previousStart: Date, now: Date }}
 */
const getPeriodDates = timeRange => {
  const now = new Date();
  const days = { '7d': 7, '30d': 30, '90d': 90 };
  const d = days[timeRange] || 30;

  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - d);

  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - d);

  return { currentStart, previousStart, now };
};

/**
 * Devuelve el inicio del día actual (00:00:00.000).
 * @returns {Date}
 */
const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ══════════════════════════════════════════════════════════════════════
// Helpers de agregación
// ══════════════════════════════════════════════════════════════════════

/**
 * Crea un ObjectId de Mongoose a partir de un string.
 * Wrapper para evitar repetir `new mongoose.Types.ObjectId(...)`.
 *
 * @param {string} id - ID como string
 * @returns {mongoose.Types.ObjectId}
 */
const toObjectId = id => new mongoose.Types.ObjectId(id);

/**
 * Pipeline stages comunes para filtrar GamePlays por sesiones de un profesor.
 * Hace $lookup a game_sessions y filtra por createdBy.
 *
 * @param {string} teacherId - ID del profesor
 * @returns {Array} Stages de pipeline ($lookup + $unwind + $match)
 */
const teacherSessionStages = teacherId => [
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
      'session.createdBy': toObjectId(teacherId)
    }
  }
];

/**
 * Calcula la pendiente (slope) de una regresión lineal simple.
 * Útil para determinar tendencias en series temporales.
 *
 * @param {Array<{x: number, y: number}>} points - Puntos de datos
 * @returns {{ slope: number, intercept: number }}
 */
const linearRegression = points => {
  const n = points.length;
  if (n < 2) {
    return { slope: 0, intercept: points[0]?.y || 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

/**
 * Determina la dirección de tendencia basándose en el slope y número de puntos.
 *
 * @param {number} slope - Pendiente de la regresión lineal
 * @param {number} numPoints - Número de puntos de datos
 * @returns {{ direction: string, confidence: string }}
 */
const classifyTrend = (slope, numPoints) => {
  let direction;
  if (slope > 0.5) {
    direction = 'improving';
  } else if (slope < -0.5) {
    direction = 'declining';
  } else {
    direction = 'stable';
  }

  let confidence;
  if (numPoints >= 7 && Math.abs(slope) > 1.0) {
    confidence = 'high';
  } else if (numPoints >= 4 || Math.abs(slope) > 0.5) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { direction, confidence };
};

/**
 * Genera un ID estable para una alerta basándose en tipo, estudiante y fecha.
 * Permite al frontend trackear alertas como leídas/no leídas sin persistencia server-side.
 *
 * @param {string} type - Tipo de alerta
 * @param {string} studentId - ID del estudiante
 * @param {string} [dateStr] - Fecha opcional (por defecto, hoy)
 * @returns {string} ID hash estable
 */
const generateAlertId = (type, studentId, dateStr) => {
  const date = dateStr || new Date().toISOString().split('T')[0];
  // Hash simple basado en string para generar ID determinista
  const raw = `${type}:${studentId}:${date}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `alert_${Math.abs(hash).toString(36)}`;
};

// ══════════════════════════════════════════════════════════════════════
// Framework KPI: umbrales RAG y generación de interpretaciones
// Basado en Business Intelligence skill — ver Analytics_Design_Rationale.md
// ══════════════════════════════════════════════════════════════════════

/**
 * Estados RAG (Red/Amber/Green) para indicadores.
 * Cada KPI se clasifica en uno de estos estados.
 */
const RAG = { RED: 'RED', AMBER: 'AMBER', GREEN: 'GREEN' };

/**
 * Definiciones de KPI con umbrales RAG.
 * Cada métrica define: nombre, unidad, dirección deseada, y umbrales.
 *
 * `direction`: 'higher_better' o 'lower_better'
 * Los umbrales `green` y `red` definen los límites:
 *   - higher_better: >= green → GREEN, < red → RED, entre ambos → AMBER
 *   - lower_better:  <= green → GREEN, > red → RED, entre ambos → AMBER
 */
const KPI_DEFINITIONS = {
  score: {
    name: 'Puntuación media',
    unit: 'puntos',
    direction: 'higher_better',
    green: 70,
    red: 50,
    target: 75,
    formula: 'AVG(GamePlay.score) para partidas completadas'
  },
  accuracy: {
    name: 'Tasa de acierto',
    unit: '%',
    direction: 'higher_better',
    green: 75,
    red: 50,
    target: 80,
    formula: 'correctAttempts / (correctAttempts + errorAttempts) * 100'
  },
  engagementScore: {
    name: 'Puntuación de engagement',
    unit: 'puntos',
    direction: 'higher_better',
    green: 60,
    red: 35,
    target: 70,
    formula:
      'Media ponderada: frecuencia(0.25) + regularidad(0.25) + completado(0.30) + intervalo(0.10) + replays(0.10)'
  },
  completionRate: {
    name: 'Tasa de finalización',
    unit: '%',
    direction: 'higher_better',
    green: 85,
    red: 60,
    target: 90,
    formula: 'completedGames / totalGames * 100'
  },
  abandonmentRate: {
    name: 'Tasa de abandono',
    unit: '%',
    direction: 'lower_better',
    green: 10,
    red: 25,
    target: 5,
    formula: 'abandonedGames / totalGames * 100'
  },
  responseTime: {
    name: 'Tiempo medio de respuesta',
    unit: 'ms',
    direction: 'lower_better',
    green: 4000,
    red: 8000,
    target: 3000,
    formula: 'AVG(events.timeElapsed) excluyendo timeouts'
  },
  fatigueSlowdown: {
    name: 'Desaceleración por fatiga',
    unit: '%',
    direction: 'lower_better',
    green: 15,
    red: 40,
    target: 10,
    formula: '((avgTimeSecondHalf - avgTimeFirstHalf) / avgTimeFirstHalf) * 100'
  },
  cardErrorRate: {
    name: 'Tasa de error de tarjeta',
    unit: '%',
    direction: 'lower_better',
    green: 30,
    red: 60,
    target: 20,
    formula: '(errorCount + timeoutCount) / totalAttempts * 100'
  },
  learningRate: {
    name: 'Tasa de aprendizaje',
    unit: 'puntos/intento',
    direction: 'higher_better',
    green: 2,
    red: 0,
    target: 3,
    formula: 'Pendiente de regresión lineal de scores sobre intentos'
  },
  trendSlope: {
    name: 'Tendencia de rendimiento',
    unit: 'puntos/periodo',
    direction: 'higher_better',
    green: 0.5,
    red: -0.5,
    target: 1.0,
    formula: 'Pendiente de regresión lineal de scores sobre periodos temporales'
  }
};

/**
 * Clasifica un valor en estado RAG según la definición de su KPI.
 *
 * @param {string} kpiKey - Clave del KPI en KPI_DEFINITIONS
 * @param {number} value - Valor actual de la métrica
 * @returns {{ status: string, thresholds: Object }} Estado RAG y umbrales usados
 */
const classifyRAG = (kpiKey, value) => {
  const def = KPI_DEFINITIONS[kpiKey];
  if (!def) {
    return { status: RAG.AMBER, thresholds: {} };
  }

  let status;
  if (def.direction === 'higher_better') {
    if (value >= def.green) {
      status = RAG.GREEN;
    } else if (value < def.red) {
      status = RAG.RED;
    } else {
      status = RAG.AMBER;
    }
  } else {
    if (value <= def.green) {
      status = RAG.GREEN;
    } else if (value > def.red) {
      status = RAG.RED;
    } else {
      status = RAG.AMBER;
    }
  }

  return {
    status,
    thresholds: { green: def.green, red: def.red, target: def.target }
  };
};

/**
 * Genera una interpretación en lenguaje natural para una métrica.
 * Sigue el patrón What / So What / Now What del framework de BI.
 * Mensajes en español para los profesores.
 *
 * @param {string} kpiKey - Clave del KPI
 * @param {number} value - Valor actual
 * @param {Object} [context] - Contexto adicional (studentName, etc.)
 * @returns {{ whatHappened: string, soWhat: string, nowWhat: string }}
 */
const generateInterpretation = (kpiKey, value, context = {}) => {
  const def = KPI_DEFINITIONS[kpiKey];
  if (!def) {
    return {
      whatHappened: `Valor actual: ${value}`,
      soWhat: '',
      nowWhat: ''
    };
  }

  const { status } = classifyRAG(kpiKey, value);
  const name = context.studentName || 'El alumno';
  const rounded = typeof value === 'number' ? Math.round(value * 10) / 10 : value;

  const interpretations = {
    score: {
      [RAG.GREEN]: {
        whatHappened: `${name} tiene una puntuación media de ${rounded} puntos`,
        soWhat: 'El rendimiento está en un nivel bueno o excelente',
        nowWhat: 'Mantener el nivel actual y considerar retos más desafiantes'
      },
      [RAG.AMBER]: {
        whatHappened: `${name} tiene una puntuación media de ${rounded} puntos`,
        soWhat: 'El rendimiento está en un nivel promedio, hay margen de mejora',
        nowWhat: 'Identificar los contextos temáticos donde más falla y reforzarlos'
      },
      [RAG.RED]: {
        whatHappened: `${name} tiene una puntuación media de ${rounded} puntos`,
        soWhat: 'El rendimiento está por debajo del umbral de riesgo',
        nowWhat: 'Intervención recomendada: sesiones de refuerzo o revisión del material'
      }
    },
    accuracy: {
      [RAG.GREEN]: {
        whatHappened: `Tasa de acierto del ${rounded}%`,
        soWhat: 'El alumno comprende bien el material',
        nowWhat: 'Mantener y avanzar a contenido más complejo'
      },
      [RAG.AMBER]: {
        whatHappened: `Tasa de acierto del ${rounded}%`,
        soWhat: 'Acierta más de la mitad pero comete errores frecuentes',
        nowWhat: 'Revisar qué tarjetas o conceptos causan más fallos'
      },
      [RAG.RED]: {
        whatHappened: `Tasa de acierto del ${rounded}%`,
        soWhat: 'Falla más de lo que acierta, posible confusión con el material',
        nowWhat: 'Simplificar el contenido o proporcionar apoyo adicional'
      }
    },
    engagementScore: {
      [RAG.GREEN]: {
        whatHappened: `Engagement de ${rounded} sobre 100`,
        soWhat: 'El alumno participa activamente y con regularidad',
        nowWhat: 'El nivel de participación es saludable, mantener la dinámica actual'
      },
      [RAG.AMBER]: {
        whatHappened: `Engagement de ${rounded} sobre 100`,
        soWhat: 'La participación es moderada pero podría mejorar',
        nowWhat: 'Considerar variar los contextos o mecánicas para aumentar la motivación'
      },
      [RAG.RED]: {
        whatHappened: `Engagement de ${rounded} sobre 100`,
        soWhat: 'El alumno muestra baja participación o interés',
        nowWhat:
          'Investigar posibles causas: contenido inadecuado, sesiones largas o dificultad excesiva'
      }
    },
    completionRate: {
      [RAG.GREEN]: {
        whatHappened: `Completa el ${rounded}% de las partidas`,
        soWhat: 'Termina casi todas las sesiones que empieza',
        nowWhat: 'Buena señal de perseverancia, mantener la configuración actual'
      },
      [RAG.AMBER]: {
        whatHappened: `Completa el ${rounded}% de las partidas`,
        soWhat: 'Abandona algunas partidas antes de terminar',
        nowWhat: 'Verificar si las sesiones son demasiado largas o difíciles'
      },
      [RAG.RED]: {
        whatHappened: `Solo completa el ${rounded}% de las partidas`,
        soWhat: 'Abandona con frecuencia, posible frustración o desinterés',
        nowWhat: 'Reducir la duración de las sesiones y revisar la dificultad del contenido'
      }
    },
    abandonmentRate: {
      [RAG.GREEN]: {
        whatHappened: `Tasa de abandono del ${rounded}%`,
        soWhat: 'El abandono está dentro de niveles normales',
        nowWhat: 'No se requiere acción'
      },
      [RAG.AMBER]: {
        whatHappened: `Tasa de abandono del ${rounded}%`,
        soWhat: 'El abandono está por encima de lo ideal',
        nowWhat: 'Revisar qué sesiones generan más abandonos y ajustar su configuración'
      },
      [RAG.RED]: {
        whatHappened: `Tasa de abandono del ${rounded}%`,
        soWhat: 'Nivel de abandono alto, indica un problema sistemático',
        nowWhat:
          'Acción urgente: acortar sesiones, simplificar contenido o verificar problemas técnicos'
      }
    },
    responseTime: {
      [RAG.GREEN]: {
        whatHappened: `Tiempo medio de respuesta de ${Math.round((rounded / 1000) * 10) / 10} segundos`,
        soWhat: 'Responde con rapidez, buena comprensión del material',
        nowWhat: 'El ritmo es adecuado para su edad'
      },
      [RAG.AMBER]: {
        whatHappened: `Tiempo medio de respuesta de ${Math.round((rounded / 1000) * 10) / 10} segundos`,
        soWhat: 'Tarda un poco más de lo esperado en responder',
        nowWhat: 'Puede necesitar más tiempo de familiarización con el contenido'
      },
      [RAG.RED]: {
        whatHappened: `Tiempo medio de respuesta de ${Math.round((rounded / 1000) * 10) / 10} segundos`,
        soWhat: 'Tiempos muy altos, posible confusión o distracción',
        nowWhat: 'Considerar aumentar el tiempo límite o simplificar las opciones'
      }
    },
    fatigueSlowdown: {
      [RAG.GREEN]: {
        whatHappened: `Desaceleración del ${rounded}% entre primera y segunda mitad`,
        soWhat: 'No se detecta fatiga significativa',
        nowWhat: 'La duración de las sesiones es adecuada'
      },
      [RAG.AMBER]: {
        whatHappened: `Desaceleración del ${rounded}% entre primera y segunda mitad`,
        soWhat: 'Se detecta fatiga moderada hacia el final de la partida',
        nowWhat: 'Considerar reducir el número de rondas por sesión'
      },
      [RAG.RED]: {
        whatHappened: `Desaceleración del ${rounded}% entre primera y segunda mitad`,
        soWhat: 'Fatiga significativa: el alumno se ralentiza mucho al final',
        nowWhat: 'Reducir la duración de las sesiones o añadir descansos'
      }
    },
    cardErrorRate: {
      [RAG.GREEN]: {
        whatHappened: `Tasa de error del ${rounded}% en esta tarjeta`,
        soWhat: 'La mayoría de los alumnos aciertan esta tarjeta',
        nowWhat: 'El contenido de esta tarjeta es adecuado'
      },
      [RAG.AMBER]: {
        whatHappened: `Tasa de error del ${rounded}% en esta tarjeta`,
        soWhat: 'Algunos alumnos tienen dificultades con esta tarjeta',
        nowWhat: 'Monitorizar; si persiste, revisar el contenido asociado'
      },
      [RAG.RED]: {
        whatHappened: `Tasa de error del ${rounded}% en esta tarjeta`,
        soWhat: 'La mayoría de los alumnos fallan esta tarjeta',
        nowWhat: 'Revisar el contenido: el problema es el material, no los alumnos'
      }
    },
    learningRate: {
      [RAG.GREEN]: {
        whatHappened: `Tasa de aprendizaje de ${rounded} puntos por intento`,
        soWhat: 'Los alumnos mejoran con la repetición de este contenido',
        nowWhat: 'El contenido es efectivo para el aprendizaje'
      },
      [RAG.AMBER]: {
        whatHappened: `Tasa de aprendizaje de ${rounded} puntos por intento`,
        soWhat: 'La mejora con la repetición es lenta',
        nowWhat: 'Considerar enriquecer el contenido con pistas o variaciones'
      },
      [RAG.RED]: {
        whatHappened: `Tasa de aprendizaje de ${rounded} puntos por intento`,
        soWhat: 'No hay mejora con la repetición; el formato no funciona',
        nowWhat: 'Cambiar el enfoque didáctico para este contenido'
      }
    },
    trendSlope: {
      [RAG.GREEN]: {
        whatHappened: `Tendencia positiva de +${rounded} puntos por periodo`,
        soWhat: 'El alumno está mejorando de forma sostenida',
        nowWhat: 'Mantener el enfoque actual'
      },
      [RAG.AMBER]: {
        whatHappened: `Tendencia estable (${rounded > 0 ? '+' : ''}${rounded} puntos por periodo)`,
        soWhat: 'El rendimiento se mantiene sin cambios significativos',
        nowWhat: 'Considerar nuevos estímulos si lleva varias semanas estable'
      },
      [RAG.RED]: {
        whatHappened: `Tendencia negativa de ${rounded} puntos por periodo`,
        soWhat: 'El rendimiento está empeorando',
        nowWhat: 'Investigar la causa y considerar intervención'
      }
    }
  };

  const kpiInterpretations = interpretations[kpiKey];
  if (!kpiInterpretations) {
    return {
      whatHappened: `${def.name}: ${rounded} ${def.unit}`,
      soWhat: status === RAG.GREEN ? 'Dentro del rango esperado' : 'Fuera del rango óptimo',
      nowWhat: status === RAG.RED ? 'Se recomienda revisar' : 'Monitorizar'
    };
  }

  return kpiInterpretations[status] || kpiInterpretations[RAG.AMBER];
};

/**
 * Enriquece un valor numérico con estado RAG e interpretación.
 * Función de conveniencia que combina classifyRAG + generateInterpretation.
 *
 * @param {string} kpiKey - Clave del KPI
 * @param {number} value - Valor actual
 * @param {Object} [context] - Contexto adicional
 * @returns {{ value: number, rag: Object, interpretation: Object, kpiMeta: Object }}
 */
const enrichMetric = (kpiKey, value, context = {}) => {
  const def = KPI_DEFINITIONS[kpiKey];
  const { status, thresholds } = classifyRAG(kpiKey, value);
  const interpretation = generateInterpretation(kpiKey, value, context);

  return {
    value: typeof value === 'number' ? Math.round(value * 10) / 10 : value,
    rag: { status, thresholds },
    interpretation,
    kpiMeta: def
      ? { name: def.name, unit: def.unit, target: def.target, formula: def.formula }
      : null
  };
};

module.exports = {
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
};
