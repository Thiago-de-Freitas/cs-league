import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export function isAdmin(user: { role: string }): boolean {
  return user.role === 'ADMIN';
}

export function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (!req.user || !isAdmin(req.user)) {
    res.status(403).json({ error: 'Acesso negado' });
    return false;
  }
  return true;
}
