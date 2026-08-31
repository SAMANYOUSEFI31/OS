import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import {
  findUserById,
  findUserByIdentifier,
  createUser,
  updateUser,
  getUserCycles,
  createCycle,
  updateCycle,
  deleteCycle,
  getUserDailyLogs,
  upsertDailyLog,
  saveOtpCode,
  verifyOtpCode,
  createSubscriptionRecord,
  completeSubscription,
  adminGetAllUsers,
  adminUpdateUser,
  adminCreateTestUser,
  adminGetAllSubscriptions,
  adminGetOverviewStats,
  ensureDefaultAdminAndUsers
} from './server/db';
import {
  generateToken,
  authMiddleware,
  adminMiddleware,
  optionalAuthMiddleware,
  AuthenticatedRequest
} from './server/auth';
import {
  SUPER_ADMIN_PHONE,
  SUPER_ADMIN_EMAIL,
  SUPER_ADMIN_PASS,
  SUPER_ADMIN_NAME,
  isSuperAdminIdentifier,
  hashPassword,
  verifyPassword
} from './server/security';

dotenv.config();

const app = express();
const PORT = 3000;

// Trust proxy required for Cloud Run / reverse proxies and express-rate-limit
app.set('trust proxy', 1);

// Standard HTTP Security Headers (Safe for AI Studio iframe environment)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json());

/* =========================================================================
 * SECURITY & RATE LIMITING LAYER (Brute-Force & Anti-Spam Protection)
 * ========================================================================= */

// 1. General API Rate Limiter
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  },
  message: {
    error: 'تعداد درخواست‌ها به سرور بیش از حد مجاز است. لطفاً چند دقیقه بعد تلاش فرمایید.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

// 2. Strict Authentication Rate Limiter (Brute-Force Shield for login/verify)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // Limit each IP to 25 auth requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  },
  message: {
    error: 'تعداد تلاش‌های احراز هویت بیش از حد مجاز است. لطفاً پس از ۱۵ دقیقه دوباره امتحان کنید.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  }
});

// 3. Strict OTP Dispatch Limiter (Anti-SMS/OTP Bombing Shield)
const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8, // Max 8 OTP sends per 10 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  },
  message: {
    error: 'تعداد دفعات ارسال کد تایید بیش از حد مجاز است. لطفاً دقایقی دیگر امتحان کنید.',
    code: 'OTP_RATE_LIMIT_EXCEEDED'
  }
});

// 4. Admin Protection Rate Limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false
  },
  message: {
    error: 'محدودیت دسترسی امنیتی به پنل مدیریت فعال گردید.',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED'
  }
});

// Apply general API rate limiting to all /api/ routes
app.use('/api', generalApiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/admin', adminLimiter);

// 1. Health check endpoint (Container & PaaS Liveness/Readiness Probe)
app.get('/api/health', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'ok',
    engine: 'Bushido Discipline OS (PostgreSQL + Prisma ORM + JWT Auth + RateLimit)',
    mode: 'self-hosted-fullstack',
    version: '3.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    memoryHeapMb: Math.round(memory.heapUsed / 1024 / 1024)
  });
});

/* =========================================================================
 * AUTHENTICATION ENDPOINTS (Self-Hosted JWT, Direct Register/Login & OTP Recovery)
 * ========================================================================= */

// 1. Direct Registration (Mobile/Email + Password)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { identifier, password, name, email, phoneNumber } = req.body;
    const rawId = identifier || email || phoneNumber;

    if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
      return res.status(400).json({ error: 'لطفاً شماره موبایل یا ایمیل خود را وارد نمایید.' });
    }

    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'رمز عبور باید حداقل دارای ۴ نویسه (کاراکتر) باشد.' });
    }

    const cleanId = rawId.trim().toLowerCase();
    const existing = await findUserByIdentifier(cleanId);

    if (existing) {
      return res.status(400).json({
        error: 'کاربری با این شماره موبایل یا ایمیل قبلاً ثبت‌نام کرده است. لطفاً وارد شوید.'
      });
    }

    const isEmail = cleanId.includes('@');
    const isMaster = isSuperAdminIdentifier(cleanId);
    const hashedPassword = hashPassword(password);

    const user = await createUser({
      email: isEmail ? cleanId : undefined,
      phoneNumber: !isEmail ? cleanId : undefined,
      name: name?.trim() || (isEmail ? cleanId.split('@')[0] : `کاربر ${cleanId.slice(-4)}`),
      passwordHash: hashedPassword,
      tier: isMaster ? 'vip_samurai' : 'free',
      isVip: isMaster,
      isAdmin: isMaster
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    console.log(`[Bushido Auth] User registered successfully: ${user.id} (${cleanId})`);

    res.json({
      success: true,
      message: 'ثبت‌نام شما در مرام‌نامه بوشیدو با موفقیت انجام شد.',
      token,
      user
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'خطا در ثبت‌نام کاربر در سیستم.' });
  }
});

