import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import CharacterMascot from '../CharacterMascot';

// "Continuidad sobre teletransporte": el rig facial de Otto (cejas, ojos, pico,
// mejillas, alas) NUNCA debe desmontarse al cambiar de mood. Antes un
// `<AnimatePresence mode="wait">` keyed por mood envolvía toda la cara → se
// borraba ~0.22-0.44s en cada transición (ojos/pico desaparecían en el timeout)
// y el ala/pompones se desincronizaban del prop. Estos tests blindan que la
// cara persiste (mismo nodo entre rerenders) y que cada slot corresponde al
// mood, sin remontar.

const h = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => ({ shouldReduceMotion: h.reduced })
}));

// jsdom no implementa IntersectionObserver (lo usa `useInView` para pausar los
// loops fuera de viewport). Stub que nunca dispara → isInView=false →
// animationsActive=false → render determinista e instantáneo (sin parpadeo-swap
// asíncrono), ideal para asserts estructurales.
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
});

const face = (c) => c.querySelector('[data-otto-face]');
const slot = (c, name) => c.querySelectorAll(`[data-otto-slot="${name}"]`);

describe('CharacterMascot — persistencia del rig (continuidad sobre teletransporte)', () => {
  it('la CARA no se desmonta al cambiar de mood (mismo nodo)', () => {
    const { container, rerender } = render(<CharacterMascot mood="idle" />);
    const before = face(container);
    expect(before).not.toBeNull();

    rerender(<CharacterMascot mood="sad" />);
    const afterSad = face(container);
    rerender(<CharacterMascot mood="celebrating" />);
    const afterCeleb = face(container);

    // Mismo nodo DOM → no hubo remount (el `key={mood}` lo rompía).
    expect(afterSad).toBe(before);
    expect(afterCeleb).toBe(before);
  });

  it('ojos, cejas y pico NUNCA quedan a cero tras un cambio de mood (no blank-out)', () => {
    const { container, rerender } = render(<CharacterMascot mood="idle" />);
    for (const mood of ['sad', 'pointing', 'celebrating', 'worried', 'happy', 'thinking', 'greeting']) {
      rerender(<CharacterMascot mood={mood} />);
      expect(slot(container, 'eyes').length).toBe(1);
      expect(slot(container, 'brows').length).toBe(1);
      expect(slot(container, 'beak').length).toBe(1);
    }
  });

  // Renders FRESCOS por mood (no rerender): en jsdom AnimatePresence mantiene
  // montado el elemento SALIENTE porque sin timers de animación el `exit` nunca
  // "completa" (en la app real sí: las mejillas/alas hacen su fade-out). El
  // mount limpio expone sólo la variante activa.
  it('mejillas: presentes en happy, ausentes en idle', () => {
    const happy = render(<CharacterMascot mood="happy" />);
    expect(slot(happy.container, 'cheeks').length).toBe(1);
    const idle = render(<CharacterMascot mood="idle" />);
    expect(slot(idle.container, 'cheeks').length).toBe(0);
  });

  it('alas: 2 en reposo (idle), 1 al señalar (pointing), 4 con pompones (encouraging)', () => {
    const idle = render(<CharacterMascot mood="idle" />);
    expect(slot(idle.container, 'wings')[0].querySelectorAll('ellipse').length).toBe(2);
    const pointing = render(<CharacterMascot mood="pointing" />);
    expect(slot(pointing.container, 'wings')[0].querySelectorAll('ellipse').length).toBe(1);
    const encouraging = render(<CharacterMascot mood="encouraging" />);
    expect(slot(encouraging.container, 'wings')[0].querySelectorAll('ellipse').length).toBe(4);
  });

  // Saludo (`greeting`): mood nuevo para la bienvenida del onboarding. Reusa la
  // cara persistente y añade la variante de ala `wave` (ala izq reposo + ala
  // dcha levantada saludando = 3 elipses). Bloquea que el gesto se renderice.
  it('saludo (greeting): cara persiste + ala wave (3 elipses)', () => {
    const { container } = render(<CharacterMascot mood="greeting" />);
    expect(slot(container, 'eyes').length).toBe(1);
    expect(slot(container, 'beak').length).toBe(1);
    expect(slot(container, 'wings')[0].querySelectorAll('ellipse').length).toBe(3);
  });

  // Regresión: el gesto de SEÑALAR debe dibujar el ala/brazo extendido índigo
  // (recuperado de la hoja de modelo canónica) además de la flecha. Sin él la
  // flecha flotaba suelta y no se leía que Otto señalara — el bug histórico que
  // reaparecía. Bloquea que el `d` del brazo (M148 119 …) siga presente en props.
  it('señalar (pointing): dibuja el ala/brazo extendido + flecha (no flecha suelta)', () => {
    const { container } = render(<CharacterMascot mood="pointing" />);
    const props = container.querySelector('[data-otto-slot="props"]');
    expect(props).not.toBeNull();
    const paths = [...props.querySelectorAll('path')].map((p) => p.getAttribute('d') || '');
    // brazo/ala extendida que nace del costado derecho hacia la flecha
    expect(paths.some((d) => d.startsWith('M148 119'))).toBe(true);
  });

  it('props: vacío en idle, con contenido en moods expresivos', () => {
    const { container, rerender } = render(<CharacterMascot mood="idle" />);
    expect(slot(container, 'props')[0].children.length).toBe(0);
    rerender(<CharacterMascot mood="thinking" />);
    expect(slot(container, 'props')[0].children.length).toBeGreaterThan(0);
  });

  it('namespacing por uid: dos Ottos en la misma página no colisionan en IDs de gradiente', () => {
    const { container } = render(
      <div>
        <CharacterMascot mood="idle" />
        <CharacterMascot mood="happy" />
      </div>
    );
    const ids = [...container.querySelectorAll('[id^="owlBody-"]')].map((n) => n.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('reduced-motion: la cara sigue persistiendo entre moods (sin crash)', () => {
    h.reduced = true;
    try {
      const { container, rerender } = render(<CharacterMascot mood="idle" />);
      const before = face(container);
      rerender(<CharacterMascot mood="surprised" />);
      expect(face(container)).toBe(before);
      expect(slot(container, 'eyes').length).toBe(1);
      expect(slot(container, 'beak').length).toBe(1);
    } finally {
      h.reduced = false;
    }
  });
});
