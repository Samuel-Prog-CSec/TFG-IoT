/**
 * @fileoverview Validador HMAC-SHA256 del UID RFID (T-905 B8).
 *
 * El firmware envía cada scan con `counter` monotónico + `hmac` calculado como
 * `HMAC-SHA256(RFID_HMAC_SECRET, uid + ":" + counter)`. Este módulo:
 *
 * 1. Recalcula el HMAC esperado del lado backend y compara con `crypto.timingSafeEqual`.
 * 2. Implementa anti-replay leyendo el último counter conocido por sensor en Redis:
 *    si `counter <= previousCounter`, rechaza (intento de replay).
 * 3. Si `RFID_HMAC_ENABLED=false` (default, migración gradual): retorna `{valid:true,
 *    mode:'disabled'}` aunque el payload no traiga campos HMAC. Permite convivencia
 *    de firmware viejo y nuevo durante la transición.
 * 4. Si `RFID_HMAC_ENABLED=true`: campos `counter` y `hmac` son OBLIGATORIOS.
 *    Cualquier payload sin ellos o con HMAC inválido se rechaza.
 *
 * Métricas: emite contador `rfid_hmac_observed_total{result}` con labels
 * `valid|invalid|absent|replay` para monitorear adopción durante migración.
 *
 * @module utils/rfidHmacValidator
 */

const crypto = require('node:crypto');
const redisService = require('./../services/redisService');
const logger = require('./logger').child({ component: 'rfidHmac' });

const COUNTER_NAMESPACE = 'rfid:counter';
const COUNTER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días — un sensor inactivo más tiempo se resetea

let metrics = {
  valid: 0,
  invalid: 0,
  absent: 0,
  replay: 0
};

const isEnabled = () => process.env.RFID_HMAC_ENABLED === 'true';

const computeExpectedHmac = (uid, counter) => {
  const secret = process.env.RFID_HMAC_SECRET;
  if (!secret) {
    return null;
  }
  return crypto.createHmac('sha256', secret).update(`${uid}:${counter}`).digest('hex');
};

const recordMetric = bucket => {
  if (metrics[bucket] !== undefined) {
    metrics[bucket] += 1;
  }
};

/**
 * Valida un payload RFID. Side effect: actualiza el último counter en Redis si
 * el payload pasa la verificación HMAC + anti-replay.
 *
 * @param {object} payload - shape de `rfidClientEventSchema`.
 * @returns {Promise<{valid:boolean, mode:'disabled'|'enforce', reason?:string}>}
 */
const validate = async payload => {
  const enabled = isEnabled();
  const { uid, sensorId, counter, hmac } = payload || {};

  if (!enabled) {
    // Observación de adopción durante migración: contamos cuántos eventos
    // traen ya HMAC (firmware actualizado) aunque no estemos enforcing.
    if (hmac && counter !== undefined) {
      recordMetric('valid');
    } else {
      recordMetric('absent');
    }
    return { valid: true, mode: 'disabled' };
  }

  // Enforcement: HMAC + counter obligatorios.
  if (counter === undefined || !hmac) {
    recordMetric('absent');
    logger.warn({ uid, sensorId }, 'RFID payload sin HMAC/counter con flag enabled');
    return { valid: false, mode: 'enforce', reason: 'HMAC_FIELDS_MISSING' };
  }

  if (!process.env.RFID_HMAC_SECRET) {
    recordMetric('invalid');
    logger.error('RFID_HMAC_SECRET no configurado pero RFID_HMAC_ENABLED=true');
    return { valid: false, mode: 'enforce', reason: 'HMAC_SECRET_MISSING' };
  }

  const expected = computeExpectedHmac(uid, counter);
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(hmac.toLowerCase(), 'hex');
  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    recordMetric('invalid');
    logger.warn({ uid, sensorId, counter }, 'RFID HMAC mismatch');
    return { valid: false, mode: 'enforce', reason: 'HMAC_INVALID' };
  }

  // Anti-replay: counter debe ser estrictamente mayor que el último conocido.
  const previousRaw = await redisService.get(COUNTER_NAMESPACE, sensorId);
  const previous = previousRaw ? Number.parseInt(previousRaw, 10) : -1;
  if (Number.isFinite(previous) && counter <= previous) {
    recordMetric('replay');
    logger.warn({ uid, sensorId, counter, previous }, 'RFID counter replay detectado');
    return { valid: false, mode: 'enforce', reason: 'COUNTER_REPLAY' };
  }

  await redisService.setWithTTL(COUNTER_NAMESPACE, sensorId, String(counter), COUNTER_TTL_SECONDS);
  recordMetric('valid');
  return { valid: true, mode: 'enforce' };
};

/**
 * Devuelve y resetea los contadores acumulados (consumido por /api/metrics).
 *
 * @returns {{valid:number, invalid:number, absent:number, replay:number}}
 */
const drainMetrics = () => {
  const snapshot = { ...metrics };
  metrics = { valid: 0, invalid: 0, absent: 0, replay: 0 };
  return snapshot;
};

const peekMetrics = () => ({ ...metrics });

module.exports = {
  validate,
  isEnabled,
  drainMetrics,
  peekMetrics,
  COUNTER_NAMESPACE
};
