import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectPremium from '../SelectPremium';

const buildOptions = (count) =>
  Array.from({ length: count }, (_, i) => ({
    value: `id-${i}`,
    label: `Estudiante ${String.fromCharCode(65 + (i % 26))}${i}`
  }));

describe('SelectPremium · searchable (PROP-70/84)', () => {
  describe('auto threshold', () => {
    it('NO renderiza el input de búsqueda cuando hay 20 o menos opciones', async () => {
      const user = userEvent.setup();
      render(<SelectPremium options={buildOptions(20)} value="" onChange={() => {}} placeholder="Selec" />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.queryByLabelText('Buscar opciones')).not.toBeInTheDocument();
    });

    it('renderiza el input de búsqueda automáticamente cuando hay >20 opciones', async () => {
      const user = userEvent.setup();
      render(<SelectPremium options={buildOptions(25)} value="" onChange={() => {}} placeholder="Selec" />);

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByLabelText('Buscar opciones')).toBeInTheDocument();
    });
  });

  describe('searchable forzado', () => {
    it('searchable=true muestra el input incluso con pocas opciones', async () => {
      const user = userEvent.setup();
      render(
        <SelectPremium
          options={buildOptions(3)}
          value=""
          onChange={() => {}}
          placeholder="Selec"
          searchable
        />
      );

      await user.click(screen.getByRole('combobox'));

      expect(screen.getByLabelText('Buscar opciones')).toBeInTheDocument();
    });

    it('searchable=false NO muestra el input ni con muchas opciones', async () => {
      const user = userEvent.setup();
      render(
        <SelectPremium
          options={buildOptions(50)}
          value=""
          onChange={() => {}}
          placeholder="Selec"
          searchable={false}
        />
      );

      await user.click(screen.getByRole('combobox'));

      expect(screen.queryByLabelText('Buscar opciones')).not.toBeInTheDocument();
    });
  });

  describe('filtrado por query', () => {
    it('filtra las opciones por label case-insensitive', async () => {
      const user = userEvent.setup();
      const options = [
        { value: '1', label: 'María García' },
        { value: '2', label: 'Carlos López' },
        { value: '3', label: 'María Fernández' },
        { value: '4', label: 'Daniel Pérez' }
      ];

      render(
        <SelectPremium options={options} value="" onChange={() => {}} placeholder="X" searchable />
      );

      await user.click(screen.getByRole('combobox'));
      const input = screen.getByLabelText('Buscar opciones');
      await user.type(input, 'maría');

      expect(screen.getByRole('option', { name: /maría garcía/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /maría fernández/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /carlos lópez/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /daniel pérez/i })).not.toBeInTheDocument();
    });

    it('aria-live anuncia el conteo de resultados', async () => {
      const user = userEvent.setup();
      const options = [
        { value: '1', label: 'Apple' },
        { value: '2', label: 'Banana' },
        { value: '3', label: 'Cherry' }
      ];

      render(
        <SelectPremium options={options} value="" onChange={() => {}} placeholder="X" searchable />
      );

      await user.click(screen.getByRole('combobox'));
      await user.type(screen.getByLabelText('Buscar opciones'), 'a');

      // "Apple" + "Banana" matchean → 2 resultados
      const live = document.querySelector('[aria-live="polite"]');
      expect(live).toHaveTextContent('2 resultados');
    });

    it('muestra "Sin coincidencias" cuando no hay matches', async () => {
      const user = userEvent.setup();
      const options = [
        { value: '1', label: 'Apple' },
        { value: '2', label: 'Banana' }
      ];

      render(
        <SelectPremium options={options} value="" onChange={() => {}} placeholder="X" searchable />
      );

      await user.click(screen.getByRole('combobox'));
      await user.type(screen.getByLabelText('Buscar opciones'), 'zzz');

      expect(screen.getAllByText(/sin coincidencias/i).length).toBeGreaterThan(0);
    });
  });

  describe('comportamiento legacy', () => {
    it('selecciona una opción al hacer click sobre ella', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const options = [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' }
      ];

      render(<SelectPremium options={options} value="" onChange={onChange} placeholder="X" />);

      await user.click(screen.getByRole('combobox'));
      await user.click(screen.getByRole('option', { name: /beta/i }));

      expect(onChange).toHaveBeenCalledWith('b');
    });
  });
});
