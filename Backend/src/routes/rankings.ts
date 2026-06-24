import { Router, Response } from 'express';
import { getPlayerRankings, getTeamRankings, getPlayerProfileBySteamId } from '../lib/rankings';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { parseRankingPositionFilter, RANKING_POSITION_OPTIONS } from '../lib/playerPosition';

const router = Router();

router.get('/positions', authMiddleware, (_req: AuthRequest, res: Response) => {
  res.json(RANKING_POSITION_OPTIONS);
});

router.get('/players', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const leagueId = typeof req.query.leagueId === 'string' ? req.query.leagueId : undefined;
    const positionRaw = typeof req.query.position === 'string' ? req.query.position : undefined;
    const position = positionRaw ? parseRankingPositionFilter(positionRaw) : undefined;
    if (positionRaw && !position) {
      res.status(400).json({ error: 'Posição inválida' });
      return;
    }

    const players = await getPlayerRankings(10, { leagueId, position });
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar ranking de jogadores' });
  }
});

router.get('/players/:steamId', async (req, res: Response) => {
  try {
    const profile = await getPlayerProfileBySteamId(req.params.steamId);
    if (!profile) {
      res.status(404).json({ error: 'Jogador não encontrado nas estatísticas de ligas' });
      return;
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar perfil do jogador' });
  }
});

router.get('/teams', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const teams = await getTeamRankings(10);
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar ranking de times' });
  }
});

export default router;
