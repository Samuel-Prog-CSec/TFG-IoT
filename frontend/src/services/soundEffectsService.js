/**
 * Servicio de efectos de sonido para el juego
 * Genera tonos usando Web Audio API — sin archivos externos
 * Latencia minima (< 50ms) para feedback inmediato
 */

class SoundEffectsService {
  constructor() {
    this._ctx = null;
    this._enabled = true;
    // BUG-AUDIO-1 (QA 2026-05-14): unlock al primer gesture del usuario
    // (click/keydown/touchstart). Antes el AudioContext se creaba en el
    // primer _playTone aunque no hubiera habido interacción, lo que disparaba
    // el warning "AudioContext was not allowed to start" en Chrome y dejaba
    // el ctx en estado 'suspended' hasta el siguiente reproducir.
    this._unlocked = false;
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this._unlocked = true;
        // Si por alguna razón ya existía el ctx, lo despertamos.
        if (this._ctx && this._ctx.state === 'suspended') {
          this._ctx.resume().catch(() => { /* ignorar */ });
        }
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
    }
  }

  // Lazy init para evitar autoplay policy
  _getContext() {
    if (!this._unlocked) {
      // Aún no hubo gesture: no crear el ctx para no disparar el warning
      // del autoplay policy. La primera llamada útil ocurrirá tras click/key.
      return null;
    }
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume si esta suspendido (autoplay policy)
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => { /* ignorar */ });
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
      if (!ctx) return;
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
      if (!ctx) return;
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

  // ============================================================
  // T-953 Fase 2.6 — sonidos kid-friendly de la mascota
  // ============================================================

  /**
   * "Chirp" de la mascota cuando saluda al alumno o aparece en la UI
   * (greeting, primer mount). Dos picos cortos y agudos que evocan un
   * pajarito (la mascota es un búho 🦉 y el sonido refuerza la
   * identidad sin necesidad de voz humana grabada).
   */
  playMascotChirp() {
    this._playSequence([
      { freq: 1320, dur: 0.06, type: 'sine' }, // E6
      { freq: 1568, dur: 0.08, type: 'sine' }, // G6
    ], 0.15);
  }

  /**
   * "Sparkle" cuando se alcanza una racha o se desbloquea una
   * micro-celebración (cada 5 aciertos consecutivos). Arpegio rápido
   * en escala mayor para reforzar el "subiendo".
   */
  playStreakSparkle() {
    this._playSequence([
      { freq: 1047, dur: 0.05, type: 'sine' }, // C6
      { freq: 1319, dur: 0.05, type: 'sine' }, // E6
      { freq: 1568, dur: 0.05, type: 'sine' }, // G6
      { freq: 2093, dur: 0.08, type: 'sine' }, // C7
    ], 0.18);
  }

  /**
   * Fanfare de fin de juego escalado según estrellas obtenidas. La
   * intensidad y duración crecen con el tier para que la pantalla
   * GameOver suene proporcional al rendimiento del alumno.
   *
   *  - 1-2⭐ → pop suave de un par de notas.
   *  - 3-4⭐ → arpegio C-E-G-C de duración media.
   *  - 5⭐ → fanfare completa C-E-G-C-E-G-C ascendente y final largo.
   *
   * @param {number} stars — 1..5 (escala canónica)
   */
  playGameOverFanfare(stars) {
    if (!this._enabled || !Number.isFinite(stars) || stars <= 0) return;
    if (stars <= 2) {
      this._playSequence([
        { freq: 523, dur: 0.12 },  // C5
        { freq: 659, dur: 0.18 },  // E5
      ], 0.22);
      return;
    }
    if (stars <= 4) {
      this._playSequence([
        { freq: 523, dur: 0.1 },   // C5
        { freq: 659, dur: 0.1 },   // E5
        { freq: 784, dur: 0.1 },   // G5
        { freq: 1047, dur: 0.2 },  // C6
      ], 0.28);
      return;
    }
    // 5 estrellas — fanfare más rica.
    this._playSequence([
      { freq: 523, dur: 0.08 },    // C5
      { freq: 659, dur: 0.08 },    // E5
      { freq: 784, dur: 0.08 },    // G5
      { freq: 1047, dur: 0.08 },   // C6
      { freq: 1319, dur: 0.1 },    // E6
      { freq: 1568, dur: 0.1 },    // G6
      { freq: 2093, dur: 0.3 },    // C7 (largo final)
    ], 0.32);
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
