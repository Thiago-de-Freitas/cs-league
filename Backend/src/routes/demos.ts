import { Router, Response } from 'express';
import express from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { enqueueDemoJob } from '../lib/redis';
import {
  validatePersonalDemoUpload,
  validateGeneralDemoUpload,
  validateDuplicateDemoUpload,
  canUserManageMatchDemo,
  canUserViewDemo,
  canUserDeleteDemoHighlights,
} from '../lib/demoValidation';
import { buildPersonalStatsOverview } from '../lib/personalStats';
import {
  getDemoStoragePath,
  getDemoUploadTempPath,
  moveDemoFileToStorage,
  resolveDemoFilePath,
  tryResolveDemoFilePath,
} from '../lib/demoStorage';
import { sanitizeFileExtension } from '../lib/pathSafe';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { participationGuard } from '../middleware/participationGuard';
import { requireDemoQueue } from '../middleware/demoQueue';
import { isAdmin } from '../lib/permissions';
import { auditResponseMiddleware } from '../middleware/auditResponse';
import { audit, setAuditContext } from '../lib/audit';
import { isHighlightsFeatureEnabled } from '../lib/featureFlags';
import { enqueueHighlightExtractJob } from '../lib/highlightExtractQueue';
import { filterHighlightsForPersonalDemo } from '../lib/highlightPayload';
import { filterStatsByRegisteredSteamIds, loadRegisteredSteamIdSet } from '../lib/registeredPlayers';
import { getHighlightProgress } from '../lib/highlightProgress';
import { buildHighlightsListResponse, sendHighlightClipSpec, sendHighlightVideo } from '../lib/highlightHttp';
import { serializeHighlight } from '../lib/highlightSerialization';
import { getDemoMaxUploadBytes } from '../lib/demoUploadLimits';
import {
  assembleDemoUploadSession,
  createDemoUploadSession,
  destroyDemoUploadSession,
  getChunkPath,
  getDemoUploadChunkBytes,
  loadDemoUploadSession,
  markChunkReceived,
  validateChunkedUploadParams,
} from '../lib/demoChunkedUpload';
import {
  deleteAllDemoHighlights,
  deleteAllPersonalHighlightsForUser,
  deleteDemoHighlightById,
} from '../lib/highlightDelete';

const router = Router();
router.use(auditResponseMiddleware);

const DEMO_FILE_MISSING_ERROR =
  'Arquivo .dem não encontrado no servidor. Provavelmente o volume /data não estava montado no upload — exclua esta demo e envie novamente após configurar o volume persistente na API e no worker.';

async function markDemoFileMissing(demoId: string): Promise<void> {
  await prisma.demo.update({
    where: { id: demoId },
    data: { status: 'FAILED', errorMessage: DEMO_FILE_MISSING_ERROR },
  });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, getDemoUploadTempPath()),
  filename: (_req, file, cb) => {
    const ext = sanitizeFileExtension(file.originalname, ['.dem']);
    if (!ext) {
      cb(new Error('Apenas arquivos .dem são permitidos'), '');
      return;
    }
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: getDemoMaxUploadBytes() },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.dem')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .dem são permitidos'));
    }
  },
});

