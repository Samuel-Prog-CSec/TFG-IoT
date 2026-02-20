const runtimeMetrics = require('../src/utils/runtimeMetrics');

describe('runtimeMetrics', () => {
  beforeEach(() => {
    runtimeMetrics.reset();
  });

  it('tracks avg latency and EWMA', () => {
    runtimeMetrics.recordHttpRequest({ durationMs: 10, statusCode: 200 });
    runtimeMetrics.recordHttpRequest({ durationMs: 30, statusCode: 200 });

    const snap = runtimeMetrics.getSnapshot();
    expect(snap.http.totalResponses).toBe(2);
    expect(snap.http.avgLatencyMs).toBe(20);
    expect(typeof snap.http.ewmaLatencyMs).toBe('number');
  });

  it('tracks RFID event counts by type', () => {
    runtimeMetrics.recordRfidEvent({ event: 'card_detected' });
    runtimeMetrics.recordRfidEvent({ event: 'card_detected' });
    runtimeMetrics.recordRfidEvent({ event: 'error' });

    const snap = runtimeMetrics.getSnapshot();
    expect(snap.rfid.totalEventsProcessed).toBe(3);
    expect(snap.rfid.byEvent.card_detected).toBe(2);
    expect(snap.rfid.byEvent.error).toBe(1);
  });

  it('tracks websocket auth cache hits and misses', () => {
    runtimeMetrics.recordSocketAuthCache('miss');
    runtimeMetrics.recordSocketAuthCache('hit');
    runtimeMetrics.recordSocketAuthCache('hit');

    const snap = runtimeMetrics.getSnapshot();
    expect(snap.websocket.authCacheMisses).toBe(1);
    expect(snap.websocket.authCacheHits).toBe(2);
  });
});
