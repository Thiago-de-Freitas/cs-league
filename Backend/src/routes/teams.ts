import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import { isAdmin } from '../lib/permissions';
import { TEAM_LEAGUE_STATS_WHERE, sumLeagueTeamStats } from '../lib/teamStats';
import { parseOwnerAsMember } from '../lib/teamCreation';
import { getAverageAdrBySteamIds } from '../lib/teamMemberStats';
import {
  deleteLegacyUploadFile,
  encodeUploadedImageToDataUrl,
  publicUploadUrlForResponse,
} from '../lib/uploadAssets';
import { auditResponseMiddleware } from '../middleware/auditResponse';
import { audit, setAuditContext } from '../lib/audit';

const router = Router();
router.use(auditResponseMiddleware);

const logoUpload = multer({
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

async function getTeamWithDetails(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      members: {
        include: {
          user: { select: { id: true, displayName: true, email: true, steamId: true, position: true } },
        },
      },
      invites: {
        where: { status: 'PENDING' },
        include: {
          invitedUser: { select: { id: true, displayName: true, email: true } },
        },
      },
      leagueTeams: {
        where: TEAM_LEAGUE_STATS_WHERE,
      },
    },
  });
}

function canManageTeamRoster(user: { userId: string; role: string }, team: { ownerId: string }): boolean {
  return team.ownerId === user.userId || isAdmin(user);
}

function parseMemberRole(value: unknown): 'CAPTAIN' | 'MEMBER' | null {
  if (value === 'CAPTAIN' || value === 'MEMBER') return value;
  return null;
}

const MEMBER_TAG_MAX_LENGTH = 12;

function parseMemberTag(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MEMBER_TAG_MAX_LENGTH) return undefined;
  return trimmed;
}

