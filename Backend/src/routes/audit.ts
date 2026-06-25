import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { isAdmin } from '../lib/permissions';
import { canUserAccessLeague } from '../lib/leaguePermissions';
import { formatAuditEventForApi } from '../lib/audit';

const router = Router();

function parseLimit(value: unknown, fallback = 50, max = 200): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

router.get('/events', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdmin(req.user!)) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const limit = parseLimit(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
    const actorUserId = typeof req.query.actorUserId === 'string' ? req.query.actorUserId : undefined;
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;

    const where: Prisma.AuditEventWhereInput = {
      ...(action ? { action: { contains: action } } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorUserId ? { actorUserId } : {}),
      ...(from && !Number.isNaN(from.getTime()) ? { occurredAt: { gte: from } } : {}),
      ...(to && !Number.isNaN(to.getTime())
        ? { occurredAt: { ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}), lte: to } }
        : {}),
    };

    const events = await prisma.auditEvent.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actorUser: { select: { id: true, displayName: true, email: true } },
      },
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    res.json({
      events: page.map(formatAuditEventForApi),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar auditoria' });
  }
});

router.get('/leagues/:leagueId/activity', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const access = await canUserAccessLeague(req.user!.userId, req.user!.role, req.params.leagueId);
    if (!access.allowed) {
      res.status(access.error === 'Liga não encontrada.' ? 404 : 403).json({ error: access.error });
      return;
    }

    const limit = parseLimit(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const leagueId = req.params.leagueId;

    const events = await prisma.auditEvent.findMany({
      where: {
        OR: [
          { entityType: 'League', entityId: leagueId },
          { parentType: 'League', parentId: leagueId },
        ],
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        actorUser: { select: { id: true, displayName: true, email: true } },
      },
    });

    const hasMore = events.length > limit;
    const page = hasMore ? events.slice(0, limit) : events;

    res.json({
      events: page.map(formatAuditEventForApi),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar atividade da liga' });
  }
});

export default router;
