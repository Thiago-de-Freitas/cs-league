import { prisma } from './prisma';
import { deleteHighlightClipFile } from './highlightStorage';
import { clearHighlightProgress } from './highlightProgress';

function removeClipFiles(highlights: { clipVideoPath: string | null }[]): void {
  for (const highlight of highlights) {
    deleteHighlightClipFile(highlight.clipVideoPath);
  }
}

export async function deleteDemoHighlightById(
  demoId: string,
  highlightId: string
): Promise<boolean> {
  const highlight = await prisma.demoHighlight.findFirst({
    where: { id: highlightId, demoId },
  });
  if (!highlight) {
    return false;
  }

  deleteHighlightClipFile(highlight.clipVideoPath);
  await prisma.demoHighlight.delete({ where: { id: highlight.id } });

  const remaining = await prisma.demoHighlight.count({ where: { demoId } });
  if (remaining === 0) {
    await clearHighlightProgress('demo', demoId);
  }

  return true;
}

export async function deleteAllDemoHighlights(demoId: string): Promise<number> {
  const highlights = await prisma.demoHighlight.findMany({
    where: { demoId },
    select: { clipVideoPath: true },
  });
  removeClipFiles(highlights);
  const deleted = await prisma.demoHighlight.deleteMany({ where: { demoId } });
  await clearHighlightProgress('demo', demoId);
  return deleted.count;
}

export async function deleteAllPersonalHighlightsForUser(userId: string): Promise<number> {
  const demos = await prisma.demo.findMany({
    where: { uploadedById: userId, isPersonal: true },
    select: { id: true },
  });

  let total = 0;
  for (const demo of demos) {
    total += await deleteAllDemoHighlights(demo.id);
  }
  return total;
}

export async function deleteMatchHighlightById(
  matchId: string,
  highlightId: string
): Promise<boolean> {
  const highlight = await prisma.matchHighlight.findFirst({
    where: { id: highlightId, matchId },
  });
  if (!highlight) {
    return false;
  }

  deleteHighlightClipFile(highlight.clipVideoPath);
  await prisma.matchHighlight.delete({ where: { id: highlight.id } });

  const remaining = await prisma.matchHighlight.count({ where: { matchId } });
  if (remaining === 0) {
    await clearHighlightProgress('match', matchId);
  }

  return true;
}

export async function deleteAllMatchHighlights(matchId: string): Promise<number> {
  const highlights = await prisma.matchHighlight.findMany({
    where: { matchId },
    select: { clipVideoPath: true },
  });
  removeClipFiles(highlights);
  const deleted = await prisma.matchHighlight.deleteMany({ where: { matchId } });
  await clearHighlightProgress('match', matchId);
  return deleted.count;
}
