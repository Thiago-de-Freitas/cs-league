import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import { canUserRegisterMatchResult } from '../lib/matchPermissions';
import { importLolMatchStats, importValorantMatchStats } from '../lib/riot/matchImport';
import { importPubgMatchStats } from '../lib/pubg/match';
import {
  getPubgPlacementStatDeltas,
  parsePubgPlacements,
  resolveMatchOutcomeForGame,
} from '../lib/games/matchScoring';
import { getMapLabel } from '../lib/cs2Maps';

const router = Router();

router.post('/:id/import-riot', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { game: true } } },
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

    const { riotMatchId, region } = req.body as { riotMatchId?: string; region?: string };
    if (!riotMatchId?.trim()) {
      res.status(400).json({ error: 'riotMatchId é obrigatório.' });
      return;
    }

    const game = match.league.game;
    if (game === 'VALORANT') {
      const imported = await importValorantMatchStats(match.id, riotMatchId.trim(), region ?? 'na');
      if ('error' in imported) {
        res.status(400).json({ error: imported.error });
        return;
      }

      const outcome = resolveMatchOutcomeForGame(
        game,
        match.team1Id,
        match.team2Id,
        imported.team1Rounds,
        imported.team2Rounds,
        match.phase
      );
      if ('error' in outcome) {
        res.status(400).json({ error: outcome.error });
        return;
      }

      const manualDemo = await prisma.demo.create({
        data: {
          matchId: match.id,
          uploadedById: req.user!.userId,
          status: 'COMPLETED',
          isManual: true,
          fileName: `riot-${riotMatchId.trim()}`,
        },
      });

      await prisma.$transaction(async (tx) => {
        await tx.matchPlayerStat.deleteMany({ where: { demoId: manualDemo.id } });
        for (const stat of imported.stats) {
          await tx.matchPlayerStat.create({
            data: {
              demoId: manualDemo.id,
              playerName: stat.playerName,
              steamId: stat.externalId,
              kills: stat.kills,
              deaths: stat.deaths,
              assists: stat.assists,
              damage: stat.damage,
              analytics: stat.analytics as Prisma.InputJsonValue,
            },
          });
        }
        await tx.match.update({
          where: { id: match.id },
          data: {
            riotMatchId: riotMatchId.trim(),
            team1Rounds: imported.team1Rounds,
            team2Rounds: imported.team2Rounds,
            winnerId: outcome.winnerId,
            map: imported.mapId,
            status: 'COMPLETED',
            playedAt: new Date(),
          },
        });
      });

      res.json({
        success: true,
        mapLabel: getMapLabel(imported.mapId, game),
        team1Rounds: imported.team1Rounds,
        team2Rounds: imported.team2Rounds,
        statsCount: imported.stats.length,
      });
      return;
    }

    if (game === 'LOL') {
      const imported = await importLolMatchStats(match.id, riotMatchId.trim());
      if ('error' in imported) {
        res.status(400).json({ error: imported.error });
        return;
      }

      const outcome = resolveMatchOutcomeForGame(
        game,
        match.team1Id,
        match.team2Id,
        imported.team1Wins,
        imported.team2Wins,
        match.phase
      );
      if ('error' in outcome) {
        res.status(400).json({ error: outcome.error });
        return;
      }

      const manualDemo = await prisma.demo.create({
        data: {
          matchId: match.id,
          uploadedById: req.user!.userId,
          status: 'COMPLETED',
          isManual: true,
          fileName: `riot-lol-${riotMatchId.trim()}`,
        },
      });

      await prisma.$transaction(async (tx) => {
        for (const stat of imported.stats) {
          await tx.matchPlayerStat.create({
            data: {
              demoId: manualDemo.id,
              playerName: stat.playerName,
              steamId: stat.externalId,
              kills: stat.kills,
              deaths: stat.deaths,
              assists: stat.assists,
              damage: stat.damage,
              analytics: stat.analytics as Prisma.InputJsonValue,
            },
          });
        }
        await tx.match.update({
          where: { id: match.id },
          data: {
            riotMatchId: riotMatchId.trim(),
            team1Rounds: imported.team1Wins,
            team2Rounds: imported.team2Wins,
            winnerId: outcome.winnerId,
            status: 'COMPLETED',
            playedAt: new Date(),
          },
        });
      });

      res.json({
        success: true,
        team1Wins: imported.team1Wins,
        team2Wins: imported.team2Wins,
        statsCount: imported.stats.length,
      });
      return;
    }

    res.status(400).json({ error: 'Este jogo não suporta importação Riot.' });
  } catch (err) {
    console.error('POST /api/matches/:id/import-riot', err);
    res.status(500).json({ error: 'Erro ao importar partida da Riot API.' });
  }
});

router.post('/:id/import-pubg', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: { league: { select: { game: true, id: true } } },
    });
    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }
    if (match.league.game !== 'PUBG') {
      res.status(400).json({ error: 'Importação PUBG só está disponível para ligas PUBG.' });
      return;
    }

    const permission = await canUserRegisterMatchResult(req.user!.userId, req.user!.role, match.id);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.error || 'Sem permissão' });
      return;
    }

    const { pubgMatchId, shard, placements } = req.body as {
      pubgMatchId?: string;
      shard?: string;
      placements?: unknown;
    };

    if (pubgMatchId?.trim()) {
      const imported = await importPubgMatchStats(pubgMatchId.trim(), shard ?? 'steam');
      if ('error' in imported) {
        res.status(400).json({ error: imported.error });
        return;
      }

      const manualDemo = await prisma.demo.create({
        data: {
          matchId: match.id,
          uploadedById: req.user!.userId,
          status: 'COMPLETED',
          isManual: true,
          fileName: `pubg-${pubgMatchId.trim()}`,
        },
      });

      await prisma.$transaction(async (tx) => {
        for (const stat of imported.stats) {
          await tx.matchPlayerStat.create({
            data: {
              demoId: manualDemo.id,
              playerName: stat.playerName,
              steamId: stat.externalId,
              kills: stat.kills,
              damage: stat.damage,
              analytics: { ...stat.analytics, placement: stat.placement },
            },
          });
        }
        await tx.match.update({
          where: { id: match.id },
          data: {
            pubgMatchId: pubgMatchId.trim(),
            map: imported.mapName,
            status: 'COMPLETED',
            playedAt: new Date(),
          },
        });
      });

      res.json({ success: true, mapName: imported.mapName, statsCount: imported.stats.length });
      return;
    }

    const parsed = parsePubgPlacements(placements);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const statDeltas = getPubgPlacementStatDeltas(parsed);
    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.id },
        data: { status: 'COMPLETED', playedAt: new Date() },
      });
      for (const [teamId, delta] of statDeltas) {
        await tx.leagueTeam.updateMany({
          where: { leagueId: match.league.id, teamId },
          data: {
            wins: { increment: delta.wins },
            points: { increment: delta.points },
            roundsWon: { increment: delta.roundsWon },
          },
        });
      }
    });

    res.json({ success: true, placements: parsed });
  } catch (err) {
    console.error('POST /api/matches/:id/import-pubg', err);
    res.status(500).json({ error: 'Erro ao registrar resultado PUBG.' });
  }
});

export default router;