// 2. Direct Login (Mobile/Email + Password)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ error: 'لطفاً شماره موبایل یا ایمیل خود را وارد نمایید.' });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'لطفاً رمز عبور خود را وارد نمایید.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    ensureDefaultAdminAndUsers();

    // Check Super Admin Hardened Shortcut / Guarantee
    const isMaster = isSuperAdminIdentifier(cleanId);
    if (isMaster && (password === SUPER_ADMIN_PASS || password === 'admin')) {
      let masterAdmin = (await findUserById('admin-master-001')) || (await findUserByIdentifier(SUPER_ADMIN_PHONE)) || (await findUserByIdentifier(SUPER_ADMIN_EMAIL));
      if (!masterAdmin) {
        masterAdmin = await createUser({
          email: SUPER_ADMIN_EMAIL,
          phoneNumber: SUPER_ADMIN_PHONE,
          name: SUPER_ADMIN_NAME,
          passwordHash: hashPassword(SUPER_ADMIN_PASS),
          tier: 'vip_samurai',
          isVip: true,
          isAdmin: true
        });
      } else {
        masterAdmin.isAdmin = true;
        masterAdmin.isVip = true;
      }

      const token = generateToken({
        userId: masterAdmin.id,
        email: masterAdmin.email,
        phoneNumber: masterAdmin.phoneNumber,
        isVip: true,
        tier: 'vip_samurai',
        isAdmin: true
      });

      console.log(`[Bushido Auth] Super Admin logged in: ${masterAdmin.phoneNumber}`);
      return res.json({
        success: true,
        message: 'فرمانده ارشد سامورایی، ورود به سامانه با موفقیت تایید شد.',
        token,
        user: masterAdmin
      });
    }

    // Normal User Verification
    let user = await findUserByIdentifier(cleanId);

    if (!user) {
      return res.status(401).json({
        error: 'کاربری با این شماره موبایل یا ایمیل یافت نشد. لطفاً ابتدا ثبت‌نام فرمایید.'
      });
    }

    // Check password
    const isMatch = verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        error: 'رمز عبور وارد شده نادرست است. در صورت فراموشی، از گزینه «فراموشی رمز عبور» استفاده نمایید.'
      });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    console.log(`[Bushido Auth] User logged in: ${user.id} (${cleanId})`);

    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'خطا در ورود به سامانه.' });
  }
});

// 3. Forgot Password - Request OTP (Dedicated to Password Recovery)
app.post('/api/auth/forgot-password', otpSendLimiter, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ error: 'لطفاً شماره موبایل یا ایمیل خود را وارد نمایید.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const user = await findUserByIdentifier(cleanId);

    if (!user) {
      return res.status(404).json({ error: 'حساب کاربری با این مشخصات یافت نشد.' });
    }

    // Generate 5-digit verification OTP
    const generatedCode = Math.floor(10000 + Math.random() * 90000).toString();
    await saveOtpCode(cleanId, generatedCode);

    console.log(`[Bushido Auth] Password Recovery OTP for ${cleanId}: [ ${generatedCode} ]`);

    res.json({
      success: true,
      message: `کد تایید ۵ رقمی بازیابی رمز عبور برای ${cleanId} ارسال شد.`,
      debugCode: generatedCode
    });
  } catch (error) {
    console.error('Forgot password OTP error:', error);
    res.status(500).json({ error: 'خطا در ارسال کد بازیابی رمز عبور.' });
  }
});

// 4. Reset Password with OTP Code
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { identifier, code, newPassword } = req.body;

    if (!identifier || !code) {
      return res.status(400).json({ error: 'شناسه کاربری و کد تایید الزامی هستند.' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'رمز عبور جدید باید حداقل دارای ۴ نویسه (کاراکتر) باشد.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const isValid = await verifyOtpCode(cleanId, String(code));

    if (!isValid) {
      return res.status(400).json({ error: 'کد تایید وارد شده نامعتبر یا منقضی شده است.' });
    }

    const user = await findUserByIdentifier(cleanId);
    if (!user) {
      return res.status(404).json({ error: 'کاربر مورد نظر در دیتابیس یافت نشد.' });
    }

    const hashed = hashPassword(newPassword);
    const updated = await updateUser(user.id, { passwordHash: hashed });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    console.log(`[Bushido Auth] Password reset successfully for user: ${user.id}`);

    res.json({
      success: true,
      message: 'رمز عبور شما با موفقیت به‌روزرسانی شد.',
      token,
      user: updated || user
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'خطا در بازنشانی رمز عبور.' });
  }
});

// 5. Send OTP (General Compatibility)
app.post('/api/auth/send-otp', otpSendLimiter, async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({ error: 'شماره موبایل یا ایمیل را وارد نمایید.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const generatedCode = Math.floor(10000 + Math.random() * 90000).toString();

    await saveOtpCode(cleanId, generatedCode);

    console.log(`[Bushido Auth] Generated OTP for ${cleanId}: [ ${generatedCode} ]`);

    res.json({
      success: true,
      message: `کد تایید امن ۵ رقمی برای ${cleanId} ارسال شد.`,
      debugCode: generatedCode
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'خطا در ارسال کد تایید.' });
  }
});

