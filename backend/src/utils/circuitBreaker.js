/**
 * @fileoverview Implementacion simple de Circuit Breaker.
 * Protege contra fallos en cascada de servicios externos (Redis, Supabase).
 * Registra transiciones de estado para facilitar la observabilidad.
 */

const logger = require('./logger').child({ component: 'circuitBreaker' });

class CircuitBreaker {
  constructor({
    name = 'breaker',
    failureThreshold = 5,
    successThreshold = 2,
    resetTimeoutMs = 15000
  } = {}) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.halfOpenInFlight = false;
  }

  /** @private */
  _transition(newState) {
    const prevState = this.state;
    if (prevState === newState) {
      return;
    }
    this.state = newState;
    logger.warn(`Circuit breaker [${this.name}]: ${prevState} → ${newState}`, {
      breaker: this.name,
      from: prevState,
      to: newState,
      failureCount: this.failureCount
    });
  }

  canRequest() {
    if (this.state === 'open') {
      if (this.lastFailureAt && Date.now() - this.lastFailureAt >= this.resetTimeoutMs) {
        this._transition('half_open');
        this.halfOpenInFlight = false;
        this.successCount = 0;
        return true;
      }
      return false;
    }

    if (this.state === 'half_open') {
      if (this.halfOpenInFlight) {
        return false;
      }
      this.halfOpenInFlight = true;
      return true;
    }

    return true;
  }

  recordSuccess() {
    if (this.state === 'half_open') {
      this.successCount += 1;
      this.halfOpenInFlight = false;
      if (this.successCount >= this.successThreshold) {
        this._transition('closed');
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureAt = null;
      }
      return;
    }

    this.failureCount = 0;
  }

  recordFailure() {
    if (this.state === 'half_open') {
      this._transition('open');
      this.lastFailureAt = Date.now();
      this.failureCount = this.failureThreshold;
      this.halfOpenInFlight = false;
      return;
    }

    this.failureCount += 1;
    this.lastFailureAt = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this._transition('open');
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureAt: this.lastFailureAt,
      resetTimeoutMs: this.resetTimeoutMs
    };
  }
}

module.exports = {
  CircuitBreaker
};
