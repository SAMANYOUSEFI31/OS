import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  SystemState,
  Cycle,
  DailyLog,
  User,
  HabitKey,
  DayStatusType,
  AutopsyData
} from '../types';
import {
  loadStoredSystemState,
  saveStoredSystemState,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getStoredUser,
  setStoredUser
} from '../utils/storageUtils';
import {
  getTodayISOString,
  getShiftedISOString
} from '../utils/dateUtils';
import { soundFX } from '../utils/audioEffects';
import { haptics } from '../utils/haptics';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface BushidoContextType {
  state: SystemState;
  user: User | null;
  activeCycle: Cycle | null;
  todayLog: DailyLog | null;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  toast: ToastMessage | null;
  showToast: (type: ToastMessage['type'], message: string) => void;
  toggleHabit: (habitKey: HabitKey) => void;
  toggleSpecialMission: () => void;
  saveDayNotes: (notes: string) => void;
  submitAutopsy: (autopsy: AutopsyData) => void;
  freezeDay: () => void;
  createNewCycle: (title: string, startDate: string, targetTheme?: string, inheritedStreak?: number) => void;
  archiveCycle: (cycleId: string) => void;
  loginUser: (token: string, user: User) => void;
  logoutUser: () => void;
  updateUserProfile: (updates: Partial<User>) => void;
  importData: (jsonData: string) => boolean;
  exportData: () => string;
  resetAllData: () => void;
  syncWithServer: () => Promise<void>;
  isOnline: boolean;
}

const BushidoContext = createContext<BushidoContextType | undefined>(undefined);