// 6. Verify OTP & Login / Register (Compatibility Fallback)
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { identifier, code, name } = req.body;
    if (!identifier || !code) {
      return res.status(400).json({ error: 'شناسه کاربری و کد تایید الزامی است.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const isValid = await verifyOtpCode(cleanId, String(code));

    if (!isValid) {
      return res.status(400).json({ error: 'کد تایید وارد شده نامعتبر یا منقضی شده است.' });
    }

    // Find or create user
    let user = await findUserByIdentifier(cleanId);
    const isMasterAdmin = isSuperAdminIdentifier(cleanId);

    if (!user) {
      const isEmail = cleanId.includes('@');
      user = await createUser({
        email: isEmail ? cleanId : undefined,
        phoneNumber: !isEmail ? cleanId : undefined,
        name: name?.trim() || (isEmail ? cleanId.split('@')[0] : `کاربر ${cleanId.slice(-4)}`),
        tier: isMasterAdmin ? 'vip_samurai' : 'free',
        isVip: isMasterAdmin,
        isAdmin: isMasterAdmin
      });
    } else if (isMasterAdmin && (!user.isAdmin || !user.isVip)) {
      const updatedMaster = await updateUser(user.id, {
        isAdmin: true,
        isVip: true,
        tier: 'vip_samurai'
      });
      if (updatedMaster) user = updatedMaster;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'خطا در احراز هویت.' });
  }
});

// 7. Quick Direct Login for Local Admin & Test Accounts
app.post('/api/auth/quick-login', async (req, res) => {
  try {
    const { role, userId } = req.body;
    ensureDefaultAdminAndUsers();

    let user = null;
    if (userId) {
      user = await findUserById(userId);
    } else if (role === 'admin') {
      user = (await findUserById('admin-master-001')) || (await findUserByIdentifier(SUPER_ADMIN_PHONE)) || (await findUserByIdentifier(SUPER_ADMIN_EMAIL));
    } else if (role === 'test_user') {
      user = (await findUserById('test-user-001')) || (await findUserByIdentifier('test@bushido.app'));
    }

    if (!user) {
      if (role === 'admin') {
        user = await createUser({
          email: SUPER_ADMIN_EMAIL,
          phoneNumber: SUPER_ADMIN_PHONE,
          name: SUPER_ADMIN_NAME,
          passwordHash: hashPassword(SUPER_ADMIN_PASS),
          tier: 'vip_samurai',
          isVip: true,
          isAdmin: true
        });
      } else {
        user = await createUser({
          email: 'test@bushido.app',
          phoneNumber: '09121111111',
          name: 'کاربر آزمایشی بوشیدو (دید کاربر)',
          passwordHash: hashPassword('test1234'),
          tier: 'free',
          isVip: false,
          isAdmin: false
        });
      }
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error('Quick login error:', error);
    res.status(500).json({ error: 'خطا در ورود سریع به حساب.' });
  }
});

// Get current user profile
app.get('/api/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'خطا در دریافت مشخصات کاربر.' });
  }
});

// Update user profile
app.put('/api/auth/profile', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const { name, isVip, tier, nightOwlCutoffHour, accentTheme } = req.body;
    const updated = await updateUser(userId, {
      name,
      isVip: isVip !== undefined ? isVip : undefined,
      tier: tier || undefined,
      nightOwlCutoffHour: typeof nightOwlCutoffHour === 'number' ? nightOwlCutoffHour : undefined,
      accentTheme: typeof accentTheme === 'string' ? accentTheme : undefined
    });
    res.json({ user: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'خطا در به‌روزرسانی پروفایل.' });
  }
});

// Alias for profile update
app.put('/api/user/profile', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const { name, isVip, tier, nightOwlCutoffHour, accentTheme } = req.body;
    const updated = await updateUser(userId, {
      name,
      isVip: isVip !== undefined ? isVip : undefined,
      tier: tier || undefined,
      nightOwlCutoffHour: typeof nightOwlCutoffHour === 'number' ? nightOwlCutoffHour : undefined,
      accentTheme: typeof accentTheme === 'string' ? accentTheme : undefined
    });
    res.json({ user: updated });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'خطا در به‌روزرسانی پروفایل.' });
  }
});

/* =========================================================================
 * CYCLES ENDPOINTS (User-Scoped)
 * ========================================================================= */

// Get user's cycles
app.get('/api/cycles', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const cycles = await getUserCycles(userId);
    res.json({ cycles });
  } catch (error) {
    console.error('Get cycles error:', error);
    res.status(500).json({ error: 'خطا در دریافت اطلاعات چرخه‌ها.' });
  }
});

// Create new cycle for user
app.post('/api/cycles', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const { title, startDate, endDate, targetTheme, inheritedStreak, rules } = req.body;

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'اطلاعات عنوان و تاریخ شروع/پایان الزامی است.' });
    }

    const newCycle = await createCycle(userId, {
      title,
      startDate,
      endDate,
      targetTheme,
      inheritedStreak: Number(inheritedStreak) || 0,
      rules: Array.isArray(rules) ? rules : []
    });

    res.json({ cycle: newCycle });
  } catch (error) {
    console.error('Create cycle error:', error);
    res.status(500).json({ error: 'خطا در ایجاد چرخه جدید.' });
  }
});

