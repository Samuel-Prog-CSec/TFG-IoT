/**
 * @fileoverview Migración one-shot: limpia los leaderboards materializados (ZSET
 * Redis) tras cambiar la unidad acumulada de score CRUDO a PORCENTAJE
 * (score/maxScore×100). Los ZSETs `leaderboard:*:score:*` antiguos contienen
 * sumas de puntos crudos, incompatibles con el nuevo % que escriben el writer en
 * vivo (`recordPlayCompletion`) y el reconciliador nocturno
 * (`reconcileLeaderboards`). Mezclarlos daría rankings sin sentido durante la
 * ventana de transición.
 *
 * Al borrarlos, las lecturas caen al fallback Mongo —que YA calcula `avgScore` en
 * % (`$avg: SCORE_PERCENT_EXPR`)— hasta que el writer/reconcile repueblan los ZSET
 * con %. Borrar un cache materializado NUNCA pierde datos: la fuente es Mongo.
 * Idempotente y seguro.
 *
 * Debe ejecutarse junto con el deploy del cambio de unidad del leaderboard a %.
 *
 * Uso:
 *   npm run migrate:leaderboard-percent
 */

const dotenv = require('dotenv');
const { connectRedis, disconnectRedis } = require('../src/config/redis');
const redisService = require('../src/services/redisService');
const logger = require('../src/utils/logger');

dotenv.config();

const migrate = async () => {
  try {
    await connectRedis();
    logger.info('[migrate-leaderboard-percent] Limpiando ZSETs de leaderboard (score crudo → %)');

    // `leaderboard` es el namespace de todos los ZSET de ranking (context/mechanic
    // × score/plays × 24h/7d/30d). flushNamespace hace SCAN + DEL (no KEYS).
    const removed = await redisService.flushNamespace('leaderboard');

    logger.info(
      `[migrate-leaderboard-percent] Completado. Claves eliminadas: ${removed ?? 'n/d'}. ` +
        'El writer en vivo y el reconciliador nocturno las repueblan en %.'
    );
    await disconnectRedis();
    process.exit(0);
  } catch (error) {
    logger.error(`[migrate-leaderboard-percent] Error: ${error.message}`);
    await disconnectRedis().catch(() => {});
    process.exit(1);
  }
};

migrate();
