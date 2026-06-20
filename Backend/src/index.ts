import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import teamRoutes from './routes/teams';
import leagueRoutes from './routes/leagues';
import matchRoutes from './routes/matches';
import demoRoutes from './routes/demos';
import rankingsRoutes from './routes/rankings';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:4200';
const publicPath = path.join(__dirname, '../public');
const serveFrontend = process.env.SERVE_FRONTEND === 'true'
  || (process.env.NODE_ENV === 'production' && fs.existsSync(publicPath));

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

const teamLogosPath = process.env.TEAM_LOGO_STORAGE_PATH
  || path.join(__dirname, '../data/team-logos');
app.use('/uploads/team-logos', express.static(teamLogosPath));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/demos', demoRoutes);
app.use('/api/rankings', rankingsRoutes);

if (serveFrontend) {
  app.use(express.static(publicPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (err.message === 'Apenas arquivos .dem são permitidos') {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message === 'Apenas imagens PNG, JPG, WEBP ou GIF são permitidas') {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Erro interno do servidor' });
});

const server = app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

function shutdown() {
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