function parseIsPersonal(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

async function validateDemoUploadRequest(
  userId: string,
  role: string,
  fileName: string,
  isPersonal: boolean,
  matchId?: string
): Promise<{ valid: true } | { valid: false; error: string; code?: string; status: number }> {
  const duplicateCheck = await validateDuplicateDemoUpload(userId, fileName);
  if (!duplicateCheck.valid) {
    return { valid: false, error: duplicateCheck.error, code: duplicateCheck.code, status: 400 };
  }

  if (isPersonal) {
    const validation = await validatePersonalDemoUpload(userId, role);
    if (!validation.valid) {
      return { valid: false, error: validation.error, code: validation.code, status: 400 };
    }
    return { valid: true };
  }

  if (!matchId) {
    return { valid: false, error: 'Selecione uma partida para enviar a demo.', code: 'MATCH_REQUIRED', status: 400 };
  }
  const permission = await canUserManageMatchDemo(userId, role, matchId);
  if (!permission.allowed) {
    return { valid: false, error: permission.error ?? 'Sem permissão para enviar demo nesta partida.', status: 403 };
  }
  const validation = await validateGeneralDemoUpload(matchId);
  if (!validation.valid) {
    return { valid: false, error: validation.error, code: validation.code, status: 400 };
  }
  return { valid: true };
}

async function persistDemoFromTempPath(
  req: AuthRequest,
  tempPath: string,
  fileName: string,
  isPersonal: boolean,
  matchId?: string
): Promise<{ demo: Awaited<ReturnType<typeof prisma.demo.create>>; storedDemoPath: string }> {
  let storedDemoPath: string | null = null;
  try {
    storedDemoPath = moveDemoFileToStorage(tempPath);
  } catch (moveErr) {
    fs.unlink(tempPath, () => {});
    console.error('[demo upload] falha ao mover arquivo para storage:', moveErr);
    throw Object.assign(new Error('DEMO_STORAGE_WRITE_FAILED'), { code: 'DEMO_STORAGE_WRITE_FAILED' });
  }

  try {
    const demo = await prisma.$transaction(async (tx) => {
      if (!isPersonal && matchId) {
        const existing = await tx.demo.findFirst({
          where: {
            matchId,
            isPersonal: false,
            status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
          },
          select: { id: true, isManual: true },
        });
        if (existing) {
          const error = existing.isManual
            ? 'Já existem estatísticas manuais para esta partida. Edite-as em vez de enviar uma demo.'
            : 'Já existe uma demo geral associada a esta partida.';
          throw new Error(error);
        }
      }

      return tx.demo.create({
        data: {
          uploadedById: req.user!.userId,
          filePath: resolveDemoFilePath(storedDemoPath!),
          fileName,
          status: 'PENDING',
          isPersonal,
          ...(matchId && !isPersonal && { matchId }),
        },
      });
    });

    try {
      const demoFilePath = demo.filePath;
      if (!demoFilePath) {
        throw new Error('Demo criada sem arquivo');
      }
      await enqueueDemoJob(demo.id, demoFilePath);
    } catch (enqueueErr) {
      await prisma.demo.delete({ where: { id: demo.id } }).catch(() => {});
      fs.unlink(storedDemoPath, () => {});
      throw enqueueErr;
    }

    setAuditContext(req, demo.matchId
      ? audit.withParent('match.demo.link', 'Demo', demo.id, 'Match', demo.matchId, {
          after: { fileName: demo.fileName, isPersonal: demo.isPersonal },
        })
      : audit.of('demo.upload', 'Demo', demo.id, {
          after: { fileName: demo.fileName, isPersonal: demo.isPersonal },
        }));

    return { demo, storedDemoPath };
  } catch (err) {
    if (storedDemoPath) {
      fs.unlink(storedDemoPath, () => {});
    }
    throw err;
  }
}

function sendDemoUploadError(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : '';
  if (
    message.includes('estatísticas manuais') ||
    message.includes('demo geral associada')
  ) {
    res.status(400).json({ error: message, code: 'MATCH_HAS_DEMO' });
    return;
  }
  if (message === 'DEMO_STORAGE_WRITE_FAILED') {
    res.status(500).json({
      error: 'Não foi possível salvar a demo no servidor. Verifique o volume /data na API.',
      code: 'DEMO_STORAGE_WRITE_FAILED',
    });
    return;
  }
  if (message.includes('Fila Redis indisponível') || message.includes('Redis')) {
    res.status(503).json({
      error: 'Fila de processamento de demos indisponível. Verifique REDIS_URL na API (plugin Redis, não o Worker).',
      code: 'DEMO_QUEUE_UNAVAILABLE',
    });
    return;
  }
  res.status(500).json({ error: 'Erro ao fazer upload da demo' });
}

function serializeCreatedDemo(demo: {
  id: string;
  fileName: string | null;
  status: string;
  matchId: string | null;
  isPersonal: boolean;
  createdAt: Date;
}) {
  return {
    id: demo.id,
    fileName: demo.fileName ?? 'demo.dem',
    status: demo.status.toLowerCase(),
    matchId: demo.matchId,
    isPersonal: demo.isPersonal,
    createdAt: demo.createdAt,
  };
}

router.get('/validate-personal', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await validatePersonalDemoUpload(req.user!.userId, req.user!.role);
    if (!result.valid) {
      res.json({ valid: false, error: result.error, code: result.code });
      return;
    }
    res.json({ valid: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao validar demo pessoal' });
  }
});

router.get('/personal/overview', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demos = await prisma.demo.findMany({
      where: { uploadedById: req.user!.userId, isPersonal: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        stats: true,
      },
    });

    res.json(buildPersonalStatsOverview(demos));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao carregar estatísticas do perfil' });
  }
});

