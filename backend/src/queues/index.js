/**
 * @fileoverview Registro central de queues BullMQ (ADR-071, PROP-62).
 *
 * BullMQ usa Redis para coordinar productores y consumidores. Compartimos la
 * misma URL Redis del cluster (`REDIS_URL`) pero con un cliente DEDICADO en
 * lugar del singleton `getRedis()` — BullMQ requiere `maxRetriesPerRequest:
 * null` y modo `enableReadyCheck: false`, conflictivos con el cliente de
 * cache/lock distribuido.
 *
 * Las queues registradas hoy:
 *   - `data-retention` (ACTIVA) — programada cada noche, ejecuta el ciclo
 *     RGPD (anonimizar GamePlays >12m, borrar estudiantes inactivos >24m).
 *   - `gdpr-exports` (SCAFFOLD) — vacía. Pendiente de implementar generación
 *     de ZIP + signed URL Supabase + email (sin email backend hoy).
 *   - `notifications` (SCAFFOLD) — vacía. Para futuros notification jobs.
 *
 * @module queues
 */

const { Queue } = require('bullmq');
const logger = require('../utils/logger').child({ component: 'queues' });

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY_PREFIX = process.env.REDIS_KEY_PREFIX || 'rfid-games:';

/** Conexión Redis dedicada para BullMQ. No reutilizar getRedis() — requiere flags distintos. */
const buildBullConnection = () => {
  const url = new URL(REDIS_URL);
  // Mismo motivo que en config/redis.js: con esquema `rediss://` (Upstash) hay
  // que propagar `tls` explícitamente o el handshake falla / el tráfico va en claro.
  const useTls = url.protocol === 'rediss:';
  return {
    host: url.hostname || 'localhost',
    port: Number.parseInt(url.port, 10) || 6379,
    password: url.password || process.env.REDIS_PASSWORD || undefined,
    db: Number.parseInt(process.env.REDIS_DB, 10) || 0,
    ...(useTls ? { tls: { servername: url.hostname } } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  };
};

const connection = buildBullConnection();

/** Opciones por defecto: limpiar jobs viejos para evitar crecimiento ilimitado de Redis. */
const defaultJobOptions = {
  removeOnComplete: { age: 86400, count: 1000 }, // 24h o 1000 jobs
  removeOnFail: { age: 604800, count: 5000 } // 7d o 5000 jobs
};

const QUEUE_NAMES = Object.freeze({
  DATA_RETENTION: 'data-retention',
  GDPR_EXPORTS: 'gdpr-exports',
  NOTIFICATIONS: 'notifications',
  ALERT_DETECTION: 'alert-detection',
  SYSTEM_ALERT_DETECTION: 'system-alert-detection',
  // T-931 (pre-v1.0.0) — reconciliación nocturna materialización Redis
  // (ZSET leaderboards + Hash studentMetrics). Cron 00:30 horario servidor.
  ANALYTICS_RECONCILE: 'analytics-reconcile'
});

const dataRetentionQueue = new Queue(QUEUE_NAMES.DATA_RETENTION, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const gdprExportsQueue = new Queue(QUEUE_NAMES.GDPR_EXPORTS, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const alertDetectionQueue = new Queue(QUEUE_NAMES.ALERT_DETECTION, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const systemAlertDetectionQueue = new Queue(QUEUE_NAMES.SYSTEM_ALERT_DETECTION, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const analyticsReconcileQueue = new Queue(QUEUE_NAMES.ANALYTICS_RECONCILE, {
  connection,
  prefix: `${KEY_PREFIX}bull`,
  defaultJobOptions
});

const allQueues = [
  dataRetentionQueue,
  gdprExportsQueue,
  notificationsQueue,
  alertDetectionQueue,
  systemAlertDetectionQueue,
  analyticsReconcileQueue
];

/**
 * Programa el cron diario de retención de datos. Idempotente: usar siempre el
 * mismo `jobId` evita duplicados aunque el backend reinicie.
 *
 * Patrón: cada noche a las 03:00 (zona del servidor).
 *
 * T-907 INT4 (sharding): si `DATA_RETENTION_SHARDS > 1`, se encolan N jobs
 * `daily-retention-shard-{i}-cron` que procesan rangos temporales disjuntos
 * en paralelo. El rango total cubierto es el mismo que con N=1, dividido en
 * N ventanas iguales desde el inicio del proyecto (fija: 2024-01-01) hasta
 * el cutoff por defecto del service. Útil cuando el job único tarda >30 min
 * en producción y queremos repartirlo entre varios workers con `concurrency`
 * subido (el worker se queda con concurrency 1 por defecto; activar via env
 * `DATA_RETENTION_WORKER_CONCURRENCY`).
 *
 * @returns {Promise<void>}
 */
const SHARDING_EPOCH = new Date('2024-01-01T00:00:00.000Z');

const buildShardWindows = shardCount => {
  if (shardCount <= 1) {
    return [{ shardIndex: 0, shardCount: 1, windowStart: null, windowEnd: null }];
  }
  const now = Date.now();
  const startMs = SHARDING_EPOCH.getTime();
  const sliceMs = Math.floor((now - startMs) / shardCount);
  return Array.from({ length: shardCount }, (_, i) => ({
    shardIndex: i,
    shardCount,
    windowStart: new Date(startMs + i * sliceMs),
    windowEnd: i === shardCount - 1 ? null : new Date(startMs + (i + 1) * sliceMs)
  }));
};

const scheduleDataRetentionCron = async () => {
  const shardCount = Math.max(1, Number.parseInt(process.env.DATA_RETENTION_SHARDS, 10) || 1);

  try {
    if (shardCount === 1) {
      // Path original — mismo jobId y semántica que antes.
      await dataRetentionQueue.add(
        'daily-retention',
        { triggeredAt: new Date().toISOString() },
        {
          jobId: 'daily-retention-cron',
          repeat: { pattern: '0 3 * * *' }
        }
      );
      logger.info('queues: cron diario de retención programado (03:00)');
      return;
    }

    const windows = buildShardWindows(shardCount);
    for (const win of windows) {
      await dataRetentionQueue.add(
        'daily-retention',
        {
          triggeredAt: new Date().toISOString(),
          shardIndex: win.shardIndex,
          shardCount: win.shardCount,
          windowStart: win.windowStart?.toISOString() || null,
          windowEnd: win.windowEnd?.toISOString() || null
        },
        {
          jobId: `daily-retention-shard-${win.shardIndex}-cron`,
          repeat: { pattern: '0 3 * * *' }
        }
      );
    }
    logger.info('queues: cron diario de retención programado con sharding', {
      shardCount,
      windowsCount: windows.length
    });
  } catch (err) {
    logger.warn('queues: no se pudo programar el cron de retención', {
      error: err.message,
      shardCount
    });
  }
};

/**
 * Programa el cron del detector de alertas (T-941).
 *
 * Patrón por defecto: cada 15 minutos (env `ALERT_DETECTION_CRON`).
 * Idempotente — el `jobId` fijo evita duplicados ante reinicios del backend.
 *
 * @returns {Promise<void>}
 */
const scheduleAlertDetectionCron = async () => {
  // Cargamos config justo aquí para no introducir dependencia circular si el
  // arranque carga queues antes de los services.
  const { DETECTION_CONFIG } = require('../config/alerts');
  try {
    await alertDetectionQueue.add(
      'periodic-alert-detection',
      { triggeredAt: new Date().toISOString() },
      {
        jobId: 'alert-detection-cron',
        repeat: { pattern: DETECTION_CONFIG.cronPattern }
      }
    );
    logger.info('queues: cron de detección de alertas programado', {
      pattern: DETECTION_CONFIG.cronPattern
    });
  } catch (err) {
    logger.warn('queues: no se pudo programar el cron de alertas', {
      error: err.message
    });
  }
};

/**
 * Programa el cron del detector de alertas de sistema (T-942).
 *
 * Patrón por defecto: cada 5 minutos (env `SYSTEM_ALERT_DETECTION_CRON`).
 * Más frecuente que el de teacher porque las señales operacionales (Redis
 * lento, memoria al límite) necesitan respuesta más rápida.
 *
 * @returns {Promise<void>}
 */
const scheduleSystemAlertDetectionCron = async () => {
  const { SYSTEM_DETECTION_CONFIG } = require('../config/systemAlerts');
  try {
    await systemAlertDetectionQueue.add(
      'periodic-system-alert-detection',
      { triggeredAt: new Date().toISOString() },
      {
        jobId: 'system-alert-detection-cron',
        repeat: { pattern: SYSTEM_DETECTION_CONFIG.cronPattern }
      }
    );
    logger.info('queues: cron de detección de system-alerts programado', {
      pattern: SYSTEM_DETECTION_CONFIG.cronPattern
    });
  } catch (err) {
    logger.warn('queues: no se pudo programar el cron de system-alerts', {
      error: err.message
    });
  }
};

/**
 * Programa el cron del reconciliador nocturno T-931 (pre-v1.0.0).
 *
 * Patrón: cada noche a las 00:30 (horario servidor). Recalcula
 * leaderboards ZSET + studentMetrics Hash desde Mongo y reporta drift.
 *
 * @returns {Promise<void>}
 */
const scheduleAnalyticsReconcileCron = async () => {
  try {
    await analyticsReconcileQueue.add(
      'nightly-analytics-reconcile',
      { triggeredAt: new Date().toISOString() },
      {
        jobId: 'analytics-reconcile-cron',
        repeat: { pattern: process.env.ANALYTICS_RECONCILE_CRON || '30 0 * * *' }
      }
    );
    logger.info('queues: cron de reconciliación analytics programado (00:30)');
  } catch (err) {
    logger.warn('queues: no se pudo programar el cron de reconciliación analytics', {
      error: err.message
    });
  }
};

/**
 * Cierra todas las queues. Llamado en gracefulShutdown.
 *
 * @returns {Promise<void>}
 */
const closeAllQueues = async () => {
  for (const queue of allQueues) {
    try {
      await queue.close();
    } catch (err) {
      logger.warn('queues: error al cerrar queue', { name: queue.name, error: err.message });
    }
  }
};

module.exports = {
  QUEUE_NAMES,
  connection,
  defaultJobOptions,
  dataRetentionQueue,
  gdprExportsQueue,
  notificationsQueue,
  alertDetectionQueue,
  systemAlertDetectionQueue,
  analyticsReconcileQueue,
  scheduleDataRetentionCron,
  scheduleAlertDetectionCron,
  scheduleSystemAlertDetectionCron,
  scheduleAnalyticsReconcileCron,
  closeAllQueues
};
