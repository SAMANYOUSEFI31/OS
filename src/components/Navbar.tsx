import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Cycle, CycleMetrics, SystemSettings, UserProfile } from '../types';
import { toPersianDigits } from '../utils/numberUtils';
import { THEME_PALETTES } from '../utils/themeUtils';
import { 
  Swords, 
  LayoutDashboard, 
  Archive, 
  Settings, 
  Flame, 
  AlertTriangle, 
  ChevronDown,
  Crown,
  User,
  LogIn,
  ShieldCheck,
  Sparkles
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
  onOpenDebtAutopsy
}) => {
  const [isCycleDropdownOpen, setIsCycleDropdownOpen] = useState(false);
  const [adminUnlockToast, setAdminUnlockToast] = useState(false);

  // Secret 5-click counter on brand logo to reveal admin panel / auth
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleBrandClick = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 5) {
      clickCountRef.current = 0;
      try {
        const currentSecret = localStorage.getItem('bushido_secret_dev_mode') === 'true';
        localStorage.setItem('bushido_secret_dev_mode', (!currentSecret).toString());
      } catch (e) {}

      setAdminUnlockToast(true);
      setTimeout(() => setAdminUnlockToast(false), 3500);
      onOpenAuthModal();
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0;
    }, 2000);
  };

  // Exactly 4 primary user tabs as strictly required
  const mainTabs = [
    { id: 'battlefield', label: 'میدان نبرد', icon: Swords },
    { id: 'dashboard', label: 'اتاق فرماندهی', icon: LayoutDashboard },
    { id: 'archives', label: 'بایگانی و کارنامه', icon: Archive },
    { id: 'profile', label: 'حساب و تنظیمات', icon: Settings },
  ];

  const currentTheme = userProfile.accentTheme || settings.accentTheme || 'amber';
  const themeConfig = THEME_PALETTES[currentTheme] || THEME_PALETTES.amber;

  return (
    <>
      {/* Top Hub Bar Header */}
      <header className="sticky top-0 z-40 bg-[#09090b]/95 border-b border-zinc-800/90 backdrop-blur-xl transition-all" dir="rtl">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-4">
            
            {/* Brand & Cycle Switcher */}
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 shrink">
              <div className="flex items-center gap-2 shrink-0">
                {/* 5-click easter egg on brand logo */}
                <button
                  type="button"
                  onClick={handleBrandClick}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center text-black font-black shadow-lg text-sm sm:text-base transition-transform active:scale-90 shrink-0 select-none cursor-pointer focus:outline-none"
                  style={{ backgroundColor: themeConfig.colorHex }}
                  title="سیستم دیسیپلین بوشیدو (۵ بار کلیک برای دسترسی فرمانده)"
                >
                  武
                </button>
                <div className="hidden sm:block select-none">
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
                  className="h-8 sm:h-9 bg-[#121215] hover:bg-zinc-800 active:bg-zinc-750 border border-zinc-800 rounded-xl px-2.5 text-xs text-zinc-200 inline-flex items-center justify-center gap-1.5 transition cursor-pointer max-w-[120px] xs:max-w-[150px] sm:max-w-[210px] shrink-0"
                >
                  <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 shrink-0"></span>
                  <span className="font-bold truncate text-[11px] sm:text-xs">
                    {currentCycle.title.split('—')[0] || currentCycle.title}
                  </span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>

                {isCycleDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsCycleDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-72 bg-[#121215] border border-zinc-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-[10px] text-zinc-400 font-bold border-b border-zinc-800 flex items-center justify-between">
                        <span>انتخاب چرخه ۹۰ روزه:</span>
                        <span className="text-zinc-500 font-mono">{toPersianDigits(cycles.length)} چرخه</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto py-1">
                        {cycles.map(c => (
                          <button
                            key={c.id}
                            onClick={() => {
                              onSelectCycle(c);
                              setIsCycleDropdownOpen(false);
                            }}
                            className={`w-full text-right px-3 py-2.5 text-xs hover:bg-zinc-800 transition flex items-center justify-between cursor-pointer ${
                              c.id === currentCycle.id ? 'text-emerald-400 font-bold bg-zinc-800/80' : 'text-zinc-300'
                            }`}
                          >
                            <span className="truncate pl-2">{c.title}</span>
                            {c.isArchived ? (
                              <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded shrink-0">
                                بایگانی
                              </span>
                            ) : c.id === currentCycle.id ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Desktop Navigation Tabs (Exactly 4 Tabs with Spring layoutId indicator) */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              {mainTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const hasDebtAlert = tab.id === 'battlefield' && metrics.unresolvedDebtCount > 0;

                return (
                  <button
                    key={tab.id}
                    onClick={() => onSelectTab(tab.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs xl:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer relative z-10 ${
                      isActive
                        ? 'text-white font-bold'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="desktopActiveTabIndicator"
                        className="absolute inset-0 rounded-xl -z-10 shadow-md border"
                        style={{
                          backgroundColor: themeConfig.bgSubtle,
                          borderColor: `${themeConfig.colorHex}50`,
                          boxShadow: `0 0 20px ${themeConfig.glowColor}`
                        }}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      />
                    )}
                    <Icon 
                      className="w-4 h-4 transition-colors"
                      style={{ color: isActive ? themeConfig.colorHex : undefined }}
                    />
                    <span>{tab.label}</span>

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

              {/* Pure Streak Flame (Always visible and responsive with permanent Fiery Rose token) */}
              <div 
                className="h-8 sm:h-9 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 sm:px-2.5 rounded-xl inline-flex items-center justify-center gap-1 text-[11px] sm:text-xs font-bold shrink-0"
                title="تعداد روزهای زنجیره خالص متوالی بدون شکست"
              >
                <Flame className="w-3.5 h-3.5 shrink-0 fill-current text-rose-400" />
                <span className="whitespace-nowrap font-mono">{toPersianDigits(metrics.pureStreak)} روز</span>
              </div>

              {/* VIP Status Badge (If active VIP) */}
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

              {/* Admin Panel Quick Access Button if Admin */}
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

              {/* User Account / Settings Button (Visible on Desktop; Mobile users have the bottom profile tab) */}
              <button
                type="button"
                onClick={() => onSelectTab('profile')}
                className={`hidden lg:inline-flex h-8 w-8 sm:h-9 sm:w-9 rounded-xl border items-center justify-center transition cursor-pointer shrink-0 relative ${
                  activeTab === 'profile'
                    ? 'bg-zinc-800 border-amber-500 text-amber-400'
                    : 'bg-[#121215] hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
                }`}
                title={userProfile?.id ? `حساب و تنظیمات (${userProfile.name})` : 'حساب کاربری و تنظیمات'}
              >
                <Settings className={`w-4 h-4 ${activeTab === 'profile' ? 'text-amber-400' : 'text-zinc-300'}`} />
                {!userProfile.isVip && (metrics.elapsedDays >= 30 || metrics.pureStreak >= 7) && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1 animate-pulse" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Secret admin unlock banner notification */}
        {adminUnlockToast && (
          <div className="bg-amber-950/90 border-t border-b border-amber-500/40 px-4 py-2 text-center text-xs text-amber-200 flex items-center justify-center gap-2 animate-in slide-in-from-top-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
            <span>حالت دسترسی مخفی فرمانده ارشد فعال شد.</span>
          </div>
        )}
      </header>

      {/* Mobile Bottom Navigation Bar (4 clean tabs with spring layoutId active indicator) */}
      <nav 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 border-t border-zinc-800/90 backdrop-blur-xl px-2 py-1.5 pb-safe"
        dir="rtl"
      >
        <div className="grid grid-cols-4 max-w-md mx-auto relative">
          {mainTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const hasDebtAlert = tab.id === 'battlefield' && metrics.unresolvedDebtCount > 0;
            const hasMilestoneAlert = tab.id === 'profile' && !userProfile.isVip && (metrics.elapsedDays >= 30 || metrics.pureStreak >= 7);

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex flex-col items-center justify-center py-1 px-1 relative cursor-pointer z-10 transition-colors ${
                  isActive
                    ? 'font-bold text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="relative px-3 py-1 flex items-center justify-center">
                  {isActive && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute inset-0 rounded-xl border"
                      style={{
                        backgroundColor: themeConfig.bgSubtle,
                        borderColor: `${themeConfig.colorHex}50`,
                        boxShadow: `0 0 16px ${themeConfig.glowColor}`
                      }}
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon 
                    className="w-5 h-5 relative z-10 transition-colors duration-200" 
                    style={{ color: isActive ? themeConfig.colorHex : undefined }}
                  />
                </div>
                <span 
                  className="text-[10px] tracking-tight mt-0.5 leading-none whitespace-nowrap transition-colors duration-200"
                  style={{ color: isActive ? themeConfig.colorHex : undefined }}
                >
                  {tab.label}
                </span>

                {hasDebtAlert && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-3" />
                )}

                {hasMilestoneAlert && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute top-1 right-3 shadow-xs" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
