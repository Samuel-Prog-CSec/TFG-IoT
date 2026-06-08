/**
 * @fileoverview Migración one-shot: recalcula `studentMetrics.averageScore` de
 * cada alumno como PORCENTAJE real (media de `score / maxScore × 100` sobre sus
 * partidas completadas), en lugar de la media de puntos crudos que se guardaba
 * antes. El score crudo no es comparable entre mecánicas con distinto techo
 * (Asociación 50-90, Memoria 90, Secuencia 210-420), así que mostrarlo como "%"
 * y clasificarlo con umbrales 0-100 distorsionaba el rendimiento real.
 *
 * NO toca `totalScore` ni `bestScore` (siguen en puntos crudos: alimentan
 * "Mejor: N pts" y el histórico). Idempotente: recalcula desde el origen.
 *
 * Debe ejecutarse junto con el deploy del cambio en `User.updateStudentMetrics`
 * (que ya mantiene la media como % de forma incremental para nuevas partidas).
 *
 * Uso:
 *   npm run migrate:score-percent             # aplica cambios
 *   npm run migrate:score-percent -- --dry-run  # solo reporta
 */

const dotenv = require('dotenv');
const { connectDB, disconnectDB } = require('../src/config/database');
const User = require('../src/models/User');
const GamePlay = require('../src/models/GamePlay');
const logger = require('../src/utils/logger');

dotenv.config();

// Script de administrador ejecutado manualmente; process.argv es seguro aqui.
// eslint-disable-next-line sonarjs/process-argv
const isDryRun = process.argv.includes('--dry-run');

const migrate = async () => {
  try {
    await connectDB();
    logger.info(`[migrate-score-percent] Iniciando (${isDryRun ? 'DRY-RUN' : 'aplicar cambios'})`);

    // Media del porcentaje por partida (score/maxScore×100) agrupada por alumno.
    const rows = await GamePlay.aggregate([
      { $match: { status: 'completed', maxScore: { $gt: 0 } } },
      {
        $group: {
          _id: '$playerId',
          avgPercent: {
            $avg: { $multiply: [{ $divide: ['$score', '$maxScore'] }, 100] }
          },
          games: { $sum: 1 }
        }
      }
    ]);

    const ops = rows.map(r => ({
      updateOne: {
        filter: { _id: r._id, role: 'student' },
        update: { $set: { 'studentMetrics.averageScore': Math.round(r.avgPercent * 100) / 100 } }
      }
    }));

    const summary = { studentsWithPlays: rows.length, pendingOps: ops.length };

    if (isDryRun) {
      const sample = rows.slice(0, 5).map(r => ({
        playerId: r._id.toString(),
        games: r.games,
        newAverageScorePercent: Math.round(r.avgPercent * 10) / 10
      }));
      logger.info('[migrate-score-percent] DRY-RUN — no se escribe', summary);
      console.log(JSON.stringify({ ...summary, sample }, null, 2));
      return;
    }

    if (ops.length === 0) {
      logger.info('[migrate-score-percent] Nada que migrar.', summary);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const result = await User.bulkWrite(ops, { ordered: false });
    logger.info('[migrate-score-percent] Migracion completada', {
      ...summary,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });
    console.log(JSON.stringify({ ...summary, modified: result.modifiedCount }, null, 2));
  } catch (error) {
    logger.error('[migrate-score-percent] Error', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

migrate();
