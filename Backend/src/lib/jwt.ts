import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'dev-secret');
const DEFAULT_JWT_EXPIRES_IN = '7d';

function assertJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET não configurado.');
  }
  return JWT_SECRET;
}

/**
 * Normaliza JWT_EXPIRES_IN. Valores 0 / "0" / "0s" geram token já expirado (iat === exp)
 * e causam 401 em todas as rotas autenticadas após o login.
 */
export function resolveJwtExpiresIn(raw: string | undefined = process.env.JWT_EXPIRES_IN): string | number {
  const value = raw?.trim();
  if (!value) return DEFAULT_JWT_EXPIRES_IN;

  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_JWT_EXPIRES_IN;
    return seconds;
  }

  // "0", "0s", "0d", "0h", "0m", "0w"
  if (/^0+[smhdw]?$/i.test(value)) return DEFAULT_JWT_EXPIRES_IN;

  return value;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: resolveJwtExpiresIn() as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(payload, assertJwtSecret(), options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, assertJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
}
