/**
 * @fileoverview Validador HMAC-SHA256 del UID RFID (T-905 B8).
 *
 * El firmware envía cada scan con `counter` monotónico + `hmac` calculado como
 * `HMAC-SHA256(RFID_HMAC_SECRET, UID_MAYÚSCULAS + ":" + counter)`. Este módulo:
 *
 * 1. Recalcula el HMAC esperado del lado backend y compara con `crypto.timingSafeEqual`.
 * 2. Implementa anti-replay leyendo el último counter conocido por sensor en Redis:
 *    si `counter <= previousCounter`, rechaza (intento de replay).
 * 2b. Enforcement CONSCIENTE DEL ORIGEN: solo `source:'web_serial'` (sensor físico)
 *    está obligado a firmar. Las fuentes táctiles (`touch_fallback`,
 *    `touch_memory_flip`) — juego sin sensor — se eximen y retornan
 *    `{valid:true, mode:'exempt'}` aunque el flag esté en enforce.
 * 3. Modo disabled: si la variable `RFID_HMAC_ENABLED` está AUSENTE (o vale `false`),
 *    retorna `{valid:true, mode:'disabled'}` aunque el payload no traiga campos HMAC.
 *    Es el fallback de compatibilidad para convivencia de firmware viejo y nuevo
 *    durante una migración gradual.
 * 4. Si `RFID_HMAC_ENABLED=true`: campos `counter` y `hmac` son OBLIGATORIOS.
 *    Cualquier payload sin ellos o con HMAC inválido se rechaza.
 *
 * Métricas: emite contador `rfid_hmac_observed_total{result}` con labels
 * `valid|invalid|absent|replay|exempt` para monitorear adopción durante migración.
 *
 * @module utils/rfidHmacValidator
 */

const crypto = require('node:crypto');
const redisService = require('./../services/redisService');
const logger = require('./logger').child({ component: 'rfidHmac' });

const COUNTER_NAMESPACE = 'rfid:counter';
const COUNTER_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 días — un sensor inactivo más tiempo se resetea

// Solo el sensor físico (web_serial) porta el secret y puede firmar. Las
// fuentes táctiles (juego sin sensor) se eximen del enforcement por diseño.
const SENSOR_HMAC_SOURCES = new Set(['web_serial']);

let metrics = {
  valid: 0,
  invalid: 0,
  absent: 0,
  replay: 0,
  exempt: 0
};

// Parsing del flag: solo acepta 'true' case-insensitive (NO '1'/'yes', para no
// ampliar la superficie). Debe mantenerse alineado con el guard de envValidator.js,
// que valida la presencia de RFID_HMAC_SECRET con la misma comparación.
const isEnabled = () => process.env.RFID_HMAC_ENABLED?.toLowerCase() === 'true';

const computeExpectedHmac = (uid, counter) => {
  const secret = process.env.RFID_HMAC_SECRET;
  if (!secret) {
    return null;
  }
  // El firmware firma el UID en MAYÚSCULAS canónicas; normalizamos aquí para que
  // la verificación sea correcta aunque el caller no haya pasado por el schema Zod.
  return crypto
    .createHmac('sha256', secret)
    .update(`${String(uid).toUpperCase()}:${counter}`)
    .digest('hex');
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
 * @returns {Promise<{valid:boolean, mode:'disabled'|'enforce'|'exempt', reason?:string}>}
 */
const validate = async payload => {
  const enabled = isEnabled();
  const { uid, sensorId, counter, hmac, source } = payload || {};

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

  // Un payload que llega al enforcement sin `source` es malformado (en producción
  // el schema Zod lo garantiza; aquí defendemos el módulo en uso autónomo). No lo
  // tratamos como exención silenciosa.
  if (source === undefined || source === null) {
    recordMetric('invalid');
    logger.warn({ uid, sensorId }, 'RFID payload sin source con flag enabled');
    return { valid: false, mode: 'enforce', reason: 'SOURCE_MISSING' };
  }

  // Las fuentes táctiles (juego sin sensor físico) no pueden firmar: el secreto
  // HMAC vive en el firmware, no en el navegador. Se eximen del enforcement —
  // solo `web_serial` (sensor real) está obligado a firmar.
  if (!SENSOR_HMAC_SOURCES.has(source)) {
    recordMetric('exempt');
    return { valid: true, mode: 'exempt' };
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
    // Señal para el detector SmartAlert (contador Redis, ventana 1h). Fail-open:
    // un fallo del require o de Redis nunca debe romper el procesamiento del scan.
    try {
      require('../services/security/securityCountersService')
        .increment('rfid_hmac_invalid')
        .catch(() => {});
    } catch {
      /* no-op */
    }
    return { valid: false, mode: 'enforce', reason: 'HMAC_INVALID' };
  }

  // Anti-replay atómico (CAS Lua): el counter debe ser estrictamente mayor que el
  // último conocido. `rfidCounterCheckAndAdvance` lee-y-avanza en una sola ejecución
  // de Redis, cerrando la ventana TOCTOU del get-then-setex previo (dos scans del
  // mismo sensor podían leer el mismo `previous`, pasar ambos y reabrir la ventana
  // de replay). Fail-open ante Redis/Lua caído: la firma HMAC ya verificada sigue
  // protegiendo, solo se podría reutilizar un scan capturado durante el outage.
  const { accepted } = await redisService.rfidCounterCheckAndAdvance(
    COUNTER_NAMESPACE,
    sensorId,
    counter,
    COUNTER_TTL_SECONDS
  );
  if (!accepted) {
    recordMetric('replay');
    logger.warn({ uid, sensorId, counter }, 'RFID counter replay detectado');
    // Señal para el detector SmartAlert (contador Redis, ventana 1h). Fail-open.
    try {
      require('../services/security/securityCountersService')
        .increment('rfid_replay')
        .catch(() => {});
    } catch {
      /* no-op */
    }
    return { valid: false, mode: 'enforce', reason: 'COUNTER_REPLAY' };
  }

  recordMetric('valid');
  return { valid: true, mode: 'enforce' };
};

/**
 * Devuelve y resetea los contadores acumulados (consumido por /api/metrics).
 *
 * @returns {{valid:number, invalid:number, absent:number, replay:number, exempt:number}}
 */
const drainMetrics = () => {
  const snapshot = { ...metrics };
  metrics = { valid: 0, invalid: 0, absent: 0, replay: 0, exempt: 0 };
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
