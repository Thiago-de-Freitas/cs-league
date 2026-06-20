import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  ALLOWED_BRACKET_SIZES,
  getFirstRoundPairings,
  isValidBracketSize,
  rankTeamsForSeeding,
} from '../lib/bracket';
import { advanceBracketFromRound } from '../lib/bracketAdvance';

const router = Router();

async function getMatchIdsWithGeneralDemo(leagueId: string): Promise<Set<string>> {
  const demos = await prisma.demo.findMany({
    where: {
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      match: { leagueId },
    },
    select: { matchId: true },
  });
  return new Set(demos.map((d) => d.matchId).filter((id): id is string => !!id));
}

async function getLeagueWithDetails(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      owner: { select: { id: true, displayName: true } },
      teams: {
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, displayName: true, steamId: true } },
                },
              },
            },
          },
        },
        orderBy: [{ seed: 'asc' }, { points: 'desc' }, { wins: 'desc' }],
      },
      matches: {
        include: {
          team1: { select: { id: true, name: true, tag: true } },
          team2: { select: { id: true, name: true, tag: true } },
          winner: { select: { id: true, name: true, tag: true } },
        },
        orderBy: [{ round: 'asc' }, { bracketPosition: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

function formatLeague(
  league: NonNullable<Awaited<ReturnType<typeof getLeagueWithDetails>>>,
  matchIdsWithDemo: Set<string> = new Set()
) {
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    status: league.status.toLowerCase(),
    maxTeams: league.maxTeams,
    ownerId: league.ownerId,
    owner: league.owner,
    startDate: league.startDate,
    endDate: league.endDate,
    teams: league.teams.map((lt) => ({
      id: lt.team.id,
      name: lt.team.name,
      tag: lt.team.tag,
      logoUrl: lt.team.logoUrl,
      ownerId: lt.team.ownerId,
      wins: lt.wins,
      losses: lt.losses,
      points: lt.points,
      seed: lt.seed,
      players: lt.team.members.map((m) => ({
        id: m.user.id,
        name: m.user.displayName,
        IGN: m.user.displayName,
        role: m.role,
      })),
    })),
    matches: league.matches.map((m) => ({
      id: m.id,
      leagueId: m.leagueId,
      team1: m.team1,
      team2: m.team2,
      winner: m.winner,
      winnerId: m.winnerId,
      status: m.status.toLowerCase(),
      round: m.round,
      bracketPosition: m.bracketPosition,
      map: m.map,
      playedAt: m.playedAt,
      hasGeneralDemo: matchIdsWithDemo.has(m.id),
    })),
    createdAt: league.createdAt,
  };
}

async function assertLeagueOwner(leagueId: string, userId: string, role: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return { error: 'Liga não encontrada', status: 404 as const, league: null };
  if (league.ownerId !== userId && role !== 'ADMIN') {
    return { error: 'Sem permissão', status: 403 as const, league: null };
  }
  return { error: null, status: 200 as const, league };
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const includeArchived = req.query.includeArchived === 'true';
    const leagues = await prisma.league.findMany({
      where: {
        AND: [
          {
            OR: [
              { ownerId: userId },
              { teams: { some: { team: { members: { some: { userId } } } } } },
            ],
          },
          ...(includeArchived ? [] : [{ status: { not: 'ARCHIVED' as const } }]),
        ],
      },
      include: {
        teams: { include: { team: true } },
        _count: { select: { matches: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      leagues.map((l) => ({
        id: l.id,
        name: l.name,
        description: l.description,
        status: l.status.toLowerCase(),
        maxTeams: l.maxTeams,
        ownerId: l.ownerId,
        startDate: l.startDate,
        endDate: l.endDate,
        teamCount: l.teams.length,
        matchCount: l._count.matches,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar ligas' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const league = await getLeagueWithDetails(req.params.id);
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }
    const matchIdsWithDemo = await getMatchIdsWithGeneralDemo(req.params.id);
    res.json(formatLeague(league, matchIdsWithDemo));
  } catch (err) {
    console.error('GET /api/leagues/:id', err);
    res.status(500).json({ error: 'Erro ao buscar liga' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, description, startDate, endDate, status, maxTeams } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Nome é obrigatório' });
      return;
    }

    const bracketSize = maxTeams ?? 8;
    if (!isValidBracketSize(bracketSize)) {
      res.status(400).json({
        error: `Quantidade de times inválida. Use: ${ALLOWED_BRACKET_SIZES.join(', ')}`,
      });
      return;
    }

    const league = await prisma.league.create({
      data: {
        name,
        description: description || '',
        maxTeams: bracketSize,
        ownerId: req.user!.userId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status?.toUpperCase() || 'UPCOMING',
      },
    });

    const full = await getLeagueWithDetails(league.id);
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar liga' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { name, description, startDate, endDate, status, maxTeams } = req.body;

    if (maxTeams !== undefined) {
      if (!isValidBracketSize(maxTeams)) {
        res.status(400).json({
          error: `Quantidade de times inválida. Use: ${ALLOWED_BRACKET_SIZES.join(', ')}`,
        });
        return;
      }
      const teamCount = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });
      if (teamCount > maxTeams) {
        res.status(400).json({
          error: `Não é possível reduzir para ${maxTeams} times. A liga já tem ${teamCount} times.`,
        });
        return;
      }
    }

    await prisma.league.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(status && { status: status.toUpperCase() }),
        ...(maxTeams !== undefined && { maxTeams }),
      },
    });

    const full = await getLeagueWithDetails(req.params.id);
    res.json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar liga' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    await prisma.league.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir liga' });
  }
});

