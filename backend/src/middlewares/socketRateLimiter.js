/**
 * @fileoverview Rate limiting y control de payload para eventos Socket.IO.
 * Implementa ventana deslizante, bloqueo temporal y dedupe para RFID.
 *
 * ADR-072 (PROP-59): añade un path distribuido vía Lua script + Redis ZSET
 * para que el rate limit sea consistente entre múltiples instancias del backend.
 * El estado in-memory original (`rateState` Map) sigue presente como
 * "insurance limiter": si Redis cae o el script falla, no se pierde la
 * protección — el limiter funciona localmente como antes.
 *
 * @module middlewares/socketRateLimiter
 */

const logger = require('../utils/logger');
const runtimeMetrics = require('../utils/runtimeMetrics');
const { reportRateLimiterMode } = require('../utils/runtimeMetrics');
const { logSecurityEvent, getSocketContext } = require('../utils/securityLogger');
const {
  socketRateLimits,
  socketRateLimitDefaults,
  socketSoftLimitEvents,
  socketBlockConfig,
  socketPayloadLimits,
  rfidDedupeConfig,
  socketStateCleanup
} = require('../config/socketRateLimits');
const redisService = require('../services/redisService');
const { getRedis, getKeyPrefix, getLuaScriptSHA, getLuaScriptSource } = require('../config/redis');

const LUA_SCRIPT_NAME = 'checkSocketRateLimit';
const ZSET_PREFIX = 'rl:ws:';
const BLOCK_PREFIX = 'rl:ws:block:';
const VIOLATIONS_PREFIX = 'rl:ws:violations:';

class SocketRateLimiter {
  /**
   * @param {Object} options - Opciones de configuración.
   * @param {Function} [options.nowProvider] - Función para obtener tiempo actual (ms).
   * @param {import('winston').Logger} [options.logger] - Logger opcional.
   * @param {boolean} [options.useRedis] - Activa el path distribuido (default: auto).
   */
  constructor(options = {}) {
    this.nowProvider = options.nowProvider || (() => Date.now());
    this.logger = options.logger || logger;
    this.rateState = new Map();
    this.rfidDedupeState = new Map();
    this.cleanupTimer = null;
    // Si el caller no fuerza el modo, lo decidimos en ejecución según el
    // estado de Redis. En NODE_ENV=test forzamos `false` para no tirar de
    // ioredis-mock (que no soporta scripting Lua).
    this.useRedis =
      options.useRedis !== undefined ? options.useRedis : process.env.NODE_ENV !== 'test';
    // Log periódico de fallback a in-memory cuando Redis falla, para que se
    // vea en métricas.
    this.fallbackCount = 0;
  }

  /**
   * Genera la clave de rate limit por usuario (si autenticado) o por socket.
   * @param {import('socket.io').Socket} socket
   * @returns {string}
   */
  getKey(socket) {
    const userId = socket?.data?.userId;
    return userId ? `user:${userId}` : `socket:${socket.id}`;
  }

  /**
   * Actualiza la identidad del socket (para rate limiting por usuario).
   * @param {import('socket.io').Socket} socket
   * @param {Object} user
   * @param {string} user.id
   * @param {string} user.role
   */
  setIdentity(socket, user) {
    if (!socket || !user) {
      return;
    }
    socket.data.userId = user.id;
    socket.data.userRole = user.role;
  }

  /**
   * Obtiene el límite de rate por evento.
   * @param {string} eventName
   * @returns {{windowMs:number, max:number}}
   */
  getLimit(eventName) {
    return socketRateLimits[eventName] || socketRateLimitDefaults;
  }

  /**
   * Obtiene el tamaño de payload en bytes.
   * @param {any} payload
   * @returns {number}
   */
  getPayloadSizeBytes(payload) {
    if (payload === null || payload === undefined) {
      return 0;
    }
    if (Buffer.isBuffer(payload)) {
      return payload.length;
    }
    if (typeof payload === 'string') {
      return Buffer.byteLength(payload, 'utf8');
    }

    try {
      return Buffer.byteLength(JSON.stringify(payload), 'utf8');
    } catch (error) {
      if (this.logger) {
        this.logger.debug('Fallo al calcular tamaño del payload:', error.message);
      }
      return socketPayloadLimits.globalBytes + 1;
    }
  }

