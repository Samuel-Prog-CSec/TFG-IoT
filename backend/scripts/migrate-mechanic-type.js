/**
 * @fileoverview Migración one-shot: backfill de `mechanicType` en GameSessions
 * legacy (creadas antes de ADR-193, cuando el tipo se inferia por "huella de
 * datos"). Deriva el tipo del `GameMechanic.name` referenciado por la sesión y,
 * si la mecánica no resuelve, lo infiere por la huella de planes (mismo fallback
 * que el cálculo de scoring). Idempotente: solo toca sesiones sin `mechanicType`.
 *
 * Uso:
 *   npm run migrate:mechanic-type             # aplica cambios
 *   npm run migrate:mechanic-type -- --dry-run  # solo reporta sin escribir
 */

const dotenv = require('dotenv');
const { connectDB, disconnectDB } = require('../src/config/database');
const GameSession = require('../src/models/GameSession');
const GameMechanic = require('../src/models/GameMechanic');
const { inferMechanicTypeFromShape } = require('../src/services/gamePlayScoring');
const logger = require('../src/utils/logger');

dotenv.config();

// Script de administrador ejecutado manualmente; process.argv es seguro aqui.
// eslint-disable-next-line sonarjs/process-argv
const isDryRun = process.argv.includes('--dry-run');

const migrate = async () => {
  try {
    await connectDB();

    logger.info(`[migrate-mechanic-type] Iniciando (${isDryRun ? 'DRY-RUN' : 'aplicar cambios'})`);

    // Mapa mechanicId -> name (las 3 mecánicas base caben de sobra en memoria).
    const mechanics = await GameMechanic.find({}, { _id: 1, name: 1 }).lean();
    const nameById = new Map(mechanics.map(m => [m._id.toString(), m.name]));

    // Solo sesiones sin mechanicType establecido (idempotente).
    const sessions = await GameSession.find(
      { $or: [{ mechanicType: { $exists: false } }, { mechanicType: null }] },
      { _id: 1, mechanicId: 1, sequencePlan: 1, associationChallengePlan: 1, boardLayout: 1 }
    ).lean();

    let fromMechanicName = 0;
    let fromShapeFallback = 0;
    let unresolved = 0;
    const ops = [];

    for (const session of sessions) {
      let mechanicType = nameById.get(session.mechanicId?.toString());
      if (mechanicType) {
        fromMechanicName += 1;
      } else {
        mechanicType = inferMechanicTypeFromShape(session);
        if (mechanicType) {
          fromShapeFallback += 1;
        }
      }

      if (!mechanicType) {
        unresolved += 1;
      } else {
        ops.push({
          updateOne: {
            filter: { _id: session._id },
            update: { $set: { mechanicType } }
          }
        });
      }
    }

    const summary = {
      scanned: sessions.length,
      fromMechanicName,
      fromShapeFallback,
      unresolved,
      pendingOps: ops.length
    };

    if (isDryRun) {
      logger.info('[migrate-mechanic-type] DRY-RUN — no se escribe en BD', summary);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (ops.length === 0) {
      logger.info('[migrate-mechanic-type] Nada que migrar.', summary);
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    const result = await GameSession.bulkWrite(ops, { ordered: false });
    logger.info('[migrate-mechanic-type] Migracion completada', {
      ...summary,
      matched: result.matchedCount,
      modified: result.modifiedCount
    });

    console.log(JSON.stringify({ ...summary, modified: result.modifiedCount }, null, 2));
  } catch (error) {
    logger.error('[migrate-mechanic-type] Error', { message: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
};

migrate();
