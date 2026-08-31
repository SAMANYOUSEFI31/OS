import { SystemState, User } from '../types';
import { initialCycles, initialDailyLogs } from '../data/initialData';

const SYSTEM_STATE_KEY = 'bushido_discipline_os_v1';
const AUTH_TOKEN_KEY = 'bushido_jwt_token_v1';
const USER_DATA_KEY = 'bushido_user_data_v1';

export const defaultSystemState: SystemState = {
  cycles: initialCycles,
  dailyLogs: initialDailyLogs,
  activeCycleId: initialCycles[0]?.id || 'cycle-1'
};

export function loadStoredSystemState(): SystemState {
  try {
    const raw = localStorage.getItem(SYSTEM_STATE_KEY);
    if (!raw) return defaultSystemState;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.cycles) && Array.isArray(parsed.dailyLogs)) {
      return {
        cycles: parsed.cycles.length > 0 ? parsed.cycles : initialCycles,
        dailyLogs: parsed.dailyLogs,
        activeCycleId: parsed.activeCycleId || parsed.cycles[0]?.id || 'cycle-1'
      };
    }
  } catch (error) {
    console.warn('Failed to parse local system state, falling back to initial data:', error);
  }
  return defaultSystemState;
}

export function saveStoredSystemState(state: SystemState): void {
  try {
    localStorage.setItem(SYSTEM_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to persist system state:', error);
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (e) {
    console.error('Failed to save auth token:', e);
  }
}

export function removeAuthToken(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {
    console.error('Failed to remove auth token:', e);
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: User | null): void {
  try {
    if (!user) {
      localStorage.removeItem(USER_DATA_KEY);
    } else {
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    }
  } catch (e) {
    console.error('Failed to save user data:', e);
  }
}
