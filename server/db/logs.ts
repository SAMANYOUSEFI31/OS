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

  if (isPrismaAvailable && prisma) {
    try {
      const existing = await prisma.dailyLog.findFirst({
        where: {
          userId,
          date: data.date
        }
      });

      if (existing) {
        const updated = await prisma.dailyLog.update({
          where: { id: existing.id },
          data: {
            ...data,
            updatedAt: now
          }
        });
        return updated;
      } else {
        const created = await prisma.dailyLog.create({
          data: {
            id: `log-${userId}-${data.date}`,
            userId,
            ...data,
            createdAt: now,
            updatedAt: now
          }
        });
        return created;
      }
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
      ...data,
      updatedAt: now
    };
    saveLocalStore();
    return memoryStore.dailyLogs[existingIdx];
  } else {
    const newLog: DBDailyLog = {
      id: `log-${userId}-${data.date}`,
      userId,
      ...data,
      createdAt: now,
      updatedAt: now
    };
    memoryStore.dailyLogs.push(newLog);
    saveLocalStore();
    return newLog;
  }
}
