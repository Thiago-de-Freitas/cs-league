import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import {
  assignPlayerToSquad,
  balancePickupLeague,
  getPickupLeagueState,
  PICKUP_LEAGUE_FIXED_TEAM_COUNT,
  startPickupLeagueMatch,
  updatePickupSquads,
} from '../lib/pickupLeague';
import {
  isValidPickupPlayersPerTeam,
  parsePickupBalanceMode,
  parsePickupBalanceModesFromApi,
} from '../lib/pickupBalance';
import { setAuditContext, audit } from '../lib/audit';

const router = Router({ mergeParams: true });

async function assertPickupLeagueOwner(leagueId: string, userId: string, role: string) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return { error: 'Liga não encontrada', status: 404 as const, league: null };
  if (league.format !== 'ONE_VS_ONE') {
    return { error: 'Esta liga não usa o formato individual.', status: 400 as const, league: null };
  }
  if (league.ownerId !== userId && role !== 'ADMIN') {
    return { error: 'Sem permissão', status: 403 as const, league: null };
  }
  const matchCount = await prisma.match.count({ where: { leagueId } });
  if (matchCount > 0) {
    return { error: 'Não é possível alterar elenco após o torneio ter iniciado.', status: 400 as const, league: null };
  }
  return { error: null, status: 200 as const, league };
}

router.get('/:id/pickup', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }
    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    console.error('GET /api/leagues/:id/pickup', err);
    res.status(500).json({ error: 'Erro ao carregar elenco da liga.' });
  }
});

router.post('/:id/pickup/players', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const userId = String(req.body?.userId ?? '').trim();
    if (!userId) {
      res.status(400).json({ error: 'userId é obrigatório.' });
      return;
    }

    const teamIdRaw = req.body?.teamId;
    const teamId =
      teamIdRaw == null || teamIdRaw === '' ? null : String(teamIdRaw).trim();

    if (teamId) {
      const team = await prisma.team.findFirst({ where: { id: teamId, leagueId: req.params.id } });
      if (!team) {
        res.status(400).json({ error: 'Time inválido para esta liga.' });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const existing = await prisma.leaguePlayerEntry.findUnique({
      where: { leagueId_userId: { leagueId: req.params.id, userId } },
    });
    if (existing) {
      res.status(400).json({ error: 'Jogador já está na liga.' });
      return;
    }

    await prisma.leaguePlayerEntry.create({
      data: { leagueId: req.params.id, userId, teamId },
    });

    if (teamId) {
      await assignPlayerToSquad(req.params.id, userId, teamId);
    }

    setAuditContext(req, audit.withParent('league.pickup.player_add', 'LeaguePlayerEntry', userId, 'League', req.params.id));
    const state = await getPickupLeagueState(req.params.id);
    res.status(201).json(state);
  } catch (err) {
    console.error('POST /api/leagues/:id/pickup/players', err);
    res.status(500).json({ error: 'Erro ao adicionar jogador.' });
  }
});

router.delete('/:id/pickup/players/:userId', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const entry = await prisma.leaguePlayerEntry.findUnique({
      where: { leagueId_userId: { leagueId: req.params.id, userId: req.params.userId } },
    });
    if (!entry) {
      res.status(404).json({ error: 'Jogador não está na liga.' });
      return;
    }

    if (entry.teamId) {
      await assignPlayerToSquad(req.params.id, req.params.userId, null);
    }

    await prisma.leaguePlayerEntry.delete({ where: { id: entry.id } });

    setAuditContext(req, audit.withParent('league.pickup.player_remove', 'LeaguePlayerEntry', req.params.userId, 'League', req.params.id));
    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    console.error('DELETE /api/leagues/:id/pickup/players/:userId', err);
    res.status(500).json({ error: 'Erro ao remover jogador.' });
  }
});

router.patch('/:id/pickup/assign', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const userId = String(req.body?.userId ?? '').trim();
    const teamIdRaw = req.body?.teamId;
    const teamId = teamIdRaw == null || teamIdRaw === '' ? null : String(teamIdRaw);

    if (!userId) {
      res.status(400).json({ error: 'userId é obrigatório.' });
      return;
    }

    await assignPlayerToSquad(req.params.id, userId, teamId);

    setAuditContext(req, audit.withParent('league.pickup.assign', 'LeaguePlayerEntry', userId, 'League', req.params.id, {
      metadata: { teamId },
    }));
    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('não está') || msg.includes('não pertence')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('PATCH /api/leagues/:id/pickup/assign', err);
    res.status(500).json({ error: 'Erro ao mover jogador.' });
  }
});

