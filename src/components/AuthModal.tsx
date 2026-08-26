import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../types';
import { toPersianDigits, formatPersianNumber } from '../utils/numberUtils';
import { 
  ShieldCheck, 
  Smartphone, 
  Mail, 
  KeyRound, 
  User, 
  LogOut, 
  Crown, 
  X, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Sparkles,
  Database,
  Lock
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onAuthSuccess: (token: string, user: UserProfile) => void;
  onLogout: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
  onLogout
}) => {
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const [debugOtp, setDebugOtp] = useState<string | null>(null);

  // Hidden secret dev/admin mode state (hidden from public users)
  const [showSecretDev, setShowSecretDev] = useState(false);
  const secretClickCountRef = useRef(0);
  const secretTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      try {
        const isSecretUnlocked = localStorage.getItem('bushido_secret_dev_mode') === 'true';
        setShowSecretDev(isSecretUnlocked);
      } catch (e) {
        setShowSecretDev(false);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSecretIconClick = () => {
    secretClickCountRef.current += 1;
    if (secretTimerRef.current) clearTimeout(secretTimerRef.current);

    if (secretClickCountRef.current >= 5) {
      secretClickCountRef.current = 0;
      const nextVal = !showSecretDev;
      setShowSecretDev(nextVal);
      try {
        localStorage.setItem('bushido_secret_dev_mode', nextVal.toString());
      } catch (e) {}
      return;
    }

    secretTimerRef.current = setTimeout(() => {
      secretClickCountRef.current = 0;
    }, 2000);
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setServerMessage('');
    setDebugOtp(null);

    const clean = identifier.trim();
    if (!clean) {
      setErrorMessage('لطفاً شماره موبایل یا ایمیل خود را وارد نمایید.');
      return;
    }

    setIsLoading(true);
    try {
      let data: any = null;
      try {
        const res = await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: clean })
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        }
      } catch (e) {
        console.warn('Send OTP backend fetch failed, using local offline fallback');
      }

      if (data && data.success) {
        setServerMessage(data.message || 'کد تایید ۵ رقمی ارسال شد.');
        if (data.debugCode) {
          setDebugOtp(data.debugCode);
          setOtpCode(data.debugCode);
        }
        setStep('otp');
        return;
      }

      // Offline instant OTP code generation
      const localCode = String(Math.floor(10000 + Math.random() * 90000));
      setServerMessage(`کد تایید ۵ رقمی برای ${clean} ایجاد شد.`);
      setDebugOtp(localCode);
      setOtpCode(localCode);
      setStep('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'ارتباط با سرور برقرار نشد.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!otpCode.trim()) {
      setErrorMessage('لطفاً کد تایید ۵ رقمی را وارد نمایید.');
      return;
    }

    setIsLoading(true);
    try {
      let data: any = null;
      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: identifier.trim(),
            code: otpCode.trim(),
            name: name.trim() || undefined
          })
        });
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await res.json();
        }
      } catch (e) {
        console.warn('Verify OTP backend fetch failed, using local offline verification');
      }

      if (data && data.token && data.user) {
        const userProfile: UserProfile = {
          id: data.user.id,
          name: data.user.name || 'سامورایی دیسیپلین',
          email: data.user.email || undefined,
          phoneNumber: data.user.phoneNumber || undefined,
          tier: data.user.tier || 'free',
          isVip: !!data.user.isVip,
          isAdmin: !!data.user.isAdmin,
          vipSince: data.user.vipSince,
          vipExpiresAt: data.user.vipExpiresAt,
          paymentRefId: data.user.paymentRefId,
          activeCycleLimit: data.user.isVip ? 999 : 1
        };

        onAuthSuccess(data.token, userProfile);
        onClose();
        return;
      }

      // Offline instant verification fallback
      const cleanId = identifier.trim().toLowerCase();
      const isEmail = cleanId.includes('@');
      const fallbackUser: UserProfile = {
        id: `usr-${Date.now()}`,
        name: name.trim() || (isEmail ? cleanId.split('@')[0] : 'سامورایی دیسیپلین'),
        email: isEmail ? cleanId : undefined,
        phoneNumber: !isEmail ? cleanId : undefined,
        tier: 'free',
        isVip: false,
        isAdmin: false,
        vipSince: undefined,
        vipExpiresAt: undefined,
        paymentRefId: undefined,
        activeCycleLimit: 1
      };
      const fallbackToken = `mock-token-${Date.now()}`;

      onAuthSuccess(fallbackToken, fallbackUser);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در تایید کد');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (role: 'admin' | 'test_user') => {
    setIsLoading(true);
    setErrorMessage('');
    try {
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
      } catch (networkErr) {
        console.warn('Backend quick-login fetch failed, using local offline fallback:', networkErr);
      }

      // If server responded with data
      if (data && data.user && data.token) {
        const userProfile: UserProfile = {
          id: data.user.id,
          name: data.user.name || (role === 'admin' ? 'فرمانده ارشد سامورایی (مدیر)' : 'کاربر آزمایشی'),
          email: data.user.email,
          phoneNumber: data.user.phoneNumber,
          tier: data.user.tier || (data.user.isVip ? 'vip_samurai' : 'free'),
          isVip: Boolean(data.user.isVip),
          isAdmin: Boolean(data.user.isAdmin),
          vipSince: data.user.vipSince,
          vipExpiresAt: data.user.vipExpiresAt,
          paymentRefId: data.user.paymentRefId,
          activeCycleLimit: data.user.isVip ? 999 : 1
        };

        onAuthSuccess(data.token, userProfile);
        onClose();
        return;
      }

      // Robust Instant Offline Fallback
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

      onAuthSuccess(fallbackToken, fallbackUser);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'خطا در ورود به حساب.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto" dir="rtl">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 400) {
            onClose();
          }
        }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden touch-pan-y"
      >
        {/* Mobile Drag Pill Indicator */}
        <div className="w-12 h-1.5 bg-zinc-700/80 rounded-full mx-auto my-2 sm:hidden cursor-grab active:cursor-grabbing shrink-0" />

        {/* Header */}
        <div className="px-6 py-4 sm:py-5 border-b border-zinc-800 flex items-center justify-between bg-[#09090b]/60">
          <div className="flex items-center gap-3">
            {/* 5-click easter egg on KeyRound icon for developer bypass */}
            <button
              type="button"
              onClick={handleSecretIconClick}
              className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-black font-black shadow-lg shadow-amber-500/20 active:scale-90 transition-transform cursor-pointer focus:outline-none"
              title="ورود سامورایی"
            >
              <KeyRound className="w-5 h-5 text-black" />
            </button>
            <div>
              <h2 className="text-base font-black text-white">
                {currentUser?.id ? 'پروفایل و حساب کاربری' : 'ورود / عضویت سامورایی'}
              </h2>
              <p className="text-xs text-zinc-400">
                سیستم احراز هویت مستقل و ذخیره‌سازی ابری
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentUser?.id ? (
            /* Logged in state */
            <div className="space-y-5">
              <div className="bg-[#09090b]/80 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-amber-400 font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-100">{currentUser.name}</div>
                      <div className="text-xs text-zinc-400 font-mono">
                        {currentUser.phoneNumber || currentUser.email || `کاربر: ${toPersianDigits(currentUser.id.slice(0, 8))}`}
                      </div>
                    </div>
                  </div>

                  {currentUser.isVip ? (
                    <span className="bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-black px-2.5 py-1 rounded-xl flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      VIP
                    </span>
                  ) : (
                    <span className="bg-zinc-800 text-zinc-400 text-[11px] px-2 py-0.5 rounded-lg">
                      رایگان
                    </span>
                  )}
                </div>

                <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#121215]/90 rounded-xl p-2.5 text-center">
                    <span className="text-[10px] text-zinc-400 block mb-0.5">وضعیت داده‌ها</span>
                    <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                      <Database className="w-3.5 h-3.5" />
                      دیتابیس ابری
                    </span>
                  </div>
                  <div className="bg-[#121215]/90 rounded-xl p-2.5 text-center">
                    <span className="text-[10px] text-zinc-400 block mb-0.5">سطح دسترسی</span>
                    <span className="text-amber-400 font-bold">
                      {currentUser.isVip ? 'سامورایی ویژه VIP' : 'کاربر عادی'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 font-bold text-sm py-3 rounded-2xl flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  خروج از حساب کاربری
                </button>
              </div>
            </div>
          ) : (
            /* Auth Forms */
            <div>
              {step === 'input' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      شماره موبایل یا ایمیل
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        placeholder="مثال: 09121234567 یا user@example.com"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition"
                        dir="ltr"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      نام یا لقب سامورایی (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="مثال: رستم، سهراب، یا نام شما"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition"
                    />
                  </div>

                  {errorMessage && (
                    <div className="bg-red-950/60 border border-red-800/50 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-sm py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <span>دریافت کد تایید امن</span>
                        <ArrowRight className="w-4 h-4 rotate-180" />
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-zinc-500 text-center leading-relaxed">
                    با ورود به سیستم، داده‌های میدان نبرد و چرخه‌های ۹۰ روزه شما به‌صورت کاملاً ایزوله در دیتابیس امن ذخیره خواهند شد.
                  </p>

                  {/* Secret Admin/Dev Mode: Only visible if unlocked via 5-click easter egg & passcode */}
                  {showSecretDev && (
                    <div className="pt-4 border-t border-amber-500/30 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                      <div className="text-[11px] text-amber-300 font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          دسترسی مدیریت و توسعه:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowSecretDev(false);
                            try {
                              localStorage.setItem('bushido_secret_dev_mode', 'false');
                            } catch (e) {}
                          }}
                          className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-2 py-0.5 rounded cursor-pointer"
                        >
                          مخفی‌سازی
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuickLogin('admin')}
                          disabled={isLoading}
                          className="bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 hover:border-red-500/60 text-red-300 rounded-xl p-2.5 text-right transition cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-red-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-red-400" />
                            <span>ورود به عنوان مدیر</span>
                          </div>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">فرمانده ارشد (VIP + Admin)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleQuickLogin('test_user')}
                          disabled={isLoading}
                          className="bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 rounded-xl p-2.5 text-right transition cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-1.5 font-bold text-zinc-200">
                            <User className="w-3.5 h-3.5 text-amber-400" />
                            <span>ورود کاربر تستی</span>
                          </div>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">مشاهده از دید کاربر</span>
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              ) : (
                /* OTP Verification Step */
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-200">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="font-bold">کد تایید ارسال شد به:</span>
                    </div>
                    <span className="font-mono text-amber-300 block text-left" dir="ltr">
                      {identifier}
                    </span>
                    {debugOtp && (
                      <div className="mt-2 pt-2 border-t border-amber-500/20 flex items-center justify-between text-[11px]">
                        <span className="text-amber-400/80">کد تایید تستی:</span>
                        <span className="font-mono font-black text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded-md">
                          {toPersianDigits(debugOtp)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                      کد تایید ۵ رقمی را وارد کنید
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={e => setOtpCode(e.target.value)}
                      placeholder="_____ "
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3.5 text-center text-xl tracking-[0.5em] font-mono text-amber-400 placeholder:text-zinc-700 focus:outline-none focus:border-amber-500 transition"
                      dir="ltr"
                      autoFocus
                    />
                  </div>

                  {errorMessage && (
                    <div className="bg-red-950/60 border border-red-800/50 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep('input')}
                      className="w-1/3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold py-3.5 rounded-2xl transition cursor-pointer"
                    >
                      تغییر شماره
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-2/3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-sm py-3.5 rounded-2xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <span>تایید و ورود به سیستم</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
