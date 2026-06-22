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
import { redis, connectRedis, DEMO_QUEUE } from './lib/redis';
import { getDemoStoragePath } from './lib/demoStorage';
import { isSafeStaticRequestPath } from './lib/pathSafe';
import { securityHeaders } from './middleware/securityHeaders';
import { getCoreEnvErrors, getRedisEnvErrors, getRedisWarnings, getProductionEnvErrors, getEnvConfigStatus, logProductionEnvErrors } from './lib/env';

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const corsOriginEnv = process.env.CORS_ORIGIN;

const normalizeOrigin = (url: string) => url.replace(/\/+$/, '');

const corsOrigins = (corsOriginEnv || 'http://localhost:4200')
  .split(',')
  .map((o) => normalizeOrigin(o.trim()))
  .filter(Boolean);

const app = express();
const publicPath = path.join(__dirname, '../public');

function isApiHealthPath(req: express.Request): boolean {
  const pathname = req.originalUrl.split('?')[0];
  return pathname === '/api/health' || pathname.startsWith('/api/health/');
}
const serveFrontend = process.env.SERVE_FRONTEND === 'true'
  || (isProduction && fs.existsSync(publicPath));

// Liveness — Railway healthcheck; não depende de DB/Redis
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Diagnóstico de env (sem expor valores secretos)
app.get('/api/health/config', (_req, res) => {
  res.json(getEnvConfigStatus());
});

// Readiness — config + dependências externas (Postgres + Redis)
app.get('/api/health/ready', async (_req, res) => {
  const coreErrors = getCoreEnvErrors();
  const redisErrors = getRedisEnvErrors();
  const warnings = getRedisWarnings();

  if (coreErrors.length > 0) {
    res.status(503).json({
      status: 'error',
      message: 'Configuração incompleta',
      errors: coreErrors,
      warnings,
    });
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    let demoQueueLength: number | null = null;
    if (process.env.REDIS_URL?.trim() && redisErrors.length === 0) {
      await connectRedis();
      await redis.ping();
      demoQueueLength = await redis.llen(DEMO_QUEUE);
    }

    const demoStoragePath = getDemoStoragePath();
    const demoFilesOnDisk = fs.existsSync(demoStoragePath)
      ? fs.readdirSync(demoStoragePath).filter((f) => f.toLowerCase().endsWith('.dem')).length
      : 0;

    const demoWarnings: string[] = [];
    if (demoQueueLength !== null && demoQueueLength > 0) {
      demoWarnings.push(
        `${demoQueueLength} job(s) na fila demo:queue — se persistir, verifique se cs-league-worker está online e com o mesmo REDIS_URL e volume /data`
      );
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      warnings: [...warnings, ...redisErrors, ...demoWarnings],
      demos: {
        storagePath: demoStoragePath,
        filesOnDisk: demoFilesOnDisk,
        queueLength: demoQueueLength,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service unavailable';
    console.error('[health/ready]', message);
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

// Bloqueia API se env core estiver inválida (login, ligas, etc.)
app.use('/api', (req, res, next) => {
  if (isApiHealthPath(req)) {
    next();
    return;
  }
  const coreErrors = getCoreEnvErrors();
  if (coreErrors.length > 0) {
    res.status(503).json({
      error: 'Serviço em configuração. Configure as variáveis no serviço cs-league-back (API), não no front.',
      errors: coreErrors,
      hint: 'GET /api/health/config na URL da API (ou via proxy do front) lista o que falta',
    });
    return;
  }
  next();
});

app.use(securityHeaders);

app.use(express.json({ limit: '1mb' }));

const corsOptions = cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
});

const teamLogosPath = process.env.TEAM_LOGO_STORAGE_PATH
  || path.join(__dirname, '../data/team-logos');

app.use('/uploads/team-logos', (req, res, next) => {
  if (!isSafeStaticRequestPath(req.path)) {
    res.status(400).end();
    return;
  }
  next();
}, express.static(teamLogosPath, { dotfiles: 'deny', index: false }));

app.use('/api/auth', corsOptions, authRoutes);
app.use('/api/users', corsOptions, userRoutes);
app.use('/api/teams', corsOptions, teamRoutes);
app.use('/api/leagues', corsOptions, leagueRoutes);
app.use('/api/matches', corsOptions, matchRoutes);
app.use('/api/demos', corsOptions, demoRoutes);
app.use('/api/rankings', corsOptions, rankingsRoutes);

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
  console.log(`API rodando em http://${HOST}:${PORT} (PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  if (isProduction) {
    const allErrors = getProductionEnvErrors();
    logProductionEnvErrors(allErrors);
    const coreErrors = getCoreEnvErrors();
    const redisErrors = getRedisEnvErrors();
    if (coreErrors.length > 0) {
      console.error(`[startup] ${coreErrors.length} erro(s) core — login/API bloqueados até corrigir env`);
    }
    if (redisErrors.length > 0) {
      console.error(`[startup] ${redisErrors.length} erro(s) Redis — demos bloqueadas até corrigir REDIS_URL`);
    }
  }
  void connectRedis();
});

function shutdown() {
  server.close(async () => {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