function formatTeam(team: NonNullable<Awaited<ReturnType<typeof getTeamWithDetails>>>) {
  const stats = sumLeagueTeamStats(team.leagueTeams);

  return {
    id: team.id,
    name: team.name,
    tag: team.tag,
    logoUrl: publicUploadUrlForResponse(team.logoUrl),
    ownerId: team.ownerId,
    owner: team.owner,
    wins: stats.wins,
    losses: stats.losses,
    points: stats.points,
    players: team.members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName,
      IGN: m.user.displayName,
      role: m.role,
      memberTag: m.memberTag,
      position: m.user.position,
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

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userIsAdmin = isAdmin(req.user!);
    const teams = await prisma.team.findMany({
      where: userIsAdmin
        ? { leagueId: null }
        : {
            leagueId: null,
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          },
      include: {
        members: {
          select: {
            role: true,
            memberTag: true,
            user: { select: { id: true, displayName: true, steamId: true, position: true } },
          },
        },
        leagueTeams: {
          where: TEAM_LEAGUE_STATS_WHERE,
          select: { wins: true, losses: true, draws: true, points: true, roundsWon: true, roundsLost: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const steamIds = teams.flatMap((team) =>
      team.members.map((member) => member.user.steamId).filter((id): id is string => !!id?.trim())
    );
    const adrBySteam = await getAverageAdrBySteamIds(steamIds);

    res.json(
      teams.map((team) => {
        const stats = sumLeagueTeamStats(team.leagueTeams);
        return {
        id: team.id,
        name: team.name,
        tag: team.tag,
        logoUrl: publicUploadUrlForResponse(team.logoUrl),
        ownerId: team.ownerId,
        players: team.members.map((m) => {
          const steamKey = m.user.steamId?.trim().toLowerCase() ?? '';
          const adrSummary = steamKey ? adrBySteam.get(steamKey) : undefined;
          return {
          id: m.user.id,
          name: m.user.displayName,
          IGN: m.user.displayName,
          role: m.role,
          memberTag: m.memberTag,
          position: m.user.position,
          steamId: m.user.steamId,
          adr: adrSummary?.adr ?? null,
          matches: adrSummary?.matches ?? 0,
        };
        }),
        wins: stats.wins,
        losses: stats.losses,
        points: stats.points,
      };
      })
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

    const userId = req.user!.userId;
    const isMember = team.ownerId === userId
      || team.members.some((m) => m.userId === userId)
      || req.user!.role === 'ADMIN';

    if (!isMember) {
      res.status(403).json({ error: 'Sem permissão para acessar este time' });
      return;
    }

    res.json(formatTeam(team));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar time' });
  }
});

router.post('/', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const { name, tag, ownerAsMember } = req.body;
    if (!name || !tag) {
      res.status(400).json({ error: 'Nome e tag são obrigatórios' });
      return;
    }

    const joinAsMember = parseOwnerAsMember(ownerAsMember);

    const team = await prisma.team.create({
      data: {
        name,
        tag,
        ownerId: req.user!.userId,
        ...(joinAsMember
          ? {
              members: {
                create: { userId: req.user!.userId, role: 'CAPTAIN' },
              },
            }
          : {}),
      },
    });

    const full = await getTeamWithDetails(team.id);
    setAuditContext(req, audit.of('team.create', 'Team', team.id, {
      after: { name: team.name, tag: team.tag },
    }));
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
    const data: { name?: string; tag?: string } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.length > 100) {
        res.status(400).json({ error: 'Nome inválido' });
        return;
      }
      data.name = name.trim();
    }
    if (tag !== undefined) {
      if (typeof tag !== 'string' || !tag.trim() || tag.length > 10) {
        res.status(400).json({ error: 'Tag inválida' });
        return;
      }
      data.tag = tag.trim();
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      return;
    }

    await prisma.team.update({
      where: { id: req.params.id },
      data,
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.of('team.update', 'Team', req.params.id, {
      after: data,
    }));
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar time' });
  }
});

router.post('/:id/logo', authMiddleware, logoUpload.single('logo'), async (req: AuthRequest, res: Response) => {
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
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo de imagem é obrigatório' });
      return;
    }

    const logoUrl = encodeUploadedImageToDataUrl(req.file);
    deleteLegacyUploadFile(team.logoUrl);

    await prisma.team.update({
      where: { id: req.params.id },
      data: { logoUrl },
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.of('team.logo.upload', 'Team', req.params.id, {
      metadata: { fileName: req.file.originalname, size: req.file.size },
    }));
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar logo' });
  }
});

router.delete('/:id/logo', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    deleteLegacyUploadFile(team.logoUrl);
    await prisma.team.update({
      where: { id: req.params.id },
      data: { logoUrl: null },
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.of('team.logo.delete', 'Team', req.params.id));
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover logo' });
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

    const matchCount = await prisma.match.count({
      where: { OR: [{ team1Id: req.params.id }, { team2Id: req.params.id }] },
    });
    if (matchCount > 0) {
      res.status(400).json({
        error: 'Não é possível excluir um time com partidas registradas. Remova-o das ligas ou arquive as ligas primeiro.',
      });
      return;
    }

    await prisma.team.delete({ where: { id: req.params.id } });
    deleteLegacyUploadFile(team.logoUrl);
    setAuditContext(req, audit.of('team.delete', 'Team', req.params.id, {
      before: { name: team.name, tag: team.tag },
    }));
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
    if (!canManageTeamRoster(req.user!, team)) {
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

    setAuditContext(req, audit.withParent('team.invite.send', 'TeamInvite', invite.id, 'Team', req.params.id, {
      after: { invitedUserId: userId },
    }));
    res.status(201).json(invite);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar convite' });
  }
});

router.post('/:id/invites/:inviteId/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: 'REJECTED' },
    });

    setAuditContext(req, audit.withParent('team.invite.reject', 'TeamInvite', invite.id, 'Team', req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao rejeitar convite' });
  }
});

