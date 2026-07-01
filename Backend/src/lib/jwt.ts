import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function assertJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET não configurado.');
  }
  return JWT_SECRET;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'], algorithm: 'HS256' };
  return jwt.sign(payload, assertJwtSecret(), options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, assertJwtSecret(), { algorithms: ['HS256'] }) as JwtPayload;
}
