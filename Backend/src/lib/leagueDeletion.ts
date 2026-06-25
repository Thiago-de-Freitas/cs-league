import fs from 'fs';
import { prisma } from './prisma';
import { tryResolveDemoFilePath } from './demoStorage';

function unlinkDemoFile(filePath: string | null | undefined): void {
  if (!filePath?.trim()) return;
  const absolutePath = tryResolveDemoFilePath(filePath);
  if (!absolutePath || !fs.existsSync(absolutePath)) return;
  try {
    fs.unlinkSync(absolutePath);
  } catch {
    // arquivo pode já ter sido removido manualmente
  }
}

/**
 * Remove liga e dados vinculados (partidas, LeagueTeam, demos da liga, arquivos .dem).
 * LeagueTeam some via CASCADE — vitórias/derrotas deixam de contar nos times.
 */
export async function deleteLeagueCompletely(leagueId: string): Promise<void> {
  const matchIds = (
    await prisma.match.findMany({
      where: { leagueId },
      select: { id: true },
    })
  ).map((m) => m.id);

  if (matchIds.length > 0) {
    const demos = await prisma.demo.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true, filePath: true },
    });

    for (const demo of demos) {
      unlinkDemoFile(demo.filePath);
    }

    await prisma.demo.deleteMany({ where: { matchId: { in: matchIds } } });
  }

  await prisma.league.delete({ where: { id: leagueId } });
}
