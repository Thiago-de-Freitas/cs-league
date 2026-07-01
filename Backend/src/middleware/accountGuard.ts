import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from './auth';
import { canUserLogin, canUserParticipate, DEACTIVATED_ACCOUNT_MESSAGE, PARTICIPATION_BAN_MESSAGE } from '../lib/userModeration';

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  bannedUntil: Date | null;
  emailVerified: boolean;
};

export interface AccountAuthRequest extends AuthRequest {
  accountUser?: AccountUser;
}

const accountSelect = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  role: true,
  isActive: true,
  bannedUntil: true,
  emailVerified: true,
} as const;

async function loadAccountUser(
  req: AccountAuthRequest,
  res: Response,
  options: { requireVerified: boolean }
): Promise<AccountUser | null> {
  if (!req.user) {
    res.status(401).json({ error: 'Token não fornecido' });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: accountSelect,
  });

  if (!user) {
    res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' });
    return null;
  }

  if (!canUserLogin(user)) {
    res.status(403).json({ error: DEACTIVATED_ACCOUNT_MESSAGE });
    return null;
  }

  if (options.requireVerified && !canUserParticipate(user)) {
    res.status(403).json({
      error: PARTICIPATION_BAN_MESSAGE,
      code: 'PARTICIPATION_SUSPENDED',
    });
    return null;
  }

  if (options.requireVerified && !user.emailVerified) {
    res.status(403).json({
      error: 'Confirme seu e-mail antes de alterar o endereço.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return null;
  }

  req.accountUser = user;
  return user;
}

/** Conta ativa (permite exclusão mesmo sem e-mail verificado). */
export async function requireActiveAccount(
  req: AccountAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await loadAccountUser(req, res, { requireVerified: false });
  if (!user) return;
  next();
}

/** Conta ativa com e-mail verificado — troca de e-mail e ações sensíveis. */
export async function requireVerifiedAccount(
  req: AccountAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await loadAccountUser(req, res, { requireVerified: true });
  if (!user) return;
  next();
}
