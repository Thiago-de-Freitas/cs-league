import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';

const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'dev-secret');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (isProduction) {
  if (!JWT_SECRET || JWT_SECRET === 'dev-secret' || JWT_SECRET.length < 32) {
    throw new Error(
      'JWT_SECRET deve ser definido em produção (mínimo 32 caracteres aleatórios)'
    );
  }
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
}