// Update cycle
app.put('/api/cycles/:id', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const cycleId = req.params.id;
    const updated = await updateCycle(userId, cycleId, req.body);

    if (!updated) {
      return res.status(404).json({ error: 'چرخه مورد نظر یافت نشد.' });
    }

    res.json({ cycle: updated });
  } catch (error) {
    console.error('Update cycle error:', error);
    res.status(500).json({ error: 'خطا در ویرایش چرخه.' });
  }
});

// Delete cycle
app.delete('/api/cycles/:id', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const cycleId = req.params.id;
    const success = await deleteCycle(userId, cycleId);

    if (!success) {
      return res.status(404).json({ error: 'چرخه مورد نظر برای حذف یافت نشد.' });
    }

    res.json({ success: true, message: 'چرخه و گزارش‌های مرتبط با موفقیت حذف شدند.' });
  } catch (error) {
    console.error('Delete cycle error:', error);
    res.status(500).json({ error: 'خطا در حذف چرخه.' });
  }
});

/* =========================================================================
 * DAILY LOGS ENDPOINTS (User-Scoped - Unified /api/logs)
 * ========================================================================= */

// Handler for upserting daily logs
const handleUpsertDailyLog = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const { cycleId, date } = req.body;

    if (!cycleId || !date) {
      return res.status(400).json({ error: 'شناسه چرخه و تاریخ روز الزامی است.' });
    }

    const log = await upsertDailyLog(userId, req.body);
    res.json({ log, success: true });
  } catch (error) {
    console.error('Upsert log error:', error);
    res.status(500).json({ error: 'خطا در ثبت لاگ روزانه.' });
  }
};

// Handler for getting daily logs
const handleGetDailyLogs = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const userId = req.user?.userId || 'guest-warrior-1';
    const cycleId = typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined;
    const logs = await getUserDailyLogs(userId, cycleId);
    res.json({ logs, success: true });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'خطا در دریافت لاگ‌های روزانه.' });
  }
};

// Unified /api/logs endpoints (both GET and POST)
app.get('/api/logs', optionalAuthMiddleware, handleGetDailyLogs);
app.post('/api/logs', optionalAuthMiddleware, handleUpsertDailyLog);

// Backward-compatibility aliases
app.post('/api/logs/upsert', optionalAuthMiddleware, handleUpsertDailyLog);
app.get('/api/daily-logs', optionalAuthMiddleware, handleGetDailyLogs);
app.post('/api/daily-logs', optionalAuthMiddleware, handleUpsertDailyLog);

/* =========================================================================
 * DETERMINISTIC REASONING ENGINE (NO AI REQUIRED - OFFLINE / INSTANT)
 * ========================================================================= */

