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
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* RATE LIMITERS WITH PROXY VALIDATION GUARD */
const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'تعداد درخواست‌ها بیش از حد مجاز است.', code: 'RATE_LIMIT_EXCEEDED' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'تعداد تلاش‌های ورود بیش از حد مجاز است.', code: 'AUTH_RATE_LIMIT_EXCEEDED' }
});

const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'تعداد دفعات ارسال کد تایید بیش از حد مجاز است.', code: 'OTP_RATE_LIMIT_EXCEEDED' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'محدودیت دسترسی امنیتی مدیریت فعال گردید.', code: 'ADMIN_RATE_LIMIT_EXCEEDED' }
});

app.use('/api', generalApiLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/admin', adminLimiter);

/* HEALTH CHECK */
app.get('/api/health', (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: 'ok',
    engine: 'Bushido Discipline OS (PostgreSQL + Prisma ORM + JWT Auth)',
    version: '3.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memoryRssMb: Math.round(memory.rss / 1024 / 1024)
  });
});

/* AUTHENTICATION ENDPOINTS */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { identifier, password, name, email, phoneNumber } = req.body;
    const rawId = identifier || email || phoneNumber;

    if (!rawId || typeof rawId !== 'string' || !rawId.trim()) {
      return res.status(400).json({ error: 'لطفاً شماره موبایل یا ایمیل خود را وارد نمایید.' });
    }

    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'رمز عبور باید حداقل دارای ۴ نویسه باشد.' });
    }

    const cleanId = rawId.trim().toLowerCase();
    const existing = await findUserByIdentifier(cleanId);

    if (existing) {
      return res.status(400).json({ error: 'کاربری با این مشخصات قبلاً ثبت‌نام کرده است.' });
    }

    const isEmail = cleanId.includes('@');
    const isMaster = isSuperAdminIdentifier(cleanId);

    const user = await createUser({
      email: isEmail ? cleanId : undefined,
      phoneNumber: !isEmail ? cleanId : undefined,
      name: name?.trim().slice(0, 80) || (isEmail ? cleanId.split('@')[0] : `کاربر ${cleanId.slice(-4)}`),
      passwordHash: hashPassword(password),
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

    res.json({ success: true, message: 'ثبت‌نام با موفقیت انجام شد.', token, user });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'خطا در ثبت‌نام کاربر.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'شناسه کاربری و رمز عبور الزامی هستند.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    ensureDefaultAdminAndUsers();

    const isMaster = isSuperAdminIdentifier(cleanId);
    if (isMaster && password === SUPER_ADMIN_PASS) {
      let masterAdmin = (await findUserById('admin-master-001')) || (await findUserByIdentifier(SUPER_ADMIN_PHONE));
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
      }

      const token = generateToken({
        userId: masterAdmin.id,
        email: masterAdmin.email,
        phoneNumber: masterAdmin.phoneNumber,
        isVip: true,
        tier: 'vip_samurai',
        isAdmin: true
      });

      return res.json({ success: true, message: 'ورود مدیر ارشد تایید شد.', token, user: masterAdmin });
    }

    const user = await findUserByIdentifier(cleanId);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'شناسه کاربری یا رمز عبور نادرست است.' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'خطا در ورود به سامانه.' });
  }
});

app.post('/api/auth/send-otp', otpSendLimiter, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      return res.status(400).json({ error: 'شماره موبایل معتبر الزامی است.' });
    }

    const cleanPhone = phoneNumber.trim();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    saveOtpCode(cleanPhone, otpCode);

    if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_OTP_DEBUG === 'true') {
      console.log(`[OTP DEBUG] Sent code ${otpCode} to ${cleanPhone}`);
    }

    res.json({ success: true, message: 'کد تایید یک‌بارمصرف ارسال گردید.' });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'خطا در ارسال کد تایید.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phoneNumber, code, name } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: 'شماره موبایل و کد تایید الزامی است.' });
    }

    const cleanPhone = phoneNumber.trim();
    const isValid = verifyOtpCode(cleanPhone, String(code).trim());

    if (!isValid) {
      return res.status(400).json({ error: 'کد تایید وارد شده نامعتبر یا منقضی شده است.' });
    }

    let user = await findUserByIdentifier(cleanPhone);
    if (!user) {
      const isMaster = isSuperAdminIdentifier(cleanPhone);
      user = await createUser({
        phoneNumber: cleanPhone,
        name: name?.trim().slice(0, 80) || `کاربر ${cleanPhone.slice(-4)}`,
        tier: isMaster ? 'vip_samurai' : 'free',
        isVip: isMaster,
        isAdmin: isMaster
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

    res.json({ success: true, message: 'احراز هویت با موفقیت انجام شد.', token, user });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'خطا در راستی‌آزمایی کد تایید.' });
  }
});

