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
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.userProfile) {
        const initial = createInitialSystemState();
        parsed.userProfile = initial.userProfile;
      }
      if (Array.isArray(parsed.cycles)) {
        parsed.cycles = parsed.cycles.map((c: any) => {
          if (c.id === 'cycle-1' && c.isArchived) {
            return { ...c, isArchived: false };
          }
          return c;
        });
      }
      return parsed;
    }
  } catch (e) {
    console.warn('[Bushido Storage] Failed to load from localStorage, initializing fresh:', e);
  }
  return createInitialSystemState();
}
