import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { advanceBracketFromRound } from '../lib/bracketAdvance';
import { resolveBracketSize } from '../lib/bracket';
import { tryCompleteLeague } from '../lib/leagueComplete';
import { areAllGroupMatchesComplete } from '../lib/groupStage';
import { aggregateMatchStats } from '../lib/matchStats';
import type { MatchPlayerStat } from '@prisma/client';
import { canUserAccessMatch, canUserRegisterMatchResult, canUserEditMatchStats } from '../lib/matchPermissions';
import {
  calcPlayerAdr,
  parseManualPlayerStats,
  resolveTotalRounds,
} from '../lib/manualMatchStats';
import { syncLeagueEndDate } from '../lib/applyLeagueSchedule';
import {
  getStatDeltasForTeams,
  getRoundsOnlyStatDeltas,
  getPlayoffSeriesWinStatDeltas,
  parseMatchRounds,
  resolveMatchOutcome,
} from '../lib/matchResult';
import { auditResponseMiddleware } from '../middleware/auditResponse';
import { audit, recordAuditInTransaction, setAuditContext, skipAudit } from '../lib/audit';
import { registerMatchExtras } from './matchExtras';
import { ensureMatchMapVeto } from '../lib/mapVetoService';
import { getMapLabel } from '../lib/cs2Maps';
import { getSeriesForMatch, advanceSeriesAfterMapWin } from '../lib/matchSeriesService';

const router = Router();
router.use(auditResponseMiddleware);

type Tx = Prisma.TransactionClient;

async function loadMatchRoster(team1Id: string, team2Id: string) {
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: [team1Id, team2Id] } },
    include: {
      user: { select: { id: true, displayName: true, steamId: true } },
    },
    orderBy: { role: 'asc' },
  });

  const mapTeam = (teamId: string) =>
    members
      .filter((m) => m.teamId === teamId)
      .map((m) => ({
        userId: m.user.id,
        playerName: m.user.displayName,
        steamId: m.user.steamId,
        teamId: m.teamId,
      }));

  return {
    team1: mapTeam(team1Id),
    team2: mapTeam(team2Id),
  };
}

function formatMatchDemos(demos: Array<{
  id: string;
  fileName: string | null;
  status: string;
  isPersonal: boolean;
  isManual: boolean;
  errorMessage: string | null;
  stats: MatchPlayerStat[];
  createdAt: Date;
}>) {
  return demos.map((d) => ({
    id: d.id,
    fileName: d.isManual ? 'Stats manuais' : (d.fileName || 'demo.dem'),
    status: d.status.toLowerCase(),
    isPersonal: d.isPersonal,
    isManual: d.isManual,
    errorMessage: d.errorMessage,
    stats: d.stats,
    createdAt: d.createdAt,
  }));
}

function formatMatchResponse(
  match: {
    id: string;
    leagueId: string;
    league: { id: string; name: string; ownerId: string; maxTeams: number | null; bracketSize: number | null };
    team1: { id: string; name: string; tag: string };
    team2: { id: string; name: string; tag: string };
    winner: { id: string; name: string; tag: string } | null;
    winnerId: string | null;
    status: string;
    phase: string;
    groupId: string | null;
    groupRound: number | null;
    round: number;
    bracketPosition: number | null;
    map: string | null;
    team1Rounds: number | null;
    team2Rounds: number | null;
    team1StartingSide?: string | null;
    team2StartingSide?: string | null;
    seriesId?: string | null;
    seriesGameNumber?: number | null;
    scheduledAt: Date | null;
    playedAt: Date | null;
  },
  demos: Array<{
    id: string;
    fileName: string | null;
    status: string;
    isPersonal: boolean;
    isManual: boolean;
    errorMessage: string | null;
    stats: MatchPlayerStat[];
    createdAt: Date;
  }>,
  permissions: {
    canRegisterResult: boolean;
    canEditManualStats: boolean;
    captainTeamIds?: string[];
  },
  roster?: Awaited<ReturnType<typeof loadMatchRoster>>,
  extras?: {
    mapVeto?: unknown;
    mapVetoEnabled?: boolean;
    lineup?: unknown[];
    images?: unknown[];
    highlights?: unknown[];
    series?: unknown;
    seriesGameNumber?: number | null;
  }
) {
  const hasFileDemo = demos.some(
    (d) => !d.isManual && ['PENDING', 'PROCESSING', 'COMPLETED'].includes(d.status.toUpperCase())
  );
  const manualDemo = demos.find((d) => d.isManual) ?? null;

  return {
    id: match.id,
    leagueId: match.leagueId,
    league: match.league,
    team1: match.team1,
    team2: match.team2,
    winner: match.winner,
    winnerId: match.winnerId,
    status: match.status.toLowerCase(),
    phase: match.phase.toLowerCase(),
    groupId: match.groupId,
    groupRound: match.groupRound,
    round: match.round,
    bracketPosition: match.bracketPosition,
    map: match.map,
    mapLabel: match.map ? getMapLabel(match.map) : null,
    team1StartingSide: match.team1StartingSide?.toLowerCase() ?? null,
    team2StartingSide: match.team2StartingSide?.toLowerCase() ?? null,
    team1Rounds: match.team1Rounds,
    team2Rounds: match.team2Rounds,
    scheduledAt: match.scheduledAt,
    playedAt: match.playedAt,
    demos: formatMatchDemos(demos),
    aggregatedStats: aggregateMatchStats(demos),
    roster,
    hasFileDemo,
    manualDemoId: manualDemo?.id ?? null,
    permissions,
    mapVeto: extras?.mapVeto ?? null,
    mapVetoEnabled: extras?.mapVetoEnabled ?? false,
    lineup: extras?.lineup ?? [],
    images: extras?.images ?? [],
    highlights: extras?.highlights ?? [],
    series: extras?.series ?? null,
    seriesGameNumber: match.seriesGameNumber ?? null,
  };
}

