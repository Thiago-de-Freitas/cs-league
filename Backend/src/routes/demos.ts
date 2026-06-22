import { Router, Response } from 'express';
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
} from '../lib/demoValidation';
import { buildPersonalStatsOverview } from '../lib/personalStats';
import { getDemoStoragePath, resolveDemoFilePath, tryResolveDemoFilePath } from '../lib/demoStorage';
import { sanitizeFileExtension } from '../lib/pathSafe';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireDemoQueue } from '../middleware/demoQueue';

const router = Router();

const storagePath = getDemoStoragePath();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storagePath),
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
  limits: { fileSize: 500 * 1024 * 1024 },
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

router.get('/validate-personal', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await validatePersonalDemoUpload(req.user!.userId);
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

router.post('/upload', authMiddleware, requireDemoQueue, upload.single('demo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo .dem é obrigatório' });
      return;
    }

    const isPersonal = parseIsPersonal(req.body.isPersonal);
    const matchId = isPersonal ? undefined : (req.body.matchId ? String(req.body.matchId) : undefined);
    const fileName = req.file.originalname;

    const duplicateCheck = await validateDuplicateDemoUpload(req.user!.userId, fileName);
    if (!duplicateCheck.valid) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: duplicateCheck.error, code: duplicateCheck.code });
      return;
    }

    if (isPersonal) {
      const validation = await validatePersonalDemoUpload(req.user!.userId);
      if (!validation.valid) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: validation.error, code: validation.code });
        return;
      }
    } else {
      if (!matchId) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: 'Selecione uma partida para enviar a demo.', code: 'MATCH_REQUIRED' });
        return;
      }
      const permission = await canUserManageMatchDemo(req.user!.userId, req.user!.role, matchId);
      if (!permission.allowed) {
        fs.unlink(req.file.path, () => {});
        res.status(403).json({ error: permission.error });
        return;
      }
      const validation = await validateGeneralDemoUpload(matchId);
      if (!validation.valid) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: validation.error, code: validation.code });
        return;
      }
    }

    const demo = await prisma.demo.create({
      data: {
        uploadedById: req.user!.userId,
        filePath: resolveDemoFilePath(req.file.path),
        fileName: req.file.originalname,
        status: 'PENDING',
        isPersonal,
        ...(matchId && !isPersonal && { matchId }),
      },
    });

    try {
      await enqueueDemoJob(demo.id, demo.filePath);
    } catch (enqueueErr) {
      await prisma.demo.delete({ where: { id: demo.id } }).catch(() => {});
      fs.unlink(req.file.path, () => {});
      throw enqueueErr;
    }

    res.status(201).json({
      id: demo.id,
      fileName: demo.fileName,
      status: demo.status.toLowerCase(),
      matchId: demo.matchId,
      isPersonal: demo.isPersonal,
      createdAt: demo.createdAt,
    });
  } catch (err) {
    console.error(err);
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    const message = err instanceof Error ? err.message : '';
    if (message.includes('Fila Redis indisponível') || message.includes('Redis')) {
      res.status(503).json({
        error: 'Fila de processamento de demos indisponível. Verifique REDIS_URL na API (plugin Redis, não o Worker).',
        code: 'DEMO_QUEUE_UNAVAILABLE',
      });
      return;
    }
    res.status(500).json({ error: 'Erro ao fazer upload da demo' });
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const demo = await prisma.demo.findUnique({
      where: { id: req.params.id },
      include: {
        stats: true,
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

    res.json({
      id: demo.id,
      fileName: demo.fileName,
      status: demo.status.toLowerCase(),
      errorMessage: demo.errorMessage,
      matchId: demo.matchId,
      isPersonal: demo.isPersonal,
      match: demo.match,
      stats: demo.stats,
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
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

router.post('/:id/reprocess', authMiddleware, requireDemoQueue, async (req: AuthRequest, res: Response) => {
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
      res.status(400).json({ error: 'Arquivo da demo não encontrado no servidor' });
      return;
    }

    await prisma.demo.update({
      where: { id: demo.id },
      data: { status: 'PENDING', errorMessage: null, filePath: absolutePath },
    });

    await enqueueDemoJob(demo.id, absolutePath);

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

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir demo' });
  }
});

router.patch('/:id/match', authMiddleware, async (req: AuthRequest, res: Response) => {
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
    const demos = await prisma.demo.findMany({
      where: { uploadedById: req.user!.userId, isPersonal: false },
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