app.post('/api/auth/quick-login', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_QUICK_LOGIN !== 'true') {
      return res.status(403).json({ error: 'ورود سریع در محیط عملیاتی غیرفعال است.' });
    }

    const { role, userId } = req.body;
    ensureDefaultAdminAndUsers();

    let user = null;
    if (userId) {
      user = await findUserById(userId);
    } else if (role === 'admin') {
      user = (await findUserById('admin-master-001')) || (await findUserByIdentifier(SUPER_ADMIN_PHONE));
    } else if (role === 'test_user') {
      user = (await findUserById('test-user-001')) || (await findUserByIdentifier('test@bushido.app'));
    }

    if (!user) {
      return res.status(404).json({ error: 'حساب تست یافت نشد.' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Quick login error:', error);
    res.status(500).json({ error: 'خطا در ورود سریع.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) return res.status(404).json({ error: 'کاربر یافت نشد.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت مشخصات کاربر.' });
  }
});

app.put('/api/auth/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { name, nightOwlCutoffHour, accentTheme } = req.body;

    const updatePayload: Record<string, any> = {};
    if (typeof name === 'string' && name.trim()) {
      updatePayload.name = name.trim().slice(0, 80);
    }
    if (typeof nightOwlCutoffHour === 'number' && nightOwlCutoffHour >= 0 && nightOwlCutoffHour <= 23) {
      updatePayload.nightOwlCutoffHour = nightOwlCutoffHour;
    }
    if (typeof accentTheme === 'string' && ['amber', 'emerald', 'rose', 'blue', 'violet'].includes(accentTheme)) {
      updatePayload.accentTheme = accentTheme;
    }

    const updated = await updateUser(userId, updatePayload);
    res.json({ user: updated });
  } catch (error) {
    res.status(500).json({ error: 'خطا در به‌روزرسانی پروفایل.' });
  }
});

/* CYCLES ENDPOINTS */
app.get('/api/cycles', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const cycles = await getUserCycles(req.user!.userId);
    res.json({ cycles });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت چرخه‌ها.' });
  }
});

app.post('/api/cycles', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, startDate, endDate, targetTheme, inheritedStreak, rules } = req.body;
    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'اطلاعات عنوان و تاریخ شروع/پایان الزامی است.' });
    }

    const newCycle = await createCycle(req.user!.userId, {
      title: String(title).slice(0, 150),
      startDate,
      endDate,
      targetTheme: targetTheme ? String(targetTheme).slice(0, 500) : undefined,
      inheritedStreak: Number(inheritedStreak) || 0,
      rules: Array.isArray(rules) ? rules.slice(0, 10).map(r => String(r).slice(0, 200)) : []
    });

    res.json({ cycle: newCycle });
  } catch (error) {
    res.status(500).json({ error: 'خطا در ایجاد چرخه جدید.' });
  }
});

app.put('/api/cycles/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const updated = await updateCycle(req.user!.userId, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'چرخه یافت نشد.' });
    res.json({ cycle: updated });
  } catch (error) {
    res.status(500).json({ error: 'خطا در ویرایش چرخه.' });
  }
});

app.delete('/api/cycles/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const success = await deleteCycle(req.user!.userId, req.params.id);
    if (!success) return res.status(404).json({ error: 'چرخه یافت نشد.' });
    res.json({ success: true, message: 'چرخه حذف شد.' });
  } catch (error) {
    res.status(500).json({ error: 'خطا در حذف چرخه.' });
  }
});

