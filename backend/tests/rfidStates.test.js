/**
 * @fileoverview Tests unitarios para RFID State Pattern.
 * Verifica cada estado, sus permisos de lectura, validación de rooms y la factory.
 */

const BaseRfidState = require('../src/states/rfid/BaseRfidState');
const IdleState = require('../src/states/rfid/IdleState');
const GameplayState = require('../src/states/rfid/GameplayState');
const CardAssignmentState = require('../src/states/rfid/CardAssignmentState');
const { getRfidState } = require('../src/states/rfid');

describe('RFID State Pattern', () => {
  describe('BaseRfidState', () => {
    it('stores and returns the mode name', () => {
      const state = new BaseRfidState('custom');

      expect(state.getMode()).toBe('custom');
    });

    it('disallows reads by default', () => {
      const state = new BaseRfidState('test');

      expect(state.allowsReads()).toBe(false);
    });

    it('validates any room by default', () => {
      const state = new BaseRfidState('test');

      expect(state.validateRoom({})).toBe(true);
    });

    it('returns default messages', () => {
      const state = new BaseRfidState('test');

      expect(state.getReadNotAllowedMessage()).toBe('Modo RFID no permite lecturas');
      expect(state.getRoomMismatchMessage()).toBe('Modo RFID inválido');
      expect(state.getRoomMismatchReason()).toBe('RFID_MODE_ROOM_MISMATCH');
    });
  });

  describe('IdleState', () => {
    const state = new IdleState();

    it('has mode "idle"', () => {
      expect(state.getMode()).toBe('idle');
    });

    it('does not allow reads', () => {
      expect(state.allowsReads()).toBe(false);
    });

    it('validates any room (inherits base behavior)', () => {
      expect(state.validateRoom({})).toBe(true);
    });
  });

  describe('GameplayState', () => {
    const state = new GameplayState();

    it('has mode "gameplay"', () => {
      expect(state.getMode()).toBe('gameplay');
    });

    it('allows reads', () => {
      expect(state.allowsReads()).toBe(true);
    });
  });

  describe('CardAssignmentState', () => {
    const state = new CardAssignmentState();

    it('has mode "card_assignment"', () => {
      expect(state.getMode()).toBe('card_assignment');
    });

    it('allows reads', () => {
      expect(state.allowsReads()).toBe(true);
    });

    it('validates room by checking socket is in assignment room', () => {
      const assignmentRoom = 'assignment:teacher-1';
      const socket = { rooms: new Set([assignmentRoom]) };

      expect(state.validateRoom({ socket, rooms: { assignment: assignmentRoom } })).toBe(true);
    });

    it('rejects socket not in assignment room', () => {
      const socket = { rooms: new Set(['other-room']) };

      expect(state.validateRoom({ socket, rooms: { assignment: 'assignment:teacher-1' } })).toBe(
        false
      );
    });

    it('returns specific mismatch message', () => {
      expect(state.getRoomMismatchMessage()).toBe('Modo RFID inválido para asignación');
    });
  });

  describe('getRfidState factory', () => {
    it('returns IdleState for "idle"', () => {
      const state = getRfidState('idle');

      expect(state).toBeInstanceOf(IdleState);
      expect(state.getMode()).toBe('idle');
    });

    it('returns GameplayState for "gameplay"', () => {
      const state = getRfidState('gameplay');

      expect(state).toBeInstanceOf(GameplayState);
    });

    it('returns CardAssignmentState for "card_assignment"', () => {
      const state = getRfidState('card_assignment');

      expect(state).toBeInstanceOf(CardAssignmentState);
    });

    it('is case-insensitive', () => {
      expect(getRfidState('GAMEPLAY')).toBeInstanceOf(GameplayState);
      expect(getRfidState('Card_Assignment')).toBeInstanceOf(CardAssignmentState);
    });

    it('falls back to IdleState for unknown mode', () => {
      const state = getRfidState('unknown_mode');

      expect(state).toBeInstanceOf(IdleState);
    });

    it('falls back to IdleState for null/undefined', () => {
      expect(getRfidState(null)).toBeInstanceOf(IdleState);
      expect(getRfidState(undefined)).toBeInstanceOf(IdleState);
    });

    it('logs warning for unknown mode when logger is provided', () => {
      const logger = { warn: jest.fn() };

      getRfidState('invalid', logger);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('sin estado dedicado'),
        expect.objectContaining({ mode: 'invalid' })
      );
    });
  });
});