router.post('/:id/invites/:inviteId/accept', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
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
    setAuditContext(req, audit.withParent('team.invite.accept', 'TeamInvite', invite.id, 'Team', req.params.id, {
      after: { userId: invite.invitedUserId },
    }));
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

router.post('/:id/members', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (!canManageTeamRoster(req.user!, team)) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const { userId } = req.body;
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId é obrigatório' });
      return;
    }

    const role = parseMemberRole(req.body.role) ?? 'MEMBER';

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' });
      return;
    }

    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.id, userId } },
    });
    if (existingMember) {
      res.status(409).json({ error: 'Usuário já é membro do time' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (role === 'CAPTAIN') {
        await tx.teamMember.updateMany({
          where: { teamId: req.params.id, role: 'CAPTAIN' },
          data: { role: 'MEMBER' },
        });
      }
      await tx.teamMember.create({
        data: { teamId: req.params.id, userId, role },
      });
      await tx.teamInvite.updateMany({
        where: { teamId: req.params.id, invitedUserId: userId, status: 'PENDING' },
        data: { status: 'ACCEPTED' },
      });
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('team.member.add', 'TeamMember', userId, 'Team', req.params.id, {
      after: { userId, role },
    }));
    res.status(201).json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar jogador' });
  }
});

router.patch('/:id/members/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (!canManageTeamRoster(req.user!, team)) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const roleProvided = Object.prototype.hasOwnProperty.call(req.body, 'role');
    const memberTagProvided = Object.prototype.hasOwnProperty.call(req.body, 'memberTag');
    if (Object.prototype.hasOwnProperty.call(req.body, 'position')) {
      res.status(400).json({ error: 'A posição é definida pelo próprio jogador no perfil da conta.' });
      return;
    }
    if (!roleProvided && !memberTagProvided) {
      res.status(400).json({ error: 'Informe role e/ou memberTag' });
      return;
    }

    const role = roleProvided ? parseMemberRole(req.body.role) : undefined;
    if (roleProvided && !role) {
      res.status(400).json({ error: 'role deve ser CAPTAIN ou MEMBER' });
      return;
    }

    const memberTag = memberTagProvided ? parseMemberTag(req.body.memberTag) : undefined;
    if (memberTagProvided && memberTag === undefined) {
      res.status(400).json({ error: `memberTag deve ser texto de até ${MEMBER_TAG_MAX_LENGTH} caracteres ou null` });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.id, userId: req.params.userId } },
    });
    if (!member) {
      res.status(404).json({ error: 'Jogador não encontrado no time' });
      return;
    }

    const updateData: {
      role?: 'CAPTAIN' | 'MEMBER';
      memberTag?: string | null;
    } = {};
    if (role) updateData.role = role;
    if (memberTagProvided) updateData.memberTag = memberTag ?? null;

    await prisma.$transaction(async (tx) => {
      if (role === 'CAPTAIN') {
        await tx.teamMember.updateMany({
          where: { teamId: req.params.id, role: 'CAPTAIN', userId: { not: req.params.userId } },
          data: { role: 'MEMBER' },
        });
      }
      await tx.teamMember.update({
        where: { teamId_userId: { teamId: req.params.id, userId: req.params.userId } },
        data: updateData,
      });
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('team.member.update', 'TeamMember', req.params.userId, 'Team', req.params.id, {
      after: updateData,
    }));
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar jogador' });
  }
});

router.delete('/:id/members/:userId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id } });
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    if (!canManageTeamRoster(req.user!, team)) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: req.params.id, userId: req.params.userId } },
    });
    if (!member) {
      res.status(404).json({ error: 'Jogador não encontrado no time' });
      return;
    }

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: req.params.id, userId: req.params.userId } },
    });

    const full = await getTeamWithDetails(req.params.id);
    setAuditContext(req, audit.withParent('team.member.remove', 'TeamMember', req.params.userId, 'Team', req.params.id, {
      before: { role: member.role },
    }));
    res.json(formatTeam(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover jogador' });
  }
});

export default router;