/* DAILY LOGS ENDPOINTS */
const handleUpsertDailyLog = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { cycleId, date } = req.body;
    if (!cycleId || !date) {
      return res.status(400).json({ error: 'شناسه چرخه و تاریخ الزامی است.' });
    }

    const log = await upsertDailyLog(req.user!.userId, req.body);
    res.json({ log, success: true });
  } catch (error) {
    res.status(500).json({ error: 'خطا در ثبت لاگ روزانه.' });
  }
};

const handleGetDailyLogs = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const cycleId = typeof req.query.cycleId === 'string' ? req.query.cycleId : undefined;
    const logs = await getUserDailyLogs(req.user!.userId, cycleId);
    res.json({ logs, success: true });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لاگ‌ها.' });
  }
};

app.get('/api/logs', authMiddleware, handleGetDailyLogs);
app.post('/api/logs', authMiddleware, handleUpsertDailyLog);

/* DETERMINISTIC REASONING ENGINE - AUTH PROTECTED */
app.post('/api/ai/autopsy', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { missedHabits, failureReason, failureTime, userNotes } = req.body;

    if (failureReason === 'دلایل شخصی') {
      return res.json({
        analysis: 'توقف اضطراری به دلایل غیرقابل پیش‌بینی شخصی رخ داده است. طبق اصول بوشیدو، حفظ آرامش عین دیسیپلین است.',
        psychologicalTrap: 'تله سرزنش بیهوده خود در شرایط اضطراری بیرونی',
        countermeasure: 'قانون مقابله: ثبت فریز و بازگشت پرقدرت به ریتم اصلی بدون فوت وقت از فردا صبح.',
        tacticalActionTomorrow: 'اجرای بدون درنگ اولین فونداسیون روز در ثانیه اول بیداری.'
      });
    }

    let trap = 'تله توهم کنترل زمان و انباشت اصطکاک‌های خرد';
    let analysis = 'عدم مرزبندی مشخص میان ساعات تمرکز عمیق و فعالیت‌های پراکنده باعث فرسایش اراده شده است.';
    let countermeasure = 'قانون مقابله: مسدودسازی کلیه عوامل حواس‌پرتی تا پایان کار سخت.';
    let tacticalActionTomorrow = 'تعیین دقیق سنگین‌ترین وظیفه فردا روی کاغذ قبل از خواب.';

    if (failureTime === 'اول روز') {
      trap = 'تله اینرسی صبحگاهی و به تعویق انداختن نخستین ضربه';
      analysis = 'شروع روز بدون برنامه مکتوب باعث فرار ذهن به فعالیت‌های آسان شد.';
      countermeasure = 'قانون ۳۰ دقیقه اول: ورود مستقیم به روتین فونداسیون بدون لمس تلفن همراه.';
      tacticalActionTomorrow = 'قرار دادن لباس ورزشی و دفترچه ژورنال کنار تخت.';
    } else if (failureTime === 'وسط روز') {
      trap = 'تله افت دوپامین پس از ظهر (Midday Slump)';
      analysis = 'در میانه روز به دلیل خستگی ذهنی، آستانه مقاومت در برابر حواس‌پرتی کاهش یافته است.';
      countermeasure = 'قانون بلوک عمیق ۹۰ دقیقه‌ای همراه با ۵ دقیقه استراحت فیزیکی.';
      tacticalActionTomorrow = 'انجام مهم‌ترین بخش کار سخت پیش از ساعت ۱۲ ظهر.';
    } else if (failureTime === 'آخر روز') {
      trap = 'تله تخلیه مخزن اراده و اهمال‌کاری شبانه';
      analysis = 'انتقال دادن عادت‌ها به ساعات پایانی شب علت اصلی ثبت شکست بوده است.';
      countermeasure = 'قانون خط قرمز ساعت ۲۱: هیچ عادتی نباید پس از ساعت ۹ شب بدون تیک بماند.';
      tacticalActionTomorrow = 'جابجایی زمان مطالعه و ژورنال به عصر.';
    }

    if (Array.isArray(missedHabits) && missedHabits.length > 0) {
      analysis += ` عدم اجرای «${missedHabits.join('، ')}» ساختار روز را تضعیف کرد.`;
    }

    res.json({
      analysis,
      psychologicalTrap: trap,
      countermeasure,
      tacticalActionTomorrow
    });
  } catch (error) {
    res.status(500).json({ error: 'خطا در ارزیابی کالبدشکافی.' });
  }
});

