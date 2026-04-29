/**
 * @fileoverview Migración one-shot: normalizar GamePlays historicas que tienen
 * score > maxScore teorico o falta maxScore. Parte de la correccion de
 * integridad de datos tras QA 18/04/2026 (propuesta P19 / ADR-057).
 *
 * Qué hace:
 *  1. Recorre todas las GamePlays sin maxScore establecido (legacy) y lo
 *     calcula a partir de su sesion (numberOfRounds * pointsPerCorrect).
 *  2. Para cada GamePlay con score > maxScore, lo clampa al maximo.
 *  3. Idempotente: si score <= maxScore, no toca el documento.
 *
 * Uso:
 *   npm run migrate:clamp-scores            # aplica cambios
 *   npm run migrate:clamp-scores -- --dry-run  # solo reporta sin escribir
 */

const dotenv = require('dotenv');
const { connectDB, disconnectDB } = require('../src/config/database');
const GamePlay = require('../src/models/GamePlay');
const GameSession = require('../src/models/GameSession');
const logger = require('../src/utils/logger');

dotenv.config();

// Script de administrador ejecutado manualmente; process.argv es seguro aqui.
// eslint-disable-next-line sonarjs/process-argv
const isDryRun = process.argv.includes('--dry-run');

const migrate = async () => {
  try {
    await connectDB();

    logger.info(`[migrate-clamp-scores] Iniciando (${isDryRun ? 'DRY-RUN' : 'aplicar cambios'})`);

    // Cargar sessions en memoria para evitar N+1 queries
    const sessions = await GameSession.find({}, { _id: 1, config: 1 }).lean();
    const sessionById = new Map(sessions.map(s => [s._id.toString(), s]));

    const plays = await GamePlay.find({}, { _id: 1, sessionId: 1, score: 1, maxScore: 1 }).lean();

    let needMaxScore = 0;
    let needClamp = 0;
    let alreadyValid = 0;
    let missingSession = 0;

    const ops = [];

    for (const play of plays) {
      const session = sessionById.get(play.sessionId?.toString());
      if (!session) {
        missingSession += 1;
      } else {
        const rounds = Number(session.config?.numberOfRounds) || 1;
        const points = Number(session.config?.pointsPerCorrect) || 10;
        const computedMax = Math.max(1, rounds * points);

        const update = {};
        if (typeof play.maxScore !== 'number' || play.maxScore < 1) {
          update.maxScore = computedMax;
          needMaxScore += 1;
        }

        const effectiveMax = update.maxScore || play.maxScore || computedMax;
        if (typeof play.score === 'number' && play.score > effectiveMax) {
          update.score = effectiveMax;
          needClamp += 1;
        }

        if (Object.keys(update).length === 0) {
          alreadyValid += 1;
        } else {
          ops.push({
            updateOne: {
              filter: { _id: play._id },
              update: { $set: update }
            }
          });
        }
      }
    }

    const summary = {
      totalPlays: plays.length,
      alreadyValid,
      missingSession,
      backfilledMaxScore: needMaxScore,
      clampedScore: needClamp,
      pendingOps: ops.length
    };

    if (isDryRun) {
      logger.info('[migrate-clamp-scores] DRY-RUN — no se escribe en BD', summary);

      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (ops.length === 0) {
      logger.info('[migrate-clamp-scores] Nada que migrar.', summary);
      return;
    }

    const result = await GamePlay.bulkWrite(ops, { ordered: false });
    logger.info('[migrate-clamp-scores] Migracion completada', {
      ...summary,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });

    console.log(
      JSON.stringify(
        { ...summary, matched: result.matchedCount, modified: result.modifiedCount },
        null,
        2
      )
    );
  } catch (error) {
    logger.error('[migrate-clamp-scores] Error', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

migrate();
