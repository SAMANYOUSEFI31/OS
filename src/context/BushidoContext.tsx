import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { Cycle, DailyLog, SystemSettings, UserProfile, AdminUserItem, CycleMetrics } from '../types';
import { createInitialSystemState, GUEST_USER_PROFILE } from '../data/initialData';
import { computeCycleMetrics } from '../engine/bushidoCalculations';
import { getLogicalTodayDate, addDaysToDate } from '../utils/dateUtils';
import { applyAccentTheme } from '../utils/themeUtils';
import { 
  loadStoredSystemState, 
  saveSystemStateDebounced, 
  flushPendingStorageSave, 
  STORAGE_KEY, 
  TOKEN_KEY 
} from '../utils/storageUtils';

interface BushidoContextType {
  authToken: string | null;
  systemState: {
    cycles: Cycle[];
    logs: DailyLog[];
    settings: SystemSettings;
    userProfile: UserProfile;
  };
  activeCycleId: string;
  selectedDate: string;
  activeTab: string;
  currentCycle: Cycle | null;
  cycleMetrics: CycleMetrics | null;
  impersonatingUser: AdminUserItem | null;
  autopsyTargetLog: DailyLog | null;
  isPaymentModalOpen: boolean;
  isAuthModalOpen: boolean;
  isResetConfirmOpen: boolean;
  appToastMessage: string | null;

  // Navigation & Date
  selectDate: (date: string) => void;
  setActiveTab: (tab: string) => void;
  setActiveCycleId: (id: string) => void;

  // Actions
  updateLog: (log: DailyLog) => Promise<void>;
  updateCycle: (cycle: Cycle) => Promise<void>;
  deleteCycle: (cycleId: string) => Promise<void>;
  createNewCycle: (title: string, startDate: string, targetTheme: string) => Promise<void>;
  updateUserProfile: (profile: UserProfile) => Promise<void>;
  updateSettings: (settings: SystemSettings) => Promise<void>;
  exportData: () => void;
  confirmResetData: () => void;
  importData: (jsonStr: string) => void;

  // Auth & Admin
  handleAuthSuccess: (token: string, user: UserProfile) => void;
  handleQuickLogin: (role: 'admin' | 'test_user') => Promise<void>;
  handleImpersonateUser: (user: AdminUserItem) => Promise<void>;
  handleExitImpersonation: () => Promise<void>;
  handleLogout: () => void;
  refreshUserProfile: () => Promise<void>;

  // Modal & Toast Controls
  openAutopsy: (log: DailyLog) => void;
  closeAutopsy: () => void;
  openPaymentModal: () => void;
  closePaymentModal: () => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  openResetConfirm: () => void;
  closeResetConfirm: () => void;
  showAppToast: (message: string) => void;
  closeAppToast: () => void;
}

const BushidoContext = createContext<BushidoContextType | null>(null);

