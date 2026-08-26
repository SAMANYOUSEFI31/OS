import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { findUserById } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'bushido_samurai_jwt_secret_key_2026_discipline_os';

export interface AuthUserPayload {
  userId: string;
  email?: string | null;
  phoneNumber?: string | null;
  isVip: boolean;
  tier: string;
  isAdmin?: boolean;
}

// Extend express Request type
export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf-8');
}

export function generateToken(payload: AuthUserPayload): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days validity
  const fullPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(signatureInput)
    .digest('base64url');

  return `${signatureInput}.${signature}`;
}

export function verifyToken(token: string): AuthUserPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signature] = parts;
    const signatureInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(signatureInput)
      .digest('base64url');

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload as AuthUserPayload;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'نشست کاربری نامعتبر است. لطفاً مجدداً وارد شوید.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده است.' });
    }

    // Verify user exists in database
    const user = await findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'کاربر در دیتابیس یافت نشد.' });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: Boolean(user.isAdmin)
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'احراز هویت با خطا مواجه شد.' });
  }
}

// Admin Auth Middleware: Blocks non-admin requests with 403 Forbidden
export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'دسترسی غیرمجاز: لطفاً ابتدا با حساب کاربری مدیر وارد شوید.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده است.' });
    }

    const user = await findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'حساب کاربری در دیتابیس یافت نشد.' });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ error: 'خطای ۴۰۳: دسترسی به بخش مدیریت سامانه فقط برای مدیران بوشیدو مجاز است.' });
    }

    req.user = {
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      isVip: user.isVip,
      tier: user.tier,
      isAdmin: true
    };

    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(401).json({ error: 'احراز هویت مدیر با خطا مواجه شد.' });
  }
}

// Optional Auth: If token provided, populates user; if not, assigns guest/fallback
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        const user = await findUserById(decoded.userId);
        if (user) {
          req.user = {
            userId: user.id,
            email: user.email,
            phoneNumber: user.phoneNumber,
            isVip: user.isVip,
            tier: user.tier,
            isAdmin: Boolean(user.isAdmin)
          };
        }
      }
    }
  } catch {
    // Ignore optional auth error
  }
  next();
}
