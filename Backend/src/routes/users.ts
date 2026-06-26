import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../lib/permissions';
import { formatAdminUserEntries, formatUserSearchResults } from '../lib/userSearch';
import { deleteUserAndData } from '../lib/deleteUser';
import {
  computeBannedUntil,
  parseBanDays,
} from '../lib/userModeration';
import { audit, setAuditContext } from '../lib/audit';
import { auditResponseMiddleware } from '../middleware/auditResponse';

const router = Router();
router.use(auditResponseMiddleware);

const ADMIN_USER_PAGE_SIZES = [10, 20, 50] as const;

function parsePage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function parsePageSize(value: unknown, fallback: (typeof ADMIN_USER_PAGE_SIZES)[number] = 10): number {
  const parsed = Number(value);
  if (ADMIN_USER_PAGE_SIZES.includes(parsed as (typeof ADMIN_USER_PAGE_SIZES)[number])) {
    return parsed;
  }
  return fallback;
}

async function loadTargetUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      isActive: true,
      bannedUntil: true,
    },
  });
}

function rejectProtectedTarget(
  req: AuthRequest,
  res: Response,
  target: { id: string; role: string }
): boolean {
  if (target.id === req.user!.userId) {
    res.status(400).json({ error: 'Você não pode moderar a própria conta.' });
    return true;
  }
  if (target.role === 'ADMIN') {
    res.status(400).json({ error: 'Não é possível moderar outro administrador.' });
    return true;
  }
  return false;
}

const adminUserSelect = {
  id: true,
  email: true,
  displayName: true,
  steamId: true,
  position: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  bannedUntil: true,
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.limit ?? req.query.pageSize);
    const q = String(req.query.q ?? '').trim();
    const position = String(req.query.position ?? '').trim().toUpperCase();
    const role = String(req.query.role ?? '').trim().toUpperCase();
    const status = String(req.query.status ?? '').trim().toLowerCase();

    const where: Prisma.UserWhereInput = {};
    const andFilters: Prisma.UserWhereInput[] = [];

    if (q.length >= 2) {
      andFilters.push({
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { steamId: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (position) {
      where.position = position as Prisma.UserWhereInput['position'];
    }

    if (role === 'ADMIN' || role === 'USER') {
      where.role = role;
    }

    if (status === 'inactive') {
      where.isActive = false;
    } else if (status === 'banned') {
      where.isActive = true;
      where.bannedUntil = { gt: new Date() };
    } else if (status === 'active') {
      andFilters.push({ isActive: true });
      andFilters.push({
        OR: [
          { bannedUntil: null },
          { bannedUntil: { lte: new Date() } },
        ],
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    const skip = (page - 1) * pageSize;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    res.json({
      users: formatAdminUserEntries(users),
      page,
      pageSize,
      total,
      totalPages,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar jogadores' });
  }
});

router.patch('/:id/deactivate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const target = await loadTargetUser(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }
    if (rejectProtectedTarget(req, res, target)) return;

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: false },
      select: adminUserSelect,
    });

    setAuditContext(req, audit.of('user.deactivate', 'User', target.id, {
      before: { isActive: target.isActive },
      after: { isActive: false },
    }));

    res.json({ user: formatAdminUserEntries([updated])[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao desativar jogador' });
  }
});

router.patch('/:id/activate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const target = await loadTargetUser(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }
    if (rejectProtectedTarget(req, res, target)) return;

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: true },
      select: adminUserSelect,
    });

    setAuditContext(req, audit.of('user.activate', 'User', target.id, {
      before: { isActive: target.isActive },
      after: { isActive: true },
    }));

    res.json({ user: formatAdminUserEntries([updated])[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao reativar jogador' });
  }
});

router.post('/:id/ban', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const days = parseBanDays(req.body?.days);
    if (days == null) {
      res.status(400).json({ error: 'Informe um número de dias entre 1 e 365.' });
      return;
    }

    const target = await loadTargetUser(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }
    if (rejectProtectedTarget(req, res, target)) return;

    const bannedUntil = computeBannedUntil(days);
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedUntil, isActive: true },
      select: adminUserSelect,
    });

    setAuditContext(req, audit.of('user.ban', 'User', target.id, {
      metadata: { days },
      after: { bannedUntil: bannedUntil.toISOString() },
    }));

    res.json({ user: formatAdminUserEntries([updated])[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao banir jogador' });
  }
});

router.delete('/:id/ban', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const target = await loadTargetUser(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }
    if (rejectProtectedTarget(req, res, target)) return;

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { bannedUntil: null },
      select: adminUserSelect,
    });

    setAuditContext(req, audit.of('user.unban', 'User', target.id, {
      before: { bannedUntil: target.bannedUntil?.toISOString() ?? null },
      after: { bannedUntil: null },
    }));

    res.json({ user: formatAdminUserEntries([updated])[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover banimento' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;
    const target = await loadTargetUser(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Jogador não encontrado' });
      return;
    }
    if (rejectProtectedTarget(req, res, target)) return;

    await deleteUserAndData(target.id);

    setAuditContext(req, audit.of('user.delete', 'User', target.id, {
      before: {
        email: target.email,
        displayName: target.displayName,
        role: target.role,
      },
    }));

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir jogador' });
  }
});

router.get('/search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) {
      res.json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: req.user!.userId } },
          { isActive: true },
          {
            OR: [
              { bannedUntil: null },
              { bannedUntil: { lte: new Date() } },
            ],
          },
          {
            OR: [
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { steamId: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        steamId: true,
        position: true,
        avatarUrl: true,
      },
      orderBy: [{ displayName: 'asc' }],
      take: 12,
    });

    res.json(formatUserSearchResults(users));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

export default router;
