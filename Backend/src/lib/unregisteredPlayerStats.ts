import { prisma } from './prisma';
import { hasRegisteredSteamId, loadRegisteredSteamIdSet, normalizeSteamId } from './registeredPlayers';
import { playerStatKey } from './rankings';

export type UnregisteredPlayerStatGroup = {
  groupKey: string;
  playerName: string;
  steamId: string | null;
  statCount: number;
  demoCount: number;
  matchCount: number;
};

type StatRow = {
  id: string;
  steamId: string | null;
  playerName: string;
  demoId: string;
  matchId: string | null;
};

export function buildUnregisteredGroupKey(steamId: string | null | undefined, playerName: string): string {
  const normalizedSteamId = normalizeSteamId(steamId);
  if (normalizedSteamId) return `steam:${normalizedSteamId}`;
  return `name:${playerName.trim().toLowerCase()}`;
}

export function parseUnregisteredGroupKey(
  groupKey: string
): { steamId: string | null; playerName: string | null } | null {
  const trimmed = groupKey.trim();
  if (trimmed.startsWith('steam:')) {
    const steamId = trimmed.slice('steam:'.length).trim();
    return steamId ? { steamId, playerName: null } : null;
  }
  if (trimmed.startsWith('name:')) {
    const playerName = trimmed.slice('name:'.length).trim();
    return playerName ? { steamId: null, playerName } : null;
  }
  return null;
}

async function loadLeagueDemoStats(): Promise<StatRow[]> {
  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      demo: {
        isPersonal: false,
        status: 'COMPLETED',
        matchId: { not: null },
      },
    },
    select: {
      id: true,
      steamId: true,
      playerName: true,
      demoId: true,
      demo: { select: { matchId: true } },
    },
    orderBy: { id: 'desc' },
    take: 20000,
  });

  return stats.map((stat) => ({
    id: stat.id,
    steamId: stat.steamId,
    playerName: stat.playerName,
    demoId: stat.demoId,
    matchId: stat.demo.matchId,
  }));
}

function filterUnregisteredRows(rows: StatRow[], registered: Set<string>): StatRow[] {
  return rows.filter((row) => !hasRegisteredSteamId(row.steamId, registered));
}

function matchesGroupFilter(
  row: StatRow,
  filter: { steamId: string | null; playerName: string | null }
): boolean {
  if (filter.steamId) {
    return normalizeSteamId(row.steamId) === filter.steamId;
  }
  if (filter.playerName) {
    return row.playerName.trim().toLowerCase() === filter.playerName;
  }
  return false;
}

export async function listUnregisteredPlayerStatGroups(limit = 200): Promise<{
  groups: UnregisteredPlayerStatGroup[];
  totalStats: number;
}> {
  const [registered, rows] = await Promise.all([loadRegisteredSteamIdSet(), loadLeagueDemoStats()]);
  const unregistered = filterUnregisteredRows(rows, registered);

  const grouped = new Map<
    string,
    {
      playerName: string;
      steamId: string | null;
      statIds: Set<string>;
      demoIds: Set<string>;
      matchIds: Set<string>;
    }
  >();

  for (const row of unregistered) {
    const key = buildUnregisteredGroupKey(row.steamId, row.playerName);
    const bucket = grouped.get(key) ?? {
      playerName: row.playerName,
      steamId: normalizeSteamId(row.steamId) || null,
      statIds: new Set<string>(),
      demoIds: new Set<string>(),
      matchIds: new Set<string>(),
    };
    bucket.statIds.add(row.id);
    bucket.demoIds.add(row.demoId);
    if (row.matchId) bucket.matchIds.add(row.matchId);
    grouped.set(key, bucket);
  }

  const groups = [...grouped.entries()]
    .map(([groupKey, bucket]) => ({
      groupKey,
      playerName: bucket.playerName,
      steamId: bucket.steamId,
      statCount: bucket.statIds.size,
      demoCount: bucket.demoIds.size,
      matchCount: bucket.matchIds.size,
    }))
    .sort((a, b) => b.statCount - a.statCount || a.playerName.localeCompare(b.playerName))
    .slice(0, limit);

  return {
    groups,
    totalStats: unregistered.length,
  };
}

export async function deleteUnregisteredPlayerStats(groupKey?: string): Promise<{
  deleted: number;
  groupsAffected: number;
}> {
  const [registered, rows] = await Promise.all([loadRegisteredSteamIdSet(), loadLeagueDemoStats()]);
  let unregistered = filterUnregisteredRows(rows, registered);

  if (groupKey) {
    const parsed = parseUnregisteredGroupKey(groupKey);
    if (!parsed) {
      return { deleted: 0, groupsAffected: 0 };
    }
    unregistered = unregistered.filter((row) => matchesGroupFilter(row, parsed));
  }

  if (unregistered.length === 0) {
    return { deleted: 0, groupsAffected: 0 };
  }

  const affectedGroups = new Set(
    unregistered.map((row) => buildUnregisteredGroupKey(row.steamId, row.playerName))
  );

  const result = await prisma.matchPlayerStat.deleteMany({
    where: { id: { in: unregistered.map((row) => row.id) } },
  });

  return {
    deleted: result.count,
    groupsAffected: affectedGroups.size,
  };
}

export function isUnregisteredStatRow(
  row: { steamId: string | null; playerName: string },
  registered: Set<string>
): boolean {
  return !hasRegisteredSteamId(row.steamId, registered);
}

export function unregisteredPlayerLabel(steamId: string | null, playerName: string): string {
  return playerStatKey(steamId, playerName);
}