async function tryAdvanceBracket(
  tx: Tx,
  match: {
    id: string;
    leagueId: string;
    phase: string;
    round: number;
    bracketPosition: number | null;
    winnerId: string | null;
  },
  maxTeams: number
): Promise<void> {
  if (match.phase !== 'PLAYOFF') return;
  if (!match.bracketPosition || !match.winnerId) return;
  await advanceBracketFromRound(tx, match.leagueId, match.round, maxTeams);
}

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
        league: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            maxTeams: true,
            bracketSize: true,
            format: true,
            mapPool: true,
            mapVetoEnabled: true,
            seriesFormat: true,
          },
        },
        lineup: true,
        images: { orderBy: { createdAt: 'desc' } },
        highlights: { orderBy: [{ score: 'desc' }, { round: 'asc' }] },
        mapVeto: true,
        demos: {
          where: { isPersonal: false },
          include: { stats: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const access = await canUserAccessMatch(req.user!.userId, req.user!.role, match.id);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const resultAccess = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);
    const statsAccess = await canUserEditMatchStats(req.user!.userId, req.user!.role, match.id);
    const captainTeamIds =
      req.user!.role === 'ADMIN' || match.league.ownerId === req.user!.userId
        ? [match.team1Id, match.team2Id]
        : (
            await prisma.teamMember.findMany({
              where: {
                userId: req.user!.userId,
                teamId: { in: [match.team1Id, match.team2Id] },
                role: 'CAPTAIN',
              },
              select: { teamId: true },
            })
          ).map((m) => m.teamId);
    const roster = statsAccess.allowed
      ? await loadMatchRoster(match.team1Id, match.team2Id)
      : undefined;

    const seriesData = match.seriesId ? await getSeriesForMatch(match.id) : null;

    let mapVeto = null;
    if (match.league.mapVetoEnabled) {
      const isBo3Series = seriesData?.series?.format === 'bo3';
      const seriesVetoReady =
        !isBo3Series ||
        seriesData?.series?.vetoStatus === 'maps_assigned' ||
        seriesData?.series?.vetoStatus === 'completed';

      if (seriesVetoReady) {
        if (isBo3Series) {
          const existingVeto = await prisma.matchMapVeto.findUnique({ where: { matchId: match.id } });
          if (existingVeto) {
            mapVeto = await ensureMatchMapVeto(match);
          }
        } else {
          mapVeto = await ensureMatchMapVeto(match);
        }
      }
    }

    const lineupUsers = match.lineup.length
      ? await prisma.user.findMany({
          where: { id: { in: match.lineup.map((l) => l.userId) } },
          select: { id: true, displayName: true, steamId: true },
        })
      : [];
    const userById = new Map(lineupUsers.map((u) => [u.id, u]));

    res.json(
      formatMatchResponse(
        match,
        match.demos,
        {
          canRegisterResult: resultAccess.allowed && match.status !== 'COMPLETED',
          canEditManualStats: statsAccess.allowed,
          captainTeamIds,
        },
        roster,
        {
          mapVeto,
          mapVetoEnabled: match.league.mapVetoEnabled,
          lineup: match.lineup.map((l) => ({
            teamId: l.teamId,
            userId: l.userId,
            playerName: userById.get(l.userId)?.displayName ?? 'Jogador',
            steamId: userById.get(l.userId)?.steamId ?? null,
          })),
          images: match.images,
          highlights: match.highlights,
          series: seriesData,
        }
      )
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar partida' });
  }
});

