import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { enqueueDemoJob } from '../lib/redis';
import { validatePersonalDemoUpload, validateGeneralDemoUpload, validateDuplicateDemoUpload } from '../lib/demoValidation';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const storagePath = process.env.DEMO_STORAGE_PATH || path.join(__dirname, '../../data/demos');

if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, storagePath),
  filename: (_req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
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
    const matchId = String(req.query.matchId || '');
    const result = await validatePersonalDemoUpload(req.user!.userId, matchId);
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

router.post('/upload', authMiddleware, upload.single('demo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Arquivo .dem é obrigatório' });
      return;
    }

    const isPersonal = parseIsPersonal(req.body.isPersonal);
    const matchId = req.body.matchId ? String(req.body.matchId) : undefined;
    const fileName = req.file.originalname;

    const duplicateCheck = await validateDuplicateDemoUpload(req.user!.userId, fileName);
    if (!duplicateCheck.valid) {
      fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: duplicateCheck.error, code: duplicateCheck.code });
      return;
    }

    if (isPersonal) {
      const validation = await validatePersonalDemoUpload(req.user!.userId, matchId || '');
      if (!validation.valid) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ error: validation.error, code: validation.code });
        return;
      }
    } else if (matchId) {
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
        filePath: req.file.path,
        fileName: req.file.originalname,
        status: 'PENDING',
        isPersonal,
        ...(matchId && { matchId }),
      },
    });

    await enqueueDemoJob(demo.id, demo.filePath);

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

    const { matchId } = req.body;
    if (!matchId) {
      res.status(400).json({ error: 'matchId é obrigatório' });
      return;
    }

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) {
      res.status(404).json({ error: 'Partida não encontrada' });
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
      where: { uploadedById: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        matchId: true,
        isPersonal: true,
        createdAt: true,
      },
    });

    res.json(
      demos.map((d) => ({
        ...d,
        status: d.status.toLowerCase(),
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar demos' });
  }
});

export default router;
