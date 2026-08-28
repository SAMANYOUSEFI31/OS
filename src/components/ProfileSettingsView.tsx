import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, SystemSettings } from '../types';
import { toPersianDigits } from '../utils/numberUtils';
import { formatPersianDate, daysBetween } from '../utils/dateUtils';
import { BUSHIDO_CRIMSON_THEME } from '../utils/themeUtils';
import { soundFX } from '../utils/audioEffects';
import { ResponsiveSubTabBar, SubTabItem } from './ResponsiveSubTabBar';
import { 
  User, 
  Crown, 
  ShieldCheck, 
  Download, 
  Upload, 
  RotateCcw, 
  Check, 
  LogIn, 
  LogOut, 
  ChevronLeft,
  Moon,
  Database,
  AlertTriangle,
  CheckCircle2,
  Settings,
  UserCheck,
  Shield,
  Clock,
  KeyRound,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  HelpCircle
} from 'lucide-react';

interface ProfileSettingsViewProps {
  userProfile: UserProfile;
  settings: SystemSettings;
  onUpdateUserProfile: (updated: UserProfile) => void;
  onUpdateSettings: (updated: SystemSettings) => void;
  onOpenPaymentModal: () => void;
  onOpenAuthModal: () => void;
  onQuickLogin?: (role: 'admin' | 'test_user') => void;
  onLogout: () => void;
  onResetData: () => void;
  onImportData: (jsonStr: string) => void;
  onExportData: () => void;
  onNavigateToAdmin: () => void;
}

