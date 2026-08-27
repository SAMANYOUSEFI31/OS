import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cycle, DailyLog, SystemSettings, UserProfile, AdminUserItem } from './types';
import { createInitialSystemState, GUEST_USER_PROFILE, DEFAULT_ADMIN_USER_PROFILE } from './data/initialData';
import { computeCycleMetrics } from './engine/bushidoCalculations';
import { getLogicalTodayDate, addDaysToDate } from './utils/dateUtils';
import { applyAccentTheme } from './utils/themeUtils';
import { 
  loadStoredSystemState, 
  saveSystemStateDebounced, 
  flushPendingStorageSave, 
  STORAGE_KEY, 
  TOKEN_KEY 
} from './utils/storageUtils';
import { Navbar } from './components/Navbar';
import { BattlefieldView } from './components/BattlefieldView';
import { AutopsyModal } from './components/AutopsyModal';
import { PaymentModal } from './components/PaymentModal';
import { AuthModal } from './components/AuthModal';
import { ViewLoadingSkeleton } from './components/ViewLoadingSkeleton';
import { Toast, ToastItem, ToastType } from './components/Toast';
import { RotateCcw, CheckCircle2, AlertTriangle, X, Eye, ShieldCheck } from 'lucide-react';

// 2026 High Performance Code-Splitting / Lazy Loading for heavy views
const CycleDashboardView = lazy(() => import('./components/CycleDashboardView').then(m => ({ default: m.CycleDashboardView })));
const ArchivesView = lazy(() => import('./components/ArchivesView').then(m => ({ default: m.ArchivesView })));
const ProfileSettingsView = lazy(() => import('./components/ProfileSettingsView').then(m => ({ default: m.ProfileSettingsView })));
const AdminView = lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));

