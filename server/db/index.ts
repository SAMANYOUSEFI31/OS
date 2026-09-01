import { PrismaClient } from '@prisma/client';
import { loadLocalStore, saveLocalStore, memoryStore, ensureDefaultAdminAndUsers } from './base';

export let prisma: PrismaClient | null = null;
export let isPrismaAvailable = false;

const NODE_ENV = process.env.NODE_ENV || 'development';
// اگر متغیر ALLOW_TEST_SHORTCUTS فعال باشد، حالت خاموشی اجباری سرور خنثی می‌شود
const isAllowTest = process.env.ALLOW_TEST_SHORTCUTS === 'true';
const isStrictProd = NODE_ENV === 'production' && !isAllowTest;

// Configuration for Retry Mechanism
const MAX_RETRIES = isStrictProd ? 5 : 2;
const RETRY_DELAY_MS = 1000;

/**
 * Delays execution for a specific amount of time.
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Securely initializes the database connection.
 * Resolves Race Conditions on server boot using a robust Retry Mechanism and Lazy Initialization.
 * In Production, it strictly binds to Prisma/PostgreSQL unless ALLOW_TEST_SHORTCUTS is true.
 */
export async function initializeDatabase(): Promise<void> {
  const dbConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DIRECT_URL;

  if (dbConnectionString) {
    let attempt = 1;

    while (attempt <= MAX_RETRIES) {
      try {
        console.log(`[Database] Attempting connection to PostgreSQL (Attempt ${attempt}/${MAX_RETRIES})...`);
        
        // Initialize Prisma Client
        prisma = new PrismaClient({
          log: isStrictProd ? ['error', 'warn'] : ['query', 'info', 'warn', 'error'],
        });

        // Test the connection to resolve any pending states
        await prisma.$connect();
        
        isPrismaAvailable = true;
        console.log('[Database] 🟢 Successfully connected to PostgreSQL via Prisma.');
        
        break; // Connection successful, exit retry loop

      } catch (error: any) {
        console.error(`[Database] 🔴 Failed to connect to PostgreSQL on attempt ${attempt}:`, error.message);
        
        if (prisma) {
           await prisma.$disconnect().catch(() => {});
           prisma = null;
        }

        if (attempt === MAX_RETRIES) {
          if (isStrictProd) {
            console.error('[Database] FATAL ERROR: Could not connect to the database in production. Shutting down.');
            process.exit(1);
          } else {
            console.warn('[Database] Falling back to local/in-memory store for development environment.');
            break;
          }
        }

        await wait(RETRY_DELAY_MS);
        attempt++;
      }
    }
  } else {
    if (isStrictProd) {
      console.error('[Database] FATAL ERROR: No Database connection URL found in production mode. Shutting down.');
      process.exit(1);
    } else {
      console.log('[Database] PostgreSQL Connection URL not set. Defaulting to local/in-memory store.');
    }
  }

  // Handle Seeding logic
  if (!isPrismaAvailable) {
    if (!isStrictProd || process.env.SEED_ADMIN === 'true') {
        console.log('[Database] Seeding default admin and test users in local store.');
        ensureDefaultAdminAndUsers();
    }
  } else {
     if (!isStrictProd || process.env.SEED_ADMIN === 'true') {
         console.log('[Database] Production Seeding requested (SEED_ADMIN=true), but Prisma automatic seeding is disabled in this layer. Use Prisma migrations/seed scripts.');
     }
  }
}

/**
 * Safely disconnects the database when the server shuts down.
 */
export async function closeDatabase(): Promise<void> {
  if (isPrismaAvailable && prisma) {
    try {
      await prisma.$disconnect();
      console.log('[Database] PostgreSQL connection closed cleanly.');
    } catch (error) {
      console.error('[Database] Error while closing PostgreSQL connection:', error);
    }
  } else {
      // Save any pending changes to the local file store
      saveLocalStore();
      console.log('[Database] Local/in-memory store saved.');
  }
}

// Ensure the process attempts a clean disconnect on termination
process.on('SIGINT', async () => {
    await closeDatabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await closeDatabase();
    process.exit(0);
});

// Re-export all necessary modules
export * from './base';
export * from './users';
export * from './cycles';
export * from './logs';
export * from './subscriptions';