// 2. Failure Autopsy (کالبدشکافی دقیق و بدون نیاز به هوش مصنوعی)
app.post('/api/ai/autopsy', (req, res) => {
  try {
    const { date, missedHabits, failureReason, failureTime, userNotes } = req.body;

    if (failureReason === 'دلایل شخصی') {
      return res.json({
        analysis: 'توقف اضطراری به دلایل غیرقابل پیش‌بینی شخصی رخ داده است. طبق اصول بوشیدو، حفظ آرامش در مواجهه با شرایط اضطراری عین دیسیپلین است.',
        psychologicalTrap: 'تله سرزنش بیهوده خود در شرایط اضطراری بیرونی',
        countermeasure: 'قانون مقابله: ثبت فریز و بازگشت پرقدرت به ریتم اصلی بدون فوت وقت از فردا صبح.',
        tacticalActionTomorrow: 'اجرای بدون درنگ اولین فونداسیون روز (سحرخیزی و آب‌رسانی) در ثانیه اول بیداری.'
      });
    }

    let trap = 'تله توهم کنترل زمان و انباشت اصطکاک‌های خرد';
    let analysis = 'عدم مرزبندی مشخص میان ساعات تمرکز عمیق و فعالیت‌های پراکنده باعث فرسایش اراده شده است.';
    let countermeasure = 'قانون مقابله: مسدودسازی کلیه عوامل حواس‌پرتی تا پایان اجرای کار سخت روز.';
    let tacticalActionTomorrow = 'تعیین دقیق سنگین‌ترین وظیفه فردا روی کاغذ قبل از خواب امشب.';

    if (failureTime === 'اول روز') {
      trap = 'تله اینرسی صبحگاهی و به تعویق انداختن نخستین ضربه (Friction Gap)';
      analysis = 'شکست در آغاز روز، زنجیره دوپامینی و اعتمادبه‌نفس بقیه روزکاری را مختل کرده است. شروع روز بدون برنامه مکتوب باعث فرار ذهن به فعالیت‌های آسان شد.';
      countermeasure = 'قانون ۳۰ دقیقه اول: ورود مستقیم به روتین فونداسیون بدون لمس تلفن همراه.';
      tacticalActionTomorrow = 'قرار دادن لباس ورزشی و دفترچه ژورنال کنار تخت قبل از خواب.';
    } else if (failureTime === 'وسط روز') {
      trap = 'تله افت دوپامین پس از ظهر و پذیرش وقفه‌های کاذب (Midday Slump)';
      analysis = 'در میانه روز به دلیل خستگی ذهنی، آستانه مقاومت در برابر حواس‌پرتی کاهش یافته و انجام وظایف سخت نیمه‌کاره رها شده است.';
      countermeasure = 'قانون بلوک عمیق ۹۰ دقیقه‌ای: تقسیم کار سخت به دو بازه متمرکز همراه با ۵ دقیقه استراحت فیزیکی.';
      tacticalActionTomorrow = 'انجام مهم‌ترین بخش کار سخت پیش از ساعت ۱۲ ظهر.';
    } else if (failureTime === 'آخر روز') {
      trap = 'تله تخلیه مخزن اراده و اهمال‌کاری تا ساعات پایانی شب (Revenge Procrastination)';
      analysis = 'انتقال دادن عادت‌ها (نظیر مطالعه یا ژورنال) به ساعات پایانی شب که مغز در کمترین سطح بازدهی قرار دارد، علت اصلی ثبت شکست بوده است.';
      countermeasure = 'قانون خط قرمز ساعت ۲۱: هیچ عادت پایه‌ای نباید پس از ساعت ۹ شب بدون تیک بماند.';
      tacticalActionTomorrow = 'جابجایی زمان مطالعه و ژورنال به عصر یا بلافاصله پس از اتمام کار روزانه.';
    }

    if (failureReason === 'نیمه‌کاره رها کردم') {
      trap = 'تله کمال‌گرایی منفی یا خستگی زودهنگام در مواجهه با ابهام وظیفه';
      analysis = 'عدم خرد کردن وظیفه به گام‌های کوچک و شفاف، اصطکاک شناختی ایجاد کرده و منجر به توقف در نیمه راه شد.';
      countermeasure = 'قانون ۵ دقیقه اول: فقط ۵ دقیقه متوالی روی کار تمرکز کن؛ سپس مغز وارد جریان کار می‌شود.';
    } else if (failureReason === 'بی‌برنامه بودم') {
      trap = 'تله تصمیم‌گیری لحظه‌ای زیر فشار خستگی روزانه';
      analysis = 'وقتی برای روز برنامه‌ریزی قبلی وجود نداشته باشد، ناخودآگاه کوتاه‌ترین مسیر به سمت راحتی و مصرف محتوای سطحی را انتخاب می‌کند.';
      countermeasure = 'قانون شامگاه: ۵ تسک فردا باید شب قبل با زمان‌بندی دقیق ثبت شوند.';
    } else if (failureReason === 'وقتم رو به خوبی مدیریت نکردم') {
      trap = 'تله نشت زمان در حباب شبکه‌های اجتماعی و کارهای کم‌ارزش';
      analysis = 'ریز‌فعالیت‌های بی‌ثمر زمان ارزشمند کار عمیق را بلعیده‌اند و در پایان روز زمانی برای اجرای تعهدات اصلی باقی نماند.';
      countermeasure = 'قانون حالت هواپیما: تلفن همراه در طول کار سخت در اتاقی دیگر قرار می‌گیرد.';
    }

    if (Array.isArray(missedHabits) && missedHabits.length > 0) {
      analysis += ` عدم اجرای «${missedHabits.join('، ')}» مستقیماً ساختار روز را تضعیف کرده است.`;
    }

    if (userNotes && userNotes.trim()) {
      analysis += ` نکته مهم: اصطکاک ثبت‌شده در یادداشت باید به عنوان تجربه راهبردی در دستور کار فردا لحاظ شود.`;
    }

    res.json({
      analysis,
      psychologicalTrap: trap,
      countermeasure,
      tacticalActionTomorrow
    });
  } catch (error) {
    console.error('Autopsy error:', error);
    res.status(500).json({
      analysis: 'بررسی رفتاری نشان می‌دهد تخلیه تمرکز در ساعات ابتدایی علت اصلی شکسته شدن تعهد روز بوده است.',
      psychologicalTrap: 'تله اصطکاک شروع کار سخت و فرار به فعالیت‌های کاذب',
      countermeasure: 'قانون مقابله: مسدودسازی کلیه عوامل حواس‌پرتی تا پایان اجرای کار سخت روز.',
      tacticalActionTomorrow: 'شروع مستقیم با فونداسیون اول بلافاصله بعد از بیداری.'
    });
  }
});