export default function App() {
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showAppToast = useCallback((msg: string, type: ToastType = 'success', duration = 2500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts(prev => [...prev.slice(-2), { id, message: msg, type, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleSelectDate = useCallback((newDate: string) => {
    setSelectedDate(newDate);

    // Auto switch active cycle if newDate falls into another cycle
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
  useEffect(() => {
    const fetchBackendData = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Fetch User profile if logged in
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
            // Token expired or invalid
            localStorage.removeItem(TOKEN_KEY);
            setAuthToken(null);
          }
        }

        // Fetch Cycles
        const cyclesRes = await fetch('/api/cycles', { headers });
        if (cyclesRes.ok) {
          const cyclesData = await cyclesRes.json();
          const cyclesList = Array.isArray(cyclesData) ? cyclesData : (cyclesData?.cycles || []);
          if (Array.isArray(cyclesList) && cyclesList.length > 0) {
            setSystemState(prev => ({
              ...prev,
              cycles: cyclesList
            }));
          }
        }

        // Fetch Daily Logs
        const logsRes = await fetch('/api/logs', { headers });
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          const logsList = Array.isArray(logsData) ? logsData : (logsData?.logs || []);
          if (Array.isArray(logsList) && logsList.length > 0) {
            setSystemState(prev => ({
              ...prev,
              logs: logsList
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
    return systemState.cycles.find(c => c.id === activeCycleId) || systemState.cycles[0];
  }, [systemState.cycles, activeCycleId]);

  const logicalToday = getLogicalTodayDate();

  const cycleMetrics = useMemo(() => {
    if (!currentCycle) return null;
    return computeCycleMetrics(currentCycle, systemState.logs, systemState.cycles, logicalToday);
  }, [currentCycle, systemState.logs, systemState.cycles, logicalToday]);

  const handleUpdateLog = useCallback(async (updatedLog: DailyLog) => {
    // 1. Optimistic UI update
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

    // 2. Background sync with backend
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      await fetch('/api/logs', {
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

  const handleUpdateCycle = useCallback(async (updatedCycle: Cycle) => {
    setSystemState(prev => ({
      ...prev,
      cycles: prev.cycles.map(c => c.id === updatedCycle.id ? updatedCycle : c)
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

  const handleDeleteCycle = useCallback(async (cycleId: string) => {
    // 1. Calculate remaining cycles first
    const remainingCycles = systemState.cycles.filter(c => c.id !== cycleId);
    const remainingLogs = systemState.logs.filter(l => l.cycleId !== cycleId);

    setSystemState(prev => ({
      ...prev,
      cycles: prev.cycles.filter(c => c.id !== cycleId),
      logs: prev.logs.filter(l => l.cycleId !== cycleId)
    }));

    // 2. Switch active cycle immediately if current was deleted
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

  const handleUpdateUserProfile = useCallback(async (updatedProfile: UserProfile) => {
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

  const handleCreateNewCycle = useCallback(async (title: string, startDate: string, targetTheme: string) => {
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

  const handleUpdateSettings = useCallback(async (updatedSettings: SystemSettings) => {
    setSystemState(prev => ({
      ...prev,
      settings: updatedSettings
    }));
  }, []);

  const handleExportData = () => {
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
  };

  const handleResetData = () => {
    setIsResetConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    flushPendingStorageSave();
    const fresh = createInitialSystemState();
    setSystemState(fresh);
    setActiveCycleId(fresh.cycles[0].id);
    setSelectedDate(getLogicalTodayDate());
    setIsResetConfirmOpen(false);
    showAppToast('داده‌های سامانه با موفقیت به مقادیر اولیه بوشیدو بازنشانی شد.');
  };

  const handleImportData = (dataStr: string) => {
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
  };

  const handleAuthSuccess = (token: string, user: UserProfile) => {
    sessionStorage.removeItem('bushido_explicit_logout');
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    setSystemState(prev => ({
      ...prev,
      userProfile: user
    }));
    showAppToast(`با موفقیت وارد حساب «${user.name || 'کاربر'}» شدید.`);
  };

  const handleQuickLogin = async (role: 'admin' | 'test_user') => {
    try {
      sessionStorage.removeItem('bushido_explicit_logout');
      const res = await fetch('/api/auth/quick-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (res.ok && data.token && data.user) {
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
      } else {
        showAppToast(data.error || 'خطا در ورود سریع');
      }
    } catch (e) {
      console.error('Quick login error:', e);
      showAppToast('خطا در برقراری ارتباط');
    }
  };

  const handleImpersonateUser = async (targetUser: AdminUserItem) => {
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
  };

  const handleExitImpersonation = async () => {
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
  };

  const handleLogout = () => {
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
  };

  if (!currentCycle || !cycleMetrics) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center text-zinc-400 font-bold text-sm">
        در حال راه‌اندازی موتور دیسیپلین بوشیدو...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col selection:bg-amber-500 selection:text-black pb-20 lg:pb-8">
      {/* Top Banner when Admin is Impersonating a User */}
      {impersonatingUser && (
        <div className="bg-sky-950 border-b border-sky-500/50 py-2.5 px-4 sticky top-0 z-50 shadow-2xl backdrop-blur-md">
          <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 text-sky-200 font-bold">
              <Eye className="w-4 h-4 text-sky-400 animate-pulse shrink-0" />
              <span>
                حالت شبیه‌سازی کاربر: در حال بررسی سامانه از دید «{impersonatingUser.name}»
              </span>
              <span className="text-[10px] bg-sky-900/80 text-sky-300 border border-sky-500/40 px-2 py-0.5 rounded-md font-mono hidden md:inline-block">
                {impersonatingUser.id}
              </span>
            </div>
            <button
              onClick={handleExitImpersonation}
              className="bg-sky-500 hover:bg-sky-400 text-zinc-950 font-black text-xs px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shrink-0 active:scale-95"
            >
              <ShieldCheck className="w-4 h-4 text-zinc-950" />
              <span>بازگشت به حساب مدیریت</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Hub Bar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        cycles={systemState.cycles}
        currentCycle={currentCycle}
        onSelectCycle={c => setActiveCycleId(c.id)}
        metrics={cycleMetrics}
        settings={systemState.settings}
        userProfile={systemState.userProfile}
        onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenDebtAutopsy={() => {
          // Find first unresolved debt log
          const firstDebt = systemState.logs.find(l => {
            if (l.date >= logicalToday) return false;
            const habitKeys = ['wakeUp', 'workout', 'study', 'journal', 'hardTask'] as const;
            const isStd = habitKeys.every(k => l[k]);
            const isFrozen = l.failureReason === 'دلایل شخصی';
            const isResolved = !!(l.failureReason && (isFrozen || l.failureTime));
            return !isStd && !isResolved;
          });
          if (firstDebt) {
            setAutopsyTargetLog(firstDebt);
          } else {
            setActiveTab('battlefield');
          }
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-6 pb-20 sm:pb-8">
        <Suspense fallback={<ViewLoadingSkeleton />}>
          <AnimatePresence mode="wait">
            {activeTab === 'battlefield' && (
              <motion.div
                key="battlefield"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <BattlefieldView
                  currentCycle={currentCycle}
                  metrics={cycleMetrics}
                  logs={systemState.logs}
                  selectedDate={selectedDate}
                  nightOwlCutoffHour={systemState.userProfile?.nightOwlCutoffHour ?? systemState.settings?.nightOwlCutoffHour ?? 4}
                  onSelectDate={handleSelectDate}
                  onUpdateLog={handleUpdateLog}
                  onOpenAutopsy={log => setAutopsyTargetLog(log)}
                  onNavigateToArchives={() => setActiveTab('archives')}
                />
              </motion.div>
            )}

            {(activeTab === 'dashboard' || activeTab === 'cycle') && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <CycleDashboardView
                  currentCycle={currentCycle}
                  metrics={cycleMetrics}
                  logs={systemState.logs}
                  cycles={systemState.cycles}
                  allTimeSettings={{
                    allTimeMaxStreak: systemState.settings?.allTimeMaxStreak ?? 0,
                    allTimeMaxScore: systemState.settings?.allTimeMaxScore ?? 0,
                    allTimeMaxStandardDays: systemState.settings?.allTimeMaxStandardDays ?? 0,
                  }}
                  onSelectDate={d => {
                    handleSelectDate(d);
                    setActiveTab('battlefield');
                  }}
                  onNavigateTab={tab => setActiveTab(tab)}
                />
              </motion.div>
            )}

            {(activeTab === 'archives' || activeTab === 'database' || activeTab === 'court') && (
              <motion.div
                key="archives"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ArchivesView
                  cycles={systemState.cycles}
                  currentCycle={currentCycle}
                  logs={systemState.logs}
                  metrics={cycleMetrics}
                  onSelectCycle={c => setActiveCycleId(c.id)}
                  onUpdateCycle={handleUpdateCycle}
                  onDeleteCycle={handleDeleteCycle}
                  onSelectDate={d => {
                    handleSelectDate(d);
                    setActiveTab('battlefield');
                  }}
                  onOpenAutopsy={log => setAutopsyTargetLog(log)}
                  onCreateNewCycle={handleCreateNewCycle}
                />
              </motion.div>
            )}

            {(activeTab === 'profile' || activeTab === 'settings') && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ProfileSettingsView
                  userProfile={systemState.userProfile}
                  settings={systemState.settings}
                  onUpdateUserProfile={handleUpdateUserProfile}
                  onUpdateSettings={handleUpdateSettings}
                  onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  onQuickLogin={handleQuickLogin}
                  onLogout={handleLogout}
                  onResetData={handleResetData}
                  onImportData={handleImportData}
                  onExportData={handleExportData}
                  onNavigateToAdmin={() => setActiveTab('admin')}
                />
              </motion.div>
            )}

            {activeTab === 'admin' && (
              <motion.div
                key="admin"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <AdminView
                  currentUser={systemState.userProfile}
                  authToken={authToken}
                  onBack={() => setActiveTab('profile')}
                  onImpersonateUser={handleImpersonateUser}
                  onRefreshUserProfile={() => {
                    if (authToken) {
                      fetch('/api/auth/me', {
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${authToken}`
                        }
                      })
                        .then(r => r.json())
                        .then(data => {
                          if (data?.user) {
                            setSystemState(prev => ({
                              ...prev,
                              userProfile: {
                                ...prev.userProfile,
                                ...data.user,
                                isVip: !!data.user.isVip,
                                isAdmin: !!data.user.isAdmin
                              }
                            }));
                          }
                        })
                        .catch(console.error);
                    }
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Autopsy Drawer/Modal */}
      {autopsyTargetLog && (
        <AutopsyModal
          log={autopsyTargetLog}
          cycleTheme={currentCycle.targetTheme}
          allUnresolvedLogs={systemState.logs.filter(l => {
            if (l.date >= logicalToday) return false;
            const habitKeys = ['wakeUp', 'workout', 'study', 'journal', 'hardTask'] as const;
            const isStd = habitKeys.every(k => l[k]);
            const isFrozen = l.failureReason === 'دلایل شخصی';
            const isResolved = !!(l.failureReason && (isFrozen || l.failureTime));
            return !isStd && !isResolved;
          })}
          onSelectLog={nextLog => setAutopsyTargetLog(nextLog)}
          onSave={handleUpdateLog}
          onClose={() => setAutopsyTargetLog(null)}
        />
      )}

      {/* Mock Payment / Subscription Modal */}
      <PaymentModal
        userProfile={systemState.userProfile}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onUpgradeSuccess={handleUpdateUserProfile}
      />

      {/* User Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={systemState.userProfile?.id ? systemState.userProfile : null}
        onAuthSuccess={handleAuthSuccess}
        onLogout={handleLogout}
      />

      {/* Global Micro-Toast Notification Layer */}
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-start sm:items-center justify-start sm:justify-center p-3 sm:p-4 pt-[max(1.25rem,calc(env(safe-area-inset-top,0px)+0.75rem))] pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] overscroll-contain overflow-y-auto max-h-[100dvh]">
          <div className="bg-[#121215] border border-red-500/40 rounded-2xl sm:rounded-3xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-100">
                  بازنشانی داده‌های سامانه
                </h3>
                <p className="text-xs text-red-400 mt-0.5">
                  بازگشت به مقادیر اولیه سیستم بوشیدو
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed bg-[#09090b]/80 border border-zinc-800 rounded-2xl p-4">
              آیا از بازنشانی کلیه داده‌ها، لاگ‌ها و چرخه‌ها به اطلاعات نمونه اولیه سیستم بوشیدو اطمینان دارید؟ تمام تغییرات ثبت‌شده محلی پاک خواهند شد.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>بله، بازنشانی داده‌ها</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