router.post('/:id/archive', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.status === 'ARCHIVED') {
      res.status(400).json({ error: 'Liga já está arquivada' });
      return;
    }

    const matches = await prisma.match.findMany({ where: { leagueId: req.params.id } });
    if (matches.length === 0) {
      res.status(400).json({ error: 'A liga não possui partidas para arquivar' });
      return;
    }
    if (!matches.every((m) => m.status === 'COMPLETED')) {
      res.status(400).json({ error: 'Todas as partidas devem estar finalizadas para arquivar a liga' });
      return;
    }

    await prisma.$executeRaw`
      UPDATE "League"
      SET status = 'ARCHIVED'::"LeagueStatus", "updatedAt" = NOW()
      WHERE id = ${req.params.id}
    `;

    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    res.json({
      id: league.id,
      status: league.status.toLowerCase(),
      message: 'Liga arquivada com sucesso',
    });
  } catch (err) {
    console.error('POST /api/leagues/:id/archive', err);
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('ARCHIVED') || msg.includes('LeagueStatus')) {
      res.status(500).json({
        error: 'Status ARCHIVED indisponível. Execute as migrations e reinicie o servidor da API.',
      });
      return;
    }
    res.status(500).json({ error: 'Erro ao arquivar liga' });
  }
});

router.post('/:id/unarchive', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    if (check.league.status !== 'ARCHIVED') {
      res.status(400).json({ error: 'Esta liga não está arquivada' });
      return;
    }

    await prisma.$executeRaw`
      UPDATE "League"
      SET status = 'COMPLETED'::"LeagueStatus", "updatedAt" = NOW()
      WHERE id = ${req.params.id}
    `;

    const league = await prisma.league.findUnique({ where: { id: req.params.id } });
    if (!league) {
      res.status(404).json({ error: 'Liga não encontrada' });
      return;
    }

    res.json({
      id: league.id,
      status: league.status.toLowerCase(),
      message: 'Liga desarquivada com sucesso',
    });
  } catch (err) {
    console.error('POST /api/leagues/:id/unarchive', err);
    res.status(500).json({ error: 'Erro ao desarquivar liga' });
  }
});

