import { describe, it, expect } from 'vitest';
import { TEACHER_TRACK, SUPER_ADMIN_TRACK } from '../onboardingTracks';
import { OWL_MOODS } from '../../components/game/mascot/owlExpressions';

// Cada paso del tour debe llevar la voz de Otto (bocadillo) y, si fija un mood,
// debe ser uno válido del rig. Blinda que ningún paso quede "mudo".
const VALID_MOODS = new Set(OWL_MOODS);

describe('onboardingTracks — voz de Otto por paso', () => {
  for (const [name, track] of [
    ['teacher', TEACHER_TRACK],
    ['admin', SUPER_ADMIN_TRACK],
  ]) {
    it(`${name}: cada paso tiene mascotLine no vacío y mascotMood válido`, () => {
      for (const step of track) {
        expect(typeof step.mascotLine).toBe('string');
        expect(step.mascotLine.trim().length).toBeGreaterThan(0);
        if (step.mascotMood) expect(VALID_MOODS.has(step.mascotMood)).toBe(true);
      }
    });
  }
});
