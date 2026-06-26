import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../lib/permissions';
import { formatAdminUserEntries, formatUserSearchResults } from '../lib/userSearch';

const router = Router();

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

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.limit ?? req.query.pageSize);
    const q = String(req.query.q ?? '').trim();
    const position = String(req.query.position ?? '').trim().toUpperCase();
    const role = String(req.query.role ?? '').trim().toUpperCase();

    const where: Prisma.UserWhereInput = {};

    if (q.length >= 2) {
      where.OR = [
        { displayName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { steamId: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (position) {
      where.position = position as Prisma.UserWhereInput['position'];
    }

    if (role === 'ADMIN' || role === 'USER') {
      where.role = role;
    }

    const skip = (page - 1) * pageSize;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          steamId: true,
          position: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
          _count: { select: { memberships: true } },
        },
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
