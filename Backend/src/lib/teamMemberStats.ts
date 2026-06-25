import { prisma } from './prisma';

export type PlayerAdrSummary = {
  adr: number;
  matches: number;
};

/** Média de ADR por jogo de liga (uma entrada por partida, mesmo com várias demos). */
export function aggregateAdrBySteamId(
  stats: Array<{ steamId: string | null; adr: number; matchId: string }>
): Map<string, PlayerAdrSummary> {
  const perMatch = new Map<string, number[]>();

  for (const stat of stats) {
    const sid = stat.steamId?.trim();
    if (!sid || !stat.matchId) continue;
    const key = `${sid.toLowerCase()}|${stat.matchId}`;
    const list = perMatch.get(key) ?? [];
    list.push(stat.adr);
    perMatch.set(key, list);
  }

  const perPlayer = new Map<string, number[]>();
  for (const [key, adrs] of perMatch) {
    const steamKey = key.split('|')[0]!;
    const matchAdr = adrs.reduce((sum, value) => sum + value, 0) / adrs.length;
    const list = perPlayer.get(steamKey) ?? [];
    list.push(matchAdr);
    perPlayer.set(steamKey, list);
  }

  const result = new Map<string, PlayerAdrSummary>();
  for (const [steamKey, matchAdrs] of perPlayer) {
    const avg = matchAdrs.reduce((sum, value) => sum + value, 0) / matchAdrs.length;
    result.set(steamKey, {
      adr: Math.round(avg * 10) / 10,
      matches: matchAdrs.length,
    });
  }

  return result;
}

export async function getAverageAdrBySteamIds(
  steamIds: string[]
): Promise<Map<string, PlayerAdrSummary>> {
  const normalized = [...new Set(steamIds.map((id) => id.trim()).filter(Boolean))];
  if (normalized.length === 0) return new Map();

  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      steamId: { in: normalized },
      demo: {
        isPersonal: false,
        status: 'COMPLETED',
        matchId: { not: null },
      },
    },
    select: {
      steamId: true,
      adr: true,
      demo: { select: { matchId: true } },
    },
  });

  return aggregateAdrBySteamId(
    stats
      .filter((row) => row.steamId && row.demo.matchId)
      .map((row) => ({
        steamId: row.steamId,
        adr: row.adr,
        matchId: row.demo.matchId!,
      }))
  );
}
