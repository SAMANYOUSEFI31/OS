import { loadLocalStore, saveLocalStore, memoryStore, ensureDefaultAdminAndUsers } from './base.js';

export let prisma: any = null;
export let isPrismaAvailable = false;

const NODE_ENV = process.env.NODE_ENV || 'development';
const isAllowTest = process.env.ALLOW_TEST_SHORTCUTS === 'true';
const isOnVercel = Boolean(process.env.VERCEL);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function initializeDatabase(): Promise<void> {
  const dbConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DIRECT_URL;

  const isLocalhost =
    !!dbConnectionString &&
    (dbConnectionString.includes('localhost') || dbConnectionString.includes('127.0.0.1'));

  // روی Vercel هرگز به localhost وصل نشو
  if (dbConnectionString && !(isOnVercel && isLocalhost)) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const mod = await import('@prisma/client');
        prisma = new mod.PrismaClient({
          log: ['error', 'warn']
        });
        await prisma.$connect();
        isPrismaAvailable = true;
        console.log('[Database] PostgreSQL connected.');
        break;
      } catch (err: any) {
        console.error(`[Database] attempt ${attempt} failed:`, err?.message || err);
        if (prisma) {
          try { await prisma.$disconnect(); } catch {}
          prisma = null;
        }
        if (attempt < 3) await wait(500);
      }
    }
  } else {
    console.log('[Database] Using local/memory store (no usable DATABASE_URL on this host).');
  }

  // اگر Prisma نبود → fallback + seed برای تست
  if (!isPrismaAvailable) {
    try { loadLocalStore(); } catch {}
    if (isAllowTest || isOnVercel || NODE_ENV !== 'production') {
      ensureDefaultAdminAndUsers();
    }
  }
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    try { await prisma.$disconnect(); } catch {}
    prisma = null;
    isPrismaAvailable = false;
  }
}

export {
  memoryStore,
  saveLocalStore,
  loadLocalStore,
  ensureDefaultAdminAndUsers
} from './base.js';

export * from './users.js';
export * from './cycles.js';
export * from './logs.js';
export * from './subscriptions.js';
