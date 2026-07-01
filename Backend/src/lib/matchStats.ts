import type { MatchPlayerStat } from '@prisma/client';
import { hasRegisteredSteamId } from './registeredPlayers';

type DemoWithStats = {
  status: string;
  isPersonal?: boolean;
  stats: MatchPlayerStat[];
};

/** Consolida stats de demos gerais concluídas (demos mais recentes têm prioridade por steamId). */
export function aggregateMatchStats(
  demos: DemoWithStats[],
  registeredSteamIds?: Set<string>
) {
  const byKey = new Map<string, MatchPlayerStat>();

  for (const demo of demos) {
    if (demo.isPersonal) continue;
    const status = demo.status.toUpperCase();
    if (status !== 'COMPLETED') continue;
    for (const stat of demo.stats) {
      if (registeredSteamIds && !hasRegisteredSteamId(stat.steamId, registeredSteamIds)) {
        continue;
      }
      const steamKey = stat.steamId?.trim().toLowerCase();
      if (!steamKey) continue;
      if (!byKey.has(steamKey)) {
        byKey.set(steamKey, stat);
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.kills - a.kills);
}