router.put('/:id/manual-stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const permission = await canUserEditMatchStats(req.user!.userId, req.user!.role, req.params.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.error || 'Sem permissão' });
      return;
    }

    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
        league: { select: { id: true, name: true, ownerId: true, maxTeams: true, bracketSize: true } },
        demos: {
          where: { isPersonal: false },
          include: { stats: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const fileDemo = match.demos.find(
      (d) => !d.isManual && ['PENDING', 'PROCESSING', 'COMPLETED'].includes(d.status)
    );
    if (fileDemo) {
      res.status(400).json({
        error: 'Esta partida já possui uma demo. Use as estatísticas extraídas do arquivo .dem.',
      });
      return;
    }

    const parsedPlayers = parseManualPlayerStats(req.body?.players, [match.team1Id, match.team2Id]);
    if ('error' in parsedPlayers) {
      res.status(400).json({ error: parsedPlayers.error });
      return;
    }

    const totalRounds = resolveTotalRounds(
      match.team1Rounds,
      match.team2Rounds,
      req.body?.totalRounds
    );
    if (!totalRounds) {
      res.status(400).json({
        error: 'Informe o placar da partida ou o total de rounds para calcular o ADR.',
      });
      return;
    }

    const existingManual = match.demos.find((d) => d.isManual);

    await prisma.$transaction(async (tx) => {
      const demo = existingManual
        ? await tx.demo.update({
            where: { id: existingManual.id },
            data: { status: 'COMPLETED', errorMessage: null },
          })
        : await tx.demo.create({
            data: {
              matchId: match.id,
              uploadedById: req.user!.userId,
              isPersonal: false,
              isManual: true,
              status: 'COMPLETED',
              filePath: null,
              fileName: null,
            },
          });

      await tx.matchPlayerStat.deleteMany({ where: { demoId: demo.id } });
      await tx.matchPlayerStat.createMany({
        data: parsedPlayers.players.map((player) => ({
          demoId: demo.id,
          teamId: player.teamId,
          steamId: player.steamId,
          playerName: player.playerName,
          kills: player.kills,
          deaths: player.deaths,
          assists: player.assists,
          damage: player.damage,
          adr: calcPlayerAdr(player.damage, totalRounds),
          hsPercent: player.hsPercent,
          kast: 0,
        })),
      });
    });

    const updated = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
        league: { select: { id: true, name: true, ownerId: true, maxTeams: true, bracketSize: true } },
        demos: {
          where: { isPersonal: false },
          include: { stats: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!updated) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const statsAccess = await canUserEditMatchStats(req.user!.userId, req.user!.role, match.id);
    const roster = statsAccess.allowed
      ? await loadMatchRoster(updated.team1Id, updated.team2Id)
      : undefined;
    const resultAccess = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);

    setAuditContext(req, audit.withParent('match.manual_stats.save', 'Match', match.id, 'League', match.leagueId, {
      metadata: { playerCount: parsedPlayers.players.length, totalRounds },
    }));
    res.json(
      formatMatchResponse(
        updated,
        updated.demos,
        {
          canRegisterResult: resultAccess.allowed && updated.status !== 'COMPLETED',
          canEditManualStats: statsAccess.allowed,
        },
        roster
      )
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar estatísticas manuais' });
  }
});

