import {
  prisma,
  isPrismaAvailable,
  memoryStore,
  saveLocalStore,
  DBDailyLog
} from './base';

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
      return logs;
    } catch (e) {
      console.warn('[Database] Prisma getUserDailyLogs failed, checking local store:', e);
    }
  }

  let logs = memoryStore.dailyLogs.filter(l => l.userId === userId);
  if (cycleId) {
    logs = logs.filter(l => l.cycleId === cycleId);
  }

  return logs.sort((a, b) => a.date.localeCompare(b.date));
}

// Atomic Upsert Implementation using Prisma Native Upsert
export async function upsertDailyLog(
  userId: string,
  data: {
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
  }
): Promise<DBDailyLog> {
  const now = new Date().toISOString();
  const logId = `log-${userId}-${data.date}`;

  // Sanitize text bounds (Max 2000 chars)
  const sanitizedData = {
    ...data,
    failureReason: data.failureReason ? data.failureReason.slice(0, 500) : null,
    failureTime: data.failureTime ? data.failureTime.slice(0, 100) : null,
    autopsyNotes: data.autopsyNotes ? data.autopsyNotes.slice(0, 2000) : null,
    countermeasure: data.countermeasure ? data.countermeasure.slice(0, 2000) : null,
    aiFeedback: data.aiFeedback ? data.aiFeedback.slice(0, 2000) : null,
    notes: data.notes ? data.notes.slice(0, 2000) : null
  };

  if (isPrismaAvailable && prisma) {
    try {
      const upserted = await prisma.dailyLog.upsert({
        where: {
          userId_date: {
            userId,
            date: data.date
          }
        },
        update: {
          ...sanitizedData,
          updatedAt: now
        },
        create: {
          id: logId,
          userId,
          ...sanitizedData,
          createdAt: now,
          updatedAt: now
        }
      });
      return upserted;
    } catch (e) {
      console.warn('[Database] Prisma upsertDailyLog failed, falling back to local store:', e);
    }
  }

  const existingIdx = memoryStore.dailyLogs.findIndex(
    l => l.userId === userId && l.date === data.date
  );

  if (existingIdx >= 0) {
    memoryStore.dailyLogs[existingIdx] = {
      ...memoryStore.dailyLogs[existingIdx],
      ...sanitizedData,
      updatedAt: now
    };
    saveLocalStore();
    return memoryStore.dailyLogs[existingIdx];
  } else {
    const newLog: DBDailyLog = {
      id: logId,
      userId,
      ...sanitizedData,
      createdAt: now,
      updatedAt: now
    };
    memoryStore.dailyLogs.push(newLog);
    saveLocalStore();
    return newLog;
  }
}