  /**
   * Comprueba si el payload supera el tamaño permitido.
   * @param {string} eventName
   * @param {any} payload
   * @returns {{allowed:boolean, maxBytes:number, sizeBytes:number}}
   */
  checkPayloadSize(eventName, payload) {
    const maxBytes =
      socketPayloadLimits.perEventBytes[eventName] || socketPayloadLimits.globalBytes;
    const sizeBytes = this.getPayloadSizeBytes(payload);

    return {
      allowed: sizeBytes <= maxBytes,
      maxBytes,
      sizeBytes
    };
  }

  /**
   * Comprueba dedupe para eventos RFID del cliente.
   * @param {string} eventName
   * @param {any} payload
   * @param {string} rateKey
   * @returns {{allowed:boolean, reason?:string}}
   */
  checkRfidDedupe(eventName, payload, rateKey) {
    if (eventName !== 'rfid_scan_from_client') {
      return { allowed: true };
    }

    const { uid, sensorId, source } = payload || {};
    if (!uid) {
      return { allowed: true };
    }

    // PROP-90 / ADR-090: cooldown diferenciado por `source` del payload. Un tap
    // sobre la mecánica Memoria no debe heredar el cooldown largo del sensor
    // RFID hardware (que existe para protegerse del chattering del RC522).
    const cooldownMs =
      rfidDedupeConfig.cooldownMsBySource?.[source] || rfidDedupeConfig.defaultCooldownMs;

    const now = this.nowProvider();
    // La clave de dedupe incluye `source` para que las distintas fuentes no
    // se "ahoguen" entre sí (un tap táctil no afecta al cooldown del sensor).
    const dedupeKey = `${rateKey}:${sensorId || 'unknown'}:${source || 'default'}`;
    const last = this.rfidDedupeState.get(dedupeKey);

    if (last && last.uid === uid && now - last.timestamp < cooldownMs) {
      return { allowed: false, reason: 'DUPLICATE_RFID_EVENT' };
    }

    this.rfidDedupeState.set(dedupeKey, { uid, timestamp: now });
    return { allowed: true };
  }

  /**
   * Comprueba si la clave está bloqueada temporalmente.
   * @param {Object} state
   * @param {number} now
   * @returns {boolean}
   */
  isBlocked(state, now) {
    return state.blockedUntil && state.blockedUntil > now;
  }

  /**
   * Obtiene o crea el estado de una clave.
   * @param {string} rateKey
   * @param {number} now
   * @returns {{events: Map<string, number[]>, consecutiveViolations: number, blockedUntil?:number, lastSeenAt:number}}
   */
  getState(rateKey, now) {
    const existing = this.rateState.get(rateKey);
    if (existing) {
      existing.lastSeenAt = now;
      return existing;
    }

    const state = {
      events: new Map(),
      consecutiveViolations: 0,
      blockedUntil: null,
      lastSeenAt: now
    };
    this.rateState.set(rateKey, state);
    return state;
  }

  /**
   * Limpia entradas inactivas para evitar crecimiento de memoria.
   * @param {number} now
   */
  cleanupStaleEntries(now) {
    for (const [key, state] of this.rateState.entries()) {
      if (now - state.lastSeenAt > socketStateCleanup.staleEntryTtlMs) {
        this.rateState.delete(key);
      }
    }

    for (const [key, state] of this.rfidDedupeState.entries()) {
      if (now - state.timestamp > rfidDedupeConfig.defaultCooldownMs * 5) {
        this.rfidDedupeState.delete(key);
      }
    }
  }

  /**
   * Limpia el estado asociado a un socket para evitar crecimiento de memoria.
   * @param {import('socket.io').Socket} socket
   */
  cleanupForSocket(socket) {
    if (!socket) {
      return;
    }

    const rateKey = this.getKey(socket);

    if (rateKey.startsWith('socket:')) {
      this.rateState.delete(rateKey);
    }

    for (const key of this.rfidDedupeState.keys()) {
      if (key.startsWith(`${rateKey}:`)) {
        this.rfidDedupeState.delete(key);
      }
    }
  }