router.post('/:id/teams/bulk', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { teamIds } = req.body as { teamIds: string[] };
    if (!teamIds?.length) {
      res.status(400).json({ error: 'Lista de teamIds é obrigatória' });
      return;
    }

    const uniqueIds = [...new Set(teamIds)];
    let count = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });
    const maxTeams = check.league.maxTeams;

    for (const teamId of uniqueIds) {
      if (count >= maxTeams) break;
      const exists = await prisma.leagueTeam.findUnique({
        where: { leagueId_teamId: { leagueId: req.params.id, teamId } },
      });
      if (exists) continue;
      await prisma.leagueTeam.create({
        data: { leagueId: req.params.id, teamId, seed: count + 1 },
      });
      count++;
    }

    const full = await getLeagueWithDetails(req.params.id);
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar times à liga' });
  }
});

router.post('/:id/teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { teamId, seed } = req.body;
    if (!teamId) {
      res.status(400).json({ error: 'teamId é obrigatório' });
      return;
    }

    const count = await prisma.leagueTeam.count({ where: { leagueId: req.params.id } });
    if (count >= check.league.maxTeams) {
      res.status(400).json({
        error: `Limite de ${check.league.maxTeams} times atingido. Ajuste o limite ou remova um time.`,
      });
      return;
    }

    await prisma.leagueTeam.create({
      data: {
        leagueId: req.params.id,
        teamId,
        seed: seed ?? count + 1,
      },
    });

    const full = await getLeagueWithDetails(req.params.id);
    res.status(201).json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar time à liga' });
  }
});

router.delete('/:id/teams/:teamId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const deleted = await prisma.leagueTeam.deleteMany({
      where: { leagueId: req.params.id, teamId: req.params.teamId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: 'Time não encontrado na liga' });
      return;
    }

    const full = await getLeagueWithDetails(req.params.id);
    res.json(formatLeague(full!));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover time da liga' });
  }
});

router.get('/:id/available-teams', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const inLeague = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const excludeIds = inLeague.map((lt) => lt.teamId);

    const teams = await prisma.team.findMany({
      where: excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {},
      select: { id: true, name: true, tag: true },
      orderBy: { name: 'asc' },
    });

    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar times disponíveis' });
  }
});

router.get('/:id/standings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const standings = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, tag: true } } },
      orderBy: [{ points: 'desc' }, { wins: 'desc' }],
    });
    res.json(standings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar classificação' });
  }
});

router.post('/:id/bracket/generate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      include: { team: { select: { id: true, name: true, tag: true } } },
    });

    if (leagueTeams.length < 2) {
      res.status(400).json({ error: 'Adicione pelo menos 2 times para gerar o chaveamento' });
      return;
    }

    const ranked = rankTeamsForSeeding(leagueTeams);

    await prisma.$transaction([
      ...ranked.map((lt, index) =>
        prisma.leagueTeam.update({
          where: { id: lt.id },
          data: { seed: index + 1 },
        })
      ),
      prisma.match.deleteMany({ where: { leagueId: req.params.id } }),
    ]);

    const bracketSize = check.league.maxTeams;
    const pairings = getFirstRoundPairings(bracketSize);
    const seedToTeam = new Map<number, (typeof ranked)[0]>();
    ranked.forEach((lt, i) => seedToTeam.set(i + 1, lt));

    const matchCreates: Parameters<typeof prisma.match.create>[0][] = [];
    const walkoverWinners = new Map<number, string>();
    let walkovers = 0;

    pairings.forEach(([seedA, seedB], position) => {
      const pos = position + 1;
      const teamA = seedToTeam.get(seedA);
      const teamB = seedToTeam.get(seedB);

      if (!teamA && !teamB) return;

      if (teamA && !teamB) {
        walkoverWinners.set(pos, teamA.teamId);
        walkovers++;
        return;
      }
      if (!teamA && teamB) {
        walkoverWinners.set(pos, teamB.teamId);
        walkovers++;
        return;
      }

      if (teamA && teamB) {
        matchCreates.push({
          data: {
            leagueId: req.params.id,
            team1Id: teamA.teamId,
            team2Id: teamB.teamId,
            round: 1,
            bracketPosition: pos,
            status: 'SCHEDULED',
          },
        });
      }
    });

    let advancedMatches = 0;
    await prisma.$transaction(async (tx) => {
      if (matchCreates.length > 0) {
        for (const data of matchCreates) {
          await tx.match.create(data);
        }
      }
      advancedMatches = await advanceBracketFromRound(
        tx,
        req.params.id,
        1,
        bracketSize,
        walkoverWinners
      );
      await tx.league.update({
        where: { id: req.params.id },
        data: { status: 'ONGOING' },
      });
    });

    const full = await getLeagueWithDetails(req.params.id);
    res.json({
      ...formatLeague(full!),
      bracketInfo: {
        bracketSize,
        round1Matches: matchCreates.length,
        walkovers,
        advancedMatches,
        seedingBy: ranked.some((t) => t.wins + t.losses > 0) ? 'record' : 'manual',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar chaveamento' });
  }
});

