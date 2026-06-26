import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { promisify } from 'node:util';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { parsePlayerPositionOptional } from '../lib/playerPosition';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimit';
import {
  deleteLegacyUploadFile,
  encodeUploadedImageToDataUrl,
  publicUploadUrlForResponse,
} from '../lib/uploadAssets';
import { auditResponseMiddleware } from '../middleware/auditResponse';
import { audit, setAuditContext } from '../lib/audit';
import {
  canUserLogin,
  DEACTIVATED_ACCOUNT_MESSAGE,
  isParticipationBanned,
} from '../lib/userModeration';

const router = Router();
router.use(auditResponseMiddleware);
const hashPassword = promisify(bcrypt.hash);
const comparePassword = promisify(bcrypt.compare);
const BCRYPT_ROUNDS = 12;
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens PNG, JPG, WEBP ou GIF são permitidas'));
    }
  },
});

function sanitizeUser(user: {
  id: string;
  email: string;
  displayName: string;
  steamId: string | null;
  avatarUrl: string | null;
  position: string | null;
  role: string;
  isActive: boolean;
  bannedUntil: Date | null;
  createdAt: Date;
}) {
  const moderation = { isActive: user.isActive, bannedUntil: user.bannedUntil };
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    steamId: user.steamId,
    avatarUrl: publicUploadUrlForResponse(user.avatarUrl),
    position: user.position?.toLowerCase() ?? null,
    role: user.role,
    isActive: user.isActive,
    bannedUntil: user.bannedUntil?.toISOString() ?? null,
    isBanned: isParticipationBanned(moderation),
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

    const passwordHash = await hashPassword(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        displayName: displayName.trim(),
      },
    });

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    setAuditContext(req, audit.of('auth.register', 'User', user.id, {
      after: { email: user.email, displayName: user.displayName, role: user.role },
    }));
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
      setAuditContext(req, audit.of('auth.login.failed', 'User', null, {
        metadata: { email: email.trim().toLowerCase() },
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
      }));
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      setAuditContext(req, audit.of('auth.login.failed', 'User', user.id, {
        metadata: { email: user.email },
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
      }));
      res.status(401).json({ error: 'Credenciais inválidas' });
      return;
    }

    if (!canUserLogin(user)) {
      setAuditContext(req, audit.of('auth.login.failed', 'User', user.id, {
        metadata: { email: user.email },
        success: false,
        errorCode: 'ACCOUNT_DEACTIVATED',
      }));
      res.status(403).json({ error: DEACTIVATED_ACCOUNT_MESSAGE });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    setAuditContext(req, audit.of('auth.login.success', 'User', user.id, {
      after: { email: user.email, role: user.role },
    }));
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
    const { displayName, steamId, position } = req.body;
    const data: { displayName?: string; steamId?: string | null; position?: import('@prisma/client').PlayerPosition | null } = {};

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

    if (position !== undefined) {
      const parsed = parsePlayerPositionOptional(position);
      if (parsed === undefined) {
        res.status(400).json({ error: 'Posição inválida' });
        return;
      }
      data.position = parsed;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
    });
    setAuditContext(req, audit.of('user.profile.update', 'User', user.id, {
      after: { displayName: user.displayName, steamId: user.steamId, position: user.position },
    }));
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

router.post('/me/avatar', authMiddleware, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo de imagem é obrigatório' });
      return;
    }

    const current = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!current) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const avatarUrl = encodeUploadedImageToDataUrl(req.file);
    deleteLegacyUploadFile(current.avatarUrl);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarUrl },
    });

    setAuditContext(req, audit.of('user.avatar.upload', 'User', user.id, {
      metadata: { fileName: req.file.originalname, size: req.file.size },
    }));
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar foto de perfil' });
  }
});

router.delete('/me/avatar', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const current = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!current) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    deleteLegacyUploadFile(current.avatarUrl);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarUrl: null },
    });

    setAuditContext(req, audit.of('user.avatar.delete', 'User', user.id));
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover foto de perfil' });
  }
});

export default router;
