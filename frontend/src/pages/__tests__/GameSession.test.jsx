import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import GameSession from '../GameSession';
import { socketService, SOCKET_EVENTS } from '../../services/socket';
import webSerialService from '../../services/webSerialService';
import { sessionsAPI, playsAPI } from '../../services/api';

let currentSessionData = null;

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', role: 'teacher' } })
}));

vi.mock('../../hooks', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true })
}));

vi.mock('../../components/ui/RFIDConnector', () => ({
  default: () => <div data-testid="rfid-connector">RFID connector</div>
}));

vi.mock('../../components/ui', () => ({
  CardAssetPreview: () => <div>asset</div>
}));

vi.mock('../../components/game', () => ({
  ChallengeDisplay: () => <div data-testid="challenge-display">challenge</div>,
  TimerBar: () => <div data-testid="timer">timer</div>,
  ScoreDisplayCompact: () => <div data-testid="score">score</div>,
  FeedbackOverlay: () => <div data-testid="feedback">feedback</div>,
  GameOverScreen: () => <div data-testid="game-over">game-over</div>,
  CharacterMascot: () => <div data-testid="mascot">mascot</div>
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn()
  }
}));

vi.mock('../../services/socket', () => {
  let connected = false;
  const listeners = new Map();

  const addListener = (event, callback) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
  };

  const removeListener = (event, callback) => {
    if (!listeners.has(event)) {
      return;
    }
    if (!callback) {
      listeners.delete(event);
      return;
    }
    listeners.get(event).delete(callback);
  };

  const emitEvent = (event, payload) => {
    const callbacks = listeners.get(event);
    if (!callbacks) {
      return;
    }
    callbacks.forEach(cb => cb(payload));
  };

  const SOCKET_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    SESSION_INVALIDATED: 'session_invalidated',
    RFID_EVENT: 'rfid_event',
    RFID_STATUS: 'rfid_status',
    RFID_MODE_CHANGED: 'rfid_mode_changed',
    RFID_SCAN_FROM_CLIENT: 'rfid_scan_from_client',
    JOIN_PLAY: 'join_play',
    LEAVE_PLAY: 'leave_play',
    START_PLAY: 'start_play',
    PAUSE_PLAY: 'pause_play',
    RESUME_PLAY: 'resume_play',
    NEXT_ROUND: 'next_round',
    JOIN_CARD_REGISTRATION: 'join_card_registration',
    LEAVE_CARD_REGISTRATION: 'leave_card_registration',
    JOIN_CARD_ASSIGNMENT: 'join_card_assignment',
    LEAVE_CARD_ASSIGNMENT: 'leave_card_assignment',
    PLAY_STATE: 'play_state',
    NEW_ROUND: 'new_round',
    MEMORY_TURN_STATE: 'memory_turn_state',
    VALIDATION_RESULT: 'validation_result',
    GAME_OVER: 'game_over',
    PLAY_INTERRUPTED: 'play_interrupted',
    PLAY_PAUSED: 'play_paused',
    PLAY_RESUMED: 'play_resumed',
    ERROR: 'error'
  };

  return {
    SOCKET_EVENTS,
    socketService: {
      connect: vi.fn(async () => {
        connected = true;
      }),
      disconnect: vi.fn(() => {
        connected = false;
      }),
      isSocketConnected: vi.fn(() => connected),
      on: vi.fn(addListener),
      off: vi.fn(removeListener),
      sendCommand: vi.fn(() => true),
      __emit: emitEvent,
      __setConnected: (value) => {
        connected = value;
      }
    }
  };
});

vi.mock('../../services/webSerialService', () => {
  const listeners = new Map();

  const addListener = (event, callback) => {
    const current = listeners.get(event) || new Set();
    current.add(callback);
    listeners.set(event, current);
  };

  const removeListener = (event, callback) => {
    if (!listeners.has(event)) {
      return;
    }
    listeners.get(event).delete(callback);
  };

  const emitEvent = (event, payload) => {
    const callbacks = Array.from(listeners.get(event) || []);
    if (callbacks.length === 0) {
      return;
    }

    for (const callback of callbacks) {
      callback(payload);
    }
  };

  return {
    __esModule: true,
    default: {
      on: vi.fn(addListener),
      off: vi.fn(removeListener),
      __emit: emitEvent
    }
  };
});