export const BushidoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authToken, setAuthToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [impersonatingUser, setImpersonatingUser] = useState<AdminUserItem | null>(null);
  const [impersonatorAdminToken, setImpersonatorAdminToken] = useState<string | null>(null);

  const [systemState, setSystemState] = useState<{
    cycles: Cycle[];
    logs: DailyLog[];
    settings: SystemSettings;
    userProfile: UserProfile;
  }>(() => loadStoredSystemState());

  const [activeCycleId, setActiveCycleId] = useState<string>(() => {
    return systemState.cycles[0]?.id || 'cycle-1';
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => getLogicalTodayDate());
  const [activeTab, setActiveTab] = useState<string>('battlefield');
  const [autopsyTargetLog, setAutopsyTargetLog] = useState<DailyLog | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [appToastMessage, setAppToastMessage] = useState<string | null>(null);

  const showAppToast = useCallback((msg: string) => {
    setAppToastMessage(msg);
    setTimeout(() => {
      setAppToastMessage(prev => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const closeAppToast = useCallback(() => setAppToastMessage(null), []);

  const selectDate = useCallback((newDate: string) => {
    setSelectedDate(newDate);

    const matchedCycle = systemState.cycles.find(c => {
      const end = c.endDate || addDaysToDate(c.startDate, 89);
      return newDate >= c.startDate && newDate <= end;
    });

    if (matchedCycle && matchedCycle.id !== activeCycleId) {
      setActiveCycleId(matchedCycle.id);
    }
  }, [systemState.cycles, activeCycleId]);

  // Debounced non-blocking async persistence to eliminate main thread freeze on mobile
  useEffect(() => {
    saveSystemStateDebounced(systemState, 350);
    const theme = systemState.userProfile?.accentTheme || systemState.settings?.accentTheme || 'amber';
    applyAccentTheme(theme);
  }, [systemState]);

  // Auto-login to Admin on first fresh session if no token and not explicitly logged out
  useEffect(() => {
    const initDefaultAdminIfNeeded = async () => {
      const currentToken = localStorage.getItem(TOKEN_KEY);
      const isExplicitLogout = sessionStorage.getItem('bushido_explicit_logout') === 'true';
      if (!currentToken && !isExplicitLogout) {
        try {
          const res = await fetch('/api/auth/quick-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'admin' })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.token && data.user) {
              localStorage.setItem(TOKEN_KEY, data.token);
              setAuthToken(data.token);
              setSystemState(prev => ({
                ...prev,
                userProfile: {
                  ...prev.userProfile,
                  ...data.user,
                  isVip: Boolean(data.user.isVip),
                  isAdmin: Boolean(data.user.isAdmin)
                }
              }));
            }
          }
        } catch (err) {
          console.warn('Auto admin login fallback:', err);
        }
      }
    };

    initDefaultAdminIfNeeded();
  }, []);

  // Fetch user profile and backend data on mount or token change
  const refreshUserProfile = useCallback(async () => {
    if (!authToken) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          setSystemState(prev => ({
            ...prev,
            userProfile: {
              ...prev.userProfile,
              ...data.user,
              isVip: Boolean(data.user.isVip),
              isAdmin: Boolean(data.user.isAdmin)
            }
          }));
        }
      }
    } catch (err) {
      console.warn('Refresh user profile error:', err);
    }
  }, [authToken]);

  useEffect(() => {
    const fetchBackendData = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        if (authToken) {
          const userRes = await fetch('/api/auth/me', { headers });
          if (userRes.ok) {
            const userData = await userRes.json();
            if (userData.user) {
              setSystemState(prev => ({
                ...prev,
                userProfile: {
                  ...prev.userProfile,
                  ...userData.user,
                  isVip: !!userData.user.isVip,
                  isAdmin: !!userData.user.isAdmin
                }
              }));
            }
          } else {
            localStorage.removeItem(TOKEN_KEY);
            setAuthToken(null);
          }
        }

        const cyclesRes = await fetch('/api/cycles', { headers });
        if (cyclesRes.ok) {
          const cyclesData = await cyclesRes.json();
          if (Array.isArray(cyclesData) && cyclesData.length > 0) {
            setSystemState(prev => ({
              ...prev,
              cycles: cyclesData
            }));
          }
        }

        const logsRes = await fetch('/api/daily-logs', { headers });
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          if (Array.isArray(logsData) && logsData.length > 0) {
            setSystemState(prev => ({
              ...prev,
              logs: logsData
            }));
          }
        }
      } catch (err) {
        console.warn('Backend sync warning (running in offline/local fallback):', err);
      }
    };

    fetchBackendData();
  }, [authToken]);

  const currentCycle = useMemo(() => {
    return systemState.cycles.find(c => c.id === activeCycleId) || systemState.cycles[0] || null;
  }, [systemState.cycles, activeCycleId]);

  const logicalToday = getLogicalTodayDate();

  const cycleMetrics = useMemo(() => {
    if (!currentCycle) return null;
    return computeCycleMetrics(currentCycle, systemState.logs, systemState.cycles, logicalToday);
  }, [currentCycle, systemState.logs, systemState.cycles, logicalToday]);

  const updateLog = useCallback(async (updatedLog: DailyLog) => {
    setSystemState(prev => {
      const existingIdx = prev.logs.findIndex(l => l.date === updatedLog.date);
      let newLogs: DailyLog[];
      if (existingIdx >= 0) {
        newLogs = [...prev.logs];
        newLogs[existingIdx] = updatedLog;
      } else {
        newLogs = [...prev.logs, updatedLog];
      }
      return {
        ...prev,
        logs: newLogs
      };
    });

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch('/api/daily-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...updatedLog,
          cycleId: updatedLog.cycleId || activeCycleId
        })
      });
    } catch (e) {
      console.warn('Failed to sync log to server backend (saved locally):', e);
    }
  }, [authToken, activeCycleId]);

  const updateCycle = useCallback(async (updatedCycle: Cycle) => {
    setSystemState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => (c.id === updatedCycle.id ? updatedCycle : c))
    }));

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch(`/api/cycles/${updatedCycle.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedCycle)
      });
    } catch (e) {
      console.warn('Failed to sync cycle update to server:', e);
    }
  }, [authToken]);

  const deleteCycle = useCallback(async (cycleId: string) => {
    const remainingCycles = systemState.cycles.filter(c => c.id !== cycleId);
    const remainingLogs = systemState.logs.filter(l => l.cycleId !== cycleId);

    setSystemState(prev => ({
      ...prev,
      cycles: prev.cycles.filter(c => c.id !== cycleId),
      logs: prev.logs.filter(l => l.cycleId !== cycleId)
    }));

    if (activeCycleId === cycleId && remainingCycles.length > 0) {
      setActiveCycleId(remainingCycles[0].id);
      setSelectedDate(remainingCycles[0].startDate);
    }

    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      await fetch(`/api/cycles/${cycleId}`, {
        method: 'DELETE',
        headers
      });
    } catch (e) {
      console.warn('Failed to sync cycle deletion to server:', e);
    }
  }, [authToken, activeCycleId, systemState.cycles, systemState.logs]);

  const createNewCycle = useCallback(async (title: string, startDate: string, targetTheme: string) => {
    const newCycle: Cycle = {
      id: `cycle-${Date.now()}`,
      title,
      startDate,
      endDate: addDaysToDate(startDate, 89),
      targetTheme,
      inheritedStreak: cycleMetrics?.pureStreak || 0,
      isArchived: false,
      reportRead: false
    };

    setSystemState(prev => ({
      ...prev,
      cycles: [...prev.cycles, newCycle]
    }));
    setActiveCycleId(newCycle.id);
    setSelectedDate(startDate);
    setActiveTab('battlefield');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch('/api/cycles', {
        method: 'POST',
        headers,
        body: JSON.stringify(newCycle)
      });
    } catch (e) {
      console.warn('Failed to save cycle to server:', e);
    }
  }, [authToken, cycleMetrics?.pureStreak]);

  const updateUserProfile = useCallback(async (updatedProfile: UserProfile) => {
    setSystemState(prev => ({
      ...prev,
      userProfile: updatedProfile
    }));

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch('/api/user/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatedProfile)
      });
    } catch (e) {
      console.warn('Failed to sync user profile:', e);
    }
  }, [authToken]);

  const updateSettings = useCallback(async (updatedSettings: SystemSettings) => {
    setSystemState(prev => ({
      ...prev,
      settings: updatedSettings
    }));
  }, []);

  const exportData = useCallback(() => {
    const data = {
      cycles: systemState.cycles,
      logs: systemState.logs,
      settings: systemState.settings,
      userProfile: systemState.userProfile,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bushido-discipline-backup-${logicalToday}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [systemState, logicalToday]);

  const confirmResetData = useCallback(() => {
    flushPendingStorageSave();
    const fresh = createInitialSystemState();
    setSystemState(fresh);
    setActiveCycleId(fresh.cycles[0].id);
    setSelectedDate(getLogicalTodayDate());
    setIsResetConfirmOpen(false);
    showAppToast('داده‌های سامانه با موفقیت به مقادیر اولیه بوشیدو بازنشانی شد.');
  }, [showAppToast]);

  const importData = useCallback((dataStr: string) => {
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed.cycles && parsed.logs && parsed.settings) {
        if (!parsed.userProfile) {
          parsed.userProfile = createInitialSystemState().userProfile;
        }
        flushPendingStorageSave();
        setSystemState(parsed);
        setActiveCycleId(parsed.cycles[0]?.id || 'cycle-1');
        showAppToast('اطلاعات پشتیبان با موفقیت بازیابی شد.');
      } else {
        showAppToast('فرمت فایل پشتیبان نامعتبر است.');
      }
    } catch {
      showAppToast('خطا در خواندن فایل JSON.');
    }
  }, [showAppToast]);

  const handleAuthSuccess = useCallback((token: string, user: UserProfile) => {
    sessionStorage.removeItem('bushido_explicit_logout');
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setSystemState(prev => ({
      ...prev,
      userProfile: user
    }));
    showAppToast(`با موفقیت وارد حساب «${user.name || 'کاربر'}» شدید.`);
  }, [showAppToast]);

  const handleQuickLogin = useCallback(async (role: 'admin' | 'test_user') => {
    try {
      sessionStorage.removeItem('bushido_explicit_logout');
      let data: any = null;
      try {
        const res = await fetch('/api/auth/quick-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role })
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        }
      } catch (err) {
        console.warn('Backend quick-login fetch warning:', err);
      }

      if (data && data.token && data.user) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setAuthToken(data.token);
        setSystemState(prev => ({
          ...prev,
          userProfile: {
            ...prev.userProfile,
            ...data.user,
            isVip: Boolean(data.user.isVip),
            isAdmin: Boolean(data.user.isAdmin)
          }
        }));
        showAppToast(role === 'admin' ? 'به عنوان مدیر ارشد سیستم وارد شدید.' : 'به عنوان کاربر تستی وارد شدید.');
        return;
      }

      // Offline instant fallback
      const fallbackToken = `mock-token-${role}-${Date.now()}`;
      const fallbackUser: UserProfile = role === 'admin' ? {
        id: 'admin-master-001',
        name: 'فرمانده ارشد سامورایی (مدیر)',
        email: 'admin@bushido.app',
        phoneNumber: '09120000000',
        tier: 'vip_samurai',
        isVip: true,
        isAdmin: true,
        vipSince: new Date().toISOString(),
        vipExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        paymentRefId: 'REF-ADMIN-MASTER-001',
        activeCycleLimit: 999
      } : {
        id: 'test-user-001',
        name: 'کاربر آزمایشی بوشیدو (دید کاربر)',
        email: 'test@bushido.app',
        phoneNumber: '09121111111',
        tier: 'free',
        isVip: false,
        isAdmin: false,
        vipSince: undefined,
        vipExpiresAt: undefined,
        paymentRefId: undefined,
        activeCycleLimit: 1
      };

      localStorage.setItem(TOKEN_KEY, fallbackToken);
      setAuthToken(fallbackToken);
      setSystemState(prev => ({
        ...prev,
        userProfile: fallbackUser
      }));
      showAppToast(role === 'admin' ? 'به عنوان مدیر ارشد سیستم وارد شدید.' : 'به عنوان کاربر تستی وارد شدید.');
    } catch (e) {
      console.error('Quick login error:', e);
      showAppToast('ورود با تنظیمات پیش‌فرض انجام شد.');
    }
  }, [showAppToast]);

  const handleImpersonateUser = useCallback(async (targetUser: AdminUserItem) => {
    try {
      const currentToken = authToken || localStorage.getItem(TOKEN_KEY);
      if (!currentToken) return;

      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ targetUserId: targetUser.id })
      });

      const data = await res.json();
      if (res.ok && data.token && data.user) {
        setImpersonatorAdminToken(currentToken);
        setImpersonatingUser(targetUser);
        localStorage.setItem(TOKEN_KEY, data.token);
        setAuthToken(data.token);
        setSystemState(prev => ({
          ...prev,
          userProfile: {
            ...prev.userProfile,
            ...data.user,
            isVip: Boolean(data.user.isVip),
            isAdmin: Boolean(data.user.isAdmin)
          }
        }));
        setActiveTab('battlefield');
        showAppToast(`در حال شبیه‌سازی و مشاهده سامانه از دید: «${data.user.name}»`);
      } else {
        showAppToast(data.error || 'خطا در سوییچ به کاربر');
      }
    } catch (e) {
      console.error('Impersonate user error:', e);
      showAppToast('خطا در برقراری ارتباط با سرور');
    }
  }, [authToken, showAppToast]);

  const handleExitImpersonation = useCallback(async () => {
    if (!impersonatorAdminToken) return;
    try {
      localStorage.setItem(TOKEN_KEY, impersonatorAdminToken);
      setAuthToken(impersonatorAdminToken);
      setImpersonatingUser(null);
      const res = await fetch('/api/auth/me', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${impersonatorAdminToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setSystemState(prev => ({
            ...prev,
            userProfile: {
              ...prev.userProfile,
              ...data.user,
              isVip: Boolean(data.user.isVip),
              isAdmin: Boolean(data.user.isAdmin)
            }
          }));
        }
      }
      setImpersonatorAdminToken(null);
      setActiveTab('admin');
      showAppToast('به حساب مدیریت بازگشتید.');
    } catch (e) {
      console.error('Exit impersonation error:', e);
    }
  }, [impersonatorAdminToken, showAppToast]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.setItem('bushido_explicit_logout', 'true');
    setAuthToken(null);
    setImpersonatingUser(null);
    setImpersonatorAdminToken(null);
    setSystemState(prev => ({
      ...prev,
      userProfile: GUEST_USER_PROFILE
    }));
    setIsAuthModalOpen(false);
    showAppToast('با موفقیت از حساب کاربری خارج شدید.');
  }, [showAppToast]);

  const openAutopsy = useCallback((log: DailyLog) => setAutopsyTargetLog(log), []);
  const closeAutopsy = useCallback(() => setAutopsyTargetLog(null), []);
  const openPaymentModal = useCallback(() => setIsPaymentModalOpen(true), []);
  const closePaymentModal = useCallback(() => setIsPaymentModalOpen(false), []);
  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);
  const openResetConfirm = useCallback(() => setIsResetConfirmOpen(true), []);
  const closeResetConfirm = useCallback(() => setIsResetConfirmOpen(false), []);

  const value: BushidoContextType = {
    authToken,
    systemState,
    activeCycleId,
    selectedDate,
    activeTab,
    currentCycle,
    cycleMetrics,
    impersonatingUser,
    autopsyTargetLog,
    isPaymentModalOpen,
    isAuthModalOpen,
    isResetConfirmOpen,
    appToastMessage,

    selectDate,
    setActiveTab,
    setActiveCycleId,

    updateLog,
    updateCycle,
    deleteCycle,
    createNewCycle,
    updateUserProfile,
    updateSettings,
    exportData,
    confirmResetData,
    importData,

    handleAuthSuccess,
    handleQuickLogin,
    handleImpersonateUser,
    handleExitImpersonation,
    handleLogout,
    refreshUserProfile,

    openAutopsy,
    closeAutopsy,
    openPaymentModal,
    closePaymentModal,
    openAuthModal,
    closeAuthModal,
    openResetConfirm,
    closeResetConfirm,
    showAppToast,
    closeAppToast
  };

  return <BushidoContext.Provider value={value}>{children}</BushidoContext.Provider>;
};

export const useBushido = (): BushidoContextType => {
  const context = useContext(BushidoContext);
  if (!context) {
    throw new Error('useBushido must be used within a BushidoProvider');
  }
  return context;
};
