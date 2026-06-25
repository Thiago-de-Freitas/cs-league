import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { advanceBracketFromRound } from '../lib/bracketAdvance';
import { resolveBracketSize } from '../lib/bracket';
import { tryCompleteLeague } from '../lib/leagueComplete';
import { areAllGroupMatchesComplete } from '../lib/groupStage';
import { aggregateMatchStats } from '../lib/matchStats';
import { canUserAccessMatch, canUserRegisterMatchResult, canUserEditMatchStats } from '../lib/matchPermissions';
import {
  calcPlayerAdr,
  parseManualPlayerStats,
  resolveTotalRounds,
} from '../lib/manualMatchStats';
import { syncLeagueEndDate } from '../lib/applyLeagueSchedule';
import {
  getStatDeltasForTeams,
  parseMatchRounds,
  resolveMatchOutcome,
} from '../lib/matchResult';

const router = Router();

type Tx = Prisma.TransactionClient;

async function loadMatchRoster(team1Id: string, team2Id: string) {
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: [team1Id, team2Id] } },
    include: {
      user: { select: { id: true, displayName: true, steamId: true } },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
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
  stats: unknown[];
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
    stats: unknown[];
    createdAt: Date;
  }>,
  permissions: {
    canRegisterResult: boolean;
    canEditManualStats: boolean;
  },
  roster?: Awaited<ReturnType<typeof loadMatchRoster>>
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

    const access = await canUserAccessMatch(req.user!.userId, req.user!.role, match.id);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const resultAccess = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);
    const statsAccess = await canUserEditMatchStats(req.user!.userId, req.user!.role, match.id);
    const roster = statsAccess.allowed
      ? await loadMatchRoster(match.team1Id, match.team2Id)
      : undefined;

    res.json(
      formatMatchResponse(
        match,
        match.demos,
        {
          canRegisterResult: resultAccess.allowed && match.status !== 'COMPLETED',
          canEditManualStats: statsAccess.allowed,
        },
        roster
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
      include: { league: { select: { maxTeams: true, bracketSize: true } } },
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
    const statDeltas = getStatDeltasForTeams(
      match.team1Id,
      match.team2Id,
      rounds.team1Rounds,
      rounds.team2Rounds,
      outcome
    );

    let groupPhaseJustCompleted = false;

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

      await tryAdvanceBracket(
        tx,
        { ...match, winnerId },
        resolveBracketSize(
          await tx.leagueTeam.count({ where: { leagueId: match.leagueId } }),
          match.league.bracketSize
        )
      );

      await tryCompleteLeague(tx, match.leagueId);
    });

    const updated = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        team1: { select: { id: true, name: true, tag: true } },
        team2: { select: { id: true, name: true, tag: true } },
        winner: { select: { id: true, name: true, tag: true } },
      },
    });

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

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remarcar partida' });
  }
});

export default router;
