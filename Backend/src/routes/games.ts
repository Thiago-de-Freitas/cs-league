import { Router, Response } from 'express';
import { listEnabledGames, serializeGameForApi } from '../lib/games';

const router = Router();

router.get('/', (_req, res: Response) => {
  res.json(listEnabledGames().map(serializeGameForApi));
});

export default router;
