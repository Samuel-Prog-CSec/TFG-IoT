/**
 * @fileoverview Backfill histórico de SmartAlerts (T-941).
 *
 * Ejecuta el detector en 4 pasadas con `referenceDate` retrocedido (90 / 60 /
 * 30 / ahora) para reconstruir un historial verosímil tras la migración a
 * persistencia. Es idempotente: el unique partial index
 * `(studentId, type, status='active')` impide duplicados; las pasadas
 * antiguas pueden generar alertas que luego las pasadas más recientes
 * resuelven o reescalan según el patrón real del alumno.
 *
 * Uso:
 *   node scripts/migrate-alerts-backfill.js
 *   node scripts/migrate-alerts-backfill.js --dry-run
 *   node scripts/migrate-alerts-backfill.js --teacher-id=64f...
 *   node scripts/migrate-alerts-backfill.js --passes=2
 *
 * @module scripts/migrate-alerts-backfill
 */

const mongoose = require('mongoose');
const pino = require('pino');
const alertDetectionService = require('../src/services/analytics/alertDetectionService');
const userRepository = require('../src/repositories/userRepository');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rfid_games';

// eslint-disable-next-line sonarjs/process-argv -- script CLI de dev: lee flags --dry-run/--teacher-id/--passes de argv
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const teacherArg = args.find(a => a.startsWith('--teacher-id='));
const passesArg = args.find(a => a.startsWith('--passes='));
const TEACHER_ID = teacherArg ? teacherArg.split('=')[1] : null;
const PASSES = passesArg ? Number.parseInt(passesArg.split('=')[1], 10) : 4;

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' }
  }
});

// 4 pasadas por defecto: hace 90 / 60 / 30 / hoy
const buildReferenceDates = passes => {
  const dates = [];
  const stepDays = Math.floor(90 / Math.max(1, passes - 1)) || 30;
  for (let i = passes - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i * stepDays);
    dates.push(date);
  }
  return dates;
};

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info(`Conectado a MongoDB: ${mongoose.connection.host}`);

    if (DRY_RUN) {
      logger.warn('=== MODO DRY-RUN: no se realizarán cambios ===');
    }

    const referenceDates = buildReferenceDates(PASSES);
    logger.info(
      `Pasadas programadas: ${referenceDates.map(d => d.toISOString().split('T')[0]).join(' → ')}`
    );

    // Resolver lista de teachers
    let teachers;
    if (TEACHER_ID) {
      teachers = [{ _id: TEACHER_ID }];
    } else {
      teachers = await userRepository.find(
        { role: 'teacher', status: 'active' },
        { select: '_id', lean: true }
      );
    }
    logger.info(`Profesores a procesar: ${teachers.length}`);

    const grandTotals = {
      created: 0,
      updated: 0,
      autoResolved: 0,
      escalated: 0,
      reopened: 0
    };

    for (const refDate of referenceDates) {
      logger.info(`--- Pasada con referenceDate=${refDate.toISOString()} ---`);
      for (const t of teachers) {
        const tid = String(t._id);
        try {
          const result = await alertDetectionService.runForTeacher(tid, {
            referenceDate: refDate,
            dryRun: DRY_RUN
          });
          grandTotals.created += result.created || 0;
          grandTotals.updated += result.updated || 0;
          grandTotals.autoResolved += result.autoResolved || 0;
          grandTotals.escalated += result.escalated || 0;
          grandTotals.reopened += result.reopened || 0;
          logger.debug({ teacherId: tid, result }, 'teacher procesado');
        } catch (err) {
          logger.error({ err, teacherId: tid }, 'fallo en teacher');
        }
      }
    }

    logger.info('=== BACKFILL COMPLETADO ===');
    logger.info(grandTotals);
  } catch (error) {
    logger.error({ err: error }, 'Error durante el backfill de alertas');
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    logger.info('Conexión a MongoDB cerrada');
  }
})();
