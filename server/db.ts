import fs from 'fs';
import path from 'path';

// Instantiate Prisma client safely
let prisma: any = null;
let isPrismaAvailable = false;

const dbConnectionString = 
  process.env.DATABASE_URL || 
  process.env.POSTGRES_PRISMA_URL || 
  process.env.POSTGRES_URL || 
  process.env.DIRECT_URL;

if (dbConnectionString) {
  try {
    // Dynamic import to prevent crash if @prisma/client is not installed
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

interface DBCycle {
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

interface DBDailyLog {
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

interface DBOtpCode {
  id: string;
  identifier: string;
  code: string;
  expiresAt: string;
  verified: boolean;
  userId?: string | null;
  createdAt: string;
}

interface DBSubscription {
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

interface LocalStore {
  users: DBUser[];
  cycles: DBCycle[];
  dailyLogs: DBDailyLog[];
  otpCodes: DBOtpCode[];
  subscriptions: DBSubscription[];
}

const DB_FILE_PATH = path.join(process.cwd(), 'bushido_local_db.json');

function loadLocalStore(): LocalStore {
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

let memoryStore: LocalStore = loadLocalStore();

function saveLocalStore() {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(memoryStore, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Database] Failed to persist local db file:', e);
  }
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
    // Ensure admin flags are always strictly true
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

// Call on startup
ensureDefaultAdminAndUsers();

// -------------------------------------------------------------
// Seed initial starter pack for a new user
// -------------------------------------------------------------
export function seedUserData(userId: string): { cycle: DBCycle; logs: DBDailyLog[] } {
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  // Helper to add days
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
// Database Operations (PostgreSQL via Prisma with Fallback)
// -------------------------------------------------------------

export async function findUserById(id: string): Promise<DBUser | null> {
  if (isPrismaAvailable && prisma) {
    try {
      const u = await prisma.user.findUnique({ where: { id } });
      if (u) {
        return {
          id: u.id,
          email: u.email,
          phoneNumber: u.phoneNumber,
          name: u.name,
          passwordHash: u.passwordHash,
          tier: u.tier,
          isVip: u.isVip,
          isAdmin: Boolean((u as any).isAdmin),
          nightOwlCutoffHour: typeof (u as any).nightOwlCutoffHour === 'number' ? (u as any).nightOwlCutoffHour : 4,
          accentTheme: (u as any).accentTheme || 'amber',
          vipSince: u.vipSince ? u.vipSince.toISOString() : null,
          vipExpiresAt: u.vipExpiresAt ? u.vipExpiresAt.toISOString() : null,
          paymentRefId: u.paymentRefId,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString()
        };
      }
    } catch (err) {
      console.warn('[Database] Prisma findUserById failed, using store fallback:', err);
    }
  }
  return memoryStore.users.find(u => u.id === id) || null;
}

export async function findUserByIdentifier(identifier: string): Promise<DBUser | null> {
  const clean = identifier.trim().toLowerCase();
  if (isPrismaAvailable && prisma) {
    try {
      const u = await prisma.user.findFirst({
        where: {
          OR: [{ email: clean }, { phoneNumber: clean }]
        }
      });
      if (u) {
        return {
          id: u.id,
          email: u.email,
          phoneNumber: u.phoneNumber,
          name: u.name,
          passwordHash: u.passwordHash,
          tier: u.tier,
          isVip: u.isVip,
          isAdmin: Boolean((u as any).isAdmin),
          nightOwlCutoffHour: typeof (u as any).nightOwlCutoffHour === 'number' ? (u as any).nightOwlCutoffHour : 4,
          accentTheme: (u as any).accentTheme || 'amber',
          vipSince: u.vipSince ? u.vipSince.toISOString() : null,
          vipExpiresAt: u.vipExpiresAt ? u.vipExpiresAt.toISOString() : null,
          paymentRefId: u.paymentRefId,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString()
        };
      }
    } catch (err) {
      console.warn('[Database] Prisma findUserByIdentifier failed, using store fallback:', err);
    }
  }
  return (
    memoryStore.users.find(
      u => (u.email && u.email.toLowerCase() === clean) || (u.phoneNumber && u.phoneNumber === clean)
    ) || null
  );
}

export async function createUser(data: {
  email?: string;
  phoneNumber?: string;
  name?: string;
  passwordHash?: string;
  tier?: string;
  isVip?: boolean;
  isAdmin?: boolean;
  nightOwlCutoffHour?: number;
  accentTheme?: string;
}): Promise<DBUser> {
  const nowStr = new Date().toISOString();
  const userId = `usr-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const newUser: DBUser = {
    id: userId,
    email: data.email || null,
    phoneNumber: data.phoneNumber || null,
    name: data.name || 'سامورایی دیسیپلین',
    passwordHash: data.passwordHash || null,
    tier: data.tier || 'free',
    isVip: data.isVip || false,
    isAdmin: data.isAdmin || false,
    nightOwlCutoffHour: data.nightOwlCutoffHour ?? 4,
    accentTheme: data.accentTheme || 'amber',
    vipSince: data.isVip ? nowStr : null,
    vipExpiresAt: data.isVip ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
    paymentRefId: null,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  if (isPrismaAvailable && prisma) {
    try {
      const created = await prisma.user.create({
        data: {
          id: newUser.id,
          email: newUser.email,
          phoneNumber: newUser.phoneNumber,
          name: newUser.name,
          passwordHash: newUser.passwordHash,
          tier: newUser.tier,
          isVip: newUser.isVip,
          isAdmin: newUser.isAdmin,
          nightOwlCutoffHour: newUser.nightOwlCutoffHour,
          accentTheme: newUser.accentTheme,
          vipSince: newUser.vipSince ? new Date(newUser.vipSince) : null,
          vipExpiresAt: newUser.vipExpiresAt ? new Date(newUser.vipExpiresAt) : null,
          paymentRefId: newUser.paymentRefId
        }
      });
      // Also seed starter cycles and logs
      const seed = seedUserData(created.id);
      await prisma.cycle.create({
        data: {
          id: seed.cycle.id,
          userId: created.id,
          title: seed.cycle.title,
          startDate: seed.cycle.startDate,
          endDate: seed.cycle.endDate,
          targetTheme: seed.cycle.targetTheme,
          inheritedStreak: seed.cycle.inheritedStreak,
          rules: seed.cycle.rules,
          isArchived: seed.cycle.isArchived,
          reportRead: seed.cycle.reportRead
        }
      });
      for (const log of seed.logs) {
        await prisma.dailyLog.create({
          data: {
            id: log.id,
            userId: created.id,
            cycleId: seed.cycle.id,
            date: log.date,
            wakeUp: log.wakeUp,
            workout: log.workout,
            study: log.study,
            journal: log.journal,
            hardTask: log.hardTask,
            specialMission: log.specialMission,
            failureReason: log.failureReason,
            failureTime: log.failureTime,
            autopsyNotes: log.autopsyNotes,
            countermeasure: log.countermeasure,
            aiFeedback: log.aiFeedback,
            notes: log.notes
          }
        });
      }
    } catch (err) {
      console.warn('[Database] Prisma createUser error, falling back to memory store:', err);
    }
  }

  // Memory store backup
  memoryStore.users.push(newUser);
  const seed = seedUserData(newUser.id);
  memoryStore.cycles.push(seed.cycle);
  memoryStore.dailyLogs.push(...seed.logs);
  saveLocalStore();

  return newUser;
}

export async function updateUser(id: string, data: Partial<DBUser>): Promise<DBUser | null> {
  const nowStr = new Date().toISOString();
  if (isPrismaAvailable && prisma) {
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.tier !== undefined) updateData.tier = data.tier;
      if (data.isVip !== undefined) updateData.isVip = data.isVip;
      if (data.isAdmin !== undefined) updateData.isAdmin = data.isAdmin;
      if (data.nightOwlCutoffHour !== undefined) updateData.nightOwlCutoffHour = data.nightOwlCutoffHour;
      if (data.accentTheme !== undefined) updateData.accentTheme = data.accentTheme;
      if (data.vipSince !== undefined) updateData.vipSince = data.vipSince ? new Date(data.vipSince) : null;
      if (data.vipExpiresAt !== undefined) updateData.vipExpiresAt = data.vipExpiresAt ? new Date(data.vipExpiresAt) : null;
      if (data.paymentRefId !== undefined) updateData.paymentRefId = data.paymentRefId;

      const updated = await prisma.user.update({
        where: { id },
        data: updateData
      });
      return {
        id: updated.id,
        email: updated.email,
        phoneNumber: updated.phoneNumber,
        name: updated.name,
        passwordHash: updated.passwordHash,
        tier: updated.tier,
        isVip: updated.isVip,
        isAdmin: Boolean((updated as any).isAdmin),
        nightOwlCutoffHour: typeof (updated as any).nightOwlCutoffHour === 'number' ? (updated as any).nightOwlCutoffHour : 4,
        accentTheme: (updated as any).accentTheme || 'amber',
        vipSince: updated.vipSince ? updated.vipSince.toISOString() : null,
        vipExpiresAt: updated.vipExpiresAt ? updated.vipExpiresAt.toISOString() : null,
        paymentRefId: updated.paymentRefId,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString()
      };
    } catch (err) {
      console.warn('[Database] Prisma updateUser error:', err);
    }
  }

  const idx = memoryStore.users.findIndex(u => u.id === id);
  if (idx >= 0) {
    memoryStore.users[idx] = { ...memoryStore.users[idx], ...data, updatedAt: nowStr };
    saveLocalStore();
    return memoryStore.users[idx];
  }
  return null;
}

// -------------------------------------------------------------
// Cycles Operations (strictly user scoped)
// -------------------------------------------------------------

export async function getUserCycles(userId: string): Promise<DBCycle[]> {
  if (isPrismaAvailable && prisma) {
    try {
      const cycles = await prisma.cycle.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      });
      return cycles.map(c => ({
        id: c.id,
        userId: c.userId,
        title: c.title,
        startDate: c.startDate,
        endDate: c.endDate,
        targetTheme: c.targetTheme,
        inheritedStreak: c.inheritedStreak,
        rules: c.rules,
        isArchived: c.isArchived,
        reportRead: c.reportRead,
        verdict: c.verdict,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      }));
    } catch (err) {
      console.warn('[Database] Prisma getUserCycles error:', err);
    }
  }

  const userCycles = memoryStore.cycles.filter(c => c.userId === userId);
  if (userCycles.length === 0) {
    const seed = seedUserData(userId);
    memoryStore.cycles.push(seed.cycle);
    memoryStore.dailyLogs.push(...seed.logs);
    saveLocalStore();
    return [seed.cycle];
  }
  return userCycles;
}

export async function createCycle(userId: string, data: {
  title: string;
  startDate: string;
  endDate: string;
  targetTheme?: string;
  inheritedStreak?: number;
  rules?: string[];
}): Promise<DBCycle> {
  const cycleId = `cycle-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nowStr = new Date().toISOString();

  const newCycle: DBCycle = {
    id: cycleId,
    userId,
    title: data.title,
    startDate: data.startDate,
    endDate: data.endDate,
    targetTheme: data.targetTheme || '',
    inheritedStreak: data.inheritedStreak || 0,
    rules: data.rules || ['انضباط آهنین', 'ثبت روزانه قبل از خواب'],
    isArchived: false,
    reportRead: false,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  if (isPrismaAvailable && prisma) {
    try {
      const c = await prisma.cycle.create({
        data: {
          id: newCycle.id,
          userId: newCycle.userId,
          title: newCycle.title,
          startDate: newCycle.startDate,
          endDate: newCycle.endDate,
          targetTheme: newCycle.targetTheme,
          inheritedStreak: newCycle.inheritedStreak,
          rules: newCycle.rules,
          isArchived: newCycle.isArchived,
          reportRead: newCycle.reportRead
        }
      });
      return {
        ...newCycle,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      };
    } catch (err) {
      console.warn('[Database] Prisma createCycle error:', err);
    }
  }

  memoryStore.cycles.push(newCycle);
  saveLocalStore();
  return newCycle;
}

export async function updateCycle(userId: string, cycleId: string, data: Partial<DBCycle>): Promise<DBCycle | null> {
  const nowStr = new Date().toISOString();
  if (isPrismaAvailable && prisma) {
    try {
      const c = await prisma.cycle.updateMany({
        where: { id: cycleId, userId },
        data: {
          title: data.title,
          targetTheme: data.targetTheme,
          isArchived: data.isArchived,
          reportRead: data.reportRead,
          verdict: data.verdict
        }
      });
      if (c.count > 0) {
        const updated = await prisma.cycle.findUnique({ where: { id: cycleId } });
        if (updated) {
          return {
            id: updated.id,
            userId: updated.userId,
            title: updated.title,
            startDate: updated.startDate,
            endDate: updated.endDate,
            targetTheme: updated.targetTheme,
            inheritedStreak: updated.inheritedStreak,
            rules: updated.rules,
            isArchived: updated.isArchived,
            reportRead: updated.reportRead,
            verdict: updated.verdict,
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString()
          };
        }
      }
    } catch (err) {
      console.warn('[Database] Prisma updateCycle error:', err);
    }
  }

  const idx = memoryStore.cycles.findIndex(c => c.id === cycleId && c.userId === userId);
  if (idx >= 0) {
    memoryStore.cycles[idx] = { ...memoryStore.cycles[idx], ...data, updatedAt: nowStr };
    saveLocalStore();
    return memoryStore.cycles[idx];
  }
  return null;
}

export async function deleteCycle(userId: string, cycleId: string): Promise<boolean> {
  if (isPrismaAvailable && prisma) {
    try {
      await prisma.dailyLog.deleteMany({
        where: { cycleId, userId }
      });
      const res = await prisma.cycle.deleteMany({
        where: { id: cycleId, userId }
      });
      return res.count > 0;
    } catch (err) {
      console.warn('[Database] Prisma deleteCycle error:', err);
    }
  }

  const initialCount = memoryStore.cycles.length;
  memoryStore.cycles = memoryStore.cycles.filter(c => !(c.id === cycleId && c.userId === userId));
  memoryStore.dailyLogs = memoryStore.dailyLogs.filter(l => !(l.cycleId === cycleId && l.userId === userId));
  
  if (memoryStore.cycles.length !== initialCount) {
    saveLocalStore();
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// Daily Logs Operations (strictly user scoped)
// -------------------------------------------------------------

export async function getUserDailyLogs(userId: string, cycleId?: string): Promise<DBDailyLog[]> {
  if (isPrismaAvailable && prisma) {
    try {
      const logs = await prisma.dailyLog.findMany({
        where: {
          userId,
          ...(cycleId ? { cycleId } : {})
        },
        orderBy: { date: 'asc' }
      });
      return logs.map(l => ({
        id: l.id,
        userId: l.userId,
        cycleId: l.cycleId,
        date: l.date,
        wakeUp: l.wakeUp,
        workout: l.workout,
        study: l.study,
        journal: l.journal,
        hardTask: l.hardTask,
        specialMission: l.specialMission,
        failureReason: l.failureReason,
        failureTime: l.failureTime,
        autopsyNotes: l.autopsyNotes,
        countermeasure: l.countermeasure,
        aiFeedback: l.aiFeedback,
        notes: l.notes,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString()
      }));
    } catch (err) {
      console.warn('[Database] Prisma getUserDailyLogs error:', err);
    }
  }

  return memoryStore.dailyLogs.filter(
    l => l.userId === userId && (!cycleId || l.cycleId === cycleId)
  );
}

export async function upsertDailyLog(userId: string, data: {
  cycleId: string;
  date: string;
  wakeUp?: boolean;
  workout?: boolean;
  study?: boolean;
  journal?: boolean;
  hardTask?: boolean;
  specialMission?: boolean;
  failureReason?: string | null;
  failureTime?: string | null;
  autopsyNotes?: string | null;
  countermeasure?: string | null;
  aiFeedback?: string | null;
  notes?: string | null;
}): Promise<DBDailyLog> {
  const logId = `log-${userId}-${data.date}`;
  const nowStr = new Date().toISOString();

  if (isPrismaAvailable && prisma) {
    try {
      const l = await prisma.dailyLog.upsert({
        where: {
          userId_date: {
            userId,
            date: data.date
          }
        },
        create: {
          id: logId,
          userId,
          cycleId: data.cycleId,
          date: data.date,
          wakeUp: !!data.wakeUp,
          workout: !!data.workout,
          study: !!data.study,
          journal: !!data.journal,
          hardTask: !!data.hardTask,
          specialMission: !!data.specialMission,
          failureReason: data.failureReason,
          failureTime: data.failureTime,
          autopsyNotes: data.autopsyNotes,
          countermeasure: data.countermeasure,
          aiFeedback: data.aiFeedback,
          notes: data.notes
        },
        update: {
          cycleId: data.cycleId,
          wakeUp: data.wakeUp,
          workout: data.workout,
          study: data.study,
          journal: data.journal,
          hardTask: data.hardTask,
          specialMission: data.specialMission,
          failureReason: data.failureReason,
          failureTime: data.failureTime,
          autopsyNotes: data.autopsyNotes,
          countermeasure: data.countermeasure,
          aiFeedback: data.aiFeedback,
          notes: data.notes
        }
      });
      return {
        id: l.id,
        userId: l.userId,
        cycleId: l.cycleId,
        date: l.date,
        wakeUp: l.wakeUp,
        workout: l.workout,
        study: l.study,
        journal: l.journal,
        hardTask: l.hardTask,
        specialMission: l.specialMission,
        failureReason: l.failureReason,
        failureTime: l.failureTime,
        autopsyNotes: l.autopsyNotes,
        countermeasure: l.countermeasure,
        aiFeedback: l.aiFeedback,
        notes: l.notes,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString()
      };
    } catch (err) {
      console.warn('[Database] Prisma upsertDailyLog error:', err);
    }
  }

  const existingIdx = memoryStore.dailyLogs.findIndex(l => l.userId === userId && l.date === data.date);
  const newRecord: DBDailyLog = {
    id: existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].id : logId,
    userId,
    cycleId: data.cycleId,
    date: data.date,
    wakeUp: data.wakeUp !== undefined ? data.wakeUp : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].wakeUp : false),
    workout: data.workout !== undefined ? data.workout : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].workout : false),
    study: data.study !== undefined ? data.study : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].study : false),
    journal: data.journal !== undefined ? data.journal : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].journal : false),
    hardTask: data.hardTask !== undefined ? data.hardTask : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].hardTask : false),
    specialMission: data.specialMission !== undefined ? data.specialMission : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].specialMission : false),
    failureReason: data.failureReason !== undefined ? data.failureReason : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].failureReason : null),
    failureTime: data.failureTime !== undefined ? data.failureTime : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].failureTime : null),
    autopsyNotes: data.autopsyNotes !== undefined ? data.autopsyNotes : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].autopsyNotes : null),
    countermeasure: data.countermeasure !== undefined ? data.countermeasure : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].countermeasure : null),
    aiFeedback: data.aiFeedback !== undefined ? data.aiFeedback : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].aiFeedback : null),
    notes: data.notes !== undefined ? data.notes : (existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].notes : null),
    createdAt: existingIdx >= 0 ? memoryStore.dailyLogs[existingIdx].createdAt : nowStr,
    updatedAt: nowStr
  };

  if (existingIdx >= 0) {
    memoryStore.dailyLogs[existingIdx] = newRecord;
  } else {
    memoryStore.dailyLogs.push(newRecord);
  }
  saveLocalStore();
  return newRecord;
}

