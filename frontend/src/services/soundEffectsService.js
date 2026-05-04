/**
 * Servicio de efectos de sonido para el juego
 * Genera tonos usando Web Audio API — sin archivos externos
 * Latencia minima (< 50ms) para feedback inmediato
 */

class SoundEffectsService {
  constructor() {
    this._ctx = null;
    this._enabled = true;
  }

  // Lazy init para evitar autoplay policy
  _getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume si esta suspendido (autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  setEnabled(enabled) { this._enabled = enabled; }
  get enabled() { return this._enabled; }

  // Helper: tono simple
  _playTone(frequency, duration, type = 'sine', volume = 0.3) {
    if (!this._enabled) return;
    try {
      const ctx = this._getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch { /* silenciar errores de audio */ }
  }

  // Helper: secuencia de tonos
  _playSequence(notes, volume = 0.3) {
    if (!this._enabled) return;
    try {
      const ctx = this._getContext();
      let time = ctx.currentTime;
      for (const { freq, dur, type = 'sine' } of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + dur);
        time += dur * 0.85; // ligero overlap
      }
    } catch { /* silenciar errores de audio */ }
  }

  /** Respuesta correcta — tono ascendente alegre (C5->E5) */
  playCorrect() {
    this._playSequence([
      { freq: 523, dur: 0.08 },  // C5
      { freq: 659, dur: 0.12 },  // E5
    ], 0.25);
  }

  /** Respuesta incorrecta — tono descendente suave (E4->C4) */
  playIncorrect() {
    this._playSequence([
      { freq: 330, dur: 0.1, type: 'triangle' },  // E4
      { freq: 262, dur: 0.15, type: 'triangle' },  // C4
    ], 0.2);
  }

  /** Tick del timer (ultimos 5 segundos) */
  playTick() {
    this._playTone(800, 0.05, 'sine', 0.15);
  }

  /** Inicio de ronda */
  playRoundStart() {
    this._playSequence([
      { freq: 440, dur: 0.08 },  // A4
      { freq: 554, dur: 0.08 },  // C#5
      { freq: 659, dur: 0.1 },   // E5
    ], 0.2);
  }

  /** Fin de juego */
  playGameOver() {
    this._playSequence([
      { freq: 659, dur: 0.15 },  // E5
      { freq: 554, dur: 0.15 },  // C#5
      { freq: 440, dur: 0.15 },  // A4
      { freq: 330, dur: 0.25 },  // E4
    ], 0.25);
  }

  /** Victoria / celebracion (>=2 estrellas) */
  playSuccess() {
    this._playSequence([
      { freq: 523, dur: 0.1 },   // C5
      { freq: 659, dur: 0.1 },   // E5
      { freq: 784, dur: 0.1 },   // G5
      { freq: 1047, dur: 0.2 },  // C6
    ], 0.3);
  }

  /** Aterrizaje de una carta del crupier durante el reparto. Click corto. */
  playCardDeal() {
    this._playTone(280, 0.05, 'square', 0.12);
    // pequeño "tac" agudo encima para que evoque pulgar+carta
    this._playTone(900, 0.03, 'sine', 0.08);
  }

  /** Inicio de la animación de recogida — silbido corto descendente. */
  playCardSweep() {
    this._playSequence([
      { freq: 700, dur: 0.06, type: 'sine' },
      { freq: 500, dur: 0.08, type: 'sine' },
      { freq: 350, dur: 0.1, type: 'sine' }
    ], 0.18);
  }

  /** Secuencia completada correctamente. Acorde ascendente alegre. */
  playSequenceComplete() {
    this._playSequence([
      { freq: 523, dur: 0.08 },   // C5
      { freq: 659, dur: 0.08 },   // E5
      { freq: 784, dur: 0.12 }    // G5
    ], 0.25);
  }

  dispose() {
    if (this._ctx) {
      this._ctx.close();
      this._ctx = null;
    }
  }
}

// Singleton
const soundEffectsService = new SoundEffectsService();
export default soundEffectsService;
