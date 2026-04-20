/**
 * @fileoverview Helpers para generación de keys de rate-limit.
 * Centraliza el patrón "userId post-auth o IP normalizada" usado por los
 * limiters HTTP que aplican sobre rutas autenticadas o públicas. Usa
 * `ipKeyGenerator` de express-rate-limit para normalizar IPv6 a su /64, lo
 * que evita que un atacante bypasee el límite iterando prefijos distintos
 * del mismo rango de asignación.
 *
 * @module utils/ipHelper
 */

const { ipKeyGenerator } = require('express-rate-limit');

/**
 * KeyGenerator compuesto: identifica al cliente por userId si está
 * autenticado, sino por IP normalizada. Diseñado para que múltiples
 * usuarios detrás del mismo NAT (p. ej. una escuela con salida única)
 * no se bloqueen entre sí cuando ya han iniciado sesión.
 *
 * @param {import('express').Request} req
 * @returns {string} Clave estable para agrupar requests de un mismo cliente
 */
const userOrIpKeyGenerator = req => {
  const userId = req.user?._id?.toString();
  return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip)}`;
};

module.exports = { userOrIpKeyGenerator };