  /**
   * Inicia el cleanup periodico para evitar fugas de memoria en estados inactivos.
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      return;
    }

    const intervalMs = Math.max(socketStateCleanup.staleEntryTtlMs / 2, 60 * 1000);
    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleEntries(this.nowProvider());
    }, intervalMs);
  }

  /**
   * Detiene el cleanup periodico.
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Comprueba el rate limit de un evento.
   * @param {string} rateKey
   * @param {string} eventName
   * @returns {{allowed:boolean, retryAfterMs:number, blocked:boolean}}
   */
  checkRateLimit(rateKey, eventName) {
    const now = this.nowProvider();
    const limit = this.getLimit(eventName);
    const state = this.getState(rateKey, now);

    this.cleanupStaleEntries(now);

    if (this.isBlocked(state, now)) {
      return {
        allowed: false,
        retryAfterMs: state.blockedUntil - now,
        blocked: true
      };
    }

    const eventTimestamps = state.events.get(eventName) || [];
    const windowStart = now - limit.windowMs;
    const filtered = eventTimestamps.filter(ts => ts > windowStart);

    if (filtered.length >= limit.max) {
      // Eventos soft-limit (escaneos): descartan la lectura sobrante pero NO
      // acumulan violaciones ni activan el bloqueo compartido — así un niño
      // tocando rápido nunca congela los controles del docente (pause/next).
      if (socketSoftLimitEvents.has(eventName)) {
        state.events.set(eventName, filtered);
        return {
          allowed: false,
          retryAfterMs: limit.windowMs - (now - filtered[0]),
          blocked: false
        };
      }

      state.consecutiveViolations += 1;

      if (state.consecutiveViolations >= socketBlockConfig.violationThreshold) {
        state.blockedUntil = now + socketBlockConfig.blockDurationMs;
        return {
          allowed: false,
          retryAfterMs: socketBlockConfig.blockDurationMs,
          blocked: true
        };
      }

      state.events.set(eventName, filtered);
      return {
        allowed: false,
        retryAfterMs: limit.windowMs - (now - filtered[0]),
        blocked: false
      };
    }

    filtered.push(now);
    state.events.set(eventName, filtered);
    state.consecutiveViolations = 0;

    return { allowed: true, retryAfterMs: 0, blocked: false };
  }

  /**
   * Versión distribuida: ejecuta el script Lua `checkSocketRateLimit` para
   * que múltiples instancias del backend compartan estado vía Redis ZSET.
   *
   * Si Redis no está disponible o el script falla, cae al limiter in-memory
   * (`checkRateLimit`). El llamante no necesita saber qué path se usó.
   *
   * @param {string} rateKey
   * @param {string} eventName
   * @returns {Promise<{allowed:boolean, retryAfterMs:number, blocked:boolean}>}
   */
  async checkRateLimitAsync(rateKey, eventName) {
    if (!this.useRedis || !redisService.checkRedisAvailable()) {
      // B.6: modo memory-local intencional (test / Redis no disponible).
      // No es fallback, es la configuración esperada.
      reportRateLimiterMode({ useRedis: false, fallback: false });
      return this.checkRateLimit(rateKey, eventName);
    }

    const redis = getRedis();
    if (!redis) {
      this.fallbackCount += 1;
      // B.6: Redis configurado pero no obtenible → fallback inesperado.
      reportRateLimiterMode({ useRedis: false, fallback: true });
      return this.checkRateLimit(rateKey, eventName);
    }

    const limit = this.getLimit(eventName);
    const now = this.nowProvider();
    const prefix = getKeyPrefix();

    // Las KEYS del script Lua llevan el keyPrefix del cliente (porque ioredis
    // sólo aplica el prefijo en operaciones simples, no dentro de EVAL).
    const zsetKey = `${prefix}${ZSET_PREFIX}${eventName}:${rateKey}`;
    const blockKey = `${prefix}${BLOCK_PREFIX}${rateKey}`;
    const violationsKey = `${prefix}${VIOLATIONS_PREFIX}${rateKey}`;

    try {
      const sha = getLuaScriptSHA(LUA_SCRIPT_NAME);
      const args = [
        3,
        zsetKey,
        blockKey,
        violationsKey,
        String(now),
        String(limit.windowMs),
        String(limit.max),
        String(socketBlockConfig.blockDurationMs),
        String(socketBlockConfig.violationThreshold)
      ];

      let raw;
      if (sha) {
        try {
          raw = await redis.evalsha(sha, ...args);
        } catch (error) {
          // Flatten de control flow: re-lanzar pronto si no es recuperable, en
          // vez de anidar if/if dentro del catch (regla sonarjs/nested-control-flow).
          if (!error?.message?.includes?.('NOSCRIPT')) {
            throw error;
          }
          const source = getLuaScriptSource(LUA_SCRIPT_NAME);
          if (!source) {
            throw error;
          }
          raw = await redis.eval(source, ...args);
        }
      } else {
        const source = getLuaScriptSource(LUA_SCRIPT_NAME);
        if (!source) {
          throw new Error(`Lua script ${LUA_SCRIPT_NAME} no disponible`);
        }
        raw = await redis.eval(source, ...args);
      }

      const result = JSON.parse(raw);
      // B.6: éxito del path distribuido — visible en /api/metrics como
      // socketRateLimiter.useRedis = true.
      reportRateLimiterMode({ useRedis: true, fallback: false });
      return {
        allowed: result.ok === 1,
        retryAfterMs: Number(result.retryAfterMs) || 0,
        blocked: result.blocked === 1
      };
    } catch (error) {
      // Fallback transparente al limiter in-memory. Loggeamos como debug para
      // no inundar el log si Redis está offline una temporada larga.
      this.fallbackCount += 1;
      // B.6: fallback inesperado (Lua falló, EVALSHA NOSCRIPT repetido, etc.).
      reportRateLimiterMode({ useRedis: false, fallback: true });
      this.logger?.debug?.('socketRateLimiter Redis path falló, fallback in-memory', {
        eventName,
        rateKey,
        error: error.message
      });
      return this.checkRateLimit(rateKey, eventName);
    }
  }

