import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import GameSession from '../GameSession';
import { socketService, SOCKET_EVENTS } from '../../services/socket';
import webSerialService from '../../services/webSerialService';
import { sessionsAPI, playsAPI } from '../../services/api';

let currentSessionData = null;

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'teacher-1', role: 'teacher' } })
}));

vi.mock('../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: true })
}));

vi.mock('../../components/ui/RFIDConnector', () => ({
  default: () => <div data-testid="rfid-connector">RFID connector</div>
}));

vi.mock('../../components/ui/CardAssetPreview', () => ({
  default: () => <div>asset</div>
}));

vi.mock('../../components/common/ErrorBoundary', () => ({
  default: ({ children }) => <>{children}</>
}));

vi.mock('../../components/game/ChallengeDisplay', () => ({
  default: () => <div data-testid="challenge-display">challenge</div>
}));

vi.mock('../../components/game/TimerBar', () => ({
  default: () => <div data-testid="timer">timer</div>
}));

vi.mock('../../components/game/ScoreDisplay', () => ({
  ScoreDisplayCompactMemo: () => <div data-testid="score">score</div>
}));

vi.mock('../../components/game/FeedbackOverlay', () => ({
  default: () => <div data-testid="feedback">feedback</div>
}));

vi.mock('../../components/game/GameOverScreen', () => ({
  default: ({ score, summary }) => (
    <div data-testid="game-over">
      <span>{score}</span>
      <span data-testid="go-mode">{summary?.mode || 'none'}</span>
      {summary && (
        <>
          <span>Errores</span>
          <span>{summary.errors}</span>
          <span>{summary.averageResponseTimeMs > 0 ? `${(summary.averageResponseTimeMs / 1000).toFixed(1)}s` : '—'}</span>
        </>
      )}
    </div>
  )
}));

