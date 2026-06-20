import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimit';

const router = Router();
const BCRYPT_ROUNDS = 12;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

function sanitizeUser(user: {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  role: string;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    steamId: user.steamId,
    role: user.role,
    createdAt: user.createdAt,
  };
}

router.post('/register', authRateLimiter, async (req, res: Response) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
      return;
    }
    if (
      typeof email !== 'string'
      || typeof password !== 'string'
      || typeof displayName !== 'string'
    ) {
      res.status(400).json({ error: 'Dados de cadastro inválidos' });
      return;
    }
    if (
      email.length > MAX_EMAIL_LENGTH
      || displayName.length > MAX_DISPLAY_NAME_LENGTH
      || password.length < MIN_PASSWORD_LENGTH
      || password.length > MAX_PASSWORD_LENGTH
    ) {
      res.status(400).json({ error: 'Email, senha ou nome fora dos limites permitidos' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: 'Email já cadastrado' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        displayName: displayName.trim(),
      },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
});

router.post('/login', authRateLimiter, async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' });
      return;
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Credenciais inválidas' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { displayName, steamId } = req.body;
    const data: { displayName?: string; steamId?: string | null } = {};

    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        res.status(400).json({ error: 'Nome de exibição inválido' });
        return;
      }
      data.displayName = displayName.trim();
    }

    if (steamId !== undefined) {
      if (steamId !== null && (typeof steamId !== 'string' || steamId.length > 32)) {
        res.status(400).json({ error: 'Steam ID inválido' });
        return;
      }
      data.steamId = steamId === null ? null : steamId.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
    });
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;