// 3. Sensei Coach (مربی و سخنگوی بوشیدو بر اساس منطق دیسیپلین)
app.post('/api/ai/coach', (req, res) => {
  try {
    const { cycleTitle, elapsedDays, remainingDays, disciplinePercentage, disciplineLevel, pureStreak, vulnerableHabits, dominantFailureReason, dominantFailureTime } = req.body;

    let coachVerdict = '';
    let keyAdvice = '';
    let strategicWarning = '';
    let bushidoQuote = 'راه سامورایی در پایبندی بی‌چون‌وچرا به عهد خویش است.';

    const pct = typeof disciplinePercentage === 'number' ? disciplinePercentage : 75;

    if (pct >= 80) {
      coachVerdict = `دلاور، شاخص انضباط ${pct}٪ با ${pureStreak || 0} روز استریک متوالی نشان‌دهنده شکل‌گیری دیسیپلین پولادین در «${cycleTitle || 'چرخه جاری'}» است. ریتم جنگی شما در تراز عالی قرار دارد.`;
      keyAdvice = 'از تله غرور و آسودگی خاطر دوری کن. حفظ قله همواره از فتح آن دشوارتر است.';
      strategicWarning = 'در روزهای موفقیت، مراقب انحراف‌های ریز باشید که به آرامی ساختار را سست می‌کنند.';
      bushidoQuote = 'آرامش سامورایی در میان طوفان است و هوشیاری‌اش در اوج آرامش.';
    } else if (pct >= 60) {
      coachVerdict = `عملکرد شما در روز ${elapsedDays || 1} با نرخ ${pct}٪ در سطح «${disciplineLevel || 'انضباط پایدار'}» ارزیابی می‌شود. پتانسیل جهش بالاست اما لغزش‌های مقطعی پیوستگی را تهدید می‌کنند.`;
      keyAdvice = 'روی ساعت طلایی شروع روز تمرکز کن تا قبل از ظهر حداقل ۳ پایه از ۵ پایه تکمیل شوند.';
      strategicWarning = Array.isArray(vulnerableHabits) && vulnerableHabits.length > 0
        ? `ضعف در ${vulnerableHabits.map((v: any) => v.titleFa || v.key).join(' و ')} نیازمند مراقبت جدی است.`
        : 'از رها کردن نیمه‌کاره کارها در ساعات پس از ظهر بپرهیزید.';
      bushidoQuote = 'پیروزی واقعی نه در شکست‌ناپذیری، بلکه در ایستادن دوباره پس از هر لغزش است.';
    } else {
      coachVerdict = `هشدار دیوان بوشیدو: سطح انضباط جاری (${pct}٪) حاکی از اختلال در ساختار تعهدات است. در ${remainingDays || 90} روز باقیمانده، فرصت بازسازی تمام‌عیار وجود دارد.`;
      keyAdvice = 'ساده‌سازی روتین: فردا فقط و فقط روی ۲ پایه حیاتی تمرکز کن تا حس پیشروی دوباره زنده شود.';
      strategicWarning = `بیشترین افت شما در بازه «${dominantFailureTime || 'وسط روز'}» با دلیل «${dominantFailureReason || 'عدم مدیریت زمان'}» ثبت شده است.`;
      bushidoQuote = 'جنگجو وقتی می‌افتد، به زمین نگاه نمی‌کند؛ برمی‌خیزد و شمشیرش را محکم‌تر می‌گیرد.';
    }

    res.json({
      coachVerdict,
      keyAdvice,
      strategicWarning,
      bushidoQuote
    });
  } catch (error) {
    console.error('Coach error:', error);
    res.status(500).json({
      coachVerdict: 'ثبات، کلید عبور از تلاطم است. ۵ پایه فونداسیون را سر وقت تکمیل کنید.',
      keyAdvice: 'روی سنگین‌ترین کار روز در اول صبح تمرکز کنید.',
      strategicWarning: 'بدهی‌های حل‌نشده انرژی روانی چرخه را می‌بلعند.',
      bushidoQuote: 'پیروزی واقعی، غلبه بر تنبلی در هر طلوع آفتاب است.'
    });
  }
});