vi.mock('../../services/api', () => ({
  sessionsAPI: {
    getSessionById: vi.fn(async () => ({ data: currentSessionData })),
    startSession: vi.fn(async () => ({ data: { ...currentSessionData, status: 'active' } }))
  },
  usersAPI: {
    getStudentsByTeacher: vi.fn(async () => ({ data: [{ id: 'student-1' }] }))
  },
  playsAPI: {
    getPlays: vi.fn(async () => ({ data: [] })),
    createPlay: vi.fn(async () => ({ data: { id: 'play-1', playerId: 'student-1' } }))
  },
  extractData: (response) => response?.data,
  extractErrorMessage: (error) => error?.message || 'error',
  isAbortError: () => false
}));

function renderGameSession() {
  return render(
    <MemoryRouter initialEntries={['/game/session-1?playerId=student-1']}>
      <Routes>
        <Route path="/game/:sessionId" element={<GameSession />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GameSession realtime gameplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    currentSessionData = {
      id: 'session-1',
      status: 'active',
      deck: { name: 'Animales' },
      mechanic: { name: 'association' },
      config: {
        numberOfRounds: 5,
        timeLimit: 15,
        pointsPerCorrect: 10,
        penaltyPerError: -2
      }
    };

    socketService.__setConnected(false);
    socketService.sendCommand.mockReturnValue(true);
  });

  it('renders association gameplay and updates round event in realtime', async () => {
    renderGameSession();

    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Perro',
            display: '🐶'
          }
        }
      });
    });

    expect(await screen.findByText(/^Busca$/i)).toBeInTheDocument();
    expect(screen.getByText(/Puntos/i)).toBeInTheDocument();
  });

  it('renders memory-specific panel and pair progress from memory_turn_state', async () => {
    currentSessionData = {
      ...currentSessionData,
      mechanic: { name: 'memory' }
    };

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Memoria',
            display: '🧠'
          }
        }
      });
    });

    await screen.findByText(/Encuentra las parejas/i);

    act(() => {
      socketService.__emit(SOCKET_EVENTS.MEMORY_TURN_STATE, {
        attempts: 3,
        matchedCount: 2,
        totalCards: 4,
        board: [
          { slotIndex: 0, isMatched: true, isRevealed: true, assignedValue: 'A', displayData: { display: 'A' } },
          { slotIndex: 1, isMatched: true, isRevealed: true, assignedValue: 'A', displayData: { display: 'A' } },
          { slotIndex: 2, isMatched: false, isRevealed: false, assignedValue: 'B', displayData: null },
          { slotIndex: 3, isMatched: false, isRevealed: false, assignedValue: 'B', displayData: null }
        ]
      });
    });

    expect(await screen.findByText(/Parejas encontradas/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*2/)).toBeInTheDocument();
    expect(screen.getByText(/🧠\s*Parejas/i)).toBeInTheDocument();
  });

  it('maps realtime backend error codes to specific UX messages', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.ERROR, {
        code: 'RFID_SENSOR_UNAUTHORIZED',
        message: 'legacy'
      });
    });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalled();
    });
  });

  it('requires realtime socket to pause or resume gameplay', async () => {
    const user = userEvent.setup();
    socketService.sendCommand.mockReturnValue(false);

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Gato',
            display: '🐱'
          }
        }
      });
    });

    const pauseButton = await screen.findByLabelText('Pausar');
    await user.click(pauseButton);

    expect(socketService.sendCommand).toHaveBeenCalledWith(SOCKET_EVENTS.PAUSE_PLAY, {
      playId: 'play-1'
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('shows final summary card with persisted metrics payload from game_over', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.GAME_OVER, {
        finalScore: 80,
        metrics: {
          totalAttempts: 6,
          averageResponseTime: 3200,
          totalTimePlayed: 60000
        }
      });
    });

    expect(await screen.findByText('Resumen de la partida')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('3.2s')).toBeInTheDocument();
  });

  it('rehydrates memory snapshot from play_state after reconnect/join', async () => {
    currentSessionData = {
      ...currentSessionData,
      mechanic: { name: 'memory' }
    };

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.PLAY_STATE, {
        status: 'in-progress',
        currentRound: 2,
        score: 30,
        maxRounds: 4,
        awaitingResponse: true,
        remainingTimeMs: 8000,
        memoryState: {
          attempts: 3,
          matchedCount: 2,
          totalCards: 4,
          board: [
            { slotIndex: 0, isMatched: true, isRevealed: true, assignedValue: 'A', displayData: { display: 'A' } },
            { slotIndex: 1, isMatched: true, isRevealed: true, assignedValue: 'A', displayData: { display: 'A' } }
          ]
        }
      });
    });

    expect(await screen.findByText(/Parejas encontradas/i)).toBeInTheDocument();
    expect(screen.getByText(/1\s*\/\s*2/)).toBeInTheDocument();
  });

  it('handles play_interrupted event with warning feedback', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.PLAY_INTERRUPTED, {
        reason: 'server_restart',
        message: 'La partida fue interrumpida por reinicio.',
        finalScore: 12
      });
    });

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalled();
    });

    expect(await screen.findByTestId('game-over')).toBeInTheDocument();
  });

  it('updates RFID connection indicator from web serial runtime events', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      webSerialService.__emit('device_state_change', { state: 'ready' });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Conecta el sensor RFID/i)).not.toBeInTheDocument();
    });
  });

  it('sends touch fallback scans when RFID is disconnected', async () => {
    const user = userEvent.setup();
    currentSessionData = {
      ...currentSessionData,
      sensorId: 'sensor-class-1',
      cardMappings: [
        {
          uid: 'AA11',
          assignedValue: 'Perro',
          displayData: { display: '🐶', value: 'Perro' }
        }
      ]
    };

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Perro',
            display: '🐶'
          }
        }
      });
    });

    const cardButton = await screen.findByRole('button', { name: /perro/i });
    await user.click(cardButton);

    expect(socketService.sendCommand).toHaveBeenCalledWith(SOCKET_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: 'AA11',
      type: 'UNKNOWN',
      sensorId: 'sensor-class-1',
      timestamp: expect.any(Number),
      source: 'web_serial'
    });
  });

  it('bootstraps session and play through backend APIs', async () => {
    renderGameSession();

    await screen.findByRole('button', { name: /empezar/i });

    expect(sessionsAPI.getSessionById).toHaveBeenCalledWith('session-1', expect.any(Object));
    expect(playsAPI.createPlay).toHaveBeenCalledWith({ sessionId: 'session-1', playerId: 'student-1' });
    expect(socketService.sendCommand).toHaveBeenCalledWith(SOCKET_EVENTS.JOIN_PLAY, { playId: 'play-1' });
    expect(socketService.sendCommand).toHaveBeenCalledWith(SOCKET_EVENTS.START_PLAY, { playId: 'play-1' });
  });

  it('announces round start in the live status region for screen readers', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 5,
        score: 0,
        challenge: {
          displayData: {
            value: 'Perro',
            display: '🐶'
          }
        }
      });
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole('status', { hidden: true }).some(node =>
          node.textContent?.includes('Ronda 1 iniciada.') || node.textContent?.includes('Quedan 5 segundos.')
        )
      ).toBe(true);
    });
  });

  it('exposes semantic toggle state for sound and pause controls', async () => {
    const user = userEvent.setup();

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    const soundButton = screen.getByRole('button', { name: 'Silenciar' });
    expect(soundButton).toHaveAttribute('aria-pressed', 'true');

    await user.click(soundButton);
    expect(screen.getByRole('button', { name: 'Activar sonido' })).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Gato',
            display: '🐱'
          }
        }
      });
    });

    const pauseButton = await screen.findByRole('button', { name: 'Pausar' });
    expect(pauseButton).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      socketService.__emit(SOCKET_EVENTS.PLAY_PAUSED, { remainingTimeMs: 8000 });
    });

    expect(await screen.findByRole('button', { name: 'Reanudar' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves focus into pause dialog and supports keyboard resume with Escape', async () => {
    const user = userEvent.setup();

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.NEW_ROUND, {
        roundNumber: 1,
        totalRounds: 5,
        timeLimit: 15,
        score: 0,
        challenge: {
          displayData: {
            value: 'Pato',
            display: '🦆'
          }
        }
      });
    });

    const pauseButton = await screen.findByRole('button', { name: 'Pausar' });
    pauseButton.focus();

    act(() => {
      socketService.__emit(SOCKET_EVENTS.PLAY_PAUSED, { remainingTimeMs: 5000 });
    });

    const continueButton = await screen.findByRole('button', { name: /continuar/i });
    await waitFor(() => {
      expect(continueButton).toHaveFocus();
    });

    await user.keyboard('{Escape}');

    expect(socketService.sendCommand).toHaveBeenCalledWith(SOCKET_EVENTS.RESUME_PLAY, { playId: 'play-1' });
  });
});
