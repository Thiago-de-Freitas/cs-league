import { prisma } from './prisma';
import { connectRedis, redis } from './redis';
import { isValidResourceId } from './pathSafe';
import { resolveDemoFilePath, tryResolveDemoFilePath } from './demoStorage';

export const HIGHLIGHT_EXTRACT_QUEUE = 'highlight:extract:queue';

export interface HighlightExtractJob {
  demoId: string;
  filePath: string;
}

export async function enqueueHighlightExtractJob(demoId: string): Promise<void> {
  if (!isValidResourceId(demoId)) {
    throw new Error('ID de demo inválido');
  }

  const demo = await prisma.demo.findUnique({
    where: { id: demoId },
    select: { filePath: true, status: true, isManual: true },
  });
  if (!demo) {
    throw new Error('Demo não encontrada');
  }
  if (demo.isManual) {
    throw new Error('Demos manuais não geram destaques automaticamente');
  }
  if (demo.status !== 'COMPLETED') {
    throw new Error('A demo precisa estar processada antes de gerar destaques');
  }

  const demoPath = tryResolveDemoFilePath(demo.filePath);
  if (!demoPath) {
    throw new Error('Arquivo .dem não encontrado no servidor');
  }

  const job: HighlightExtractJob = {
    demoId,
    filePath: resolveDemoFilePath(demoPath),
  };

  await connectRedis();
  try {
    await redis.lpush(HIGHLIGHT_EXTRACT_QUEUE, JSON.stringify(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fila de destaques indisponível: ${message}`);
  }
}

export async function findLatestCompletedDemoForMatch(matchId: string): Promise<string | null> {
  const demo = await prisma.demo.findFirst({
    where: {
      matchId,
      isManual: false,
      status: 'COMPLETED',
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return demo?.id ?? null;
}