  /**
   * Diagnóstico: cuenta de fallbacks acumulados desde el arranque.
   * Útil en métricas y health-check para detectar si Redis está degradado.
   * @returns {number}
   */
  getFallbackCount() {
    return this.fallbackCount;
  }

  /**
   * Wrapper para aplicar rate limiting y validaciones a un handler de Socket.IO.
   * @param {import('socket.io').Socket} socket
   * @param {string} eventName
   * @param {Function} handler
   * @returns {Function}
   */
  wrap(socket, eventName, handler) {
    return async (payload, ...args) => {
      const rateKey = this.getKey(socket);

      const payloadCheck = this.checkPayloadSize(eventName, payload);
      if (!payloadCheck.allowed) {
        logSecurityEvent('SECURITY_PAYLOAD_TOO_LARGE', {
          ...getSocketContext(socket),
          eventName,
          rateKey,
          userId: socket?.data?.userId,
          userRole: socket?.data?.userRole,
          sizeBytes: payloadCheck.sizeBytes,
          maxBytes: payloadCheck.maxBytes
        });

        socket.emit('error', {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Payload demasiado grande para este evento',
          event: eventName,
          sizeBytes: payloadCheck.sizeBytes,
          maxBytes: payloadCheck.maxBytes
        });
        runtimeMetrics.recordWebsocketEvent({
          eventName,
          outcome: 'payload_rejected'
        });
        return undefined;
      }

      const dedupeCheck = this.checkRfidDedupe(eventName, payload, rateKey);
      if (!dedupeCheck.allowed) {
        logSecurityEvent('SECURITY_RFID_DEDUPE', {
          ...getSocketContext(socket),
          eventName,
          rateKey,
          userId: socket?.data?.userId,
          userRole: socket?.data?.userRole
        });

        socket.emit('error', {
          code: 'DUPLICATE_RFID_EVENT',
          message: 'Evento RFID duplicado en ventana corta',
          event: eventName
        });
        runtimeMetrics.recordWebsocketEvent({
          eventName,
          outcome: 'deduped'
        });
        // Contador específico del servicio RFID para el endpoint de salud.
        try {
          require('../services/rfidService').recordDedupeHit();
        } catch {
          // Best effort: si rfidService no está disponible (tests aislados), ignorar.
        }
        return undefined;
      }

      const rateResult = await this.checkRateLimitAsync(rateKey, eventName);
      if (!rateResult.allowed) {
        const errorCode = rateResult.blocked ? 'TEMP_BLOCKED' : 'RATE_LIMITED';

        logSecurityEvent('SECURITY_RATE_LIMITED', {
          ...getSocketContext(socket),
          eventName,
          rateKey,
          userId: socket?.data?.userId,
          userRole: socket?.data?.userRole,
          blocked: rateResult.blocked,
          retryAfterMs: rateResult.retryAfterMs
        });

        socket.emit('error', {
          code: errorCode,
          message: rateResult.blocked
            ? 'Socket temporalmente bloqueado por abuso'
            : 'Rate limit excedido para este evento',
          event: eventName,
          retryAfterMs: rateResult.retryAfterMs
        });
        runtimeMetrics.recordWebsocketEvent({
          eventName,
          outcome: rateResult.blocked ? 'blocked' : 'rate_limited'
        });
        return undefined;
      }

      runtimeMetrics.recordWebsocketEvent({
        eventName,
        outcome: 'allowed'
      });

      return handler(payload, ...args);
    };
  }
}

const createSocketRateLimiter = options => new SocketRateLimiter(options);

module.exports = {
  createSocketRateLimiter
};
