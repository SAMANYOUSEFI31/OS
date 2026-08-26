// Web Audio API Synthesizer for subtle tactile sound feedback (Zero external audio files)
// Calibrated for Bushido Stoic Discipline: resonant, warm, restrained, low-latency.

class SoundFX {
  private ctx: AudioContext | null = null;
  private isUnlocked: boolean = false;

  constructor() {
    this.setupAutoUnlock();
  }

  // Automatic AudioContext unlock on first user interaction
  private setupAutoUnlock() {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else if (this.ctx) {
        this.isUnlocked = true;
      }
      // Remove listeners once activated
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  private init(): boolean {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          return false;
        }
      }
    }
    return !!this.ctx;
  }

  // 1. Crisp, tactile wooden clack / checkmark sound (subtle 80ms duration)
  playCheck() {
    try {
      if (!this.init() || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.09, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.1);
    } catch {
      // ignore audio context restrictions
    }
  }

  // 2. Triumphant Standard Day Gong / Chime (5/5 foundation habits)
  playStandardDay() {
    try {
      if (!this.init() || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const freqs = [440, 554.37, 659.25, 880]; // A Major harmonic chord
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime + i * 0.035);

        gain.gain.setValueAtTime(0.06 / (i * 0.5 + 1), this.ctx!.currentTime + i * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime + i * 0.035);
        osc.stop(this.ctx!.currentTime + 0.55);
      });
    } catch {}
  }

  // 3. Mastery (10/10 Score: 5 Habits + Special Mission) deep honorable martial chime
  playMastery() {
    try {
      if (!this.init() || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      // Deep resonant bronze temple bell fundamental harmonics (G major chord)
      const freqs = [196, 293.66, 392, 587.33];
      freqs.forEach((f, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, this.ctx!.currentTime);

        gain.gain.setValueAtTime(0.09 / (i + 1), this.ctx!.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.9);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(this.ctx!.currentTime);
        osc.stop(this.ctx!.currentTime + 0.95);
      });
    } catch {}
  }

  // 4. Subtle warning tone for debt or locked day
  playWarning() {
    try {
      if (!this.init() || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(160, this.ctx.currentTime + 0.18);

      gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch {}
  }

  // 5. Debt Settled / Autopsy Resolved tone (Calm release tone)
  playAutopsySave() {
    try {
      if (!this.init() || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, this.ctx.currentTime + 0.15);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch {}
  }
}

export const soundFX = new SoundFX();
