import {
  prisma,
  isPrismaAvailable,
  memoryStore,
  saveLocalStore,
  DBCycle,
  seedUserData
} from './base';

export async function getUserCycles(userId: string): Promise<DBCycle[]> {
  if (isPrismaAvailable && prisma) {
    try {
      const cycles = await prisma.cycle.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' }
      });
      if (cycles.length > 0) return cycles;
    } catch (e) {
      console.warn('[Database] Prisma getUserCycles failed, checking local store:', e);
    }
  }

  let cycles = memoryStore.cycles.filter(c => c.userId === userId);
  if (cycles.length === 0) {
    const seed = seedUserData(userId);
    memoryStore.cycles.push(seed.cycle);
    memoryStore.dailyLogs.push(...seed.logs);
    saveLocalStore();
    cycles = [seed.cycle];
  }

  return cycles.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function createCycle(
  userId: string,
  data: {
    title: string;
    startDate: string;
    endDate: string;
    targetTheme?: string;
    inheritedStreak?: number;
    rules?: string[];
  }
): Promise<DBCycle> {
  const now = new Date().toISOString();
  const newCycle: DBCycle = {
    id: `cycle-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    title: data.title,
    startDate: data.startDate,
    endDate: data.endDate,
    targetTheme: data.targetTheme || null,
    inheritedStreak: data.inheritedStreak || 0,
    rules: data.rules || [],
    isArchived: false,
    reportRead: false,
    createdAt: now,
    updatedAt: now
  };

  if (isPrismaAvailable && prisma) {
    try {
      const created = await prisma.cycle.create({
        data: newCycle
      });
      return created;
    } catch (e) {
      console.warn('[Database] Prisma createCycle failed, saving to local store:', e);
    }
  }

  memoryStore.cycles.push(newCycle);
  saveLocalStore();
  return newCycle;
}

export async function updateCycle(
  userId: string,
  cycleId: string,
  data: Partial<Omit<DBCycle, 'id' | 'userId' | 'createdAt'>>
): Promise<DBCycle | null> {
  const now = new Date().toISOString();

  if (isPrismaAvailable && prisma) {
    try {
      const updated = await prisma.cycle.update({
        where: { id: cycleId },
        data: {
          ...data,
          updatedAt: now
        }
      });
      return updated;
    } catch (e) {
      console.warn('[Database] Prisma updateCycle failed, updating local store:', e);
    }
  }

  const idx = memoryStore.cycles.findIndex(c => c.id === cycleId && c.userId === userId);
  if (idx === -1) return null;

  memoryStore.cycles[idx] = {
    ...memoryStore.cycles[idx],
    ...data,
    updatedAt: now
  };

  saveLocalStore();
  return memoryStore.cycles[idx];
}

export async function deleteCycle(userId: string, cycleId: string): Promise<boolean> {
  if (isPrismaAvailable && prisma) {
    try {
      await prisma.dailyLog.deleteMany({ where: { cycleId, userId } });
      await prisma.cycle.delete({ where: { id: cycleId, userId } });
      return true;
    } catch (e) {
      console.warn('[Database] Prisma deleteCycle failed, deleting in local store:', e);
    }
  }

  const initialCycleCount = memoryStore.cycles.length;
  memoryStore.cycles = memoryStore.cycles.filter(c => !(c.id === cycleId && c.userId === userId));
  memoryStore.dailyLogs = memoryStore.dailyLogs.filter(l => !(l.cycleId === cycleId && l.userId === userId));

  if (memoryStore.cycles.length < initialCycleCount) {
    saveLocalStore();
    return true;
  }
  return false;
}