app.post('/api/ai/verdict', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const { disciplinePercentage, standardDays, totalScore, currentStreak } = req.body;
    const score = Number(disciplinePercentage) || 0;

    let grade = 'C';
    let title = 'مبارز تازه‌کار (Novice Warrior)';
    let verdict = 'عملکرد شما نیازمند بازنگری در ساختار انضباطی است. اراده وجود دارد اما ثبات قدم کم است.';

    if (score >= 85) {
      grade = 'A+';
      title = 'استاد دیسیپلین پولادین (Grandmaster)';
      verdict = 'تبریک دیوان عالی بوشیدو. شما بر نوسانات ذهنی غلبه کرده و اراده‌ای روئین‌تن از خود نشان دادید.';
    } else if (score >= 70) {
      grade = 'A';
      title = 'سامورایی ارشد (Senior Samurai)';
      verdict = 'عملکرد بسیار درخشان و باثبات. ریتم کلی نبرد حفظ شده و بازسازی پس از افت‌ها سریع بوده است.';
    } else if (score >= 50) {
      grade = 'B';
      title = 'رونین متعهد (Ronin Guardian)';
      verdict = 'پایه‌های اصلی اجرا شده اما نوسانات مقطعی مانع از رسیدن به حدنصاب کمال شده است.';
    }

    res.json({
      grade,
      title,
      verdict,
      issuedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'خطا در صدور حکم دیوان.' });
  }
});

