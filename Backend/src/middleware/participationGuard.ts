import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from './auth';
import { isAdmin } from '../lib/permissions';
import {
  canUserParticipate,
  PARTICIPATION_BAN_MESSAGE,
} from '../lib/userModeration';

export async function participationGuard(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }

  if (isAdmin(req.user)) {
    next();
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { isActive: true, bannedUntil: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  if (!canUserParticipate(user)) {
    res.status(403).json({
      error: PARTICIPATION_BAN_MESSAGE,
      bannedUntil: user.bannedUntil?.toISOString() ?? null,
      code: 'PARTICIPATION_SUSPENDED',
    });
    return;
  }

  next();
}