export const BushidoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SystemState>(() => loadStoredSystemState());
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayISOString());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state to local storage whenever state changes
  useEffect(() => {
    saveStoredSystemState(state);
  }, [state]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('info', 'اتصال اینترنت برقرار شد. همگام‌سازی با سرور...');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('warning', 'حالت آفلاین فعال شد. داده‌ها روی دستگاه ذخیره می‌شوند.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, type, message });

    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  const activeCycle = state.cycles.find(c => c.id === state.activeCycleId) || state.cycles[0] || null;

  const getLogForDate = useCallback((dateStr: string): DailyLog | null => {
    return state.dailyLogs.find(l => l.date === dateStr && l.cycleId === activeCycle?.id) || null;
  }, [state.dailyLogs, activeCycle?.id]);

  const todayLog = getLogForDate(selectedDate);

  // Server Synchronization Function (Dual-Engine Sync)
  const syncWithServer = useCallback(async () => {
    const token = getAuthToken();
    if (!token || !navigator.onLine) return;

    try {
      // 1. Fetch user cycles from server
      const cyclesRes = await fetch('/api/cycles', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (cyclesRes.ok) {
        const data = await cyclesRes.json();
        if (Array.isArray(data.cycles) && data.cycles.length > 0) {
          setState(prev => {
            const serverCycles = data.cycles.map((c: any) => ({ ...c, isSynced: true }));
            return {
              ...prev,
              cycles: serverCycles,
              activeCycleId: prev.activeCycleId || serverCycles[0]?.id
            };
          });
        }
      }

      // 2. Fetch daily logs from server
      const logsRes = await fetch('/api/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (logsRes.ok) {
        const data = await logsRes.json();
        if (Array.isArray(data.logs)) {
          setState(prev => {
            const serverLogs = data.logs.map((l: any) => ({ ...l, isSynced: true }));
            // Merge local unsynced logs with server logs
            const unsyncedLocal = prev.dailyLogs.filter(l => l.isSynced === false);
            const mergedMap = new Map();
            
            serverLogs.forEach((l: DailyLog) => mergedMap.set(`${l.cycleId}-${l.date}`, l));
            unsyncedLocal.forEach((l: DailyLog) => mergedMap.set(`${l.cycleId}-${l.date}`, l));

            return {
              ...prev,
              dailyLogs: Array.from(mergedMap.values())
            };
          });
        }
      }

      // 3. Push unsynced local logs to server
      const unsyncedLogs = state.dailyLogs.filter(l => l.isSynced === false);
      for (const log of unsyncedLogs) {
        const pushRes = await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(log)
        });
        if (pushRes.ok) {
          setState(prev => ({
            ...prev,
            dailyLogs: prev.dailyLogs.map(l => l.id === log.id ? { ...l, isSynced: true } : l)
          }));
        }
      }
    } catch (err) {
      console.warn('[Sync] Background sync failed:', err);
    }
  }, [state.dailyLogs]);

  // Auto Sync on User Change or Network Reconnect
  useEffect(() => {
    if (user && isOnline) {
      syncWithServer();
    }
  }, [user, isOnline]);

  // Core Interactive Actions
  const toggleHabit = useCallback(async (habitKey: HabitKey) => {
    if (!activeCycle) return;

    const todayISO = getTodayISOString();
    if (selectedDate > todayISO) {
      showToast('warning', 'ثبت وضعیت برای روزهای آینده امکان‌پذیر نیست.');
      return;
    }

    const currentLog = getLogForDate(selectedDate) || {
      id: `log-${Date.now()}`,
      cycleId: activeCycle.id,
      date: selectedDate,
      wakeUp: false,
      workout: false,
      study: false,
      journal: false,
      hardTask: false,
      specialMission: false,
      isSynced: false
    };

    const nextVal = !currentLog[habitKey];
    const updatedLog: DailyLog = {
      ...currentLog,
      [habitKey]: nextVal,
      isSynced: false
    };

    if (nextVal) {
      soundFX.playCheck();
      haptics.lightTap();
    } else {
      haptics.uncheckTap();
    }

    // Update Local State immediately (Zero Latency)
    setState(prev => {
      const idx = prev.dailyLogs.findIndex(l => l.date === selectedDate && l.cycleId === activeCycle.id);
      let newLogs = [...prev.dailyLogs];
      if (idx >= 0) newLogs[idx] = updatedLog;
      else newLogs.push(updatedLog);
      return { ...prev, dailyLogs: newLogs };
    });

    // Send to Server API if online
    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        const res = await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatedLog)
        });
        if (res.ok) {
          setState(prev => ({
            ...prev,
            dailyLogs: prev.dailyLogs.map(l => (l.date === selectedDate && l.cycleId === activeCycle.id) ? { ...l, isSynced: true } : l)
          }));
        }
      } catch (err) {
        console.warn('[API] Log sync deferred to offline queue.');
      }
    }
  }, [activeCycle, selectedDate, getLogForDate, showToast]);

  const toggleSpecialMission = useCallback(async () => {
    if (!activeCycle) return;
    const currentLog = getLogForDate(selectedDate) || {
      id: `log-${Date.now()}`,
      cycleId: activeCycle.id,
      date: selectedDate,
      wakeUp: false,
      workout: false,
      study: false,
      journal: false,
      hardTask: false,
      specialMission: false,
      isSynced: false
    };

    const updatedLog: DailyLog = {
      ...currentLog,
      specialMission: !currentLog.specialMission,
      isSynced: false
    };

    soundFX.playCheck();
    haptics.lightTap();

    setState(prev => {
      const idx = prev.dailyLogs.findIndex(l => l.date === selectedDate && l.cycleId === activeCycle.id);
      let newLogs = [...prev.dailyLogs];
      if (idx >= 0) newLogs[idx] = updatedLog;
      else newLogs.push(updatedLog);
      return { ...prev, dailyLogs: newLogs };
    });

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        const res = await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatedLog)
        });
        if (res.ok) {
          setState(prev => ({
            ...prev,
            dailyLogs: prev.dailyLogs.map(l => (l.date === selectedDate && l.cycleId === activeCycle.id) ? { ...l, isSynced: true } : l)
          }));
        }
      } catch (err) {
        console.warn('[API] Special mission sync deferred.');
      }
    }
  }, [activeCycle, selectedDate, getLogForDate]);

  const saveDayNotes = useCallback(async (notes: string) => {
    if (!activeCycle) return;
    const currentLog = getLogForDate(selectedDate) || {
      id: `log-${Date.now()}`,
      cycleId: activeCycle.id,
      date: selectedDate,
      wakeUp: false,
      workout: false,
      study: false,
      journal: false,
      hardTask: false,
      specialMission: false,
      isSynced: false
    };

    const updatedLog: DailyLog = { ...currentLog, notes, isSynced: false };

    setState(prev => {
      const idx = prev.dailyLogs.findIndex(l => l.date === selectedDate && l.cycleId === activeCycle.id);
      let newLogs = [...prev.dailyLogs];
      if (idx >= 0) newLogs[idx] = updatedLog;
      else newLogs.push(updatedLog);
      return { ...prev, dailyLogs: newLogs };
    });

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatedLog)
        });
      } catch (err) {
        console.warn('[API] Notes sync deferred.');
      }
    }
  }, [activeCycle, selectedDate, getLogForDate]);

  const submitAutopsy = useCallback(async (autopsy: AutopsyData) => {
    if (!activeCycle) return;
    const currentLog = getLogForDate(selectedDate) || {
      id: `log-${Date.now()}`,
      cycleId: activeCycle.id,
      date: selectedDate,
      wakeUp: false,
      workout: false,
      study: false,
      journal: false,
      hardTask: false,
      specialMission: false,
      isSynced: false
    };

    const updatedLog: DailyLog = {
      ...currentLog,
      statusType: 'burned_resolved',
      failureReason: autopsy.failureReason,
      failureTime: autopsy.failureTime,
      autopsyNotes: autopsy.autopsyNotes,
      countermeasure: autopsy.countermeasure,
      aiFeedback: autopsy.aiFeedback,
      isSynced: false
    };

    soundFX.playAutopsySave();
    haptics.debtResolved();
    showToast('success', 'کالبدشکافی با موفقیت ثبت شد و پرونده بدهی بسته شد.');

    setState(prev => {
      const idx = prev.dailyLogs.findIndex(l => l.date === selectedDate && l.cycleId === activeCycle.id);
      let newLogs = [...prev.dailyLogs];
      if (idx >= 0) newLogs[idx] = updatedLog;
      else newLogs.push(updatedLog);
      return { ...prev, dailyLogs: newLogs };
    });

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatedLog)
        });
      } catch (err) {
        console.warn('[API] Autopsy sync deferred.');
      }
    }
  }, [activeCycle, selectedDate, getLogForDate, showToast]);

  const freezeDay = useCallback(async () => {
    if (!activeCycle) return;
    const currentLog = getLogForDate(selectedDate) || {
      id: `log-${Date.now()}`,
      cycleId: activeCycle.id,
      date: selectedDate,
      wakeUp: false,
      workout: false,
      study: false,
      journal: false,
      hardTask: false,
      specialMission: false,
      isSynced: false
    };

    const updatedLog: DailyLog = {
      ...currentLog,
      statusType: 'personal_frozen',
      failureReason: 'دلایل شخصی',
      isSynced: false
    };

    soundFX.playWarning();
    haptics.warningAlert();
    showToast('info', 'روز با موفقیت به عنوان توقف موجه (فریز) ثبت گردید.');

    setState(prev => {
      const idx = prev.dailyLogs.findIndex(l => l.date === selectedDate && l.cycleId === activeCycle.id);
      let newLogs = [...prev.dailyLogs];
      if (idx >= 0) newLogs[idx] = updatedLog;
      else newLogs.push(updatedLog);
      return { ...prev, dailyLogs: newLogs };
    });

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        await fetch('/api/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updatedLog)
        });
      } catch (err) {
        console.warn('[API] Freeze day sync deferred.');
      }
    }
  }, [activeCycle, selectedDate, getLogForDate, showToast]);

  const createNewCycle = useCallback(async (title: string, startDate: string, targetTheme?: string, inheritedStreak: number = 0) => {
    const end = getShiftedISOString(startDate, 89);
    const newCycle: Cycle = {
      id: `cycle-${Date.now()}`,
      title,
      startDate,
      endDate: end,
      targetTheme,
      inheritedStreak,
      status: 'active',
      isSynced: false
    };

    setState(prev => ({
      ...prev,
      cycles: [...prev.cycles, newCycle],
      activeCycleId: newCycle.id
    }));

    showToast('success', `چرخه ۹۰ روزه «${title}» با موفقیت آغاز شد.`);

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        const res = await fetch('/api/cycles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(newCycle)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.cycle) {
            setState(prev => ({
              ...prev,
              cycles: prev.cycles.map(c => c.id === newCycle.id ? { ...data.cycle, isSynced: true } : c),
              activeCycleId: data.cycle.id
            }));
          }
        }
      } catch (err) {
        console.warn('[API] Create cycle sync deferred.');
      }
    }
  }, [showToast]);

  const archiveCycle = useCallback(async (cycleId: string) => {
    setState(prev => {
      const updatedCycles = prev.cycles.map(c =>
        c.id === cycleId ? { ...c, status: 'archived' as const, isSynced: false } : c
      );
      return { ...prev, cycles: updatedCycles };
    });

    showToast('info', 'چرخه به آرشیو منتقل گردید.');

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        await fetch(`/api/cycles/${cycleId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'archived' })
        });
      } catch (err) {
        console.warn('[API] Archive cycle sync deferred.');
      }
    }
  }, [showToast]);

  const loginUser = useCallback((token: string, userData: User) => {
    setAuthToken(token);
    setStoredUser(userData);
    setUser(userData);
    showToast('success', `خوش آمدید فرمانده ${userData.name}`);
    syncWithServer();
  }, [showToast, syncWithServer]);

  const logoutUser = useCallback(() => {
    soundFX.playSlash();
    removeAuthToken();
    setStoredUser(null);
    setUser(null);
    showToast('info', 'از حساب کاربری خارج شدید.');
  }, [showToast]);

  const updateUserProfile = useCallback(async (updates: Partial<User>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setStoredUser(updated);
    setUser(updated);

    showToast('success', 'پروفایل به‌روزرسانی شد.');

    const token = getAuthToken();
    if (token && navigator.onLine) {
      try {
        await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(updates)
        });
      } catch (err) {
        console.warn('[API] Profile update sync deferred.');
      }
    }
  }, [user, showToast]);

  const exportData = useCallback(() => {
    return JSON.stringify(state, null, 2);
  }, [state]);

  const importData = useCallback((jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);
      if (parsed && Array.isArray(parsed.cycles) && Array.isArray(parsed.dailyLogs)) {
        setState(parsed);
        saveStoredSystemState(parsed);
        showToast('success', 'بازیابی داده‌ها با موفقیت انجام شد.');
        return true;
      }
      throw new Error('فرمت فایل معتبر نیست.');
    } catch {
      showToast('error', 'خطا در بارگذاری فایل پشتیبان.');
      return false;
    }
  }, [showToast]);

  const resetAllData = useCallback(() => {
    soundFX.playSlash();
    localStorage.clear();
    window.location.reload();
  }, []);

  return (
    <BushidoContext.Provider
      value={{
        state,
        user,
        activeCycle,
        todayLog,
        selectedDate,
        setSelectedDate,
        toast,
        showToast,
        toggleHabit,
        toggleSpecialMission,
        saveDayNotes,
        submitAutopsy,
        freezeDay,
        createNewCycle,
        archiveCycle,
        loginUser,
        logoutUser,
        updateUserProfile,
        importData,
        exportData,
        resetAllData,
        syncWithServer,
        isOnline
      }}
    >
      {children}
    </BushidoContext.Provider>
  );
};

export const useBushido = () => {
  const context = useContext(BushidoContext);
  if (!context) {
    throw new Error('useBushido must be used within a BushidoProvider');
  }
  return context;
};