/* PAYMENTS & SUBSCRIPTIONS ENDPOINTS */
app.post('/api/payment/request', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user!.userId;

    if (!amount || amount < 1000) {
      return res.status(400).json({ error: 'مبلغ تراکنش نامعتبر است.' });
    }

    const authority = `ZARIN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    await createSubscriptionRecord({
      userId,
      planId: planId || 'vip_season',
      amount: Number(amount),
      authority
    });

    const sandboxPaymentUrl = `/api/payment/mock-gateway?authority=${authority}&amount=${amount}`;

    res.json({
      success: true,
      authority,
      paymentUrl: sandboxPaymentUrl,
      message: 'شناسه پرداخت با موفقیت ایجاد گردید.'
    });
  } catch (error) {
    console.error('Payment request error:', error);
    res.status(500).json({ error: 'خطا در ایجاد درخواست پرداخت.' });
  }
});

/* MOCK PAYMENT GATEWAY UI (ZARINPAL SANDBOX SIMULATION) */
app.get('/api/payment/mock-gateway', (req, res) => {
  const { authority, amount } = req.query;
  const numAmount = Number(amount || 0);

  res.send(`
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>شبیه‌ساز درگاه پرداخت امن زرین‌پال</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #f4f4f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 1rem; }
        .card { background: #121215; border: 1px solid #27272a; border-radius: 1.5rem; padding: 2rem; width: 100%; max-width: 420px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
        .logo { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .title { font-size: 1.25rem; font-weight: bold; margin-bottom: 0.5rem; color: #fbbf24; }
        .amount-box { background: #18181b; border: 1px solid #3f3f46; border-radius: 1rem; padding: 1rem; margin: 1.25rem 0; text-align: center; }
        .amount { font-size: 1.5rem; font-weight: 900; color: #34d399; }
        .authority { font-size: 0.75rem; color: #71717a; margin-top: 0.25rem; word-break: break-all; }
        .btn-group { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
        .btn { width: 100%; padding: 0.875rem; border-radius: 0.75rem; border: none; font-weight: bold; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; }
        .btn-success { background: #10b981; color: #ffffff; }
        .btn-success:hover { background: #059669; }
        .btn-danger { background: #3f3f46; color: #f4f4f5; border: 1px solid #52525b; }
        .btn-danger:hover { background: #ef4444; color: #ffffff; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">⚔️</div>
        <div class="title">درگاه شبیه‌ساز پرداخت زرین‌پال</div>
        <p style="font-size: 0.875rem; color: #a1a1aa; margin: 0;">سامانه انضباطی بوشیدو - ارتقای حساب VIP</p>

        <div class="amount-box">
          <div style="font-size: 0.8rem; color: #a1a1aa;">مبلغ قابل پرداخت</div>
          <div class="amount">${numAmount.toLocaleString('fa-IR')} تومان</div>
          <div class="authority">شناسه مرجع: ${authority || 'N/A'}</div>
        </div>

        <form action="/api/payment/verify-mock" method="POST">
          <input type="hidden" name="authority" value="${authority || ''}" />
          <div class="btn-group">
            <button type="submit" name="status" value="OK" class="btn btn-success">✓ تایید و پرداخت موفق (تست)</button>
            <button type="submit" name="status" value="NOK" class="btn btn-danger">✕ انصراف / انقضای تراکنش</button>
          </div>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.post('/api/payment/verify-mock', async (req, res) => {
  try {
    const { authority, status } = req.body;
    if (status !== 'OK') {
      return res.redirect(`/?payment_status=failed&authority=${authority || ''}`);
    }
    res.redirect(`/?payment_status=success&authority=${authority || ''}`);
  } catch (error) {
    res.redirect('/?payment_status=failed');
  }
});

app.post('/api/payment/verify', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { authority, status } = req.body;
    const userId = req.user!.userId;

    if (!authority) {
      return res.status(400).json({ error: 'شناسه مرجع پرداخت الزامی است.' });
    }

    if (status === 'NOK' || status === 'CANCELLED') {
      return res.status(400).json({ error: 'تراکنش بانکی توسط کاربر لغو شد یا با خطا مواجه گردید.' });
    }

    const refId = `REF-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const completed = await completeSubscription(userId, authority, refId);

    if (!completed) {
      return res.status(400).json({ error: 'تراکنش یافت نشد یا قبلاً پردازش شده است.' });
    }

    const updatedUser = await updateUser(userId, {
      tier: 'vip_samurai',
      isVip: true
    });

    res.json({
      success: true,
      refId,
      message: 'پرداخت با موفقیت تایید شد و حساب شما به سامورایی ویژه (VIP) ارتقا یافت.',
      user: updatedUser
    });
  } catch (error) {
    console.error('Payment verify error:', error);
    res.status(500).json({ error: 'خطا در راستی‌آزمایی تراکنش.' });
  }
});

app.get('/api/subscriptions', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const subs = await adminGetAllSubscriptions();
    const userSubs = subs.filter(s => s.userId === req.user!.userId);
    res.json({ subscriptions: userSubs });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لیست اشتراک‌ها.' });
  }
});

/* ADMIN PANEL ENDPOINTS */
app.get('/api/admin/stats', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await adminGetOverviewStats();
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت آمار مدیریت.' });
  }
});

app.get('/api/admin/users', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const users = await adminGetAllUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت کاربران.' });
  }
});

app.put('/api/admin/users/:id', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.params.id;
    const { tier, isVip, isAdmin, name, daysExtension } = req.body;

    const targetUser = await findUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }

    const isTargetRootAdmin = isSuperAdminIdentifier(targetUser.email) || isSuperAdminIdentifier(targetUser.phoneNumber);
    if (isTargetRootAdmin && (isAdmin === false || isVip === false)) {
      return res.status(403).json({ error: 'حساب مالک ارشد سیستم غیرقابل عزل یا تنزل می‌باشد.' });
    }

    const updated = await adminUpdateUser(userId, {
      tier,
      isVip: typeof isVip === 'boolean' ? isVip : (tier ? tier === 'vip_samurai' : undefined),
      isAdmin: typeof isAdmin === 'boolean' ? isAdmin : undefined,
      name: name ? String(name).slice(0, 80) : undefined,
      daysExtension: Number(daysExtension) || undefined
    });

    res.json({ user: updated, message: 'اطلاعات کاربر به‌روزرسانی شد.' });
  } catch (error) {
    res.status(500).json({ error: 'خطا در ویرایش کاربر.' });
  }
});

app.get('/api/admin/subscriptions', adminMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptions = await adminGetAllSubscriptions();
    res.json({ subscriptions });
  } catch (error) {
    res.status(500).json({ error: 'خطا در دریافت لیست تراکنش‌ها.' });
  }
});

/* SERVER LAUNCH */
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

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'خطای غیرمنتظره سرور.' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bushido OS running on port ${PORT}`);
  });
}

startServer();
