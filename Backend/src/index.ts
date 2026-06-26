import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import teamRoutes from './routes/teams';
import leagueRoutes from './routes/leagues';
import matchRoutes from './routes/matches';
import seriesRoutes from './routes/series';
import demoRoutes from './routes/demos';
import rankingsRoutes from './routes/rankings';
import auditRoutes from './routes/audit';
import { prisma } from './lib/prisma';
import { redis, connectRedis, DEMO_QUEUE } from './lib/redis';
import { getDemoStoragePath } from './lib/demoStorage';
import { getHighlightClipsPath } from './lib/highlightStorage';
import { mapHighlightPayload, filterHighlightsForPersonalDemo } from './lib/highlightPayload';
import {
  enqueueRenderJobsForDemoHighlights,
  enqueueRenderJobsForMatchHighlights,
} from './lib/highlightRenderQueue';
import {
  bumpHighlightRenderProgress,
  markHighlightRenderQueued,
} from './lib/highlightProgress';
import { isSafeStaticRequestPath } from './lib/pathSafe';
import { securityHeaders } from './middleware/securityHeaders';
import { requestContextMiddleware } from './middleware/requestContext';
import { internalServiceAuth } from './middleware/internalService';
import { tryResolveDemoFilePath } from './lib/demoStorage';
import { isValidResourceId } from './lib/pathSafe';
import { getCoreEnvErrors, getRedisEnvErrors, getRedisWarnings, getProductionEnvErrors, getEnvConfigStatus, logProductionEnvErrors } from './lib/env';
import { getDemoMaxUploadErrorMessage } from './lib/demoUploadLimits';
import { getBuildInfo, formatBuildLabel, type BuildInfo } from './lib/buildInfo';
import {
  ensureUploadStorageDirectories,
  getTeamLogoStoragePath,
  getUserAvatarStoragePath,
  getUploadStorageStatus,
} from './lib/uploadAssets';
import { recordWorkerAudit, skipAudit } from './lib/audit';

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
// Parser JSON antes das rotas /api/internal/* (worker envia destaques via POST JSON).
app.use(express.json({ limit: '1mb' }));
const publicPath = path.join(__dirname, '../public');

function isApiHealthPath(req: express.Request): boolean {
  const pathname = req.originalUrl.split('?')[0];
  return pathname === '/api/health'
    || pathname.startsWith('/api/health/')
    || pathname === '/api/version';
}

function isApiInternalPath(req: express.Request): boolean {
  const pathname = req.originalUrl.split('?')[0];
  return pathname.startsWith('/api/internal/');
}
const serveFrontend = process.env.SERVE_FRONTEND === 'true'
  || (isProduction && fs.existsSync(publicPath));

// Liveness — Railway healthcheck; não depende de DB/Redis
app.get('/api/health', (_req, res) => {
  const build = getBuildInfo();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    build,
    label: formatBuildLabel(build),
  });
});