router.get('/personal/highlights', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { steamId: true },
    });

    const highlights = await prisma.demoHighlight.findMany({
      where: {
        demo: {
          uploadedById: req.user!.userId,
          isPersonal: true,
        },
      },
      include: {
        demo: {
          select: { id: true, fileName: true, createdAt: true },
        },
      },
      orderBy: [{ score: 'desc' }, { round: 'asc' }],
    });

    const scopedHighlights = filterHighlightsForPersonalDemo(highlights, user?.steamId);

    const serialized = scopedHighlights.map((highlight) => ({
      ...serializeHighlight(highlight, { demoId: highlight.demoId }),
      demoFileName: highlight.demo.fileName ?? 'demo.dem',
      demoCreatedAt: highlight.demo.createdAt,
    }));

    res.json({
      highlights: serialized,
      total: serialized.length,
      videoExportAvailable: serialized.some(
        (h) => h.clipRenderStatus === 'COMPLETED' && !!h.clipVideoUrl
      ),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')) {
      res.status(503).json({
        error: 'Banco desatualizado: execute as migrações do backend (prisma migrate deploy).',
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar destaques pessoais' });
  }
});

router.delete('/personal/highlights', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await deleteAllPersonalHighlightsForUser(req.user!.userId);

    setAuditContext(req, audit.of('demo.highlights.delete_all_personal', 'User', req.user!.userId, {
      metadata: { count: deleted },
    }));
    res.json({ ok: true, deleted });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2021' || err.code === 'P2022')) {
      res.status(503).json({
        error: 'Banco desatualizado: execute as migrações do backend (prisma migrate deploy).',
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir destaques pessoais' });
  }
});

router.get('/personal', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demos = await prisma.demo.findMany({
      where: { uploadedById: req.user!.userId, isPersonal: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        errorMessage: true,
        isPersonal: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { stats: true } },
      },
    });

    res.json(
      demos.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status.toLowerCase(),
        errorMessage: d.errorMessage,
        isPersonal: d.isPersonal,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        playerCount: d._count.stats,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar demos pessoais' });
  }
});

