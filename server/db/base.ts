import fs from 'fs';
import path from 'path';

// Instantiate Prisma client safely
export let prisma: any = null;
export let isPrismaAvailable = false;

const dbConnectionString = 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_PRISMA_URL || 
  process.env.POSTGRES_URL || 
  process.env.DIRECT_URL;

if (dbConnectionString) {
  try {
    const prismaPkg = '@prisma/client';
    import(prismaPkg)
      .then((module) => {
        if (module && module.PrismaClient) {
          prisma = new module.PrismaClient();
          isPrismaAvailable = true;
          console.log('[Database] Initialized Prisma Client with PostgreSQL datasource.');
        }
      })
      .catch(() => {
        console.log('[Database] Running in self-hosted persistent file/memory database mode.');
      });
  } catch {
    console.log('[Database] Running in self-hosted persistent file/memory database mode.');
  }
} else {
  console.log('[Database] PostgreSQL Connection URL not set; running in self-hosted persistent file/memory database mode.');
}

// In-Memory / File Persistent Store Fallback (Ensures 100% operational guarantee)
export interface DBUser {
  id: string;
  email?: string | null;
  phoneNumber?: string | null;
  name?: string | null;
  passwordHash?: string | null;
  tier: string;
  isVip: boolean;
  isAdmin?: boolean;
  nightOwlCutoffHour?: number;
  accentTheme?: string;
  vipSince?: string | null;
  vipExpiresAt?: string | null;
  paymentRefId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DBCycle {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  targetTheme?: string | null;
  inheritedStreak: number;
  rules: string[];
  isArchived: boolean;
  reportRead: boolean;
  verdict?: any;
  createdAt: string;
  updatedAt: string;
}

export interface DBDailyLog {
  id: string;
  userId: string;
  cycleId: string;
  date: string;
  wakeUp: boolean;
  workout: boolean;
  study: boolean;
  journal: boolean;
  hardTask: boolean;
  specialMission: boolean;
  failureReason?: string | null;
  failureTime?: string | null;
  autopsyNotes?: string | null;
  countermeasure?: string | null;
  aiFeedback?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DBOtpCode {
  id: string;
  identifier: string;
  code: string;
  expiresAt: string;
  verified: boolean;
  userId?: string | null;
  createdAt: string;
}

export interface DBSubscription {
  id: string;
  userId: string;
  planId: string;
  amount: number;
  authority: string;
  refId?: string | null;
  cardPan?: string | null;
  status: string;
  description?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalStore {
  users: DBUser[];
  cycles: DBCycle[];
  dailyLogs: DBDailyLog[];
  otpCodes: DBOtpCode[];
  subscriptions: DBSubscription[];
}

export const DB_FILE_PATH = path.join(process.cwd(), 'bushido_local_db.json');

export function loadLocalStore(): LocalStore {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const data = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[Database] Failed to read local db file, creating fresh:', e);
  }
  return {
    users: [],
    cycles: [],
    dailyLogs: [],
    otpCodes: [],
    subscriptions: []
  };
}

export let memoryStore: LocalStore = loadLocalStore();

export function saveLocalStore() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Database] Failed to persist local db file:', e);
  }
}