app.get('/api/version', (_req, res) => {
  const build = getBuildInfo();
  let frontend: BuildInfo | null = null;
  if (serveFrontend) {
    const frontendPath = path.join(publicPath, 'build-info.json');
    if (fs.existsSync(frontendPath)) {
      try {
        frontend = JSON.parse(fs.readFileSync(frontendPath, 'utf8')) as BuildInfo;
      } catch {
        frontend = null;
      }
    }
  }
  res.json({
    backend: build,
    backendLabel: formatBuildLabel(build),
    frontend,
    frontendLabel: frontend ? formatBuildLabel(frontend) : null,
  });
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
    let worker: {
      alive: boolean;
      lastSeenSecondsAgo: number | null;
      filesOnDisk: number | null;
      storagePath: string | null;
    } = {
      alive: false,
      lastSeenSecondsAgo: null,
      filesOnDisk: null,
      storagePath: null,
    };

    if (process.env.REDIS_URL?.trim() && redisErrors.length === 0) {
      const [heartbeat, workerFiles, workerPath] = await redis.mget(
        'demo:worker:heartbeat',
        'demo:worker:files_on_disk',
        'demo:worker:storage_path',
      );
      if (heartbeat) {
        const age = Math.round(Date.now() / 1000 - Number(heartbeat));
        worker = {
          alive: age < 120,
          lastSeenSecondsAgo: age,
          filesOnDisk: workerFiles !== null ? Number(workerFiles) : null,
          storagePath: workerPath,
        };
      }
    }

    if (demoQueueLength !== null && demoQueueLength > 0 && !worker.alive) {
      demoWarnings.push(
        `${demoQueueLength} job(s) na fila, mas o worker não envia heartbeat — verifique se cs-league-worker está Online e com REDIS_URL do plugin Redis`
      );
    } else if (demoQueueLength !== null && demoQueueLength > 0 && worker.alive) {
      demoWarnings.push(
        `${demoQueueLength} job(s) na fila com worker ativo — confira logs do worker (arquivo .dem ou parse da demo)`
      );
    }

    if (
      worker.alive &&
      worker.filesOnDisk === 0 &&
      demoFilesOnDisk > 0
    ) {
      demoWarnings.push(
        `Worker não acessa o disco da API (${demoFilesOnDisk} .dem na API). Na Railway volumes não são compartilhados — configure BACKEND_INTERNAL_URL e INTERNAL_SERVICE_KEY no cs-league-worker.`
      );
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      warnings: [...warnings, ...redisErrors, ...demoWarnings, ...getUploadStorageStatus().warnings],
      demos: {
        storagePath: demoStoragePath,
        filesOnDisk: demoFilesOnDisk,
        queueLength: demoQueueLength,
        worker,
      },
      uploads: getUploadStorageStatus(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service unavailable';
    console.error('[health/ready]', message);
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

// Worker baixa .dem da API (Railway não compartilha volume entre serviços)
app.get('/api/internal/demos/:id/file', internalServiceAuth, async (req, res) => {
  try {
    const demoId = req.params.id;
    if (!isValidResourceId(demoId)) {
      res.status(400).json({ error: 'ID de demo inválido' });
      return;
    }

    const demo = await prisma.demo.findUnique({ where: { id: demoId } });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    if (!demo.filePath) {
      res.status(404).json({ error: 'Demo sem arquivo associado' });
      return;
    }

    const absolutePath = tryResolveDemoFilePath(demo.filePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      res.status(404).json({ error: 'Arquivo da demo não encontrado na API' });
      return;
    }

    const safeName = (demo.fileName ?? 'demo.dem').replace(/"/g, '');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fs.createReadStream(absolutePath).pipe(res);
  } catch (err) {
    console.error('[internal/demos/file]', err);
    res.status(500).json({ error: 'Erro ao servir arquivo da demo' });
  }
});

app.post('/api/internal/audit', internalServiceAuth, async (req, res) => {
  try {
    const { action, entityType, entityId, parentType, parentId, before, after, metadata, success, errorCode } = req.body ?? {};
    if (!action || !entityType) {
      res.status(400).json({ error: 'action e entityType são obrigatórios' });
      return;
    }

    skipAudit(req);
    await recordWorkerAudit({
      action: String(action),
      entityType: String(entityType),
      entityId: entityId ? String(entityId) : null,
      parentType: parentType ? String(parentType) : null,
      parentId: parentId ? String(parentId) : null,
      before,
      after,
      metadata,
      success: success !== false,
      errorCode: errorCode ? String(errorCode) : null,
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[internal/audit]', err);
    res.status(500).json({ error: 'Erro ao registrar auditoria' });
  }
});

app.post('/api/internal/matches/:id/highlights', internalServiceAuth, async (req, res) => {
  try {
    const matchId = req.params.id;
    if (!isValidResourceId(matchId)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const highlights = Array.isArray(req.body?.highlights) ? req.body.highlights : [];
    if (highlights.length === 0) {
      res.status(400).json({ error: 'Nenhum highlight informado' });
      return;
    }

    const demoId = highlights[0]?.demoId ? String(highlights[0].demoId) : null;

    await prisma.matchHighlight.deleteMany({ where: { matchId } });
    await prisma.matchHighlight.createMany({
      data: highlights.map((h: Record<string, unknown>) => ({
        matchId,
        demoId: h.demoId ? String(h.demoId) : null,
        ...mapHighlightPayload(h),
      })),
    });

    let renderJobs = 0;
    if (demoId) {
      renderJobs = await enqueueRenderJobsForMatchHighlights(matchId, demoId);
    }
    await markHighlightRenderQueued('match', matchId, renderJobs);

    skipAudit(req);
    res.status(201).json({ ok: true, count: highlights.length, renderJobs });
  } catch (err) {
    console.error('[internal/highlights]', err);
    res.status(500).json({ error: 'Erro ao salvar highlights' });
  }
});

app.post('/api/internal/demos/:id/highlights', internalServiceAuth, async (req, res) => {
  try {
    const demoId = req.params.id;
    if (!isValidResourceId(demoId)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const highlights = Array.isArray(req.body?.highlights) ? req.body.highlights : [];
    if (highlights.length === 0) {
      res.status(400).json({ error: 'Nenhum highlight informado' });
      return;
    }

    const demo = await prisma.demo.findUnique({
      where: { id: demoId },
      select: {
        isPersonal: true,
        uploadedBy: { select: { steamId: true } },
      },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    const scopedHighlights = demo.isPersonal
      ? filterHighlightsForPersonalDemo(highlights, demo.uploadedBy.steamId)
      : highlights;

    if (demo.isPersonal && scopedHighlights.length === 0) {
      await prisma.demoHighlight.deleteMany({ where: { demoId } });
      await markHighlightRenderQueued('demo', demoId, 0);
      skipAudit(req);
      res.status(201).json({ ok: true, count: 0, renderJobs: 0 });
      return;
    }

    await prisma.demoHighlight.deleteMany({ where: { demoId } });
    await prisma.demoHighlight.createMany({
      data: scopedHighlights.map((h: Record<string, unknown>) => ({
        demoId,
        ...mapHighlightPayload(h),
      })),
    });

    const renderJobs = await enqueueRenderJobsForDemoHighlights(demoId);
    await markHighlightRenderQueued('demo', demoId, renderJobs);

    skipAudit(req);
    res.status(201).json({ ok: true, count: scopedHighlights.length, renderJobs });
  } catch (err) {
    console.error('[internal/demo-highlights]', err);
    res.status(500).json({ error: 'Erro ao salvar highlights da demo' });
  }
});

app.post('/api/internal/highlights/render-result', internalServiceAuth, async (req, res) => {
  try {
    const scope = String(req.body?.scope ?? '');
    const highlightId = String(req.body?.highlightId ?? '');
    const status = String(req.body?.status ?? '').toUpperCase();
    const clipVideoPath = req.body?.clipVideoPath ? String(req.body.clipVideoPath) : null;
    const errorMessage = req.body?.errorMessage ? String(req.body.errorMessage) : null;

    if (!isValidResourceId(highlightId)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    if (!['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNAVAILABLE'].includes(status)) {
      res.status(400).json({ error: 'Status de renderização inválido' });
      return;
    }

    const data = {
      clipRenderStatus: status as 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE',
      clipVideoPath: status === 'COMPLETED' ? clipVideoPath : null,
      clipRenderError: status === 'FAILED' || status === 'UNAVAILABLE' ? errorMessage : null,
    };

    if (scope === 'match') {
      const highlight = await prisma.matchHighlight.findUnique({
        where: { id: highlightId },
        select: { matchId: true },
      });
      if (!highlight) {
        skipAudit(req);
        res.status(200).json({ ok: true, ignored: true });
        return;
      }
      await prisma.matchHighlight.updateMany({ where: { id: highlightId }, data });
      if (highlight?.matchId) {
        await bumpHighlightRenderProgress('match', highlight.matchId, status);
      }
    } else if (scope === 'demo') {
      const highlight = await prisma.demoHighlight.findUnique({
        where: { id: highlightId },
        select: { demoId: true },
      });
      if (!highlight) {
        skipAudit(req);
        res.status(200).json({ ok: true, ignored: true });
        return;
      }
      await prisma.demoHighlight.updateMany({ where: { id: highlightId }, data });
      if (highlight?.demoId) {
        await bumpHighlightRenderProgress('demo', highlight.demoId, status);
      }
    } else {
      res.status(400).json({ error: 'Escopo de highlight inválido' });
      return;
    }

    skipAudit(req);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[internal/highlights/render-result]', err);
    res.status(500).json({ error: 'Erro ao atualizar renderização' });
  }
});

// CORS antes de qualquer bloqueio — upload direto front→back exige preflight com Authorization
const corsOptions = cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }
    if (isProduction) {
      console.warn(`[cors] origem rejeitada: ${origin}`);
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400,
});

app.use(corsOptions);

// Bloqueia API se env core estiver inválida (login, ligas, etc.)
app.use('/api', (req, res, next) => {
  if (isApiHealthPath(req) || isApiInternalPath(req) || req.method === 'OPTIONS') {
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
app.use(requestContextMiddleware);

ensureUploadStorageDirectories();
const uploadStorageStatus = getUploadStorageStatus();
console.log(
  `[uploads] storage=${uploadStorageStatus.storageMode}; legado em disco: team-logos=${uploadStorageStatus.teamLogos.filesOnDisk}, user-avatars=${uploadStorageStatus.userAvatars.filesOnDisk}`
);

const teamLogosPath = getTeamLogoStoragePath();
const userAvatarsPath = getUserAvatarStoragePath();
const highlightClipsPath = getHighlightClipsPath();

app.use('/uploads/team-logos', (req, res, next) => {
  if (!isSafeStaticRequestPath(req.path)) {
    res.status(400).end();
    return;
  }
  next();
}, express.static(teamLogosPath, { dotfiles: 'deny', index: false }));

app.use('/uploads/user-avatars', (req, res, next) => {
  if (!isSafeStaticRequestPath(req.path)) {
    res.status(400).end();
    return;
  }
  next();
}, express.static(userAvatarsPath, { dotfiles: 'deny', index: false }));

app.use('/uploads/highlights', (req, res, next) => {
  if (!isSafeStaticRequestPath(req.path)) {
    res.status(400).end();
    return;
  }
  next();
}, express.static(highlightClipsPath, { dotfiles: 'deny', index: false }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/demos', demoRoutes);
app.use('/api/rankings', rankingsRoutes);
app.use('/api/audit', auditRoutes);

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
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: getDemoMaxUploadErrorMessage(), code: 'DEMO_FILE_TOO_LARGE' });
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
  const build = getBuildInfo();
  console.log(`API rodando em http://${HOST}:${PORT} (PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  console.log(`[build] ${formatBuildLabel(build)} · ${build.branch} · ${build.buildTime}`);
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

server.timeout = 0;
if (typeof server.requestTimeout !== 'undefined') {
  server.requestTimeout = 0;
}
if (typeof server.headersTimeout !== 'undefined') {
  server.headersTimeout = 0;
}

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
