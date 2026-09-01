import { SystemState } from '../types';
import { createInitialSystemState } from '../data/initialData';

export const STORAGE_KEY = 'bushido_discipline_os_v1';
export const TOKEN_KEY = 'bushido_auth_token';

let pendingStateToSave: SystemState | null = null;
let debounceTimer: NodeJS.Timeout | number | null = null;
let idleCallbackId: number | null = null;

const DEBOUNCE_DELAY_MS = 350;

/**
 * Directly writes state to localStorage safely
 */
function writeStateDirect(state: SystemState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('[Bushido Storage] Failed to save state to localStorage:', err);
    return false;
  }
}

/**
 * Flush any pending debounced writes immediately to disk.
 * Must be called before page unload or critical resets.
 */
export function flushPendingStorageSave(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer as NodeJS.Timeout);
    debounceTimer = null;
  }
  if (idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(idleCallbackId);
    idleCallbackId = null;
  }
  if (pendingStateToSave) {
    writeStateDirect(pendingStateToSave);
    pendingStateToSave = null;
  }
}

// Auto-register unload and pagehide listeners to ensure zero data loss
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingStorageSave, { capture: true });
  window.addEventListener('pagehide', flushPendingStorageSave, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingStorageSave();
    }
  });
}

/**
 * Asynchronously persists system state to localStorage with debouncing & requestIdleCallback
 * to completely eliminate main thread blocking and frame drops on rapid habit toggling.
 */
export function saveSystemStateDebounced(state: SystemState, delayMs: number = DEBOUNCE_DELAY_MS): void {
  pendingStateToSave = state;

  if (debounceTimer) {
    clearTimeout(debounceTimer as NodeJS.Timeout);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      if (idleCallbackId !== null) {
        window.cancelIdleCallback(idleCallbackId);
      }
      idleCallbackId = window.requestIdleCallback(
        () => {
          idleCallbackId = null;
          if (pendingStateToSave) {
            writeStateDirect(pendingStateToSave);
            pendingStateToSave = null;
          }
        },
        { timeout: 1000 }
      );
    } else {
      if (pendingStateToSave) {
        writeStateDirect(pendingStateToSave);
        pendingStateToSave = null;
      }
    }
  }, delayMs);
}

/**
 * Loads system state from localStorage with fallback and schema migration checks
 */
export function loadStoredSystemState(): SystemState {
  const initial = createInitialSystemState();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed || typeof parsed !== 'object') {
        return initial;
      }

      // 1. User Profile Protection
      if (!parsed.userProfile || typeof parsed.userProfile !== 'object') {
        parsed.userProfile = initial.userProfile;
      }

      // 2. Cycles Array Protection (Strict Array.isArray check)
      if (!Array.isArray(parsed.cycles)) {
        parsed.cycles = initial.cycles;
      } else {
        parsed.cycles = parsed.cycles
          .filter((c: any) => c && typeof c === 'object' && typeof c.id === 'string')
          .map((c: any) => ({
            ...c,
            isSynced: c.isSynced !== undefined ? c.isSynced : false
          }));
      }

      // 3. Logs Array Protection (Strict Array.isArray check)
      if (!Array.isArray(parsed.logs)) {
        parsed.logs = initial.logs;
      } else {
        parsed.logs = parsed.logs
          .filter((l: any) => l && typeof l === 'object' && typeof l.date === 'string')
          .map((l: any) => ({
            ...l,
            isSynced: l.isSynced !== undefined ? l.isSynced : false
          }));
      }

      // 4. Settings Protection
      if (!parsed.settings || typeof parsed.settings !== 'object') {
        parsed.settings = initial.settings;
      }

      return parsed as SystemState;
    }
  } catch (e) {
    console.warn('[Bushido Storage] Failed to load from localStorage, initializing fresh:', e);
  }
  return initial;
}
