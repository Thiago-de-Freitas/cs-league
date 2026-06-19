import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { advanceBracketFromRound } from '../lib/bracketAdvance';
import { tryCompleteLeague } from '../lib/leagueComplete';

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
        league: { select: { id: true, name: true, ownerId: true, maxTeams: true } },
        demos: {
          include: { stats: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

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
        errorMessage: d.errorMessage,
        stats: d.stats,
        createdAt: d.createdAt,
      })),
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
      include: { league: true },
    });

    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }
    if (match.league.ownerId !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão' });
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
        match.league.maxTeams
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