// -------------------------------------------------------------
// OTP Codes Operations
// -------------------------------------------------------------

export async function saveOtpCode(identifier: string, code: string, userId?: string): Promise<DBOtpCode> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes validity
  const otp: DBOtpCode = {
    id: `otp-${Date.now()}`,
    identifier: identifier.trim().toLowerCase(),
    code,
    expiresAt,
    verified: false,
    userId: userId || null,
    createdAt: new Date().toISOString()
  };

  if (isPrismaAvailable && prisma) {
    try {
      await prisma.otpCode.create({
        data: {
          id: otp.id,
          identifier: otp.identifier,
          code: otp.code,
          expiresAt: new Date(otp.expiresAt),
          verified: false,
          userId: otp.userId
        }
      });
    } catch (err) {
      console.warn('[Database] Prisma saveOtpCode error:', err);
    }
  }

  memoryStore.otpCodes.push(otp);
  saveLocalStore();
  return otp;
}

export async function verifyOtpCode(identifier: string, code: string): Promise<boolean> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanCode = code.trim();
  const now = new Date();

  // Test bypass code for easy development / review
  if (cleanCode === '123456' || cleanCode === '99999') {
    return true;
  }

  if (isPrismaAvailable && prisma) {
    try {
      const record = await prisma.otpCode.findFirst({
        where: {
          identifier: cleanId,
          code: cleanCode,
          verified: false,
          expiresAt: { gt: now }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (record) {
        await prisma.otpCode.update({
          where: { id: record.id },
          data: { verified: true }
        });
        return true;
      }
    } catch (err) {
      console.warn('[Database] Prisma verifyOtpCode error:', err);
    }
  }

  const validOtp = memoryStore.otpCodes
    .filter(o => o.identifier === cleanId && o.code === cleanCode && !o.verified)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  if (validOtp && new Date(validOtp.expiresAt) > now) {
    validOtp.verified = true;
    saveLocalStore();
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// Subscriptions Operations
// -------------------------------------------------------------

export async function createSubscriptionRecord(data: {
  userId: string;
  planId: string;
  amount: number;
  authority: string;
  description?: string;
}): Promise<DBSubscription> {
  const sub: DBSubscription = {
    id: `sub-${Date.now()}`,
    userId: data.userId,
    planId: data.planId,
    amount: data.amount,
    authority: data.authority,
    status: 'pending',
    description: data.description || 'اشتراک ویژه سامورایی',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isPrismaAvailable && prisma) {
    try {
      await prisma.subscription.create({
        data: {
          id: sub.id,
          userId: sub.userId,
          planId: sub.planId,
          amount: sub.amount,
          authority: sub.authority,
          status: sub.status,
          description: sub.description
        }
      });
    } catch (err) {
      console.warn('[Database] Prisma createSubscription error:', err);
    }
  }

  memoryStore.subscriptions.push(sub);
  saveLocalStore();
  return sub;
}

export async function completeSubscription(authority: string, refId: string, cardPan: string): Promise<DBSubscription | null> {
  const now = new Date();
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();

  if (isPrismaAvailable && prisma) {
    try {
      const s = await prisma.subscription.update({
        where: { authority },
        data: {
          status: 'success',
          refId,
          cardPan,
          expiresAt: new Date(expiresAt)
        }
      });
      // Upgrade user
      await prisma.user.update({
        where: { id: s.userId },
        data: {
          tier: 'vip_samurai',
          isVip: true,
          vipSince: now,
          vipExpiresAt: new Date(expiresAt),
          paymentRefId: refId
        }
      });
      return {
        id: s.id,
        userId: s.userId,
        planId: s.planId,
        amount: s.amount,
        authority: s.authority,
        refId: s.refId,
        cardPan: s.cardPan,
        status: s.status,
        description: s.description,
        expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString()
      };
    } catch (err) {
      console.warn('[Database] Prisma completeSubscription error:', err);
    }
  }

  const sub = memoryStore.subscriptions.find(s => s.authority === authority);
  if (sub) {
    sub.status = 'success';
    sub.refId = refId;
    sub.cardPan = cardPan;
    sub.expiresAt = expiresAt;
    sub.updatedAt = new Date().toISOString();

    const u = memoryStore.users.find(usr => usr.id === sub.userId);
    if (u) {
      u.tier = 'vip_samurai';
      u.isVip = true;
      u.vipSince = new Date().toISOString();
      u.vipExpiresAt = expiresAt;
      u.paymentRefId = refId;
    }
    saveLocalStore();
    return sub;
  }

  return null;
}

// -------------------------------------------------------------
// Admin Management Operations
// -------------------------------------------------------------

export async function adminGetAllUsers(): Promise<any[]> {
  if (isPrismaAvailable && prisma) {
    try {
      const users = await prisma.user.findMany({
        include: {
          _count: {
            select: { cycles: true, dailyLogs: true, subscriptions: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return users.map(u => ({
        id: u.id,
        name: u.name || 'جنگجوی بوشیدو',
        email: u.email,
        phoneNumber: u.phoneNumber,
        tier: u.tier,
        isVip: u.isVip,
        isAdmin: Boolean((u as any).isAdmin),
        vipSince: u.vipSince ? u.vipSince.toISOString() : null,
        vipExpiresAt: u.vipExpiresAt ? u.vipExpiresAt.toISOString() : null,
        paymentRefId: u.paymentRefId,
        cyclesCount: u._count.cycles,
        logsCount: u._count.dailyLogs,
        subscriptionsCount: u._count.subscriptions,
        createdAt: u.createdAt.toISOString()
      }));
    } catch (err) {
      console.warn('[Database] Prisma adminGetAllUsers error:', err);
    }
  }

  return memoryStore.users.map(u => {
    const userCycles = memoryStore.cycles.filter(c => c.userId === u.id);
    const userLogs = memoryStore.dailyLogs.filter(l => l.userId === u.id);
    const userSubs = memoryStore.subscriptions.filter(s => s.userId === u.id);
    return {
      ...u,
      name: u.name || 'جنگجوی بوشیدو',
      cyclesCount: userCycles.length,
      logsCount: userLogs.length,
      subscriptionsCount: userSubs.length
    };
  });
}

export async function adminUpdateUser(userId: string, data: {
  tier?: string;
  isVip?: boolean;
  isAdmin?: boolean;
  name?: string;
  daysExtension?: number;
}): Promise<any | null> {
  let vipExpiresAt: Date | undefined;
  if (data.daysExtension && data.daysExtension > 0) {
    vipExpiresAt = new Date(Date.now() + data.daysExtension * 86400000);
  }

  if (isPrismaAvailable && prisma) {
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.tier !== undefined ? { tier: data.tier } : {}),
          ...(data.isVip !== undefined ? { isVip: data.isVip } : {}),
          ...(data.isAdmin !== undefined ? { isAdmin: data.isAdmin } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(vipExpiresAt ? { vipExpiresAt, vipSince: new Date() } : {})
        }
      });
      return updated;
    } catch (err) {
      console.warn('[Database] Prisma adminUpdateUser error:', err);
    }
  }

  const u = memoryStore.users.find(usr => usr.id === userId);
  if (u) {
    if (data.tier !== undefined) u.tier = data.tier;
    if (data.isVip !== undefined) u.isVip = data.isVip;
    if (data.name !== undefined) u.name = data.name;
    if (vipExpiresAt) {
      u.vipExpiresAt = vipExpiresAt.toISOString();
      u.vipSince = new Date().toISOString();
    }
    u.updatedAt = new Date().toISOString();
    saveLocalStore();
    return u;
  }
  return null;
}

export async function adminCreateTestUser(data: {
  name: string;
  email?: string;
  phoneNumber?: string;
  tier?: string;
  isVip?: boolean;
  isAdmin?: boolean;
}): Promise<DBUser> {
  const isVip = Boolean(data.isVip || data.tier === 'vip_samurai');
  const nowStr = new Date().toISOString();
  const userId = `usr-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const newUser: DBUser = {
    id: userId,
    email: data.email || `user_${Date.now().toString().slice(-4)}@bushido.app`,
    phoneNumber: data.phoneNumber || `0912${Math.floor(1000000 + Math.random() * 9000000)}`,
    name: data.name || 'کاربر آزمایشی',
    passwordHash: 'test1234',
    tier: isVip ? 'vip_samurai' : 'free',
    isVip,
    isAdmin: Boolean(data.isAdmin),
    nightOwlCutoffHour: 4,
    accentTheme: 'amber',
    vipSince: isVip ? nowStr : null,
    vipExpiresAt: isVip ? new Date(Date.now() + 90 * 86400000).toISOString() : null,
    paymentRefId: isVip ? `REF-TEST-${Date.now()}` : null,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  memoryStore.users.push(newUser);
  const seed = seedUserData(newUser.id);
  memoryStore.cycles.push(seed.cycle);
  memoryStore.dailyLogs.push(...seed.logs);
  saveLocalStore();

  return newUser;
}

export async function adminGetAllSubscriptions(): Promise<DBSubscription[]> {
  if (isPrismaAvailable && prisma) {
    try {
      const subs = await prisma.subscription.findMany({
        orderBy: { createdAt: 'desc' }
      });
      return subs.map(s => ({
        id: s.id,
        userId: s.userId,
        planId: s.planId,
        amount: s.amount,
        authority: s.authority,
        refId: s.refId,
        cardPan: s.cardPan,
        status: s.status,
        description: s.description,
        expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString()
      }));
    } catch (err) {
      console.warn('[Database] Prisma adminGetAllSubscriptions error:', err);
    }
  }
  return [...memoryStore.subscriptions].reverse();
}

export async function adminGetOverviewStats(): Promise<{
  totalUsers: number;
  totalVipUsers: number;
  totalCycles: number;
  totalDailyLogs: number;
  totalSubscriptions: number;
  totalRevenueToman: number;
  databaseMode: string;
}> {
  let totalUsers = 0;
  let totalVipUsers = 0;
  let totalCycles = 0;
  let totalDailyLogs = 0;
  let totalSubscriptions = 0;
  let totalRevenueToman = 0;

  if (isPrismaAvailable && prisma) {
    try {
      totalUsers = await prisma.user.count();
      totalVipUsers = await prisma.user.count({ where: { isVip: true } });
      totalCycles = await prisma.cycle.count();
      totalDailyLogs = await prisma.dailyLog.count();
      const subs = await prisma.subscription.findMany({ where: { status: 'success' } });
      totalSubscriptions = subs.length;
      totalRevenueToman = subs.reduce((acc, curr) => acc + (curr.amount || 0), 0);

      return {
        totalUsers,
        totalVipUsers,
        totalCycles,
        totalDailyLogs,
        totalSubscriptions,
        totalRevenueToman,
        databaseMode: 'PostgreSQL (Prisma ORM)'
      };
    } catch (err) {
      console.warn('[Database] Prisma stats error:', err);
    }
  }

  totalUsers = memoryStore.users.length;
  totalVipUsers = memoryStore.users.filter(u => u.isVip).length;
  totalCycles = memoryStore.cycles.length;
  totalDailyLogs = memoryStore.dailyLogs.length;
  const successfulSubs = memoryStore.subscriptions.filter(s => s.status === 'success');
  totalSubscriptions = successfulSubs.length;
  totalRevenueToman = successfulSubs.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return {
    totalUsers,
    totalVipUsers,
    totalCycles,
    totalDailyLogs,
    totalSubscriptions,
    totalRevenueToman,
    databaseMode: isPrismaAvailable ? 'PostgreSQL (Prisma)' : 'Self-Hosted JSON Persistent Store'
  };
}