router.post('/personal/requeue-pending', authMiddleware, participationGuard, requireDemoQueue, async (req: AuthRequest, res: Response) => {
  try {
    const demos = await prisma.demo.findMany({
      where: {
        uploadedById: req.user!.userId,
        isPersonal: true,
        status: { in: ['PENDING', 'FAILED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    let requeued = 0;
    const skipped: { id: string; fileName: string; reason: string }[] = [];

    for (const demo of demos) {
      const absolutePath = tryResolveDemoFilePath(demo.filePath);
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        await markDemoFileMissing(demo.id);
        skipped.push({
          id: demo.id,
          fileName: demo.fileName ?? 'demo.dem',
          reason: DEMO_FILE_MISSING_ERROR,
        });
        continue;
      }

      await prisma.demo.update({
        where: { id: demo.id },
        data: { status: 'PENDING', errorMessage: null, filePath: absolutePath },
      });
      await enqueueDemoJob(demo.id, absolutePath);
      requeued++;
    }

    setAuditContext(req, audit.of('demo.requeue_pending', 'Demo', null, {
      metadata: { requeued, skipped: skipped.length, total: demos.length },
    }));
    res.json({ requeued, skipped, total: demos.length });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Fila Redis indisponível') || message.includes('Redis')) {
      res.status(503).json({
        error: 'Fila de processamento de demos indisponível. Verifique REDIS_URL na API.',
        code: 'DEMO_QUEUE_UNAVAILABLE',
      });
      return;
    }
    res.status(500).json({ error: 'Erro ao reenfileirar demos pendentes' });
  }
});

router.post('/upload/sessions', authMiddleware, participationGuard, requireDemoQueue, async (req: AuthRequest, res: Response) => {
  try {
    const fileName = String(req.body?.fileName ?? '').trim();
    const fileSize = Number(req.body?.fileSize);
    const totalChunks = Number(req.body?.totalChunks);
    const isPersonal = parseIsPersonal(req.body?.isPersonal);
    const matchId = isPersonal ? undefined : (req.body?.matchId ? String(req.body.matchId) : undefined);

    const paramsCheck = validateChunkedUploadParams(fileName, fileSize, totalChunks);
    if (!paramsCheck.valid) {
      res.status(400).json({ error: paramsCheck.error, code: 'INVALID_CHUNKED_UPLOAD' });
      return;
    }
    if (fileSize > getDemoMaxUploadBytes()) {
      res.status(413).json({ error: 'Arquivo muito grande para upload em blocos.', code: 'DEMO_FILE_TOO_LARGE' });
      return;
    }

    const validation = await validateDemoUploadRequest(req.user!.userId, req.user!.role, fileName, isPersonal, matchId);
    if (!validation.valid) {
      res.status(validation.status).json({ error: validation.error, code: validation.code });
      return;
    }

    const session = createDemoUploadSession({
      userId: req.user!.userId,
      fileName,
      fileSize,
      totalChunks,
      isPersonal,
      matchId,
    });

    res.status(201).json({
      uploadId: session.uploadId,
      chunkBytes: getDemoUploadChunkBytes(),
      totalChunks: session.totalChunks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao iniciar upload da demo' });
  }
});

router.put(
  '/upload/sessions/:uploadId/chunks/:index',
  authMiddleware,
  participationGuard,
  requireDemoQueue,
  express.raw({ type: 'application/octet-stream', limit: getDemoUploadChunkBytes() + 64 * 1024 }),
  async (req: AuthRequest, res: Response) => {
    try {
      const uploadId = req.params.uploadId;
      const index = Number.parseInt(req.params.index, 10);
      const meta = loadDemoUploadSession(uploadId, req.user!.userId);
      if (!meta) {
        res.status(404).json({ error: 'Sessão de upload não encontrada ou expirada', code: 'UPLOAD_SESSION_NOT_FOUND' });
        return;
      }
      if (!Number.isInteger(index) || index < 0 || index >= meta.totalChunks) {
        res.status(400).json({ error: 'Índice de bloco inválido', code: 'INVALID_CHUNK_INDEX' });
        return;
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'Corpo do bloco vazio', code: 'EMPTY_CHUNK' });
        return;
      }

      const chunkBytes = getDemoUploadChunkBytes();
      const isLast = index === meta.totalChunks - 1;
      const maxSize = isLast ? meta.fileSize - index * chunkBytes : chunkBytes;
      if (body.length > maxSize) {
        res.status(400).json({ error: 'Bloco maior que o esperado', code: 'CHUNK_TOO_LARGE' });
        return;
      }

      const chunkPath = getChunkPath(uploadId, index);
      fs.mkdirSync(path.dirname(chunkPath), { recursive: true });
      fs.writeFileSync(chunkPath, body);
      markChunkReceived(uploadId, req.user!.userId, index);

      res.json({ ok: true, index, received: body.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao receber bloco da demo' });
    }
  }
);

router.post('/upload/sessions/:uploadId/complete', authMiddleware, participationGuard, requireDemoQueue, async (req: AuthRequest, res: Response) => {
  const uploadId = req.params.uploadId;
  let assembledPath: string | null = null;
  try {
    const meta = loadDemoUploadSession(uploadId, req.user!.userId);
    if (!meta) {
      res.status(404).json({ error: 'Sessão de upload não encontrada ou expirada', code: 'UPLOAD_SESSION_NOT_FOUND' });
      return;
    }

    assembledPath = await assembleDemoUploadSession(uploadId, req.user!.userId);
    const { demo } = await persistDemoFromTempPath(
      req,
      assembledPath,
      meta.fileName,
      meta.isPersonal,
      meta.matchId
    );
    assembledPath = null;
    destroyDemoUploadSession(uploadId);

    res.status(201).json(serializeCreatedDemo(demo));
  } catch (err) {
    console.error(err);
    if (assembledPath) {
      fs.unlink(assembledPath, () => {});
    }
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Upload incompleto') || message.includes('Bloco') || message.includes('Tamanho do arquivo')) {
      res.status(400).json({ error: message, code: 'INCOMPLETE_CHUNKED_UPLOAD' });
      return;
    }
    sendDemoUploadError(res, err);
  }
});

router.post('/upload', authMiddleware, participationGuard, requireDemoQueue, upload.single('demo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo .dem é obrigatório' });
      return;
    }

    const uploadedFile = req.file;
    const isPersonal = parseIsPersonal(req.body.isPersonal);
    const matchId = isPersonal ? undefined : (req.body.matchId ? String(req.body.matchId) : undefined);
    const fileName = uploadedFile.originalname;

    const validation = await validateDemoUploadRequest(req.user!.userId, req.user!.role, fileName, isPersonal, matchId);
    if (!validation.valid) {
      fs.unlink(uploadedFile.path, () => {});
      res.status(validation.status).json({ error: validation.error, code: validation.code });
      return;
    }

    const { demo } = await persistDemoFromTempPath(req, uploadedFile.path, fileName, isPersonal, matchId);
    res.status(201).json(serializeCreatedDemo(demo));
  } catch (err) {
    console.error(err);
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    sendDemoUploadError(res, err);
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      include: {
        stats: true,
        highlights: { orderBy: [{ score: 'desc' }, { round: 'asc' }] },
        uploadedBy: { select: { steamId: true } },
        match: {
          include: {
            team1: { select: { id: true, name: true, tag: true } },
            team2: { select: { id: true, name: true, tag: true } },
          },
        },
      },
    });

    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const visibleHighlights = demo.isPersonal
      ? filterHighlightsForPersonalDemo(demo.highlights, demo.uploadedBy.steamId)
      : demo.highlights;

    const registeredSteamIds = demo.isPersonal
      ? null
      : await loadRegisteredSteamIdSet();
    const visibleStats = demo.isPersonal || !registeredSteamIds
      ? demo.stats
      : filterStatsByRegisteredSteamIds(demo.stats, registeredSteamIds);

    res.json({
      id: demo.id,
      fileName: demo.fileName,
      status: demo.status.toLowerCase(),
      errorMessage: demo.errorMessage,
      matchId: demo.matchId,
      isPersonal: demo.isPersonal,
      uploadedById: demo.uploadedById,
      match: demo.match,
      stats: visibleStats,
      highlights: visibleHighlights.map((highlight) =>
        serializeHighlight(highlight, { demoId: demo.id })
      ),
      createdAt: demo.createdAt,
      updatedAt: demo.updatedAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar demo' });
  }
});

