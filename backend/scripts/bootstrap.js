#!/usr/bin/env node
/**
 * @fileoverview Script de bootstrap post-deploy.
 *
 * Se ejecuta antes de `npm run start:prod` en Koyeb cuando `SEED_ON_BOOT=true`.
 * Si la base de datos está vacía, dispara `seed:if-empty` para tener datos de
 * prueba en staging tras un reset del cluster. En producción debe quedar
 * siempre en `false` para no sobrescribir datos reales.
 *
 * Si `SEED_ON_BOOT` no está definido o vale "false", termina con código 0
 * sin tocar nada. Este script NUNCA debe romper el boot: cualquier error
 * se loguea y se sale 0 para no impedir el arranque del servidor.
 *
 * @module scripts/bootstrap
 */

'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ quiet: true });

const logger = require('../src/utils/logger');

const shouldRun = (process.env.SEED_ON_BOOT || '').trim().toLowerCase() === 'true';

if (!shouldRun) {
  logger.info('bootstrap: SEED_ON_BOOT no es "true", saltando seed inicial.');
  process.exit(0);
}

logger.info('bootstrap: SEED_ON_BOOT=true, ejecutando seed:if-empty...');

// Resolver el script real (más explícito que `npm run` dentro de un container)
const seedScript = path.resolve(__dirname, 'seed-if-empty.js');

const result = spawnSync(process.execPath, [seedScript], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  logger.error('bootstrap: error lanzando seed:if-empty', { message: result.error.message });
  // Salir 0: si seed falla, el servidor debe poder arrancar igual.
  // El operador puede correr `npm run seed` manualmente desde la Koyeb Console.
  process.exit(0);
}

if (result.status !== 0) {
  logger.warn('bootstrap: seed:if-empty terminó con código no-cero', { code: result.status });
}

process.exit(0);
