import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { advanceBracketFromRound } from '../lib/bracketAdvance';
import { resolveBracketSize } from '../lib/bracket';
import { tryCompleteLeague } from '../lib/leagueComplete';
import { aggregateMatchStats } from '../lib/matchStats';
import { canUserAccessMatch, canUserRegisterMatchResult } from '../lib/matchPermissions';

const router = Router();

type Tx = Prisma.TransactionClient;

async function tryAdvanceBracket(
  tx: Tx,
  match: {
    id: string;
    leagueId: string;
    round: number;
    bracketPosition: number | null;
    winnerId: string | null;
  },
  maxTeams: number
): Promise<void> {
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

    res.json({
      id: match.id,
      leagueId: match.leagueId,
      league: match.league,
      team1: match.team1,
      team2: match.team2,
      winner: match.winner,
      winnerId: match.winnerId,
      status: match.status.toLowerCase(),
      round: match.round,
      bracketPosition: match.bracketPosition,
      map: match.map,
      playedAt: match.playedAt,
      demos: match.demos.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status.toLowerCase(),
        isPersonal: d.isPersonal,
        errorMessage: d.errorMessage,
        stats: d.stats,
        createdAt: d.createdAt,
      })),
      aggregatedStats: aggregateMatchStats(match.demos),
      permissions: {
        canRegisterResult: resultAccess.allowed && match.status !== 'COMPLETED',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar partida' });
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

    const { winnerId, map, playedAt } = req.body;
    if (!winnerId) {
      res.status(400).json({ error: 'winnerId é obrigatório' });
      return;
    }
    if (winnerId !== match.team1Id && winnerId !== match.team2Id) {
      res.status(400).json({ error: 'Vencedor deve ser um dos times da partida' });
      return;
    }

    const loserId = winnerId === match.team1Id ? match.team2Id : match.team1Id;

    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: req.params.id },
        data: {
          winnerId,
          status: 'COMPLETED',
          ...(map && { map }),
          playedAt: playedAt ? new Date(playedAt) : new Date(),
        },
      });

      await tx.leagueTeam.updateMany({
        where: { leagueId: match.leagueId, teamId: winnerId },
        data: { wins: { increment: 1 }, points: { increment: 3 } },
      });

      await tx.leagueTeam.updateMany({
        where: { leagueId: match.leagueId, teamId: loserId },
        data: { losses: { increment: 1 } },
      });

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

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar resultado' });
  }
});

export default router;
