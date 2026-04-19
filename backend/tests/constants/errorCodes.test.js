/**
 * @fileoverview Tests sanity de las constantes RFID.
 *
 * Garantiza que los VALORES literales no cambien tras el primer despliegue:
 * son contrato público que el frontend serializa en switches/maps de UI
 * para mostrar feedback granular ("Sensor no responde" vs "Tarjeta fuera").
 */

const {
  RFID_ERROR_CODES,
  SCAN_IGNORED_REASONS,
  PLAY_INTERRUPTED_REASONS
} = require('../../src/constants/errorCodes');

describe('errorCodes constants', () => {
  it('RFID_ERROR_CODES expone los códigos esperados con valores estables', () => {
    expect(RFID_ERROR_CODES).toMatchObject({
      SENSOR_DISABLED: 'RFID_DISABLED',
      SENSOR_MISMATCH: 'RFID_SENSOR_MISMATCH',
      SENSOR_UNAUTHORIZED: 'RFID_SENSOR_UNAUTHORIZED',
      MODE_TAKEN_OVER: 'RFID_MODE_TAKEN_OVER',
      MODE_INVALID: 'RFID_MODE_INVALID',
      SOCKET_NOT_ACTIVE: 'RFID_SOCKET_NOT_ACTIVE'
    });
  });

  it('SCAN_IGNORED_REASONS preserva valores legacy de scan_ignored', () => {
    // Estos VALORES se serializan al frontend; cambiarlos sería breaking.
    expect(SCAN_IGNORED_REASONS).toMatchObject({
      PLAY_PAUSED: 'play_paused',
      NOT_AWAITING: 'not_awaiting_response',
      CARD_NOT_IN_PLAY: 'card_not_in_play',
      UID_UNKNOWN: 'uid_unknown'
    });
  });

  it('PLAY_INTERRUPTED_REASONS expone INTERNAL_ERROR estable', () => {
    expect(PLAY_INTERRUPTED_REASONS.INTERNAL_ERROR).toBe('internal_error');
  });

  it('los objetos son inmutables (Object.freeze)', () => {
    expect(Object.isFrozen(RFID_ERROR_CODES)).toBe(true);
    expect(Object.isFrozen(SCAN_IGNORED_REASONS)).toBe(true);
    expect(Object.isFrozen(PLAY_INTERRUPTED_REASONS)).toBe(true);
  });
});
