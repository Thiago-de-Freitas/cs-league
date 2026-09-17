import bcrypt from 'bcryptjs';
import { promisify } from 'node:util';
import type { User } from '@prisma/client';
import { prisma } from './prisma';
import { parseEmailInput } from './emailInput';
import { parsePasswordInput } from './passwordInput';
import { canUserLogin, DEACTIVATED_ACCOUNT_MESSAGE } from './userModeration';
import { maskEmail } from './emailVerification';

const comparePassword = promisify(bcrypt.compare);
const MAX_EMAIL_LENGTH = 255;
/** Hash fixo para equalizar tempo de resposta no login quando o e-mail não existe. */
const DUMMY_PASSWORD_HASH = '$2a$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';

export type PasswordAuthFailure = {
  ok: false;
  status: 400 | 401 | 403;
  error: string;
  errorCode: 'INVALID_INPUT' | 'INVALID_CREDENTIALS' | 'ACCOUNT_DEACTIVATED' | 'EMAIL_NOT_VERIFIED';
  userId: string | null;
  auditEmail: string | null;
  maskedEmail?: string;
};

export type PasswordAuthSuccess = {
  ok: true;
  user: User;
};

export type PasswordAuthResult = PasswordAuthSuccess | PasswordAuthFailure;

export function resolveLoginIdentifier(body: { email?: unknown; login?: unknown }): unknown {
  return body.email ?? body.login;
}

export async function authenticateWithPassword(
  emailInput: unknown,
  passwordInput: unknown
): Promise<PasswordAuthResult> {
  const normalizedEmail = parseEmailInput(emailInput, MAX_EMAIL_LENGTH);
  const normalizedPassword = parsePasswordInput(passwordInput);
  if (!normalizedEmail || !normalizedPassword) {
    return {
      ok: false,
      status: 400,
      error: 'Credenciais inválidas',
      errorCode: 'INVALID_INPUT',
      userId: null,
      auditEmail: normalizedEmail,
    };
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const valid = await comparePassword(normalizedPassword, passwordHash);
  if (!user || !valid) {
    return {
      ok: false,
      status: 401,
      error: 'Credenciais inválidas',
      errorCode: 'INVALID_CREDENTIALS',
      userId: user?.id ?? null,
      auditEmail: normalizedEmail,
    };
  }

  if (!canUserLogin(user)) {
    return {
      ok: false,
      status: 403,
      error: DEACTIVATED_ACCOUNT_MESSAGE,
      errorCode: 'ACCOUNT_DEACTIVATED',
      userId: user.id,
      auditEmail: user.email,
    };
  }

  if (!user.emailVerified) {
    return {
      ok: false,
      status: 403,
      error: 'Confirme seu e-mail com o código enviado antes de entrar.',
      errorCode: 'EMAIL_NOT_VERIFIED',
      userId: user.id,
      auditEmail: user.email,
      maskedEmail: maskEmail(user.email),
    };
  }

  return { ok: true, user };
}
