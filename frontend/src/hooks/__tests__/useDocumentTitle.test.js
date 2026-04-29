import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocumentTitle } from '../useDocumentTitle';

describe('useDocumentTitle', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
  });

  it('sets the document title with EduPlay suffix', () => {
    renderHook(() => useDocumentTitle('Dashboard'));

    expect(document.title).toBe('Dashboard | EduPlay');
  });

  it('uses default title when title is empty/falsy', () => {
    renderHook(() => useDocumentTitle(''));

    expect(document.title).toBe('EduPlay - Juegos Educativos RFID');
  });

  it('restores original title on unmount', () => {
    document.title = 'Original Title';
    const { unmount } = renderHook(() => useDocumentTitle('Test Page'));

    expect(document.title).toBe('Test Page | EduPlay');

    unmount();

    expect(document.title).toBe('Original Title');
  });

  it('does not restore title when restoreOnUnmount is false', () => {
    document.title = 'Original Title';
    const { unmount } = renderHook(() => useDocumentTitle('Persistent', false));

    expect(document.title).toBe('Persistent | EduPlay');

    unmount();

    expect(document.title).toBe('Persistent | EduPlay');
  });
});
