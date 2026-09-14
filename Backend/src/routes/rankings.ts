import { Router, Response } from 'express';
import { getPlayerRankings, getTeamRankings, getPlayerProfileBySteamId } from '../lib/rankings';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../lib/permissions';
import { parseRankingPositionFilter, getRankingPositionOptionsForGame, RANKING_POSITION_OPTIONS, type RankingPositionFilter } from '../lib/playerPosition';
import { LEVEL_THRESHOLDS, MAX_LEVEL, recomputeAllPoints } from '../lib/playerRankingPoints';

const router = Router();

function parsePage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function parsePageSize(value: unknown): number | undefined {
  const parsed = Number(value);
  if ([10, 20, 30].includes(parsed)) return parsed;
  return undefined;
}

router.get('/positions', authMiddleware, (req: AuthRequest, res: Response) => {
  const game = typeof req.query.game === 'string' ? req.query.game : 'CS2';
  res.json(getRankingPositionOptionsForGame(game));
});

router.get('/players', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const leagueId = typeof req.query.leagueId === 'string' ? req.query.leagueId : undefined;
    const positionRaw = typeof req.query.position === 'string' ? req.query.position : undefined;
    let position: RankingPositionFilter | undefined;
    if (positionRaw) {
      const parsed = parseRankingPositionFilter(positionRaw);
      if (!parsed) {
        res.status(400).json({ error: 'Posição inválida' });
        return;
      }
      position = parsed;
    }

    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.limit ?? req.query.pageSize);
    const includePersonal =
      req.query.includePersonal === 'true' ||
      req.query.includePersonal === '1';
    const sort = req.query.sort === 'level' ? 'level' : 'rating';

    const result = await getPlayerRankings({ leagueId, position, page, pageSize, includePersonal, sort });
    res.json(result);
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

router.get('/levels', (_req, res: Response) => {
  res.json({
    maxLevel: MAX_LEVEL,
    thresholds: LEVEL_THRESHOLDS.map((minPoints, index) => ({
      level: index + 1,
      minPoints,
    })),
  });
});

router.post('/recompute', authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const result = await recomputeAllPoints();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao recalcular pontos de ranking' });
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