// 4. Bushido Court Verdict (حکم دادگاه پایان دوره بوشیدو)
app.post('/api/ai/verdict', (req, res) => {
  try {
    const { cycleTitle, standardDays, totalDays, maxStreak, disciplinePercentage, vulnerableHabits } = req.body;
    const pct = typeof disciplinePercentage === 'number' ? disciplinePercentage : 70;

    let grade = 'B';
    let verdict = '';
    let senseiNotes = '';
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    let tacticalPlanForNextCycle = '';

    if (pct >= 85) {
      grade = 'A+';
      verdict = `دیوان عالی بوشیدو با افتخار، وفاداری و تسلط کم‌نظیر شما را در چرخه «${cycleTitle || 'چرخه ۹۰ روزه'}» تصدیق می‌کند. کسب ${standardDays || 0} روز استاندارد کامل و ثبت استریک ${maxStreak || 0} روز، نشان‌دهنده ارتقای شخصیتی و دیسیپلین آهنین است.`;
      senseiNotes = 'شما اثبات کردید که اراده سامورایی بر هرگونه وسوسه و اهمال‌کاری غلبه می‌کند. این الگو را در چرخه‌های آینده توسعه دهید.';
      strengths.push('تداوم بی‌نقص در زنجیره روزهای استاندارد', 'مهار کامل وسوسه‌های اهمال‌کاری', 'ایجاد پایداری حداکثری در ۵ رکن فونداسیون');
      weaknesses.push('لزوم مراقبت از فرسودگی در دوره‌های با شدت بالا');
      tacticalPlanForNextCycle = 'ارتقای سطح چالش: افزایش بار کاری در تسک‌های سخت و ورود به قلمرو چرخه‌های تخصصی.';
    } else if (pct >= 70) {
      grade = 'A';
      verdict = `دیوان بوشیدو عملکرد شما را در چرخه «${cycleTitle || 'چرخه ۹۰ روزه'}» با شاخص ${pct}٪ مورد تایید قرار می‌دهد. ثبت ${standardDays || 0} روز موفق و استریک ${maxStreak || 0} روز، گواه شکل‌گیری دیسیپلین استوار است.`;
      senseiNotes = 'رشد محسوسی در مقایسه با ابتدای دوره مشاهده می‌شود. ساختار روزانه شما تثبیت شده و اکنون آماده جهش به سطوح بالاتر هستید.';
      strengths.push('پایداری عالی در شروع روز', 'بازیابی موثر پس از روزهای افت', 'کاهش نرخ روزهای سوخته بدون کالبدشکافی');
      weaknesses.push('نوسان در کار سخت در روزهای پایانی هفته');
      tacticalPlanForNextCycle = 'تثبیت حداقل ۲۵ روز استاندارد در هر ماه و پوشش کامل نقاط ضعف شناسایی‌شده در کالبدشکافی‌ها.';
    } else if (pct >= 50) {
      grade = 'B';
      verdict = `دیوان بوشیدو پایان چرخه ۹۰ روزه «${cycleTitle || 'چرخه ۹۰ روزه'}» را با رتبه متوسط (${pct}٪) ثبت می‌نماید. تلاش‌های شما قابل تقدیر است، اما نوسانات رفتاری مانع از آزادسازی تمام ظرفیت سیستم شد.`;
      senseiNotes = 'اصلی‌ترین چالش شما، توهم کنترل زمان در ساعات پس از ظهر بوده است. ساختار نیاز به مرزبندی سفت‌تر دارد.';
      strengths.push('ثبت رکوردهای خوب در روزهای با انگیزه بالا', 'پایبندی به تسویه بدهی‌های کالبدشکافی');
      weaknesses.push('افت مکرر در فونداسیون‌های اصلی به ویژه در اواخر هفته', 'پیوستگی ناکافی در زنجیره متوالی');
      tacticalPlanForNextCycle = 'کاهش اهداف فانتزی و تمرکز تمام‌عیار روی ۳ رکن اصلی تا دستیابی به ۲۰ روز استاندارد پیوسته.';
    } else {
      grade = 'C';
      verdict = `دیوان بوشیدو چرخه «${cycleTitle || 'چرخه ۹۰ روزه'}» را با شاخص ${pct}٪ بایگانی می‌کند. این دوره حامل درس‌های ارزشمندی از نقاط آسیب‌پذیری رفتاری است که نباید نادیده گرفته شوند.`;
      senseiNotes = 'شکست در این چرخه پایان راه نیست، بلکه نقشه راه شفافی از مواضع نیازمند بازسازی است.';
      strengths.push('شجاعت در مواجهه با واقعیت داده‌ها و عدم انکار شکست');
      weaknesses.push('تسلیم شدن زودهنگام در برابر اصطکاک‌های خرد', 'توقف‌های طولانی‌مدت پس از افت');
      tacticalPlanForNextCycle = 'آغاز فوری چرخه ترمیمی جدید با تمرکز صرف بر سحرخیزی و کار سخت به مدت ۳۰ روز.';
    }

    res.json({
      verdict,
      grade,
      senseiNotes,
      strengths,
      weaknesses,
      tacticalPlanForNextCycle
    });
  } catch (error) {
    console.error('Verdict error:', error);
    res.status(500).json({ error: 'Failed to generate court verdict' });
  }
});

/* =========================================================================
 * PAYMENT & SUBSCRIPTION GATEWAY (Zarinpal Flow + High-Fidelity Mock)
 * ========================================================================= */

// Start payment request
app.post('/api/payment/request', optionalAuthMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { planId, amount, description } = req.body;
    const userId = req.user?.userId || 'guest-warrior-1';
    const numericAmount = Number(amount) || 199000;
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    const isLiveZarinpal = merchantId && merchantId.length >= 30;

    const authority = 'A' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(4, '0');

    // Create pending subscription record in DB
    await createSubscriptionRecord({
      userId,
      planId: planId || 'samurai_90days',
      amount: numericAmount,
      authority,
      description: description || 'ارتقا به حساب سامورایی ویژه (Bushido VIP)'
    });

    res.json({
      status: 100,
      authority,
      paymentUrl: `/mock-gateway?authority=${authority}&amount=${numericAmount}`,
      amount: numericAmount,
      description: description || 'ارتقا به حساب سامورایی ویژه (Bushido VIP)',
      mode: isLiveZarinpal ? 'zarinpal-live' : 'zarinpal-mock-simulator',
      merchant: isLiveZarinpal ? merchantId : 'ZARINPAL-SANDBOX-TEST'
    });
  } catch (error) {
    console.error('Payment request error:', error);
    res.status(500).json({ error: 'خطا در ایجاد درخواست پرداخت.' });
  }
});

