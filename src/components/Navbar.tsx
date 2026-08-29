import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cycle, CycleMetrics, SystemSettings, UserProfile } from '../types';
import { toPersianDigits } from '../utils/numberUtils';
import { THEME_PALETTES } from '../utils/themeUtils';
import { haptics } from '../utils/haptics';
import { soundFX } from '../utils/audioEffects';
import { 
  Swords, 
  LayoutDashboard, 
  Archive, 
  Menu, 
  Flame, 
  AlertTriangle, 
  ChevronDown,
  Crown,
  ShieldCheck,
  Plus,
  Trash2
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  cycles: Cycle[];
  currentCycle: Cycle;
  onSelectCycle: (cycle: Cycle) => void;
  metrics: CycleMetrics;
  settings: SystemSettings;
  userProfile: UserProfile;
  onOpenPaymentModal: () => void;
  onOpenAuthModal: () => void;
  onOpenDebtAutopsy?: () => void;
  onOpenNewCycleModal?: () => void;
  onDeleteCycle?: (cycleId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  cycles,
  currentCycle,
  onSelectCycle,
  metrics,
  settings,
  userProfile,
  onOpenPaymentModal,
  onOpenAuthModal,
  onOpenDebtAutopsy,
  onOpenNewCycleModal,
  onDeleteCycle
}) => {
  const [isCycleDropdownOpen, setIsCycleDropdownOpen] = useState(false);
  const [confirmDeleteCycleId, setConfirmDeleteCycleId] = useState<string | null>(null);

  // 3 Primary Canonical Tabs for Maximum Touch Ergonomics & Clean Hierarchy
  const mainTabs = [
    { id: 'battlefield', label: 'میدان نبرد', icon: Swords },
    { id: 'dashboard', label: 'اتاق فرماندهی', icon: LayoutDashboard },
    { id: 'profile', label: 'بیشتر', icon: Menu },
  ];

  const currentTheme = userProfile.accentTheme || settings.accentTheme || 'amber';
  const themeConfig = THEME_PALETTES[currentTheme] || THEME_PALETTES.amber;

  const handleTabClick = (tabId: string) => {
    if (tabId !== activeTab) {
      haptics.lightTap();
      onSelectTab(tabId);
    }
  };

  const currentCycleIndex = currentCycle 
    ? cycles.findIndex(c => c.id === currentCycle.id)
    : -1;

  const cycleTitleDisplay = currentCycle 
    ? `چرخه ${toPersianDigits(currentCycleIndex >= 0 ? currentCycleIndex + 1 : 1)}`
    : 'تعریف چرخه';

  const handleDeleteCycleClick = (e: React.MouseEvent, cycleId: string) => {
    e.stopPropagation();
    if (confirmDeleteCycleId === cycleId) {
      soundFX.playSlash();
      if (onDeleteCycle) {
        onDeleteCycle(cycleId);
      }
      setConfirmDeleteCycleId(null);
    } else {
      setConfirmDeleteCycleId(cycleId);
    }
  };

  return (
    <>
      {/* Top Hub Bar Header with Dynamic Island & PWA Safe-Area Support */}
      <header 
        className="sticky top-0 z-40 bg-[#09090b] border-b border-zinc-800 transition-all pt-[env(safe-area-inset-top,0px)]" 
        dir="rtl"
      >
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-4">
            
            {/* Brand & Cycle Switcher */}
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 shrink">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center text-black font-black shadow-lg text-sm sm:text-base shrink-0 select-none pointer-events-none"
                  style={{ backgroundColor: themeConfig.colorHex }}
                >
                  武
                </div>
                <div className="hidden sm:block select-none pointer-events-none">
                  <span className="font-black text-xs sm:text-sm text-zinc-100 tracking-tight block truncate">
                    بوشیدو
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono hidden md:block">
                    BUSHIDO OS
                  </span>
                </div>
              </div>

              {/* Cycle Switcher Dropdown */}
              <div className="relative min-w-0">
                <button 
                  type="button"
                  onClick={() => setIsCycleDropdownOpen(!isCycleDropdownOpen)}
                  className="h-8 sm:h-9 bg-[#121215] hover:bg-zinc-800 active:bg-zinc-750 border border-zinc-800 rounded-xl px-2 sm:px-2.5 text-xs text-zinc-200 inline-flex items-center justify-center gap-1 sm:gap-1.5 transition cursor-pointer shrink-0"
                >
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${currentCycle ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                  <span className="font-bold whitespace-nowrap text-[11px] sm:text-xs">
                    {cycleTitleDisplay}
                  </span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>

                {isCycleDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => {
                        setIsCycleDropdownOpen(false);
                        setConfirmDeleteCycleId(null);
                      }}
                    />
                    <div className="absolute right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] bg-[#121215] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-[10px] text-zinc-400 font-bold border-b border-zinc-800 flex items-center justify-between">
                        <span>انتخاب و مدیریت چرخه‌های ۹۰ روزه:</span>
                        <span className="text-zinc-500 font-mono">{toPersianDigits(cycles.length)} چرخه</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto py-1">
                        {cycles.length === 0 ? (
                          <div className="p-3 text-center text-xs text-zinc-400">
                            چرخه‌ای تعریف نشده است.
                          </div>
                        ) : (
                          cycles.map(c => {
                            const isCurrent = currentCycle && c.id === currentCycle.id;
                            const isConfirming = confirmDeleteCycleId === c.id;

                            return (
                              <div
                                key={c.id}
                                className={`w-full px-3 py-2 text-xs hover:bg-zinc-800/80 transition flex items-center justify-between gap-2 cursor-pointer border-b border-zinc-850 last:border-0 ${
                                  isCurrent ? 'text-emerald-400 font-bold bg-zinc-800/50' : 'text-zinc-300'
                                }`}
                                onClick={() => {
                                  onSelectCycle(c);
                                  setIsCycleDropdownOpen(false);
                                  setConfirmDeleteCycleId(null);
                                }}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCurrent ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                  <span className="truncate text-right">{c.title}</span>
                                  {c.isArchived && (
                                    <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                                      بایگانی
                                    </span>
                                  )}
                                </div>

                                {/* Delete Action inside Dropdown */}
                                {onDeleteCycle && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteCycleClick(e, c.id)}
                                    className={`p-1.5 rounded-lg text-xs transition shrink-0 cursor-pointer flex items-center justify-center ${
                                      isConfirming 
                                        ? 'bg-red-500 hover:bg-red-600 text-white font-black px-2 py-1 shadow-md animate-pulse' 
                                        : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10'
                                    }`}
                                    title={isConfirming ? 'کلیک مجدد برای حذف قطعی' : 'حذف این چرخه'}
                                  >
                                    {isConfirming ? (
                                      <span className="text-[10px] whitespace-nowrap leading-none">تایید حذف؟</span>
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                      
                      <div className="p-2 border-t border-zinc-800 space-y-1.5 bg-[#0e0e11] rounded-b-2xl">
                        {onOpenNewCycleModal && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCycleDropdownOpen(false);
                              setConfirmDeleteCycleId(null);
                              onOpenNewCycleModal();
                            }}
                            className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10 active:scale-[0.98]"
                          >
                            <Plus className="w-4 h-4" />
                            <span>+ تعریف چرخه جدید ۹۰ روزه</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsCycleDropdownOpen(false);
                            setConfirmDeleteCycleId(null);
                            onSelectTab('archives');
                          }}
                          className="w-full py-1.5 px-3 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5 text-zinc-400" />
                          <span>کارنامه و بایگانی چرخه‌ها</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2 h-10">
              {mainTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const hasDebtAlert = tab.id === 'battlefield' && metrics.unresolvedDebtCount > 0;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => handleTabClick(tab.id)}
                    className={`h-9 px-3.5 rounded-xl text-xs xl:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer relative z-10 select-none ${
                      isActive
                        ? 'text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="desktopActiveTabIndicator"
                        layout="position"
                        className="absolute inset-0 rounded-xl -z-10 shadow-md border pointer-events-none"
                        style={{
                          backgroundColor: themeConfig.bgSubtle,
                          borderColor: `${themeConfig.colorHex}50`,
                          boxShadow: `0 0 20px ${themeConfig.glowColor}`
                        }}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <Icon 
                      className="w-4 h-4 transition-colors shrink-0"
                      style={{ color: isActive ? themeConfig.colorHex : undefined }}
                    />
                    <span className="whitespace-nowrap leading-none">{tab.label}</span>

                    {hasDebtAlert && !isActive && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1.5 left-1.5" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* User Tier, Auth & Streak Controls */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Debt Alert Badge */}
              {metrics.unresolvedDebtCount > 0 && (
                <button 
                  type="button"
                  onClick={() => {
                    if (onOpenDebtAutopsy) {
                      onOpenDebtAutopsy();
                    } else {
                      onSelectTab('battlefield');
                    }
                  }}
                  className="h-8 sm:h-9 bg-red-950/80 border border-red-500/60 hover:bg-red-900/90 text-red-300 px-2 sm:px-2.5 rounded-xl text-[10px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer animate-pulse shrink-0 shadow-md transition"
                  title="کلیک برای کالبدشکافی و تسویه فوری بدهی"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="hidden xs:inline">{toPersianDigits(metrics.unresolvedDebtCount)} بدهی باز</span>
                  <span className="xs:hidden">{toPersianDigits(metrics.unresolvedDebtCount)}!</span>
                </button>
              )}

              {/* Pure Streak Flame */}
              <div 
                className="h-8 sm:h-9 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 sm:px-2.5 rounded-xl inline-flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold shrink-0"
                title="تعداد روزهای زنجیره خالص متوالی بدون شکست"
              >
                <Flame className="w-3.5 h-3.5 shrink-0 fill-current text-rose-400" />
                <span className="whitespace-nowrap font-mono">{toPersianDigits(metrics.pureStreak)} روز</span>
              </div>

              {/* VIP Status Badge */}
              {userProfile.isVip && (
                <div 
                  onClick={onOpenPaymentModal}
                  className="h-8 sm:h-9 bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 sm:px-2.5 rounded-xl text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer shadow-xs shrink-0"
                  title="حساب سامورایی ویژه فعال است"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-mono">VIP</span>
                </div>
              )}

              {/* Admin Panel Quick Access Button */}
              {userProfile.isAdmin && (
                <button
                  type="button"
                  onClick={() => onSelectTab('admin')}
                  className={`h-8 sm:h-9 bg-red-950/60 border border-red-500/50 hover:bg-red-900/80 text-red-300 px-2 sm:px-2.5 rounded-xl text-[10px] sm:text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer transition shrink-0 ${
                    activeTab === 'admin' ? 'ring-2 ring-red-500 bg-red-900/80 text-white' : ''
                  }`}
                  title="ورود به پنل مدیریت"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="hidden sm:inline">پنل مدیریت</span>
                  <span className="sm:hidden">مدیر</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (3 Clean Canonical Tabs) */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800/90 crisp-blur px-2 py-1 pb-safe select-none"
        dir="rtl"
      >
        <div className="grid grid-cols-3 max-w-md mx-auto relative h-14 items-center">
          {mainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasDebtAlert = tab.id === 'battlefield' && metrics.unresolvedDebtCount > 0;
            const hasMilestoneAlert = tab.id === 'profile' && !userProfile.isVip && (metrics.elapsedDays >= 30 || metrics.pureStreak >= 7);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`h-full flex flex-col items-center justify-center relative cursor-pointer z-10 transition-colors ${
                  isActive
                    ? 'font-bold text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="relative w-12 h-7 flex items-center justify-center">
                  {isActive && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 rounded-xl border pointer-events-none"
                      style={{
                        backgroundColor: themeConfig.bgSubtle,
                        borderColor: `${themeConfig.colorHex}50`,
                        boxShadow: `0 0 16px ${themeConfig.glowColor}`
                      }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  <Icon 
                    className="w-5 h-5 relative z-10 transition-colors duration-200" 
                    style={{ color: isActive ? themeConfig.colorHex : undefined }}
                  />

                  {hasDebtAlert && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-0.5 right-1 z-20" />
                  )}

                  {hasMilestoneAlert && !isActive && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute top-0.5 right-1 z-20 shadow-xs" />
                  )}
                </div>

                <span 
                  className="h-3.5 text-[10.5px] tracking-tight mt-0.5 leading-none whitespace-nowrap transition-colors duration-200 flex items-center justify-center"
                  style={{ color: isActive ? themeConfig.colorHex : undefined }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
