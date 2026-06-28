const { rfidClientEventSchema } = require('../src/validators/rfidValidator');
const { mapRfidPayloadError } = require('../src/realtime/socketHandlers');

/**
 * Regresión ADR-222 (mensaje de desfase de reloj): un timestamp fuera de la
 * ventana ±30s (equipo con la hora desincronizada → TODOS los scans fallan) debe
 * traducirse a un código propio `RFID_CLIENT_CLOCK_SKEW` con mensaje ACCIONABLE
 * (ajustar el reloj), no al genérico `VALIDATION_ERROR` con jerga ("timestamp
 * fuera de ventana permitida").
 */
describe('Mensaje de desfase de reloj RFID', () => {
  it('un timestamp fuera de ventana produce un issue de validación con path ["timestamp"]', () => {
    const result = rfidClientEventSchema.safeParse({
      uid: 'AA000001',
      type: 'MIFARE_1KB',
      sensorId: 'web_serial',
      timestamp: Date.now() - 5 * 60 * 1000, // 5 min en el pasado → fuera de ±30s
      source: 'web_serial'
    });
    expect(result.success).toBe(false);
    const timestampIssue = result.error.issues.find(issue => issue.path?.[0] === 'timestamp');
    expect(timestampIssue).toBeTruthy();
  });

  it('mapRfidPayloadError: un error de timestamp da código RFID_CLIENT_CLOCK_SKEW y mensaje accionable (sin jerga)', () => {
    const mapped = mapRfidPayloadError({
      path: ['timestamp'],
      message: 'timestamp fuera de ventana permitida (±30s)'
    });
    expect(mapped.code).toBe('RFID_CLIENT_CLOCK_SKEW');
    expect(mapped.message).toMatch(/reloj/i); // accionable: habla del reloj
    expect(mapped.message).not.toMatch(/timestamp/i); // sin jerga técnica
  });

  it('mapRfidPayloadError: otros errores de validación mantienen VALIDATION_ERROR y su mensaje', () => {
    const mapped = mapRfidPayloadError({ path: ['uid'], message: 'UID inválido' });
    expect(mapped.code).toBe('VALIDATION_ERROR');
    expect(mapped.message).toBe('UID inválido');
  });
});
