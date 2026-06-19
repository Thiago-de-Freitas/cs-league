import type { MatchPlayerStat } from '@prisma/client';

type DemoWithStats = {
  status: string;
  stats: MatchPlayerStat[];
};

/** Consolida stats de várias demos (demos mais recentes têm prioridade por steamId/nome). */
export function aggregateMatchStats(demos: DemoWithStats[]) {
  const byKey = new Map<string, MatchPlayerStat>();

  for (const demo of demos) {
    const status = demo.status.toUpperCase();
    if (status !== 'COMPLETED') continue;
    for (const stat of demo.stats) {
      const key = (stat.steamId || stat.playerName).toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, stat);
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.kills - a.kills);
}