router.patch('/:id/result', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        league: { select: { maxTeams: true, bracketSize: true, seriesFormat: true } },
        series: { select: { format: true } },
      },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }
    const permission = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.error || 'Sem permissão' });
      return;
    }
    if (match.status === 'COMPLETED') {
      res.status(400).json({ error: 'Resultado já registrado para esta partida' });
      return;
    }

    const { winnerId: winnerIdFromBody, map, playedAt, team1Rounds, team2Rounds } = req.body;

    const rounds = parseMatchRounds(team1Rounds, team2Rounds);
    if ('error' in rounds) {
      res.status(400).json({ error: rounds.error });
      return;
    }

    const outcome = resolveMatchOutcome(
      match.team1Id,
      match.team2Id,
      rounds.team1Rounds,
      rounds.team2Rounds,
      match.phase,
      winnerIdFromBody
    );
    if ('error' in outcome) {
      res.status(400).json({ error: outcome.error });
      return;
    }

    const winnerId = outcome.winnerId;
    const isBo3Map =
      !!match.seriesId && (match.series?.format === 'BO3' || match.league.seriesFormat === 'BO3');

    const statDeltas = isBo3Map
      ? getRoundsOnlyStatDeltas(match.team1Id, match.team2Id, rounds.team1Rounds, rounds.team2Rounds)
      : getStatDeltasForTeams(
          match.team1Id,
          match.team2Id,
          rounds.team1Rounds,
          rounds.team2Rounds,
          outcome
        );

    let groupPhaseJustCompleted = false;
    const bracketSize = resolveBracketSize(
      await prisma.leagueTeam.count({ where: { leagueId: match.leagueId } }),
      match.league.bracketSize
    );

    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: req.params.id },
        data: {
          winnerId,
          team1Rounds: rounds.team1Rounds,
          team2Rounds: rounds.team2Rounds,
          status: 'COMPLETED',
          ...(map && { map }),
          playedAt: playedAt ? new Date(playedAt) : new Date(),
        },
      });

      for (const [teamId, delta] of statDeltas) {
        await tx.leagueTeam.updateMany({
          where: { leagueId: match.leagueId, teamId },
          data: {
            wins: { increment: delta.wins },
            losses: { increment: delta.losses },
            draws: { increment: delta.draws },
            points: { increment: delta.points },
            roundsWon: { increment: delta.roundsWon },
            roundsLost: { increment: delta.roundsLost },
          },
        });
      }

      if (match.phase === 'GROUP') {
        const groupMatches = await tx.match.findMany({
          where: { leagueId: match.leagueId, phase: 'GROUP' },
        });
        if (areAllGroupMatchesComplete(groupMatches)) {
          const existingPlayoffs = await tx.match.count({
            where: { leagueId: match.leagueId, phase: 'PLAYOFF', round: { gt: 0 } },
          });
          if (existingPlayoffs === 0) {
            groupPhaseJustCompleted = true;
          }
        }
      }

      if (!isBo3Map) {
        await tryAdvanceBracket(
          tx,
          { ...match, winnerId },
          bracketSize
        );
      }

      await tryCompleteLeague(tx, match.leagueId);

      await recordAuditInTransaction(
        tx,
        audit.withParent('match.result.register', 'Match', req.params.id, 'League', match.leagueId, {
          after: {
            winnerId,
            team1Rounds: rounds.team1Rounds,
            team2Rounds: rounds.team2Rounds,
            status: 'COMPLETED',
          },
        }),
        { req }
      );
    });

    if (match.seriesId && winnerId) {
      const seriesResult = await advanceSeriesAfterMapWin(match.seriesId, winnerId);
      if (seriesResult.completed && seriesResult.winnerId) {
        await prisma.$transaction(async (tx) => {
          const seriesWinDeltas = getPlayoffSeriesWinStatDeltas(
            match.team1Id,
            match.team2Id,
            seriesResult.winnerId!
          );
          for (const [teamId, delta] of seriesWinDeltas) {
            await tx.leagueTeam.updateMany({
              where: { leagueId: match.leagueId, teamId },
              data: {
                wins: { increment: delta.wins },
                losses: { increment: delta.losses },
                points: { increment: delta.points },
              },
            });
          }

          await tryAdvanceBracket(
            tx,
            {
              id: match.id,
              leagueId: match.leagueId,
              phase: match.phase,
              round: match.round,
              bracketPosition: match.bracketPosition,
              winnerId: seriesResult.winnerId,
            },
            bracketSize
          );

          await tryCompleteLeague(tx, match.leagueId);
        });
      }
    }

    const updated = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
      },
    });

    skipAudit(req);
    res.json({ ...updated, groupPhaseJustCompleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar resultado' });
  }
});

router.patch('/:id/schedule', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { id: true, ownerId: true } } },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const isOwner =
      match.league.ownerId === req.user!.userId || req.user!.role === 'ADMIN';
    if (!isOwner) {
      res.status(403).json({ error: 'Sem permissão' });
      return;
    }

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      res.status(400).json({ error: 'Não é possível remarcar partida finalizada ou cancelada.' });
      return;
    }

    const { scheduledAt } = req.body;
    if (!scheduledAt) {
      res.status(400).json({ error: 'scheduledAt é obrigatório' });
      return;
    }

    const parsed = new Date(scheduledAt);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'Data/horário inválido' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: req.params.id },
        data: { scheduledAt: parsed },
      });
      await syncLeagueEndDate(tx, match.leagueId);
    });

    const updated = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
      },
    });

    setAuditContext(req, audit.withParent('match.schedule.update', 'Match', req.params.id, 'League', match.leagueId, {
      after: { scheduledAt: parsed },
    }));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remarcar partida' });
  }
});

registerMatchExtras(router);

export default router;
