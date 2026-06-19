import { Router, Response } from 'express';
import { getPlayerRankings, getTeamRankings } from '../lib/rankings';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/players', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const players = await getPlayerRankings(10);
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar ranking de jogadores' });
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
