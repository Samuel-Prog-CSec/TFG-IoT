import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConfirmationModal } from '../ConfirmationModal';

describe('useConfirmationModal hook', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useConfirmationModal());

    expect(result.current.isOpen).toBe(false);
  });

  it('opens via open()', () => {
    const { result } = renderHook(() => useConfirmationModal());

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
  });

  it('closes via close()', () => {
    const { result } = renderHook(() => useConfirmationModal());

    act(() => result.current.open());
    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
  });

  it('closeModal is an alias for close', () => {
    const { result } = renderHook(() => useConfirmationModal());

    act(() => result.current.open());
    act(() => result.current.closeModal());

    expect(result.current.isOpen).toBe(false);
  });

  it('openModal sets config and opens', () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useConfirmationModal());

    act(() => {
      result.current.openModal({
        title: 'Delete item',
        description: 'Are you sure?',
        confirmText: 'Delete',
        variant: 'danger',
        onConfirm
      });
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.modalProps.title).toBe('Delete item');
    expect(result.current.modalProps.description).toBe('Are you sure?');
    expect(result.current.modalProps.confirmText).toBe('Delete');
    expect(result.current.modalProps.variant).toBe('danger');
    expect(result.current.modalProps.onConfirm).toBe(onConfirm);
  });

  it('modalProps.onClose closes the modal', () => {
    const { result } = renderHook(() => useConfirmationModal());

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.modalProps.onClose());
    expect(result.current.isOpen).toBe(false);
  });

  it('supports message property as alias for description', () => {
    const { result } = renderHook(() => useConfirmationModal());

    act(() => {
      result.current.openModal({ message: 'Legacy message' });
    });

    expect(result.current.modalProps.description).toBe('Legacy message');
  });
});