type SettingsSection = 'account' | 'discipline' | 'vault';

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  userProfile,
  settings,
  onUpdateUserProfile,
  onUpdateSettings,
  onOpenPaymentModal,
  onOpenAuthModal,
  onQuickLogin,
  onLogout,
  onResetData,
  onImportData,
  onExportData,
  onNavigateToAdmin
}) => {
  // Active Section for Progressive Disclosure (reduces cognitive load & mobile viewport scrolling)
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [navDirection, setNavDirection] = useState<number>(0);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);

  // Secret passcode trigger for stealthy Admin activation without showing public buttons
  const [stealthInput, setStealthInput] = useState('');
  const [isStealthPromptOpen, setIsStealthPromptOpen] = useState(false);
  const stealthClickCountRef = useRef(0);
  const stealthTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const themeConfig = BUSHIDO_CRIMSON_THEME;
  const currentCutoff = userProfile.nightOwlCutoffHour ?? settings.nightOwlCutoffHour ?? 4;

  const SECTIONS_LIST: SettingsSection[] = ['account', 'discipline', 'vault'];

  const switchSection = (newSec: SettingsSection) => {
    const currIdx = SECTIONS_LIST.indexOf(activeSection);
    const nextIdx = SECTIONS_LIST.indexOf(newSec);
    if (currIdx !== nextIdx) {
      setNavDirection(nextIdx > currIdx ? 1 : -1);
      setActiveSection(newSec);
    }
  };

  // Touch swipe gesture handlers for switching sections effortlessly
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input, select, button, [data-no-swipe], [contenteditable="true"]')) {
      touchStartRef.current = null;
      return;
    }
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    const isQuickFlick = elapsed < 280 && Math.abs(deltaX) >= 45;
    const isStandardSwipe = Math.abs(deltaX) >= 65;

    if ((isStandardSwipe || isQuickFlick) && Math.abs(deltaX) > Math.abs(deltaY) * 1.8) {
      const currIdx = SECTIONS_LIST.indexOf(activeSection);
      if (deltaX < 0) {
        // Swipe Left in RTL -> Next section
        if (currIdx < SECTIONS_LIST.length - 1) {
          switchSection(SECTIONS_LIST[currIdx + 1]);
        }
      } else {
        // Swipe Right in RTL -> Prev section
        if (currIdx > 0) {
          switchSection(SECTIONS_LIST[currIdx - 1]);
        }
      }
    }
  };

  const handleSelectCutoffHour = (hour: number) => {
    soundFX.playCheck();
    const updatedProfile = { ...userProfile, nightOwlCutoffHour: hour };
    const updatedSettings = { ...settings, nightOwlCutoffHour: hour };
    onUpdateUserProfile(updatedProfile);
    onUpdateSettings(updatedSettings);
    showNotice(`مهلت پایانی شبانه روی ساعت ${toPersianDigits(hour)}:۰۰ بامداد تنظیم شد.`);
  };

  const showNotice = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => {
      setSaveSuccessMsg(null);
    }, 4000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        onImportData(content);
        showNotice('پایگاه داده بوشیدو با موفقیت بازیابی شد.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Stealth admin check: 5 rapid clicks on the security seal or entering dedicated passcode
  const handleStealthSecretTap = () => {
    stealthClickCountRef.current += 1;
    if (stealthTimerRef.current) clearTimeout(stealthTimerRef.current);

    if (stealthClickCountRef.current >= 5) {
      stealthClickCountRef.current = 0;
      setIsStealthPromptOpen(true);
      return;
    }

    stealthTimerRef.current = setTimeout(() => {
      stealthClickCountRef.current = 0;
    }, 1800);
  };

  const handleStealthCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = stealthInput.trim().toLowerCase();
    
    // Dedicated secret admin codes & bypass phone numbers
    const validAdminCodes = ['admin', 'bushido_admin', '09120000000', '778899', 'sensei_root'];
    
    if (validAdminCodes.includes(cleanCode)) {
      soundFX.playCheck();
      setIsStealthPromptOpen(false);
      setStealthInput('');
      if (onQuickLogin) {
        onQuickLogin('admin');
      } else {
        onUpdateUserProfile({
          ...userProfile,
          isAdmin: true,
          isVip: true,
          tier: 'vip_samurai'
        });
      }
      onNavigateToAdmin();
      showNotice('دسترسی مدیریت کل بوشیدو (Admin) فعال شد و به پنل هدایت شدید.');
    } else {
      soundFX.playSlash();
      showNotice('شناسه یا کد امنیتی نامعتبر است.');
    }
  };

  const isLoggedIn = !!userProfile.id && userProfile.id !== 'guest' && !!(userProfile.phoneNumber || userProfile.email);

  // Calculate remaining VIP days
  let vipDaysRemaining = 0;
  if (userProfile.isVip && userProfile.vipExpiresAt) {
    const todayStr = new Date().toISOString().split('T')[0];
    const expiryStr = userProfile.vipExpiresAt.split('T')[0];
    vipDaysRemaining = Math.max(0, daysBetween(todayStr, expiryStr));
  }

  const cutoffHoursList = [
    { hour: 2, label: 'تا ۲:۰۰ بامداد' },
    { hour: 3, label: 'تا ۳:۰۰ بامداد' },
    { hour: 4, label: 'تا ۴:۰۰ بامداد (پیش‌فرض)' },
    { hour: 5, label: 'تا ۵:۰۰ بامداد' },
    { hour: 6, label: 'تا ۶:۰۰ صبح' }
  ];

  const SECTIONS_CONFIG: SubTabItem<SettingsSection>[] = [
    { id: 'account', label: 'حساب و اشتراک', shortLabel: 'حساب و VIP', icon: User, activeColor: 'text-amber-400' },
    { id: 'discipline', label: 'ساعت کات‌آف شبانه', shortLabel: 'کات‌آف شب', icon: Clock, activeColor: 'text-rose-400' },
    { id: 'vault', label: 'پایگاه داده و پشتیبان', shortLabel: 'پشتیبان داده', icon: Database, activeColor: 'text-emerald-400' },
  ];

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="space-y-5 sm:space-y-6 animate-in fade-in duration-200 select-none pb-6 touch-pan-y" 
      dir="rtl"
    >
      {/* Toast Notice */}
      {saveSuccessMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-emerald-500/50 text-emerald-300 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Level 1 Hero Section Header with Stealth Tap Listener on App Identity */}
      <div className="w-full max-w-full bg-[#121215] border border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div 
              onClick={handleStealthSecretTap}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shadow-md shrink-0 cursor-pointer active:scale-95 transition"
              title="سامانه تنظیمات بوشیدو"
            >
              <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-200" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-zinc-100 truncate">
                حساب کاربری و تنظیمات
              </h1>
              <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 truncate">
                مدیریت اشتراک سامورایی، مهلت شبانه و امنیت داده‌ها
              </p>
            </div>
          </div>

          {/* User Status Chip */}
          {userProfile.isVip ? (
            <span className="bg-amber-500/15 border border-amber-500/40 text-amber-300 px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0">
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span>VIP</span>
            </span>
          ) : (
            <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-xl text-xs font-bold whitespace-nowrap shrink-0">
              طرح استاندارد
            </span>
          )}
        </div>
      </div>

      {/* Progressive Disclosure: Segmented Categorization Bar (Standard Ergonomic Component) */}
      <ResponsiveSubTabBar<SettingsSection>
        tabs={SECTIONS_CONFIG}
        activeTab={activeSection}
        onSelectTab={switchSection}
        layoutId="activeSettingsSectionIndicator"
      />

      {/* Animated Swipeable Sections Container */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="space-y-4 w-full max-w-full"
        >
          {/* Section 1: Account & VIP Identity */}
          {activeSection === 'account' && (
            <div className="space-y-4">
              <div className="bg-[#121215] border border-zinc-800 rounded-3xl p-5 sm:p-6 relative overflow-hidden shadow-xl space-y-5">
                {/* User Identity Row */}
                <div className="flex items-start justify-between gap-3 relative z-10">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-zinc-200 text-lg font-black shadow-inner shrink-0">
                      {userProfile.name ? userProfile.name.charAt(0) : '武'}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-lg font-black text-zinc-100 flex items-center gap-2 truncate">
                        <span className="truncate">{userProfile.name || 'جنگجوی بوشیدو'}</span>
                        {userProfile.isAdmin && (
                          <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] px-2 py-0.5 rounded-md font-bold whitespace-nowrap shrink-0">
                            مدیر
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-zinc-400 font-mono mt-0.5 truncate">
                        {userProfile.phoneNumber 
                          ? toPersianDigits(userProfile.phoneNumber) 
                          : userProfile.email || 'حساب کاربری محلی (مهمان)'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* VIP & Access Status Details */}
                <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-4 space-y-3 relative z-10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">سطح دسترسی:</span>
                    <span className="font-bold text-zinc-200">
                      {userProfile.isVip ? 'سامورایی ویژه VIP (دسترسی کامل)' : 'رونین (طرح استاندارد)'}
                    </span>
                  </div>

                  {userProfile.isVip && userProfile.vipExpiresAt && (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">پایان اشتراک:</span>
                        <span className="font-bold text-amber-300">
                          {formatPersianDate(userProfile.vipExpiresAt.split('T')[0])}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800">
                        <span className="text-zinc-400">اعتبار باقی‌مانده:</span>
                        <span className="font-black text-emerald-400">
                          {toPersianDigits(vipDaysRemaining)} روز
                        </span>
                      </div>
                    </>
                  )}

                  {!userProfile.isVip && (
                    <p className="text-[11px] text-zinc-400 leading-relaxed bg-[#121215] p-3 rounded-xl border border-zinc-800 text-right">
                      با فعال‌سازی اشتراک VIP، امکان ایجاد چرخه‌های نامحدود و دسترسی به تحلیل‌های سنتسی فعال می‌شود.
                    </p>
                  )}
                </div>

                {/* Account Actions & Subscriptions */}
                <div className="pt-4 border-t border-zinc-800 space-y-2.5 relative z-10">
                  {/* VIP CTA */}
                  {userProfile.isVip ? (
                    <button
                      type="button"
                      onClick={onOpenPaymentModal}
                      className="w-full bg-zinc-800 hover:bg-zinc-700 hover:border-amber-500/50 border border-amber-500/30 text-amber-300 font-bold text-xs py-3 rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98] shadow-md whitespace-nowrap"
                    >
                      <Crown className="w-4 h-4 text-amber-400" />
                      <span>تمدید اشتراک سامورایی ویژه (VIP)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenPaymentModal}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs py-3 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-[0.98] whitespace-nowrap"
                    >
                      <Crown className="w-4 h-4" />
                      <span>ارتقا به حساب سامورایی ویژه (VIP)</span>
                    </button>
                  )}

                  {/* Auth Action */}
                  {isLoggedIn ? (
                    <div className="space-y-2 pt-1">
                      {userProfile.isAdmin === true && (
                        <button
                          type="button"
                          onClick={() => {
                            soundFX.playCheck();
                            onNavigateToAdmin();
                          }}
                          className="w-full bg-red-950/50 hover:bg-red-900/70 border border-red-500/50 hover:border-red-500/80 text-red-200 text-xs font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98] whitespace-nowrap shadow-sm"
                        >
                          <ShieldCheck className="w-4 h-4 text-red-400" />
                          <span>پنل مدیریت سامانه (/admin)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          soundFX.playSlash();
                          onLogout();
                        }}
                        className="w-full bg-red-950/20 hover:bg-red-900/40 hover:text-red-300 hover:border-red-500/40 border border-zinc-800 text-zinc-400 text-xs font-bold py-2.5 rounded-2xl flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.98] whitespace-nowrap"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>خروج از حساب کاربری</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={onOpenAuthModal}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-black text-xs font-black py-3 rounded-2xl flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.98] whitespace-nowrap shadow-md shadow-amber-500/20"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>ورود یا ایجاد حساب کاربری</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Discipline & Nightly Cutoff Hour */}
          {activeSection === 'discipline' && (
            <div className="space-y-4">
              <div className="bg-[#121215] border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0 shadow-inner">
                    <Moon className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                      مهلت پایانی شبانه (مرز کات‌آف)
                    </h3>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
                      ثبت عادات تا پیش از این ساعت، برای روز قبل لحاظ می‌شود
                    </p>
                  </div>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed bg-[#18181b] p-3.5 rounded-2xl border border-zinc-800 text-right">
                  اگر شب‌ها تا دیروقت بیدار هستید، ثبت عادات تا قبل از این ساعت کماکان برای روز گذشته محاسبه می‌شود تا روز تقویمی شما قبل از خواب از دست نرود.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                  {cutoffHoursList.map(item => {
                    const isSelected = currentCutoff === item.hour;
                    return (
                      <button
                        key={item.hour}
                        type="button"
                        onClick={() => handleSelectCutoffHour(item.hour)}
                        className={`px-3.5 py-3 rounded-xl text-xs font-bold flex items-center justify-between border transition cursor-pointer active:scale-[0.98] ${
                          isSelected
                            ? 'bg-zinc-800 border-emerald-500/50 text-white shadow-md'
                            : 'bg-[#18181b] border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <span className="whitespace-nowrap">{item.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Data Vault & Safe Backup */}
          {activeSection === 'vault' && (
            <div className="space-y-4">
              <div className="bg-[#121215] border border-zinc-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0 shadow-inner">
                    <Database className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-zinc-100">
                      پشتیبان‌گیری و پایگاه داده
                    </h3>
                    <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5">
                      خروجی گرفتن، بازیابی فایل یا بازنشانی داده‌های سامانه
                    </p>
                  </div>
                </div>

                {/* Standard Safe Operations: Export & Import */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Export JSON Card */}
                  <button
                    type="button"
                    onClick={() => {
                      soundFX.playCheck();
                      onExportData();
                      showNotice('فایل پشتیبان داده‌های بوشیدو ذخیره شد.');
                    }}
                    className="bg-[#18181b] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 p-4 rounded-2xl flex items-start gap-3.5 text-right transition cursor-pointer active:scale-[0.98] group shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 group-hover:text-zinc-100 group-hover:border-zinc-600 transition shrink-0">
                      <Download className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-zinc-100 block">خروجی پشتیبان (JSON)</span>
                      <p className="text-[11px] text-zinc-400 leading-relaxed text-right">
                        دریافت نسخه پشتیبان از تمام چرخه‌ها و لاگ‌ها
                      </p>
                    </div>
                  </button>

                  {/* Import JSON Card */}
                  <label className="bg-[#18181b] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 p-4 rounded-2xl flex items-start gap-3.5 text-right transition cursor-pointer active:scale-[0.98] group shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 group-hover:text-zinc-100 group-hover:border-zinc-600 transition shrink-0">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-zinc-100 block">بازیابی نسخه پشتیبان</span>
                      <p className="text-[11px] text-zinc-400 leading-relaxed text-right">
                        بارگذاری فایل JSON و بازنشانی داده‌ها
                      </p>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Collapsible Danger Zone: Reset Data */}
                <div className="pt-2">
                  <div className="bg-red-950/15 border border-red-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 text-right">
                        <h4 className="font-bold text-xs sm:text-sm text-red-200">
                          بازنشانی کل داده‌های سامانه
                        </h4>
                        <p className="text-[11px] text-zinc-400 leading-relaxed">
                          تمام لاگ‌ها و سوابق پاک شده و سامانه به وضعیت اولیه بازمی‌گردد.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsConfirmResetOpen(true);
                      }}
                      className="bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 hover:border-red-500/60 text-red-300 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition whitespace-nowrap shrink-0 shadow-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>بازنشانی به وضعیت اولیه</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Confirmation Modal for Reset Factory Data */}
      <AnimatePresence>
        {isConfirmResetOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121215] border-2 border-red-500/50 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 text-right"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">تایید بازنشانی داده‌ها</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">آیا از پاک‌سازی کامل تمام چرخه‌ها و لاگ‌ها اطمینان دارید؟</p>
                </div>
              </div>

              <p className="text-xs text-zinc-300 bg-red-950/20 border border-red-500/30 p-3 rounded-xl leading-relaxed">
                این عملیات غیرقابل بازگشت است و تمام رکوردهای استریک، عادات ثبت‌شده و احکام دادگاه بوشیدو حذف خواهند شد.
              </p>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    soundFX.playSlash();
                    setIsConfirmResetOpen(false);
                    onResetData();
                    showNotice('داده‌های سامانه به حالت اولیه بازنشانی شد.');
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black text-xs py-3 rounded-xl transition cursor-pointer active:scale-95 shadow-md shadow-red-600/30"
                >
                  بله، بازنشانی کامل شود
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmResetOpen(false)}
                  className="px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs py-3 rounded-xl transition cursor-pointer active:scale-95"
                >
                  انصراف
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Secret Stealth Authentication Modal (Unlocked via 5 Taps) */}
      <AnimatePresence>
        {isStealthPromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#121215] border border-zinc-700 rounded-3xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4 text-right"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">ورود امن و اختصاصی سامانه</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">شناسه امنیتی یا کد اختصاصی را وارد نمایید</p>
                </div>
              </div>

              <form onSubmit={handleStealthCodeSubmit} className="space-y-3">
                <input
                  type="text"
                  value={stealthInput}
                  onChange={e => setStealthInput(e.target.value)}
                  placeholder="کد یا شناسه امنیتی..."
                  autoFocus
                  className="w-full bg-[#09090b] border border-zinc-700 focus:border-amber-400 text-white text-xs px-3.5 py-3 rounded-xl outline-none transition text-left font-mono"
                  dir="ltr"
                />

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs py-2.5 rounded-xl transition cursor-pointer active:scale-95"
                  >
                    تایید و ورود
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsStealthPromptOpen(false);
                      setStealthInput('');
                    }}
                    className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer active:scale-95"
                  >
                    بستن
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
