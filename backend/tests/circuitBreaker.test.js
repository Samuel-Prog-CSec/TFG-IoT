/**
 * @fileoverview Tests unitarios para CircuitBreaker.
 * Verifica transiciones de estado: closed → open → half_open → closed/open.
 */

const { CircuitBreaker } = require('../src/utils/circuitBreaker');

describe('CircuitBreaker', () => {
  describe('constructor', () => {
    it('uses sensible defaults', () => {
      const cb = new CircuitBreaker();
      const state = cb.getState();

      expect(state.name).toBe('breaker');
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.lastFailureAt).toBeNull();
      expect(state.resetTimeoutMs).toBe(15000);
    });

    it('accepts custom configuration', () => {
      const cb = new CircuitBreaker({
        name: 'redis',
        failureThreshold: 3,
        successThreshold: 1,
        resetTimeoutMs: 5000
      });

      const state = cb.getState();
      expect(state.name).toBe('redis');
      expect(state.resetTimeoutMs).toBe(5000);
    });
  });

  describe('closed state', () => {
    it('allows requests when closed', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      expect(cb.canRequest()).toBe(true);
    });

    it('stays closed when failures are below threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure();
      cb.recordFailure();

      expect(cb.getState().state).toBe('closed');
      expect(cb.canRequest()).toBe(true);
    });

    it('resets failureCount on success', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess();

      expect(cb.getState().failureCount).toBe(0);
    });
  });

  describe('closed → open transition', () => {
    it('opens when failure count reaches threshold', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });

      cb.recordFailure();
      cb.recordFailure();
      cb.recordFailure();

      expect(cb.getState().state).toBe('open');
      expect(cb.getState().lastFailureAt).not.toBeNull();
    });

    it('rejects requests when open', () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      cb.recordFailure();

      expect(cb.getState().state).toBe('open');
      expect(cb.canRequest()).toBe(false);
    });
  });

  describe('open → half_open transition', () => {
    it('transitions to half_open after resetTimeoutMs', () => {
      jest.useFakeTimers();

      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
      cb.recordFailure();
      expect(cb.getState().state).toBe('open');

      jest.advanceTimersByTime(5000);

      expect(cb.canRequest()).toBe(true);
      expect(cb.getState().state).toBe('half_open');

      jest.useRealTimers();
    });

    it('does not transition before resetTimeoutMs', () => {
      jest.useFakeTimers();

      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });
      cb.recordFailure();

      jest.advanceTimersByTime(4999);

      expect(cb.canRequest()).toBe(false);
      expect(cb.getState().state).toBe('open');

      jest.useRealTimers();
    });
  });

  describe('half_open state', () => {
    let cb;

    beforeEach(() => {
      jest.useFakeTimers();
      cb = new CircuitBreaker({
        failureThreshold: 1,
        successThreshold: 2,
        resetTimeoutMs: 1000
      });
      cb.recordFailure();
      jest.advanceTimersByTime(1000);
      cb.canRequest();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('only allows one in-flight request at a time', () => {
      // First half_open call is allowed and marks in-flight
      expect(cb.canRequest()).toBe(true);
      // Second call is blocked while first is in-flight
      expect(cb.canRequest()).toBe(false);
    });

    it('transitions to closed after reaching successThreshold', () => {
      // First half_open request (allowed)
      cb.canRequest();
      cb.recordSuccess();
      // Second half_open request (halfOpenInFlight reset by recordSuccess)
      cb.canRequest();
      cb.recordSuccess();

      expect(cb.getState().state).toBe('closed');
      expect(cb.getState().failureCount).toBe(0);
      expect(cb.getState().successCount).toBe(0);
    });

    it('transitions back to open on a single failure', () => {
      cb.canRequest(); // first half_open request
      cb.recordFailure();

      expect(cb.getState().state).toBe('open');
      expect(cb.getState().failureCount).toBe(1);
    });
  });

  describe('getState', () => {
    it('returns a complete snapshot of internal state', () => {
      const cb = new CircuitBreaker({ name: 'test-breaker' });
      const state = cb.getState();

      expect(state).toEqual({
        name: 'test-breaker',
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        resetTimeoutMs: 15000
      });
    });
  });
});