vi.mock('../../components/game/CharacterMascot', () => ({
  default: () => <div data-testid="mascot">mascot</div>
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
  // Listeners compartidos: los tests emiten eventos sin distinción de namespace,
  // así que sistema y juego comparten el mismo mapa para simplificar.
  const listeners = new Map();
  const gameListeners = new Map();

  const addListener = (map) => (event, callback) => {
    if (!map.has(event)) {
      map.set(event, new Set());
    }
    map.get(event).add(callback);
  };

  const removeListener = (map) => (event, callback) => {
    if (!map.has(event)) {
      return;
    }
    if (!callback) {
      map.delete(event);
      return;
    }
    map.get(event).delete(callback);
  };

  // __emit busca en ambos mapas para que los tests existentes sigan funcionando
  const emitEvent = (event, payload) => {
    for (const map of [listeners, gameListeners]) {
      const callbacks = map.get(event);
      if (callbacks) {
        callbacks.forEach(cb => cb(payload));
      }
    }
  };

  const SYSTEM_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    CONNECT_ERROR: 'connect_error',
    SESSION_INVALIDATED: 'session_invalidated',
    RFID_MODE_CHANGED: 'rfid_mode_changed',
  };

  const GAME_EVENTS = {
    JOIN_PLAY: 'join_play',
    LEAVE_PLAY: 'leave_play',
    START_PLAY: 'start_play',
    PAUSE_PLAY: 'pause_play',
    RESUME_PLAY: 'resume_play',
    NEXT_ROUND: 'next_round',
    PLAY_STATE_SYNC: 'play_state_sync',
    BOARD_READY: 'board_ready',
    JOIN_CARD_ASSIGNMENT: 'join_card_assignment',
    LEAVE_CARD_ASSIGNMENT: 'leave_card_assignment',
    RFID_SCAN_FROM_CLIENT: 'rfid_scan_from_client',
    PLAY_STATE: 'play_state',
    NEW_ROUND: 'new_round',
    MEMORY_TURN_STATE: 'memory_turn_state',
    VALIDATION_RESULT: 'validation_result',
    GAME_OVER: 'game_over',
    PLAY_INTERRUPTED: 'play_interrupted',
    PLAY_PAUSED: 'play_paused',
    PLAY_RESUMED: 'play_resumed',
    SCAN_IGNORED: 'scan_ignored',
    RFID_EVENT: 'rfid_event',
    RFID_STATUS: 'rfid_status',
    ERROR: 'error',
  };

  const SOCKET_EVENTS = { ...SYSTEM_EVENTS, ...GAME_EVENTS };

  return {
    SYSTEM_EVENTS,
    GAME_EVENTS,
    SOCKET_EVENTS,
    socketService: {
      connect: vi.fn(async () => {
        connected = true;
      }),
      disconnect: vi.fn(() => {
        connected = false;
      }),
      isSocketConnected: vi.fn(() => connected),
      isGameSocketConnected: vi.fn(() => connected),
      // Namespace de sistema
      on: vi.fn(addListener(listeners)),
      off: vi.fn(removeListener(listeners)),
      sendCommand: vi.fn(() => true),
      // Namespace de juego
      onGame: vi.fn(addListener(gameListeners)),
      offGame: vi.fn(removeListener(gameListeners)),
      sendGameCommand: vi.fn(() => true),
      emitGameFireAndForget: vi.fn(),
      requestPlayStateSync: vi.fn(() => true),
      // Helpers de test
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
    createPlay: vi.fn(async () => ({ data: { id: 'play-1', playerId: 'student-1' } })),
    getPlayerStats: vi.fn(async () => ({ data: { stats: { bestScore: 0 } } }))
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
  afterEach(() => {
    cleanup();
  });

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
    socketService.sendGameCommand.mockReturnValue(true);
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

    expect(await screen.findByText(/Encuentra:/i)).toBeInTheDocument();
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

    // La barra textual "Parejas encontradas: X/Y" se eliminó del panel para
    // liberar altura vertical (el mismo dato esta en los dots del header y en
    // los corazones superiores del tablero). Los asserts ahora verifican el
    // contador "1 / 2" del header y la metric pill "Parejas" del footer
    // (el icono Brain es un SVG hermano del texto tras la migración de emojis
    // a Lucide en QA 2026-04-23; "Parejas" aparece tanto en el mini-dot del
    // header como en la pill del footer, de ahí el getAllByText).
    expect(await screen.findByText((_content, el) => /1\s*\/\s*2/.test(el?.textContent || '') && el?.tagName === 'DIV' && el?.className?.includes('font-display'))).toBeInTheDocument();
    expect(screen.getAllByText(/Parejas/i).length).toBeGreaterThan(0);
  });

  it('suppresses RFID_SENSOR_UNAUTHORIZED in touch fallback mode', async () => {
    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.ERROR, {
        code: 'RFID_SENSOR_UNAUTHORIZED',
        message: 'legacy'
      });
    });

    // RFID_SENSOR_UNAUTHORIZED se suprime en modo fallback táctil (Fix 2D)
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('requires realtime socket to pause or resume gameplay', async () => {
    const user = userEvent.setup();
    socketService.sendGameCommand.mockReturnValue(false);

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

    expect(socketService.sendGameCommand).toHaveBeenCalledWith(SOCKET_EVENTS.PAUSE_PLAY, {
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

    expect(await screen.findByText('Errores')).toBeInTheDocument();
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

    expect(await screen.findByText((_content, el) => /1\s*\/\s*2/.test(el?.textContent || '') && el?.tagName === 'DIV' && el?.className?.includes('font-display'))).toBeInTheDocument();
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

  it('conserva la mecánica en el summary al interrumpirse la partida (no cae a Asociación por defecto)', async () => {
    currentSessionData = {
      ...currentSessionData,
      mechanic: { name: 'memory' }
    };

    renderGameSession();
    await screen.findByRole('button', { name: /empezar/i });

    act(() => {
      socketService.__emit(SOCKET_EVENTS.PLAY_INTERRUPTED, {
        reason: 'server_restart',
        message: 'La partida fue interrumpida por reinicio.',
        finalScore: 12
      });
    });

    expect(await screen.findByTestId('game-over')).toBeInTheDocument();
    // El GameOver de una partida interrumpida debe reflejar la mecánica real
    // (Memoria), no el fallback por defecto a Asociación que aparecía cuando
    // `playSummary` quedaba null (GameOverStats default = Asociación).
    expect(screen.getByTestId('go-mode')).toHaveTextContent('memory');
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

    // PROP-90 / ADR-090: el fallback táctil ahora envía source='touch_fallback'
    // para que el backend aplique el cooldown corto (250ms) en vez del cooldown
    // largo del sensor hardware (1200ms).
    expect(socketService.sendGameCommand).toHaveBeenCalledWith(SOCKET_EVENTS.RFID_SCAN_FROM_CLIENT, {
      uid: 'AA11',
      type: 'UNKNOWN',
      sensorId: 'sensor-class-1',
      timestamp: expect.any(Number),
      source: 'touch_fallback'
    });
  });

  it('bootstraps session and play through backend APIs', async () => {
    renderGameSession();

    await screen.findByRole('button', { name: /empezar/i });

    expect(sessionsAPI.getSessionById).toHaveBeenCalledWith('session-1', expect.any(Object));
    expect(playsAPI.createPlay).toHaveBeenCalledWith({ sessionId: 'session-1', playerId: 'student-1' });
    expect(socketService.sendGameCommand).toHaveBeenCalledWith(SOCKET_EVENTS.JOIN_PLAY, { playId: 'play-1' });
    expect(socketService.sendGameCommand).toHaveBeenCalledWith(SOCKET_EVENTS.START_PLAY, { playId: 'play-1' });
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

    expect(socketService.sendGameCommand).toHaveBeenCalledWith(SOCKET_EVENTS.RESUME_PLAY, { playId: 'play-1' });
  });
});