router.post('/:id/matches', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { team1Id, team2Id, map, round, bracketPosition } = req.body;
    if (!team1Id || !team2Id) {
      res.status(400).json({ error: 'team1Id e team2Id são obrigatórios' });
      return;
    }
    if (team1Id === team2Id) {
      res.status(400).json({ error: 'Times devem ser diferentes' });
      return;
    }

    const bracketMatchCount = await prisma.match.count({
      where: { leagueId: req.params.id, round: { gt: 0 } },
    });
    if (bracketMatchCount === 0) {
      res.status(400).json({
        error: 'Gere o chaveamento antes de criar partidas. Apenas times da liga podem ser usados.',
      });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const bracketTeamIds = new Set(leagueTeams.map((lt) => lt.teamId));
    if (!bracketTeamIds.has(team1Id) || !bracketTeamIds.has(team2Id)) {
      res.status(400).json({ error: 'Ambos os times devem estar chaveados na liga.' });
      return;
    }

    const match = await prisma.match.create({
      data: {
        leagueId: req.params.id,
        team1Id,
        team2Id,
        map: map || null,
        round: round ?? 1,
        bracketPosition: bracketPosition ?? null,
        status: 'SCHEDULED',
      },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
      },
    });

    res.status(201).json({
      id: match.id,
      leagueId: match.leagueId,
      team1: match.team1,
      team2: match.team2,
      status: match.status.toLowerCase(),
      round: match.round,
      bracketPosition: match.bracketPosition,
      map: match.map,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar partida' });
  }
});

router.put('/:id/teams/order', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const { teams } = req.body as { teams: { teamId: string; seed: number }[] };
    if (!teams?.length) {
      res.status(400).json({ error: 'Lista de times é obrigatória' });
      return;
    }

    const existingMatches = await prisma.match.count({ where: { leagueId: req.params.id } });
    if (existingMatches > 0) {
      res.status(400).json({
        error: 'Não é possível alterar os seeds após o chaveamento ser gerado.',
      });
      return;
    }

    const leagueTeams = await prisma.leagueTeam.findMany({
      where: { leagueId: req.params.id },
      select: { teamId: true },
    });
    const leagueTeamIds = new Set(leagueTeams.map((lt) => lt.teamId));
    for (const t of teams) {
      if (!leagueTeamIds.has(t.teamId)) {
        res.status(400).json({ error: 'Time não pertence a esta liga.' });
        return;
      }
    }

    await prisma.$transaction(
      teams.map((t) =>
        prisma.leagueTeam.updateMany({
          where: { leagueId: req.params.id, teamId: t.teamId },
          data: { seed: t.seed },
        })
      )
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar ordem dos times' });
  }
});

export default router;
