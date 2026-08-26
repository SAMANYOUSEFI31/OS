// Web Audio API Synthesizer for subtle tactile sound feedback (no external files required)

class SoundFX {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
  }

  // Crisp checkmark sound
  playCheck() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1); // A5

      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch {
      // ignore audio errors
    }
  }

  // Triumphant Standard Day Gong / Chime
  playStandardDay() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const freqs = [440, 554.37, 659.25, 880]; // A Major chord
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime + i * 0.04);

        gain.gain.setValueAtTime(0.08, this.ctx!.currentTime + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 0.6);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.04);
        osc.stop(this.ctx!.currentTime + 0.7);
      });
    } catch {
      // ignore
    }
  }

  // Sharp samurai katana slash tone
  playSlash() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.2);
    } catch {
      // ignore
    }
  }

  // Mastery (10/10 Score: 5 Habits + Special Mission) deep honorable martial chime
  playMastery() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Deep resonant bronze bell / gong fundamental frequencies
      const freqs = [196, 293.66, 392, 587.33]; // G major resonant harmonics
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);

        gain.gain.setValueAtTime(0.12 / (i + 1), this.ctx!.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 1.2);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime);
        osc.stop(this.ctx!.currentTime + 1.25);
      });
    } catch {
      // ignore
    }
  }

  // Warning tone
  playWarning() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(160, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
    } catch {
      // ignore
    }
  }
}

export const soundFX = new SoundFX();
