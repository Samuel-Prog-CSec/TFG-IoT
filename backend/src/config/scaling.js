/**
 * @fileoverview Flag único de escalado horizontal (multi-instancia).
 *
 * El servicio opera en single-instance por defecto (invariante scale=1, ver
 * server.js y documentation/Free_Tier_Budget.md): el gameEngine es stateful en
 * memoria y, a la escala objetivo, multi-instancia ni aporta ni es compatible
 * con Upstash free-tier.
 *
 * Los mecanismos de coordinación ENTRE instancias solo tienen consumidor cuando
 * hay >1 instancia:
 *   - Adapter Socket.IO (ya gateado en server.js).
 *   - pub/sub de cambios de modo RFID (rfid-mode-changes).
 *   - pub/sub de invalidación de LRU local (cache:invalidate).
 *
 * En single-instance, cada PUBLISH a estos canales lo recibe únicamente el
 * propio proceso, que lo descarta (`from === ownInstanceId`) → coste puro de
 * comandos Upstash sin ningún consumidor, y una conexión SUBSCRIBE ociosa
 * contra el límite de conexiones del free-tier. Por eso todos se activan
 * JUNTOS bajo la misma señal `SOCKET_ADAPTER_ENABLED` cuando se escala a >1
 * instancia.
 *
 * NOTA: el puente de notificaciones worker→HTTP (notificationEmitSubscriber) NO
 * depende de este flag: worker y backend son procesos SEPARADOS incluso en
 * single-instance, así que ese pub/sub siempre tiene consumidor y debe seguir
 * activo.
 *
 * @module config/scaling
 */

/**
 * @returns {boolean} true si el despliegue corre con >1 instancia del backend.
 */
const isMultiInstanceEnabled = () => process.env.SOCKET_ADAPTER_ENABLED === 'true';

module.exports = { isMultiInstanceEnabled };