router.get('/:id/stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });

    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const stats = await prisma.matchPlayerStat.findMany({
      where: { demoId: req.params.id },
      orderBy: { kills: 'desc' },
    });
    const registeredSteamIds = demo.isPersonal
      ? null
      : await loadRegisteredSteamIdSet();
    const visibleStats = demo.isPersonal || !registeredSteamIds
      ? stats
      : filterStatsByRegisteredSteamIds(stats, registeredSteamIds);
    res.json(visibleStats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

router.get('/:id/highlights', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }
    const highlights = await prisma.demoHighlight.findMany({
      where: { demoId: req.params.id },
      orderBy: [{ score: 'desc' }, { round: 'asc' }],
    });
    res.json(buildHighlightsListResponse(highlights, { demoId: req.params.id }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar highlights da demo' });
  }
});

router.get('/:id/highlights/progress', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }
    const progress = await getHighlightProgress('demo', req.params.id);
    res.json(progress ?? { percent: 0, phase: 'idle', message: 'Nenhuma geração em andamento' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao consultar progresso dos destaques' });
  }
});

router.get('/:id/highlights/:highlightId/clip', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }
    const highlight = await prisma.demoHighlight.findFirst({
      where: { id: req.params.highlightId, demoId: req.params.id },
    });
    if (!highlight) {
      res.status(404).json({ error: 'Destaque não encontrado' });
      return;
    }
    sendHighlightClipSpec(res, highlight);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar clipe' });
  }
});

