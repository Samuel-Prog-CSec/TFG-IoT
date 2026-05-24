import { describe, it, expect } from 'vitest';
import { getCurrentMonthRange, getCurrentQuarterRange } from '../dateUtils';

describe('getCurrentMonthRange', () => {
  it('arranca el dia 1 del mes a las 00:00 horario local', () => {
    const now = new Date(2026, 4, 21, 14, 35, 12); // 21 mayo 2026 14:35:12
    const { start, end } = getCurrentMonthRange(now);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(4); // mayo (0-indexed)
    expect(start.getFullYear()).toBe(2026);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
    expect(end).toBe(now);
  });

  it('en enero arranca el 1 de enero del mismo ano', () => {
    const now = new Date(2026, 0, 8, 9, 0, 0); // 8 enero 2026
    const { start, end } = getCurrentMonthRange(now);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(start.getFullYear()).toBe(2026);
    expect(end).toBe(now);
  });

  it('por defecto usa `new Date()` cuando no se pasa argumento', () => {
    const beforeCall = new Date();
    const { start, end } = getCurrentMonthRange();
    const afterCall = new Date();
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    // `end` debe situarse entre antes y despues del call
    expect(end.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
    expect(end.getTime()).toBeLessThanOrEqual(afterCall.getTime());
  });
});

describe('getCurrentQuarterRange', () => {
  it('en enero (Q1) arranca el 1 de enero', () => {
    const now = new Date(2026, 0, 15, 10, 0, 0); // 15 enero 2026
    const { start } = getCurrentQuarterRange(now);
    expect(start.getMonth()).toBe(0); // enero
    expect(start.getDate()).toBe(1);
    expect(start.getFullYear()).toBe(2026);
  });

  it('en mayo (Q2) arranca el 1 de abril', () => {
    const now = new Date(2026, 4, 21, 14, 35, 12); // 21 mayo 2026
    const { start } = getCurrentQuarterRange(now);
    expect(start.getMonth()).toBe(3); // abril
    expect(start.getDate()).toBe(1);
    expect(start.getFullYear()).toBe(2026);
  });

  it('en agosto (Q3) arranca el 1 de julio', () => {
    const now = new Date(2026, 7, 15, 12, 0, 0); // 15 agosto 2026
    const { start } = getCurrentQuarterRange(now);
    expect(start.getMonth()).toBe(6); // julio
    expect(start.getDate()).toBe(1);
  });

  it('en diciembre (Q4) arranca el 1 de octubre del mismo ano', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59); // 31 diciembre 2026
    const { start, end } = getCurrentQuarterRange(now);
    expect(start.getMonth()).toBe(9); // octubre
    expect(start.getDate()).toBe(1);
    expect(start.getFullYear()).toBe(2026); // mismo ano, no cruza
    expect(end).toBe(now);
  });
});
