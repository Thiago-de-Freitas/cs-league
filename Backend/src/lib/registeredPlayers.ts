import { prisma } from './prisma';

export function normalizeSteamId(value: string | null | undefined): string {
  if (!value) return '';
  let trimmed = value.trim();
  if (trimmed.endsWith('.0')) {
    trimmed = trimmed.slice(0, -2);
  }
  return trimmed;
}

export async function loadRegisteredSteamIdSet(): Promise<Set<string>> {
  const users = await prisma.user.findMany({
    where: {
      steamId: { not: null },
    },
    select: { steamId: true },
  });

  const registered = new Set<string>();
  for (const user of users) {
    const steamId = normalizeSteamId(user.steamId);
    if (steamId) registered.add(steamId);
  }
  return registered;
}

export function hasRegisteredSteamId(
  steamId: string | null | undefined,
  registered: Set<string>
): boolean {
  const normalized = normalizeSteamId(steamId);
  return normalized.length > 0 && registered.has(normalized);
}

export function filterStatsByRegisteredSteamIds<T extends { steamId?: string | null }>(
  stats: T[],
  registered: Set<string>
): T[] {
  return stats.filter((stat) => hasRegisteredSteamId(stat.steamId, registered));
}
