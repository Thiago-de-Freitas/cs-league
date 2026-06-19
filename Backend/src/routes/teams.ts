import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

async function getTeamWithDetails(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true, steamId: true } },
        },
      },
      invites: {
        where: { status: 'PENDING' },
        include: {
          invitedUser: { select: { id: true, displayName: true, email: true } },
        },
      },
    },
  });
}

function formatTeam(team: NonNullable<Awaited<ReturnType<typeof getTeamWithDetails>>>) {
  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    ownerId: team.ownerId,
    owner: team.owner,
    players: team.members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName,
      IGN: m.user.displayName,
      role: m.role,
      email: m.user.email,
      steamId: m.user.steamId,
    })),
    invites: team.invites.map((i) => ({
      id: i.id,
      invitedUser: i.invitedUser,
      status: i.status,
    })),
    createdAt: team.createdAt,
  };
}

router.get('/', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      include: {
        members: {
          include: {
            user: { select: { id: true, displayName: true, email: true, steamId: true } },
          },
        },
        leagueTeams: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      teams.map((team) => ({
        id: team.id,
        name: team.name,
        tag: team.tag,
        ownerId: team.ownerId,
        players: team.members.map((m) => ({
          id: m.user.id,
          name: m.user.displayName,
          IGN: m.user.displayName,
          role: m.role,
        })),
        wins: team.leagueTeams.reduce((sum, lt) => sum + lt.wins, 0),
        losses: team.leagueTeams.reduce((sum, lt) => sum + lt.losses, 0),
        points: team.leagueTeams.reduce((sum, lt) => sum + lt.points, 0),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar times' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await getTeamWithDetails(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    res.json(formatTeam(team));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar time' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, tag } = req.body;
    if (!name || !tag) {
      res.status(400).json({ error: 'Nome e tag são obrigatórios' });
      return;
    }

    const team = await prisma.team.create({
      data: {
        name,
        tag,
        ownerId: req.user!.userId,
        members: {
          create: { userId: req.user!.userId, role: 'CAPTAIN' },
        },
      },
    });

    const full = await getTeamWithDetails(team.id);
    res.status(201).json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar time' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (team.ownerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const { name, tag } = req.body;
    await prisma.team.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(tag && { tag }) },
    });

    const full = await getTeamWithDetails(req.params.id);
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar time' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (team.ownerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    await prisma.team.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir time' });
  }
});

router.post('/:id/invite', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (team.ownerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.id, userId } },
    });
    if (existingMember) {
      res.status(409).json({ error: 'Usuário já é membro do time' });
      return;
    }

    const invite = await prisma.teamInvite.upsert({
      where: { teamId_invitedUserId: { teamId: req.params.id, invitedUserId: userId } },
      create: { teamId: req.params.id, invitedUserId: userId },
      update: { status: 'PENDING' },
      include: { invitedUser: { select: { id: true, displayName: true, email: true } } },
    });

    res.status(201).json(invite);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar convite' });
  }
});

router.post('/:id/invites/:inviteId/accept', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const invite = await prisma.teamInvite.findUnique({
      where: { id: req.params.inviteId },
    });
    if (!invite || invite.teamId !== req.params.id) {
      res.status(404).json({ error: 'Convite não encontrado' });
      return;
    }
    if (invite.invitedUserId !== req.user!.userId) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    await prisma.$transaction([
      prisma.teamInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      }),
      prisma.teamMember.create({
        data: { teamId: invite.teamId, userId: invite.invitedUserId, role: 'MEMBER' },
      }),
    ]);

    const full = await getTeamWithDetails(req.params.id);
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao aceitar convite' });
  }
});

router.get('/invites/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const invites = await prisma.teamInvite.findMany({
      where: { invitedUserId: req.user!.userId, status: 'PENDING' },
      include: {
        team: { select: { id: true, name: true, tag: true } },
      },
    });
    res.json(invites);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar convites' });
  }
});

export default router;
