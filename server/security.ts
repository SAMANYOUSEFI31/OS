import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Environment configuration guard and validator.
 * Ensures the application fails fast in production if required security credentials are missing.
 */
const NODE_ENV = process.env.NODE_ENV || 'development';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production mode.');
    }
    return 'dev-fallback-insecure-secret-key-change-in-production-32bytes';
  }
  if (NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET must be at least 32 characters long in production.');
  }
  return secret;
}

function getSuperAdminIdentifier(): string {
  const adminId = process.env.SUPER_ADMIN_IDENTIFIER || process.env.ADMIN_PHONE || process.env.ADMIN_USERNAME;
  if (!adminId) {
    if (NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: SUPER_ADMIN_IDENTIFIER environment variable is missing in production mode.');
    }
    return 'admin';
  }
  return adminId;
}

// Cryptographic parameters for PBKDF2
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';
const SALT_BYTE_SIZE = 16;

/**
 * Hashes a plain-text password using PBKDF2 with SHA-512 and a cryptographically secure random salt.
 * Returns salt and hash formatted as 'salt:hash'.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || typeof password !== 'string') {
    throw new Error('Invalid input: Password must be a non-empty string.');
  }

  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTE_SIZE).toString('hex');
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a plain-text password against a stored PBKDF2 salt:hash string.
 * Employs timing-safe comparisons to prevent side-channel timing attacks.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split(':');
  if (parts.length !== 2) {
    return false;
  }

  const [salt, originalHashHex] = parts;
  if (!salt || !originalHashHex) {
    return false;
  }

  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) return resolve(false);

      const derivedHashHex = derivedKey.toString('hex');
      const hashBuffer = Buffer.from(derivedHashHex, 'utf8');
      const originalHashBuffer = Buffer.from(originalHashHex, 'utf8');

      if (hashBuffer.length !== originalHashBuffer.length) {
        return resolve(false);
      }

      resolve(crypto.timingSafeEqual(hashBuffer, originalHashBuffer));
    });
  });
}

/**
 * Generates a signed JWT token with specified payload and expiration time.
 */
export function generateToken(payload: Record<string, any>, expiresIn: string | number = '7d'): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: Token payload must be an object.');
  }

  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies and decodes a JWT token. Returns null if signature is invalid or expired.
 */
export function verifyToken<T = any>(token: string): T | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    return decoded as T;
  } catch (error) {
    return null;
  }
}

/**
 * Validates whether an identifier matches the Super Admin configuration.
 * Uses timing-safe string comparison to protect against user-enumeration side channels.
 */
export function isSuperAdminIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }

  const superAdminId = getSuperAdminIdentifier();
  const inputBuffer = Buffer.from(identifier, 'utf8');
  const targetBuffer = Buffer.from(superAdminId, 'utf8');

  if (inputBuffer.length !== targetBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(inputBuffer, targetBuffer);
}
export const SUPER_ADMIN_PHONE = process.env.SUPER_ADMIN_PHONE || '';
export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || '';
export const SUPER_ADMIN_PASS = process.env.SUPER_ADMIN_PASS || '';
export const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME || 'Super Admin';
