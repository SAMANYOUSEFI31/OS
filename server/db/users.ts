import {
  prisma,
  isPrismaAvailable,
  memoryStore,
  saveLocalStore,
  DBUser,
  seedUserData
} from './base';

export async function findUserById(id: string): Promise<DBUser | null> {
  if (isPrismaAvailable && prisma) {
    try {
      const user = await prisma.user.findUnique({
        where: { id }
      });
      return user;
    } catch (e) {
      console.warn('[Database] Prisma findUserById failed, falling back to local store:', e);
    }
  }

  const found = memoryStore.users.find(u => u.id === id);
  return found || null;
}

export async function findUserByIdentifier(identifier: string): Promise<DBUser | null> {
  const normalized = identifier.trim().toLowerCase();
  
  if (isPrismaAvailable && prisma) {
    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: normalized, mode: 'insensitive' } },
            { phoneNumber: normalized }
          ]
        }
      });
      return user;
    } catch (e) {
      console.warn('[Database] Prisma findUserByIdentifier failed, falling back to local store:', e);
    }
  }

  const found = memoryStore.users.find(
    u => (u.email && u.email.toLowerCase() === normalized) || (u.phoneNumber && u.phoneNumber === normalized)
  );
  return found || null;
}

export async function createUser(data: {
  email?: string;
  phoneNumber?: string;
  name?: string;
  passwordHash?: string;
  tier?: string;
  isVip?: boolean;
  isAdmin?: boolean;
}): Promise<DBUser> {
  const now = new Date().toISOString();
  const id = `user-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const isFirstUser = memoryStore.users.length === 0;
  const isAdmin = data.isAdmin !== undefined ? data.isAdmin : (isFirstUser || data.email === 'admin@bushido.app');

  const newUser: DBUser = {
    id,
    email: data.email ? data.email.toLowerCase().trim() : null,
    phoneNumber: data.phoneNumber ? data.phoneNumber.trim() : null,
    name: data.name || (data.phoneNumber ? `کاربر ${data.phoneNumber.slice(-4)}` : (data.email ? data.email.split('@')[0] : 'سامورایی دیسیپلین')),
    passwordHash: data.passwordHash || null,
    tier: data.tier || (data.isVip ? 'vip_samurai' : 'free'),
    isVip: Boolean(data.isVip),
    isAdmin,
    nightOwlCutoffHour: 4,
    accentTheme: 'amber',
    vipSince: data.isVip ? now : null,
    vipExpiresAt: data.isVip ? new Date(Date.now() + 365 * 86400000).toISOString() : null,
    paymentRefId: null,
    createdAt: now,
    updatedAt: now
  };

  if (isPrismaAvailable && prisma) {
    try {
      const created = await prisma.user.create({
        data: newUser
      });
      return created;
    } catch (e) {
      console.warn('[Database] Prisma createUser failed, saving to local store:', e);
    }
  }

  memoryStore.users.push(newUser);

  // Automatically seed starter cycle and logs for new registered user
  const seed = seedUserData(newUser.id);
  memoryStore.cycles.push(seed.cycle);
  memoryStore.dailyLogs.push(...seed.logs);

  saveLocalStore();
  return newUser;
}

export async function updateUser(
  id: string,
  data: Partial<Omit<DBUser, 'id' | 'createdAt'>>
): Promise<DBUser | null> {
  const now = new Date().toISOString();

  if (isPrismaAvailable && prisma) {
    try {
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...data,
          updatedAt: now
        }
      });
      return updated;
    } catch (e) {
      console.warn('[Database] Prisma updateUser failed, updating local store:', e);
    }
  }

  const idx = memoryStore.users.findIndex(u => u.id === id);
  if (idx === -1) return null;

  memoryStore.users[idx] = {
    ...memoryStore.users[idx],
    ...data,
    updatedAt: now
  };

  saveLocalStore();
  return memoryStore.users[idx];
}

// -------------------------------------------------------------
// Admin Portal User Management
// -------------------------------------------------------------
export async function adminGetAllUsers(): Promise<DBUser[]> {
  if (isPrismaAvailable && prisma) {
    try {
      return await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
      });
    } catch (e) {
      console.warn('[Database] Prisma adminGetAllUsers failed, reading local store:', e);
    }
  }

  return [...memoryStore.users].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function adminUpdateUser(
  userId: string,
  data: {
    name?: string;
    isVip?: boolean;
    tier?: string;
    isAdmin?: boolean;
    vipExpiresAt?: string | null;
  }
): Promise<DBUser | null> {
  const targetUser = await findUserById(userId);
  if (!targetUser) return null;

  const nowStr = new Date().toISOString();
  const updatePayload: Partial<DBUser> = {
    ...data,
    updatedAt: nowStr
  };

  if (data.isVip !== undefined) {
    updatePayload.isVip = data.isVip;
    if (data.isVip) {
      updatePayload.tier = data.tier || 'vip_samurai';
      updatePayload.vipSince = targetUser.vipSince || nowStr;
      if (!updatePayload.vipExpiresAt && !targetUser.vipExpiresAt) {
        updatePayload.vipExpiresAt = new Date(Date.now() + 365 * 86400000).toISOString();
      }
    } else {
      updatePayload.tier = 'free';
      updatePayload.vipExpiresAt = null;
    }
  }

  return updateUser(userId, updatePayload);
}

export async function adminCreateTestUser(data: {
  name: string;
  identifier: string;
  isVip?: boolean;
  tier?: string;
}): Promise<DBUser> {
  const isEmail = data.identifier.includes('@');
  const user = await createUser({
    name: data.name,
    email: isEmail ? data.identifier : undefined,
    phoneNumber: !isEmail ? data.identifier : undefined,
    isVip: data.isVip,
    tier: data.tier || (data.isVip ? 'vip_samurai' : 'free')
  });

  return user;
}
