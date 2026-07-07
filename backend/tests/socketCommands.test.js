/**
 * @fileoverview Tests unitarios para los comandos Socket.IO.
 * Verifica validaciones, flujo de ejecución y manejo de errores de cada comando.
 */

const BaseSocketCommand = require('../src/commands/socket/BaseSocketCommand');
const PausePlayCommand = require('../src/commands/socket/PausePlayCommand');
const ResumePlayCommand = require('../src/commands/socket/ResumePlayCommand');
const StartPlayCommand = require('../src/commands/socket/StartPlayCommand');
const JoinPlayCommand = require('../src/commands/socket/JoinPlayCommand');
const LeavePlayCommand = require('../src/commands/socket/LeavePlayCommand');
const JoinAdminRoomCommand = require('../src/commands/socket/JoinAdminRoomCommand');
const LeaveAdminRoomCommand = require('../src/commands/socket/LeaveAdminRoomCommand');
const JoinCardAssignmentCommand = require('../src/commands/socket/JoinCardAssignmentCommand');
const LeaveCardAssignmentCommand = require('../src/commands/socket/LeaveCardAssignmentCommand');
const PlayStateSyncCommand = require('../src/commands/socket/PlayStateSyncCommand');
const RfidScanFromClientCommand = require('../src/commands/socket/RfidScanFromClientCommand');
const BoardReadyCommand = require('../src/commands/socket/BoardReadyCommand');

const VALID_PLAY_ID = '507f1f77bcf86cd799439011';

const buildSocket = (overrides = {}) => ({
  id: 'socket-1',
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  data: { userId: 'teacher-1', userRole: 'teacher' },
  rooms: new Set(),
  ...overrides
});

const buildHelpers = (overrides = {}) => ({
  validatePlayId: jest.fn().mockReturnValue(true),
  requireSocketRole: jest.fn().mockReturnValue(true),
  requirePlayOwnership: jest.fn().mockResolvedValue({ play: { _id: VALID_PLAY_ID }, session: {} }),
  setRfidModeState: jest.fn(),
  clearRfidModeState: jest.fn(),
  getPlayRoom: jest.fn(id => `play:${id}`),
  getAssignmentRoom: jest.fn(userId => `assignment:${userId}`),
  handleRfidScanFromClient: jest.fn(),
  RFID_MODES: { IDLE: 'idle', GAMEPLAY: 'gameplay', CARD_ASSIGNMENT: 'card_assignment' },
  ...overrides
});

const buildLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
});

const buildGameEngine = (overrides = {}) => ({
  pausePlayInternal: jest.fn(),
  resumePlayInternal: jest.fn(),
  startPlay: jest.fn(),
  advanceToNextRound: jest.fn().mockResolvedValue({ ok: true }),
  getPlayState: jest.fn().mockReturnValue(null),
  ...overrides
});