router.get('/:id/highlights/:highlightId/video', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }
    const highlight = await prisma.demoHighlight.findFirst({
      where: { id: req.params.highlightId, demoId: req.params.id },
    });
    if (!highlight) {
      res.status(404).json({ error: 'Destaque não encontrado' });
      return;
    }
    sendHighlightVideo(res, highlight);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao baixar vídeo do destaque' });
  }
});

router.delete('/:id/highlights/:highlightId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserDeleteDemoHighlights(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const removed = await deleteDemoHighlightById(req.params.id, req.params.highlightId);
    if (!removed) {
      res.status(404).json({ error: 'Destaque não encontrado' });
      return;
    }

    setAuditContext(req, audit.of('demo.highlight.delete', 'DemoHighlight', req.params.highlightId, {
      metadata: { demoId: req.params.id },
    }));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir destaque' });
  }
});

router.delete('/:id/highlights', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: { uploadedById: true, isPersonal: true, matchId: true },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserDeleteDemoHighlights(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }

    const deleted = await deleteAllDemoHighlights(req.params.id);

    setAuditContext(req, audit.of('demo.highlights.delete_all', 'Demo', req.params.id, {
      metadata: { count: deleted },
    }));
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir destaques' });
  }
});

router.post('/:id/highlights/generate', authMiddleware, requireDemoQueue, async (req: AuthRequest, res: Response) => {
  try {
    if (!isHighlightsFeatureEnabled()) {
      res.status(503).json({ error: 'Geração de destaques temporariamente desabilitada.' });
      return;
    }
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        uploadedById: true,
        isPersonal: true,
        matchId: true,
        isManual: true,
        status: true,
      },
    });
    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }
    const access = await canUserViewDemo(req.user!.userId, req.user!.role, demo);
    if (!access.allowed) {
      res.status(403).json({ error: access.error });
      return;
    }
    await enqueueHighlightExtractJob(demo.id, 'demo', demo.id);
    setAuditContext(req, audit.of('demo.highlights.generate', 'Demo', demo.id, {
      metadata: { matchId: demo.matchId, isPersonal: demo.isPersonal },
    }));
    res.status(202).json({
      ok: true,
      message: 'Geração de destaques enfileirada. Atualize a página em instantes.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar destaques';
    if (message.includes('não encontrado') || message.includes('processada') || message.includes('manuais')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar destaques' });
  }
});

router.post('/:id/reprocess', authMiddleware, participationGuard, requireDemoQueue, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({ where: { id: req.params.id } });

    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    if (demo.uploadedById !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão para reprocessar esta demo' });
      return;
    }

    if (demo.status === 'PROCESSING') {
      res.status(400).json({ error: 'Demo já está sendo processada' });
      return;
    }

    const absolutePath = tryResolveDemoFilePath(demo.filePath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      await markDemoFileMissing(demo.id);
      res.status(400).json({
        error: DEMO_FILE_MISSING_ERROR,
        code: 'DEMO_FILE_NOT_FOUND',
        storagePath: getDemoStoragePath(),
      });
      return;
    }

    await prisma.demo.update({
      where: { id: demo.id },
      data: { status: 'PENDING', errorMessage: null, filePath: absolutePath },
    });

    await enqueueDemoJob(demo.id, absolutePath);

    setAuditContext(req, audit.of('demo.reprocess', 'Demo', demo.id, {
      metadata: { matchId: demo.matchId },
    }));
    res.json({
      id: demo.id,
      fileName: demo.fileName,
      status: 'pending',
      matchId: demo.matchId,
      isPersonal: demo.isPersonal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao reprocessar demo' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({ where: { id: req.params.id } });

    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    if (demo.uploadedById !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão para excluir esta demo' });
      return;
    }

    if (demo.status === 'PROCESSING') {
      res.status(400).json({ error: 'Não é possível excluir uma demo em processamento' });
      return;
    }

    if (demo.status === 'COMPLETED' && demo.matchId && !demo.isPersonal) {
      res.status(400).json({ error: 'Desassocie a demo da partida antes de excluir' });
      return;
    }

    const filePath = tryResolveDemoFilePath(demo.filePath);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }

    await prisma.demo.delete({ where: { id: demo.id } });

    setAuditContext(req, audit.of('demo.delete', 'Demo', demo.id, {
      before: { fileName: demo.fileName, matchId: demo.matchId },
    }));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir demo' });
  }
});

