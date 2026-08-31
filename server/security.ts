import crypto from 'crypto';

export const JWT_SECRET = process.env.JWT_SECRET || 'bushido_samurai_jwt_secret_key_2026_discipline_os';
export const PASSWORD_SALT = process.env.PASSWORD_SALT || 'bushido_salt_2026_warrior_shield_discipline_os';

// Immutable Super Admin Master Identifiers
export const SUPER_ADMIN_PHONE = '09375454050';
export const SUPER_ADMIN_EMAIL = 'admin@bushido.app';
export const SUPER_ADMIN_PASS = 'saman.y.31@';
export const SUPER_ADMIN_NAME = 'فرمانده ارشد سامورایی (مدیر ارشد)';

export function isSuperAdminIdentifier(identifier?: string | null): boolean {
  if (!identifier) return false;
  const clean = identifier.trim().toLowerCase();
  return clean === SUPER_ADMIN_PHONE || clean === SUPER_ADMIN_EMAIL || clean === '09120000000';
}

export function hashPassword(password: string): string {
  if (!password) return '';
  return crypto.pbkdf2Sync(password, PASSWORD_SALT, 10000, 64, 'sha512').toString('hex');
}

export function verifyPassword(password: string, storedHash?: string | null): boolean {
  if (!password || !storedHash) return false;
  try {
    const computed = hashPassword(password);
    if (computed.length === storedHash.length && crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash))) {
      return true;
    }
    // Plaintext fallback for initial migration
    return password === storedHash;
  } catch {
    return false;
  }
}