describe('Socket Commands', () => {
  describe('BaseSocketCommand', () => {
    it('stores and returns the command name', () => {
      const cmd = new BaseSocketCommand('test_cmd');

      expect(cmd.getName()).toBe('test_cmd');
    });

    it('throws error when execute is called (abstract)', async () => {
      const cmd = new BaseSocketCommand('test_cmd');

      await expect(cmd.execute()).rejects.toThrow('execute() no implementado');
    });
  });

  describe('PausePlayCommand', () => {
    it('pauses play with valid ownership', async () => {
      const cmd = new PausePlayCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();
      const gameEngine = buildGameEngine();
      const logger = buildLogger();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger,
        gameEngine
      });

      expect(gameEngine.pausePlayInternal).toHaveBeenCalledWith(VALID_PLAY_ID, {
        requestedBy: 'teacher-1'
      });
      expect(helpers.setRfidModeState).toHaveBeenCalledWith('teacher-1', 'idle', 'socket-1');
    });

    it('emits error when playId is missing', async () => {
      const cmd = new PausePlayCommand();
      const socket = buildSocket();

      await cmd.execute({
        socket,
        data: {},
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine: buildGameEngine()
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          code: 'VALIDATION_ERROR'
        })
      );
    });

    it('stops if role check fails', async () => {
      const cmd = new PausePlayCommand();
      const helpers = buildHelpers({ requireSocketRole: jest.fn().mockReturnValue(false) });
      const gameEngine = buildGameEngine();

      await cmd.execute({
        socket: buildSocket(),
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.pausePlayInternal).not.toHaveBeenCalled();
    });

    it('emits ENGINE_ERROR when engine throws', async () => {
      const cmd = new PausePlayCommand();
      const socket = buildSocket();
      const gameEngine = buildGameEngine({
        pausePlayInternal: jest.fn().mockRejectedValue(new Error('engine failure'))
      });

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          code: 'ENGINE_ERROR'
        })
      );
    });
  });

  describe('ResumePlayCommand', () => {
    it('resumes play and sets RFID mode to gameplay', async () => {
      const cmd = new ResumePlayCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();
      const gameEngine = buildGameEngine();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.resumePlayInternal).toHaveBeenCalledWith(VALID_PLAY_ID, {
        requestedBy: 'teacher-1'
      });
      expect(helpers.setRfidModeState).toHaveBeenCalledWith('teacher-1', 'gameplay', 'socket-1', {
        playId: VALID_PLAY_ID
      });
    });

    it('emits error when playId is missing', async () => {
      const cmd = new ResumePlayCommand();
      const socket = buildSocket();

      await cmd.execute({
        socket,
        data: null,
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine: buildGameEngine()
      });

      expect(socket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          code: 'VALIDATION_ERROR'
        })
      );
    });
  });

  describe('StartPlayCommand', () => {
    it('starts play via gameEngine', async () => {
      const cmd = new StartPlayCommand();
      const play = { _id: VALID_PLAY_ID };
      const session = { _id: 'session-1' };
      const helpers = buildHelpers({
        requirePlayOwnership: jest.fn().mockResolvedValue({ play, session })
      });
      const gameEngine = buildGameEngine();

      await cmd.execute({
        socket: buildSocket(),
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.startPlay).toHaveBeenCalledWith(play, session);
    });

    it('does not start if ownership check fails', async () => {
      const cmd = new StartPlayCommand();
      const helpers = buildHelpers({
        requirePlayOwnership: jest.fn().mockResolvedValue(null)
      });
      const gameEngine = buildGameEngine();

      await cmd.execute({
        socket: buildSocket(),
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.startPlay).not.toHaveBeenCalled();
    });
  });

  describe('JoinPlayCommand', () => {
    it('joins play room, sets RFID mode and emits state', async () => {
      const cmd = new JoinPlayCommand();
      const socket = buildSocket();
      const playState = { currentRound: 2, score: 100 };
      const gameEngine = buildGameEngine({ getPlayState: jest.fn().mockReturnValue(playState) });
      const helpers = buildHelpers();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(socket.join).toHaveBeenCalledWith(`play:${VALID_PLAY_ID}`);
      expect(helpers.setRfidModeState).toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('play_state', playState);
    });

    it('does not emit play_state when no active state exists', async () => {
      const cmd = new JoinPlayCommand();
      const socket = buildSocket();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine: buildGameEngine()
      });

      expect(socket.emit).not.toHaveBeenCalledWith('play_state', expect.anything());
    });
  });

  describe('LeavePlayCommand', () => {
    it('leaves play room and clears RFID mode', async () => {
      const cmd = new LeavePlayCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger()
      });

      expect(socket.leave).toHaveBeenCalledWith(`play:${VALID_PLAY_ID}`);
      expect(helpers.clearRfidModeState).toHaveBeenCalledWith('teacher-1', 'socket-1');
    });
  });

  describe('JoinAdminRoomCommand', () => {
    it('joins admin_room for super_admin', async () => {
      const cmd = new JoinAdminRoomCommand();
      const socket = buildSocket();

      await cmd.execute({
        socket,
        helpers: buildHelpers(),
        logger: buildLogger()
      });

      expect(socket.join).toHaveBeenCalledWith('admin_room');
    });

    it('does not join if role check fails', async () => {
      const cmd = new JoinAdminRoomCommand();
      const socket = buildSocket();
      const helpers = buildHelpers({ requireSocketRole: jest.fn().mockReturnValue(false) });

      await cmd.execute({ socket, helpers, logger: buildLogger() });

      expect(socket.join).not.toHaveBeenCalled();
    });
  });

  describe('LeaveAdminRoomCommand', () => {
    it('leaves admin_room', async () => {
      const cmd = new LeaveAdminRoomCommand();
      const socket = buildSocket();

      await cmd.execute({ socket });

      expect(socket.leave).toHaveBeenCalledWith('admin_room');
    });
  });

  describe('JoinCardAssignmentCommand', () => {
    it('joins assignment room and sets RFID mode', async () => {
      const cmd = new JoinCardAssignmentCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();

      await cmd.execute({ socket, helpers, logger: buildLogger() });

      expect(socket.join).toHaveBeenCalledWith('assignment:teacher-1');
      expect(helpers.setRfidModeState).toHaveBeenCalledWith(
        'teacher-1',
        'card_assignment',
        'socket-1'
      );
    });
  });

  describe('LeaveCardAssignmentCommand', () => {
    it('leaves assignment room and clears RFID mode', async () => {
      const cmd = new LeaveCardAssignmentCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();

      await cmd.execute({ socket, helpers });

      expect(socket.leave).toHaveBeenCalledWith('assignment:teacher-1');
      expect(helpers.clearRfidModeState).toHaveBeenCalledWith('teacher-1', 'socket-1');
    });
  });

  describe('PlayStateSyncCommand', () => {
    it('emits play_state when state exists', async () => {
      const cmd = new PlayStateSyncCommand();
      const socket = buildSocket();
      const playState = { currentRound: 3, score: 200 };
      const gameEngine = buildGameEngine({ getPlayState: jest.fn().mockReturnValue(playState) });

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine
      });

      expect(socket.emit).toHaveBeenCalledWith('play_state', playState);
    });

    it('emits null when play state does not exist', async () => {
      const cmd = new PlayStateSyncCommand();
      const socket = buildSocket();

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers: buildHelpers(),
        logger: buildLogger(),
        gameEngine: buildGameEngine()
      });

      expect(socket.emit).toHaveBeenCalledWith('play_state', null);
    });

    it('stops if playId validation fails', async () => {
      const cmd = new PlayStateSyncCommand();
      const socket = buildSocket();
      const helpers = buildHelpers({ validatePlayId: jest.fn().mockReturnValue(false) });
      const gameEngine = buildGameEngine();

      await cmd.execute({
        socket,
        data: { playId: 'invalid' },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.getPlayState).not.toHaveBeenCalled();
    });
  });

  describe('RfidScanFromClientCommand', () => {
    it('delegates to handleRfidScanFromClient helper', async () => {
      const cmd = new RfidScanFromClientCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();
      const gameEngine = buildGameEngine();
      const rfidService = {};
      const logger = buildLogger();

      await cmd.execute({
        socket,
        data: { uid: 'AA000001' },
        helpers,
        gameEngine,
        rfidService,
        logger
      });

      expect(helpers.handleRfidScanFromClient).toHaveBeenCalledWith(
        socket,
        { uid: 'AA000001' },
        gameEngine,
        rfidService,
        logger
      );
    });
  });

  describe('BoardReadyCommand', () => {
    it('confirms board ready when role and ownership pass', async () => {
      const cmd = new BoardReadyCommand();
      const socket = buildSocket();
      const helpers = buildHelpers();
      const gameEngine = buildGameEngine({ confirmBoardReady: jest.fn().mockResolvedValue() });

      await cmd.execute({
        socket,
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(helpers.requireSocketRole).toHaveBeenCalledWith(
        socket,
        ['teacher', 'super_admin'],
        'board_ready'
      );
      expect(helpers.requirePlayOwnership).toHaveBeenCalledWith(
        socket,
        VALID_PLAY_ID,
        'board_ready'
      );
      expect(gameEngine.confirmBoardReady).toHaveBeenCalledWith(VALID_PLAY_ID);
    });

    it('does NOT confirm board ready when ownership fails (cross-teacher sabotage)', async () => {
      const cmd = new BoardReadyCommand();
      const helpers = buildHelpers({ requirePlayOwnership: jest.fn().mockResolvedValue(null) });
      const gameEngine = buildGameEngine({ confirmBoardReady: jest.fn() });

      await cmd.execute({
        socket: buildSocket(),
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.confirmBoardReady).not.toHaveBeenCalled();
    });

    it('does NOT confirm board ready when role check fails', async () => {
      const cmd = new BoardReadyCommand();
      const helpers = buildHelpers({ requireSocketRole: jest.fn().mockReturnValue(false) });
      const gameEngine = buildGameEngine({ confirmBoardReady: jest.fn() });

      await cmd.execute({
        socket: buildSocket(),
        data: { playId: VALID_PLAY_ID },
        helpers,
        logger: buildLogger(),
        gameEngine
      });

      expect(gameEngine.confirmBoardReady).not.toHaveBeenCalled();
    });
  });
});