router.post('/:id/pickup/balance', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const playersPerTeam = Number(req.body?.playersPerTeam ?? check.league.pickupPlayersPerTeam ?? 5);
    const balanceModes = parsePickupBalanceModesFromApi(
      req.body?.balanceModes ?? req.body?.balanceMode ?? check.league.pickupBalanceModes ?? check.league.pickupBalanceMode
    );

    if (!isValidPickupPlayersPerTeam(playersPerTeam)) {
      res.status(400).json({ error: 'Jogadores por time deve ser entre 1 e 5.' });
      return;
    }

    const playerCount = await prisma.leaguePlayerEntry.count({ where: { leagueId: req.params.id } });
    if (playerCount < PICKUP_LEAGUE_FIXED_TEAM_COUNT) {
      res.status(400).json({ error: 'Adicione mais jogadores antes de balancear os times.' });
      return;
    }

    await balancePickupLeague(req.params.id, check.league.ownerId, {
      playersPerTeam,
      balanceModes,
    });

    setAuditContext(req, audit.of('league.pickup.balance', 'League', req.params.id, {
      metadata: { teamCount: PICKUP_LEAGUE_FIXED_TEAM_COUNT, playersPerTeam, balanceModes },
    }));
    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    console.error('POST /api/leagues/:id/pickup/balance', err);
    res.status(500).json({ error: 'Erro ao balancear times.' });
  }
});

router.patch('/:id/pickup/settings', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const data: {
      pickupPlayersPerTeam?: number;
      pickupBalanceMode?: ReturnType<typeof parsePickupBalanceMode>;
      pickupBalanceModes?: ReturnType<typeof parsePickupBalanceModesFromApi>;
      pickupTeamCount?: number;
    } = {};

    if (req.body?.teamCount !== undefined) {
      const teamCount = Number(req.body.teamCount);
      if (teamCount !== PICKUP_LEAGUE_FIXED_TEAM_COUNT) {
        res.status(400).json({ error: 'Ligas individuais usam exatamente 2 times (1x1).' });
        return;
      }
    }
    if (req.body?.playersPerTeam !== undefined) {
      const playersPerTeam = Number(req.body.playersPerTeam);
      if (!isValidPickupPlayersPerTeam(playersPerTeam)) {
        res.status(400).json({ error: 'Jogadores por time deve ser entre 1 e 5.' });
        return;
      }
      data.pickupPlayersPerTeam = playersPerTeam;
    }
    if (req.body?.balanceModes !== undefined || req.body?.balanceMode !== undefined) {
      const balanceModes = parsePickupBalanceModesFromApi(req.body?.balanceModes ?? req.body?.balanceMode);
      data.pickupBalanceModes = balanceModes;
      data.pickupBalanceMode = balanceModes[0] ?? 'RATING';
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'Nenhuma configuração informada.' });
      return;
    }

    data.pickupTeamCount = PICKUP_LEAGUE_FIXED_TEAM_COUNT;

    await prisma.league.update({ where: { id: req.params.id }, data });

    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    console.error('PATCH /api/leagues/:id/pickup/settings', err);
    res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

router.patch('/:id/pickup/squads', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const squads = Array.isArray(req.body?.squads) ? req.body.squads : [];
    await updatePickupSquads(req.params.id, squads);

    setAuditContext(req, audit.of('league.pickup.squads_update', 'League', req.params.id, {
      metadata: { squads: squads.map((s: { id: string; name: string; tag: string }) => ({ id: s.id, name: s.name, tag: s.tag })) },
    }));
    const state = await getPickupLeagueState(req.params.id);
    res.json(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Time') || msg.includes('Informe')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('PATCH /api/leagues/:id/pickup/squads', err);
    res.status(500).json({ error: 'Erro ao salvar times da liga.' });
  }
});

router.post('/:id/pickup/start', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const check = await assertPickupLeagueOwner(req.params.id, req.user!.userId, req.user!.role);
    if (!check.league) {
      res.status(check.status).json({ error: check.error });
      return;
    }

    const result = await startPickupLeagueMatch(req.params.id);

    setAuditContext(req, audit.of('league.pickup.start', 'League', req.params.id, {
      metadata: result,
    }));
    const state = await getPickupLeagueState(req.params.id);
    res.status(201).json({ ...result, state });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('jogador') || msg.includes('confronto') || msg.includes('times')) {
      res.status(400).json({ error: msg });
      return;
    }
    console.error('POST /api/leagues/:id/pickup/start', err);
    res.status(500).json({ error: 'Erro ao iniciar confronto.' });
  }
});

export default router;
