import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import { canUserAccessMatch } from '../lib/matchPermissions';
import { isValidMapId } from '../lib/cs2Maps';
import {
  getSeriesForMatch,
  getSeriesScheduledAt,
  reopenSeriesMapVeto,
  seriesBanMap,
  seriesPickMap,
} from '../lib/matchSeriesService';
import { buildVetoDeadlineInfo } from '../lib/mapVetoDeadline';
import { setAuditContext } from '../lib/audit';
import { audit } from '../lib/audit';

const router = Router();

async function assertSeriesCaptainOrAdmin(
  userId: string,
  role: string,
  series: { team1Id: string; team2Id: string; leagueId: string },
  leagueOwnerId: string
): Promise<{ ok: boolean; captainTeamIds: string[]; error?: string }> {
  if (role === 'ADMIN' || leagueOwnerId === userId) {
    return { ok: true, captainTeamIds: [series.team1Id, series.team2Id] };
  }
  const captains = await prisma.teamMember.findMany({
    where: {
      userId,
      teamId: { in: [series.team1Id, series.team2Id] },
      role: 'CAPTAIN',
    },
    select: { teamId: true },
  });
  if (captains.length === 0) {
    return { ok: false, captainTeamIds: [], error: 'Apenas capitães podem realizar esta ação.' };
  }
  return { ok: true, captainTeamIds: captains.map((c) => c.teamId) };
}

router.get('/:id/veto', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const series = await prisma.matchSeries.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { ownerId: true } } },
    });
    if (!series) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const firstMatch = await prisma.match.findFirst({
      where: { seriesId: series.id },
      orderBy: { seriesGameNumber: 'asc' },
      select: { id: true },
    });
    if (!firstMatch) {
      res.status(404).json({ error: 'Partidas da série não encontradas' });
      return;
    }

    const access = await canUserAccessMatch(req.user!.userId, req.user!.role, firstMatch.id);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const data = await getSeriesForMatch(firstMatch.id);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar veto da série' });
  }
});

router.post('/:id/veto/ban', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const series = await prisma.matchSeries.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { ownerId: true } } },
    });
    if (!series) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const perm = await assertSeriesCaptainOrAdmin(
      req.user!.userId,
      req.user!.role,
      series,
      series.league.ownerId
    );
    if (!perm.ok) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const mapId = String(req.body?.map ?? '').trim();
    if (!isValidMapId(mapId)) {
      res.status(400).json({ error: 'Mapa inválido' });
      return;
    }

    const actingTeamId = perm.captainTeamIds.find((id) => id === series.vetoTurnTeamId);
    if (!actingTeamId) {
      res.status(403).json({ error: 'Não é a vez do seu time banir.' });
      return;
    }

    const { series: view, error } = await seriesBanMap(series.id, actingTeamId, mapId, await getSeriesScheduledAt(series.id));
    if (error) {
      res.status(400).json({ error, series: view });
      return;
    }

    setAuditContext(req, audit.withParent('series.map_veto.ban', 'MatchSeries', series.id, 'League', series.leagueId, {
      after: { map: mapId, series: view },
    }));

    const full = await getSeriesForMatch(
      (await prisma.match.findFirst({
        where: { seriesId: series.id },
        orderBy: { seriesGameNumber: 'asc' },
        select: { id: true },
      }))!.id
    );
    res.json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao banir mapa na série' });
  }
});

router.post('/:id/veto/pick', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const series = await prisma.matchSeries.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { ownerId: true } } },
    });
    if (!series) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const perm = await assertSeriesCaptainOrAdmin(
      req.user!.userId,
      req.user!.role,
      series,
      series.league.ownerId
    );
    if (!perm.ok) {
      res.status(403).json({ error: perm.error });
      return;
    }

    const mapId = String(req.body?.map ?? '').trim();
    if (!isValidMapId(mapId)) {
      res.status(400).json({ error: 'Mapa inválido' });
      return;
    }

    const actingTeamId = perm.captainTeamIds.find((id) => id === series.vetoTurnTeamId);
    if (!actingTeamId) {
      res.status(403).json({ error: 'Não é a vez do seu time escolher mapa.' });
      return;
    }

    const { series: view, error } = await seriesPickMap(series.id, actingTeamId, mapId, await getSeriesScheduledAt(series.id));
    if (error) {
      res.status(400).json({ error, series: view });
      return;
    }

    setAuditContext(req, audit.withParent('series.map_veto.pick', 'MatchSeries', series.id, 'League', series.leagueId, {
      after: { map: mapId, series: view },
    }));

    const full = await getSeriesForMatch(
      (await prisma.match.findFirst({
        where: { seriesId: series.id },
        orderBy: { seriesGameNumber: 'asc' },
        select: { id: true },
      }))!.id
    );
    res.json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao escolher mapa na série' });
  }
});

router.post('/:id/veto/reopen', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Apenas administradores podem reabrir o veto de mapas.' });
      return;
    }

    const series = await prisma.matchSeries.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { ownerId: true, mapVetoEnabled: true } } },
    });
    if (!series) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }
    if (!series.league.mapVetoEnabled) {
      res.status(400).json({ error: 'Veto de mapas desativado nesta liga.' });
      return;
    }

    const scheduledAt = await getSeriesScheduledAt(series.id);
    const deadline = buildVetoDeadlineInfo(scheduledAt, series.vetoReopenedByAdmin);
    if (!deadline.deadlineExpired) {
      res.status(400).json({ error: 'O prazo de veto ainda não expirou.' });
      return;
    }

    const view = await reopenSeriesMapVeto(series.id);
    setAuditContext(req, audit.withParent('series.map_veto.reopen', 'MatchSeries', series.id, 'League', series.leagueId));

    const firstMatch = await prisma.match.findFirst({
      where: { seriesId: series.id },
      orderBy: { seriesGameNumber: 'asc' },
      select: { id: true },
    });
    const full = firstMatch ? await getSeriesForMatch(firstMatch.id) : { series: view, matches: [] };
    res.json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao reabrir veto da série.' });
  }
});

export default router;
