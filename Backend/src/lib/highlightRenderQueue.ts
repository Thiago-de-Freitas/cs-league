import { prisma } from './prisma';
import { connectRedis, redis } from './redis';
import { isValidResourceId } from './pathSafe';
import { resolveDemoFilePath, tryResolveDemoFilePath } from './demoStorage';

export const HIGHLIGHT_RENDER_QUEUE = 'highlight:render:queue';

export type HighlightRenderScope = 'match' | 'demo';

export interface HighlightRenderJob {
  scope: HighlightRenderScope;
  highlightId: string;
  parentId: string;
  demoId: string;
  demoPath: string;
  clipStartTick: number;
  clipEndTick: number;
  playerName: string;
  description: string;
  highlightType: string;
  round: number;
}

function isRenderableHighlight(
  clipStartTick: number | null | undefined,
  clipEndTick: number | null | undefined
): clipStartTick is number {
  return clipStartTick != null && clipEndTick != null && clipStartTick >= 0 && clipEndTick > clipStartTick;
}

export async function enqueueHighlightRenderJob(job: HighlightRenderJob): Promise<void> {
  if (!isValidResourceId(job.highlightId) || !isValidResourceId(job.parentId) || !isValidResourceId(job.demoId)) {
    throw new Error('IDs de highlight inválidos');
  }

  await connectRedis();
  try {
    await redis.lpush(HIGHLIGHT_RENDER_QUEUE, JSON.stringify(job));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fila de renderização indisponível: ${message}`);
  }
}

async function resolveDemoPathForHighlight(demoId: string): Promise<string | null> {
  const demo = await prisma.demo.findUnique({
    where: { id: demoId },
    select: { filePath: true },
  });
  if (!demo?.filePath) return null;
  return tryResolveDemoFilePath(demo.filePath);
}

export async function enqueueRenderJobsForMatchHighlights(matchId: string, demoId: string): Promise<number> {
  const demoPath = await resolveDemoPathForHighlight(demoId);
  if (!demoPath) return 0;

  const highlights = await prisma.matchHighlight.findMany({
    where: { matchId, demoId },
    orderBy: [{ score: 'desc' }, { round: 'asc' }],
  });

  let count = 0;
  for (const highlight of highlights) {
    if (!isRenderableHighlight(highlight.clipStartTick, highlight.clipEndTick)) {
      await prisma.matchHighlight.update({
        where: { id: highlight.id },
        data: { clipRenderStatus: 'UNAVAILABLE', clipRenderError: 'Ticks de clipe ausentes' },
      });
      continue;
    }

    await prisma.matchHighlight.update({
      where: { id: highlight.id },
      data: { clipRenderStatus: 'PENDING', clipRenderError: null },
    });

    await enqueueHighlightRenderJob({
      scope: 'match',
      highlightId: highlight.id,
      parentId: matchId,
      demoId,
      demoPath: resolveDemoFilePath(demoPath),
      clipStartTick: highlight.clipStartTick,
      clipEndTick: highlight.clipEndTick,
      playerName: highlight.playerName,
      description: highlight.description,
      highlightType: highlight.type,
      round: highlight.round,
    });
    count += 1;
  }

  return count;
}

export async function enqueueRenderJobsForDemoHighlights(demoId: string): Promise<number> {
  const demoPath = await resolveDemoPathForHighlight(demoId);
  if (!demoPath) return 0;

  const highlights = await prisma.demoHighlight.findMany({
    where: { demoId },
    orderBy: [{ score: 'desc' }, { round: 'asc' }],
  });

  let count = 0;
  for (const highlight of highlights) {
    if (!isRenderableHighlight(highlight.clipStartTick, highlight.clipEndTick)) {
      await prisma.demoHighlight.update({
        where: { id: highlight.id },
        data: { clipRenderStatus: 'UNAVAILABLE', clipRenderError: 'Ticks de clipe ausentes' },
      });
      continue;
    }

    await prisma.demoHighlight.update({
      where: { id: highlight.id },
      data: { clipRenderStatus: 'PENDING', clipRenderError: null },
    });

    await enqueueHighlightRenderJob({
      scope: 'demo',
      highlightId: highlight.id,
      parentId: demoId,
      demoId,
      demoPath: resolveDemoFilePath(demoPath),
      clipStartTick: highlight.clipStartTick,
      clipEndTick: highlight.clipEndTick,
      playerName: highlight.playerName,
      description: highlight.description,
      highlightType: highlight.type,
      round: highlight.round,
    });
    count += 1;
  }

  return count;
}