router.patch('/:id/match', authMiddleware, participationGuard, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      include: { match: { include: { league: true } } },
    });

    if (!demo) {
      res.status(404).json({ error: 'Demo não encontrada' });
      return;
    }

    if (demo.uploadedById !== req.user!.userId && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Sem permissão para alterar esta demo' });
      return;
    }

    if (demo.isPersonal) {
      res.status(400).json({ error: 'Demos pessoais ficam no perfil e não podem ser associadas a partidas.' });
      return;
    }

    const { matchId } = req.body;

    if (matchId === null) {
      if (!demo.matchId) {
        res.status(400).json({ error: 'Demo não está associada a uma partida' });
        return;
      }

      const updated = await prisma.demo.update({
        where: { id: req.params.id },
        data: { matchId: null },
        include: { stats: true },
      });

      setAuditContext(req, audit.withParent('match.demo.link', 'Demo', updated.id, 'Match', demo.matchId, {
        after: { matchId: null },
      }));
      res.json({
        id: updated.id,
        fileName: updated.fileName,
        status: updated.status.toLowerCase(),
        matchId: updated.matchId,
        isPersonal: updated.isPersonal,
        stats: updated.stats,
      });
      return;
    }

    if (!matchId) {
      res.status(400).json({ error: 'matchId é obrigatório' });
      return;
    }

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    const permission = await canUserManageMatchDemo(req.user!.userId, req.user!.role, matchId);
    if (!permission.allowed) {
      res.status(403).json({ error: permission.error });
      return;
    }

    if (!demo.isPersonal) {
      const validation = await validateGeneralDemoUpload(matchId);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error, code: validation.code });
        return;
      }
    } else {
      res.status(400).json({ error: 'Demos pessoais não podem ser associadas a partidas.' });
      return;
    }

    const updated = await prisma.demo.update({
      where: { id: req.params.id },
      data: { matchId },
      include: { stats: true },
    });

    setAuditContext(req, audit.withParent('match.demo.link', 'Demo', updated.id, 'Match', matchId, {
      after: { matchId },
    }));
    res.json({
      id: updated.id,
      fileName: updated.fileName,
      status: updated.status.toLowerCase(),
      matchId: updated.matchId,
      isPersonal: updated.isPersonal,
      stats: updated.stats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao associar demo à partida' });
  }
});

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userIsAdmin = isAdmin(req.user!);
    const demos = await prisma.demo.findMany({
      where: userIsAdmin
        ? { isPersonal: false }
        : { uploadedById: req.user!.userId, isPersonal: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        errorMessage: true,
        matchId: true,
        isPersonal: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { stats: true } },
        match: {
          select: {
            id: true,
            team1: { select: { id: true, name: true, tag: true } },
            team2: { select: { id: true, name: true, tag: true } },
          },
        },
      },
    });

    res.json(
      demos.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        status: d.status.toLowerCase(),
        errorMessage: d.errorMessage,
        matchId: d.matchId,
        isPersonal: d.isPersonal,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        playerCount: d._count.stats,
        match: d.match,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar demos' });
  }
});

export default router;