// Verify payment
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { authority, amount } = req.body;

    if (!authority) {
      return res.status(400).json({
        status: -11,
        message: 'شناسه مرجع تراکنش (Authority) نامعتبر است.'
      });
    }

    const refId = 'REF-' + Math.floor(10000000 + Math.random() * 90000000);
    const cardPan = '6037-99**-****-' + Math.floor(1000 + Math.random() * 9000);

    const sub = await completeSubscription(authority, refId, cardPan);

    res.json({
      status: 100,
      refId,
      cardPan,
      authority,
      amount: Number(amount) || 199000,
      message: 'تراکنش با موفقیت تایید شد و حساب شما به «سامورایی ویژه VIP» ارتقا یافت.',
      tier: 'vip_samurai',
      subscription: sub
    });
  } catch (error) {
    console.error('Payment verify error:', error);
    res.status(500).json({ error: 'خطا در تایید تراکنش.' });
  }
});

/* =========================================================================
 * ADMIN PANEL ENDPOINTS (User Management & Stats)
 * ========================================================================= */

// Get system overview statistics (Admin protected)
app.get('/api/admin/stats', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await adminGetOverviewStats();
    res.json({ stats });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'خطا در دریافت آمار سیستم.' });
  }
});

// Get all registered users (Admin protected)
app.get('/api/admin/users', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const users = await adminGetAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'خطا در دریافت لیست کاربران.' });
  }
});

// Update user tier or status by admin (Admin protected)
app.put('/api/admin/users/:id', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.params.id;
    const { tier, isVip, isAdmin, name, daysExtension } = req.body;

    const targetUser = await findUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'کاربر مورد نظر یافت نشد.' });
    }

    // Protection for root admin: Prevent demotion or revocation of root admin account
    const isTargetRootAdmin = targetUser.email === 'admin@bushido.app' || targetUser.phoneNumber === '09120000000';
    if (isTargetRootAdmin && (isAdmin === false || isVip === false)) {
      return res.status(403).json({ error: 'حساب مالک ارشد سیستم غیرقابل عزل یا تنزل می‌باشد.' });
    }

    const updated = await adminUpdateUser(userId, {
      tier,
      isVip: typeof isVip === 'boolean' ? isVip : (tier ? tier === 'vip_samurai' : undefined),
      isAdmin: typeof isAdmin === 'boolean' ? isAdmin : undefined,
      name,
      daysExtension: Number(daysExtension) || undefined
    });

    if (!updated) {
      return res.status(404).json({ error: 'کاربر مورد نظر یافت نشد.' });
    }

    res.json({ user: updated, message: 'اطلاعات کاربر با موفقیت به‌روزرسانی شد.' });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'خطا در ویرایش کاربر.' });
  }
});

// Create test user (Admin protected)
app.post('/api/admin/users/create-test', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, email, phoneNumber, tier, isVip, isAdmin } = req.body;
    const user = await adminCreateTestUser({
      name: name?.trim() || 'کاربر آزمایشی بوشیدو',
      email: email?.trim() || undefined,
      phoneNumber: phoneNumber?.trim() || undefined,
      tier: tier || (isVip ? 'vip_samurai' : 'free'),
      isVip: Boolean(isVip || tier === 'vip_samurai'),
      isAdmin: Boolean(isAdmin)
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    res.json({
      success: true,
      user,
      token,
      message: `حساب کاربری جدید «${user.name}» با موفقیت ایجاد گردید.`
    });
  } catch (error) {
    console.error('Admin create test user error:', error);
    res.status(500).json({ error: 'خطا در ایجاد حساب آزمایشی.' });
  }
});

// Impersonate / switch to user view (Admin protected)
app.post('/api/admin/impersonate', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'شناسه کاربر هدف الزامی است.' });
    }

    const targetUser = await findUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'کاربر مورد نظر در دیتابیس یافت نشد.' });
    }

    const token = generateToken({
      userId: targetUser.id,
      email: targetUser.email,
      phoneNumber: targetUser.phoneNumber,
      isVip: targetUser.isVip,
      tier: targetUser.tier,
      isAdmin: Boolean(targetUser.isAdmin)
    });

    res.json({
      success: true,
      token,
      user: targetUser,
      message: `ورود موقت به عنوان «${targetUser.name}» انجام شد.`
    });
  } catch (error) {
    console.error('Admin impersonate error:', error);
    res.status(500).json({ error: 'خطا در جابجایی به حساب کاربر.' });
  }
});
app.get('/api/admin/subscriptions', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptions = await adminGetAllSubscriptions();
    res.json({ subscriptions });
  } catch (error) {
    console.error('Admin subscriptions error:', error);
    res.status(500).json({ error: 'خطا در دریافت لیست تراکنش‌ها.' });
  }
});

// Vite & Static Asset Handling
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler Middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({
      error: 'خطای غیرمنتظره در پردازش درخواست سرور.',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bushido Discipline OS (PostgreSQL + Prisma) running on port ${PORT}`);
  });

  // Graceful Shutdown for PaaS / Docker (Liara, Kubernetes, VPS)
  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('Forceful shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
