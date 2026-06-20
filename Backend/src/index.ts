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
import { isSafeStaticRequestPath } from './lib/pathSafe';
import { securityHeaders } from './middleware/securityHeaders';
import { validateProductionEnv } from './lib/env';

validateProductionEnv();

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const corsOriginEnv = process.env.CORS_ORIGIN;

const corsOrigins = (corsOriginEnv || 'http://localhost:4200')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = express();
const publicPath = path.join(__dirname, '../public');
const serveFrontend = process.env.SERVE_FRONTEND === 'true'
  || (isProduction && fs.existsSync(publicPath));

// Liveness — Railway healthcheck; não depende de DB/Redis
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Readiness — dependências externas (Postgres + Redis)
app.get('/api/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service unavailable';
    console.error('[health/ready]', message);
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

app.use(securityHeaders);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const teamLogosPath = process.env.TEAM_LOGO_STORAGE_PATH
  || path.join(__dirname, '../data/team-logos');

app.use('/uploads/team-logos', (req, res, next) => {
  if (!isSafeStaticRequestPath(req.path)) {
    res.status(400).end();
    return;
  }
  next();
}, express.static(teamLogosPath, { dotfiles: 'deny', index: false }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/demos', demoRoutes);
app.use('/api/rankings', rankingsRoutes);

if (serveFrontend) {
  app.use(express.static(publicPath, { dotfiles: 'deny', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    if (!isSafeStaticRequestPath(req.path)) {
      res.status(400).end();
      return;
    }
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (!isProduction) {
    console.error(err);
  } else {
    console.error(err.message);
  }

  if (err.message === 'Apenas arquivos .dem são permitidos') {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message === 'Apenas imagens PNG, JPG, WEBP ou GIF são permitidas') {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message === 'Origem não permitida pelo CORS') {
    res.status(403).json({ error: 'Origem não permitida' });
    return;
  }

  res.status(500).json({ error: 'Erro interno do servidor' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`API rodando em http://${HOST}:${PORT}`);
});

function shutdown() {
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
