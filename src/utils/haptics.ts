// Bushido Ergonomic Haptic Feedback Engine
// Conforms to Apple HIG & Material 3 haptic standards with dignified Stoic calibration

class HapticEngine {
  private isSupported(): boolean {
    return typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }

  // 1. Light micro-tap (8ms) for habit checkmark toggle
  lightTap() {
    try {
      if (this.isSupported()) {
        navigator.vibrate(8);
      }
    } catch {
      // Graceful fallback on unsupported devices
    }
  }

  // 2. Soft double micro-tap for unchecking a habit [6ms, 40ms pause, 6ms]
  uncheckTap() {
    try {
      if (this.isSupported()) {
        navigator.vibrate([6, 40, 6]);
      }
    } catch {}
  }

  // 3. Medium solid tap for completing Standard Day (5/5 habits) [14ms, 50ms pause, 18ms]
  standardDaySuccess() {
    try {
      if (this.isSupported()) {
        navigator.vibrate([14, 50, 18]);
      }
    } catch {}
  }

  // 4. Heavy resonant double-pulse for Mastery (10/10 Score) [20ms, 60ms pause, 28ms]
  masterySuccess() {
    try {
      if (this.isSupported()) {
        navigator.vibrate([20, 60, 28]);
      }
    } catch {}
  }

  // 5. Distinct warning pattern for debt / locked day / critical autopsy [30ms, 70ms pause, 30ms]
  warningAlert() {
    try {
      if (this.isSupported()) {
        navigator.vibrate([30, 70, 30]);
      }
    } catch {}
  }

  // 6. Settled debt / autopsy saved [12ms, 40ms pause, 12ms]
  debtResolved() {
    try {
      if (this.isSupported()) {
        navigator.vibrate([12, 40, 12]);
      }
    } catch {}
  }
}

export const haptics = new HapticEngine();
