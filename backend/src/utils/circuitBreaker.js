/**
 * @fileoverview Implementacion simple de Circuit Breaker.
 */

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

  canRequest() {
    if (this.state === 'open') {
      if (this.lastFailureAt && Date.now() - this.lastFailureAt >= this.resetTimeoutMs) {
        this.state = 'half_open';
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
        this.state = 'closed';
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
      this.state = 'open';
      this.lastFailureAt = Date.now();
      this.failureCount = this.failureThreshold;
      this.halfOpenInFlight = false;
      return;
    }

    this.failureCount += 1;
    this.lastFailureAt = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
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
