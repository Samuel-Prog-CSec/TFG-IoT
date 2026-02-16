const NextRoundCommand = require('../src/commands/socket/NextRoundCommand');

describe('NextRoundCommand', () => {
  let command;
  let socket;
  let helpers;
  let gameEngine;

  beforeEach(() => {
    command = new NextRoundCommand();
    socket = {
      emit: jest.fn(),
      data: { userId: 'teacher-1', userRole: 'teacher' }
    };

    helpers = {
      validatePlayId: jest.fn().mockReturnValue(true),
      requireSocketRole: jest.fn().mockReturnValue(true),
      requirePlayOwnership: jest.fn().mockResolvedValue({ play: { _id: 'play-1' }, session: {} })
    };

    gameEngine = {
      advanceToNextRound: jest.fn().mockResolvedValue({ ok: true, reason: null })
    };
  });

  it('rechaza next_round si la ronda espera respuesta', async () => {
    gameEngine.advanceToNextRound.mockResolvedValue({ ok: false, reason: 'awaiting_response' });

    await command.execute({
      socket,
      data: { playId: '507f1f77bcf86cd799439011' },
      helpers,
      gameEngine
    });

    expect(gameEngine.advanceToNextRound).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('error', {
      message: 'No se puede avanzar de ronda mientras se espera una respuesta'
    });
  });

  it('avanza ronda cuando el motor lo permite', async () => {
    await command.execute({
      socket,
      data: { playId: '507f1f77bcf86cd799439011' },
      helpers,
      gameEngine
    });

    expect(gameEngine.advanceToNextRound).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
    expect(socket.emit).not.toHaveBeenCalledWith('error', expect.anything());
  });
});
