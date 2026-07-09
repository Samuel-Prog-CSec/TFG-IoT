import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PrintDeckModal from '../PrintDeckModal';
import { decksAPI } from '../../../services/api';
import { downloadBlob } from '../../../lib/utils';
import { toast } from 'sonner';

// Proxy de framer-motion: los motion.X se renderizan como <div> planos
// (sin props de animación) para queries deterministas.
vi.mock('framer-motion', () => {
  const strip = ({
    children,
    initial,
    animate,
    exit,
    transition,
    variants,
    whileHover,
    whileTap,
    whileInView,
    layout,
    layoutId,
    ...props
  }) => <div {...props}>{children}</div>;
  const motionProxy = new Proxy({}, { get: () => strip });
  return { motion: motionProxy, m: motionProxy, AnimatePresence: ({ children }) => <>{children}</> };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

vi.mock('../../../lib/utils', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, downloadBlob: vi.fn() };
});

vi.mock('../../../services/api', () => ({
  decksAPI: {
    printDeck: vi.fn(async () => ({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }) }))
  },
  extractErrorMessage: error => error?.message || 'error'
}));

vi.mock('../../ui/ButtonPremium', () => ({
  default: ({ children, onClick, disabled, loading }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  )
}));

vi.mock('../../ui/Tooltip', () => ({ default: ({ children }) => <>{children}</> }));

vi.mock('../../game/CharacterMascot', () => ({ default: () => <div data-testid="mascot" /> }));

const withImages = [
  { uid: 'AA000001', assignedValue: 'España', displayData: { imageUrl: 'es.webp', thumbnailUrl: 'es-t.webp' } },
  { uid: 'AA000002', assignedValue: 'Francia', displayData: { imageUrl: 'fr.webp', thumbnailUrl: 'fr-t.webp' } },
  { uid: 'AA000003', assignedValue: 'Solo audio', displayData: { audioUrl: 'a.mp3' } }
];

const renderModal = (props = {}) =>
  render(
    <PrintDeckModal
      open
      onClose={vi.fn()}
      deckId="deck-1"
      deckName="Mazo Europa"
      cards={withImages}
      {...props}
    />
  );

describe('PrintDeckModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el modal y excluye del selector las cartas sin imagen', () => {
    renderModal();
    expect(screen.getByRole('heading', { name: /imprimir cartas/i })).toBeInTheDocument();
    // 2 de las 3 cartas tienen imagen.
    expect(screen.getByText(/2 de 2/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'España' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Solo audio' })).not.toBeInTheDocument();
  });

  it('estado vacío cuando el mazo no tiene imágenes', () => {
    renderModal({ cards: [{ uid: 'X1', assignedValue: 'a', displayData: { audioUrl: 'a.mp3' } }] });
    expect(screen.getByText(/no tiene imágenes que imprimir/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /descargar pdf/i })).not.toBeInTheDocument();
  });

  it('valida el tamaño personalizado y deshabilita la descarga', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('radio', { name: /personalizado/i }));
    const widthInput = screen.getByLabelText(/ancho/i);
    await user.clear(widthInput);
    await user.type(widthInput, '1');

    expect(await screen.findByText(/mínimo es 2 cm/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
  });

  it('deshabilita la descarga si no hay cartas seleccionadas', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: /^ninguno$/i }));
    expect(screen.getByRole('button', { name: /descargar pdf/i })).toBeDisabled();
  });

  it('descarga el PDF con el tamaño estándar (sin cardUids cuando están todas)', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /descargar pdf/i }));

    await waitFor(() => {
      expect(decksAPI.printDeck).toHaveBeenCalledWith('deck-1', {
        cardWidthMm: 55,
        cardHeightMm: 85,
        showLabel: false
      });
    });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalled();
  });

  it('envía cardUids cuando se imprime un subconjunto', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole('button', { name: /^ninguno$/i }));
    await user.click(screen.getByRole('checkbox', { name: 'España' }));
    await user.click(screen.getByRole('button', { name: /descargar pdf/i }));

    await waitFor(() => {
      expect(decksAPI.printDeck).toHaveBeenCalledWith('deck-1', {
        cardWidthMm: 55,
        cardHeightMm: 85,
        showLabel: false,
        cardUids: ['AA000001']
      });
    });
  });

  it('muestra el error si la generación falla', async () => {
    const user = userEvent.setup();
    decksAPI.printDeck.mockRejectedValueOnce(new Error('El servidor falló'));
    renderModal();

    await user.click(screen.getByRole('button', { name: /descargar pdf/i }));

    expect(await screen.findByText('El servidor falló')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalled();
  });
});