// -------------------------------------------------------------
// Seed initial starter pack for a new user
// -------------------------------------------------------------
export function seedUserData(userId: string): { cycle: DBCycle; logs: DBDailyLog[] } {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  const addDays = (dStr: string, days: number) => {
    const [y, m, d] = dStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().split('T')[0];
  };

  const cycleStart = addDays(todayIso, -24);
  const cycleEnd = addDays(cycleStart, 89);

  const starterCycle: DBCycle = {
    id: `cycle-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    title: 'چرخه ۱ — فونداسیون اراده و دیسیپلین آهنین',
    startDate: cycleStart,
    endDate: cycleEnd,
    targetTheme: 'تسلط بر سحرخیزی، ۱۰۰ ساعت کار عمیق و ثبات در ورزش روزانه',
    inheritedStreak: 0,
    rules: [
      'ساعت بیدارباش ۵:۳۰ صبح بدون استفاده از اسنوز',
      'هیچ روزی بدون حداقل ۳۰ دقیقه ورزش و تحرک سپری نمی‌شود',
      'ثبت روزانه بلافاصله قبل از خواب در میدان نبرد',
      'کالبدشکافی بدون تعارف در صورت هرگونه افت'
    ],
    isArchived: false,
    reportRead: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const starterLogs: DBDailyLog[] = [];

  for (let i = 0; i <= 24; i++) {
    const logDate = addDays(cycleStart, i);
    const isToday = logDate === todayIso;

    if (isToday) {
      starterLogs.push({
        id: `log-${userId}-${logDate}`,
        userId,
        cycleId: starterCycle.id,
        date: logDate,
        wakeUp: true,
        workout: true,
        study: true,
        journal: false,
        hardTask: true,
        specialMission: true,
        notes: 'تمرکز بالا روی وظایف روزانه و شروع عالی صبح',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else if (i === 18) {
      starterLogs.push({
        id: `log-${userId}-${logDate}`,
        userId,
        cycleId: starterCycle.id,
        date: logDate,
        wakeUp: true,
        workout: false,
        study: false,
        journal: true,
        hardTask: false,
        specialMission: false,
        failureReason: 'دلایل شخصی',
        failureTime: 'وسط روز',
        autopsyNotes: 'سفر کاری اضطراری و عدم دسترسی به امکانات عادی. ریتم فریز شد.',
        countermeasure: 'حفظ استانداردهای ذهنی و ژورنال‌نویسی شبانه در شرایط بحران.',
        createdAt: new Date(Date.now() - (24 - i) * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else if (i === 11) {
      starterLogs.push({
        id: `log-${userId}-${logDate}`,
        userId,
        cycleId: starterCycle.id,
        date: logDate,
        wakeUp: false,
        workout: true,
        study: true,
        journal: true,
        hardTask: false,
        specialMission: false,
        failureReason: 'وقتم رو به خوبی مدیریت نکردم',
        failureTime: 'آخر روز',
        autopsyNotes: 'اتلاف وقت در شبکه‌های اجتماعی در ساعات اولیه صبح باعث به تعویق افتادن کار سخت شد.',
        countermeasure: 'قانون صفر دسترسی: گوشی قبل از ساعت ۹ صبح در اتاق دیگر قفل می‌شود.',
        aiFeedback: 'افت اصلی ناشی از تصمیم‌گیری واکنشی به جای کنشگرانه بوده است.',
        createdAt: new Date(Date.now() - (24 - i) * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      starterLogs.push({
        id: `log-${userId}-${logDate}`,
        userId,
        cycleId: starterCycle.id,
        date: logDate,
        wakeUp: true,
        workout: true,
        study: true,
        journal: true,
        hardTask: true,
        specialMission: i % 3 === 0,
        notes: i % 4 === 0 ? 'انرژی و تمرکز فوق‌العاده. تسلط کامل بر زمان.' : undefined,
        createdAt: new Date(Date.now() - (24 - i) * 86400000).toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  return { cycle: starterCycle, logs: starterLogs };
}

// -------------------------------------------------------------
// Initialize Default Admin & Test Users
// -------------------------------------------------------------
export function ensureDefaultAdminAndUsers() {
  const nowStr = new Date().toISOString();
  const nextYearStr = new Date(Date.now() + 365 * 86400000).toISOString();

  // 1. Ensure Master Admin Account
  const existingAdmin = memoryStore.users.find(u => u.isAdmin || u.email === 'admin@bushido.app' || u.id === 'admin-master-001');
  if (!existingAdmin) {
    const adminUser: DBUser = {
      id: 'admin-master-001',
      email: 'admin@bushido.app',
      phoneNumber: '09120000000',
      name: 'فرمانده ارشد سامورایی (مدیر)',
      passwordHash: 'admin',
      tier: 'vip_samurai',
      isVip: true,
      isAdmin: true,
      nightOwlCutoffHour: 4,
      accentTheme: 'amber',
      vipSince: nowStr,
      vipExpiresAt: nextYearStr,
      paymentRefId: 'REF-ADMIN-MASTER-001',
      createdAt: nowStr,
      updatedAt: nowStr
    };
    memoryStore.users.unshift(adminUser);
    const seed = seedUserData(adminUser.id);
    memoryStore.cycles.push(seed.cycle);
    memoryStore.dailyLogs.push(...seed.logs);
  } else {
    existingAdmin.isAdmin = true;
    existingAdmin.isVip = true;
    existingAdmin.tier = 'vip_samurai';
    if (!existingAdmin.name) existingAdmin.name = 'فرمانده ارشد سامورایی (مدیر)';
  }

  // 2. Ensure Default Test User Account
  const existingTestUser = memoryStore.users.find(u => u.id === 'test-user-001' || u.email === 'test@bushido.app');
  if (!existingTestUser) {
    const testUser: DBUser = {
      id: 'test-user-001',
      email: 'test@bushido.app',
      phoneNumber: '09121111111',
      name: 'کاربر آزمایشی بوشیدو (دید کاربر)',
      passwordHash: 'test1234',
      tier: 'free',
      isVip: false,
      isAdmin: false,
      nightOwlCutoffHour: 4,
      accentTheme: 'emerald',
      vipSince: null,
      vipExpiresAt: null,
      paymentRefId: null,
      createdAt: nowStr,
      updatedAt: nowStr
    };
    memoryStore.users.push(testUser);
    const testSeed = seedUserData(testUser.id);
    memoryStore.cycles.push(testSeed.cycle);
    memoryStore.dailyLogs.push(...testSeed.logs);
  }

  saveLocalStore();
}

// Seed on module load
ensureDefaultAdminAndUsers();
