#!/usr/bin/env node
/**
 * @fileoverview Seeder idempotente del catálogo de feature flags.
 *
 * Recorre `config/featureFlagsCatalog.js` y crea en Redis las flags que faltan,
 * usando los `defaultEnabled` / `defaultRolloutPct` del catálogo. NO sobrescribe
 * flags ya existentes (preserva el estado manual del admin). Pensado para
 * ejecutarse al desplegar una instancia recién creada.
 *
 *   npm run seed:feature-flags          # seed normal
 *   npm run seed:feature-flags -- --force  # sobreescribe (uso solo en dev)
 */

const featureFlagService = require('../src/services/featureFlagService');
const { FEATURE_FLAGS_CATALOG } = require('../src/config/featureFlagsCatalog');
const { disconnectRedis } = require('../src/config/redis');
const logger = require('../src/utils/logger').child({ component: 'seed-feature-flags' });

const FORCE_FLAG = process.argv.includes('--force');

async function seedFeatureFlags() {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const entry of FEATURE_FLAGS_CATALOG) {
    const existing = await featureFlagService.getFlag(entry.name);

    if (existing && !FORCE_FLAG) {
      skipped += 1;
      logger.debug('Flag ya existe, se preserva el estado manual', {
        name: entry.name,
        enabled: existing.enabled,
        rolloutPct: existing.rolloutPct
      });
      continue;
    }

    await featureFlagService.setFlag(
      entry.name,
      {
        enabled: entry.defaultEnabled,
        rolloutPct: entry.defaultRolloutPct ?? (entry.defaultEnabled ? 100 : 0),
        whitelist: [],
        reason: entry.reason || entry.description
      },
      'system:seed'
    );

    if (existing) {
      updated += 1;
      logger.info('Flag sobreescrita por --force', { name: entry.name });
    } else {
      created += 1;
      logger.info('Flag creada desde catálogo', {
        name: entry.name,
        enabled: entry.defaultEnabled
      });
    }
  }

  logger.info('Seed de feature flags completado', {
    catalogTotal: FEATURE_FLAGS_CATALOG.length,
    created,
    updated,
    skipped,
    forced: FORCE_FLAG
  });

  return { created, updated, skipped };
}

if (require.main === module) {
  seedFeatureFlags()
    .then(() => disconnectRedis())
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Seed de feature flags falló', { error: error.message, stack: error.stack });
      disconnectRedis()
        .catch(() => undefined)
        .finally(() => process.exit(1));
    });
}

module.exports = { seedFeatureFlags };
