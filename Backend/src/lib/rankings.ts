import { prisma } from './prisma';

export type PlayerRankingEntry = {
  rank: number;
  playerName: string;
  displayName: string | null;
  steamId: string | null;
  demos: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export type TeamRankingEntry = {
  rank: number;
  teamId: string;
  name: string;
  tag: string;
  logoUrl: string | null;
  wins: number;
  losses: number;
  leagues: number;
};

export function calcRating(kd: number, adr: number, kast: number, hsPercent: number): number {
  return Math.round(((kd / 1.2) * 0.35 + (adr / 85) * 0.35 + (kast / 75) * 0.2 + (hsPercent / 50) * 0.1) * 100) / 100;
}

export async function getPlayerRankings(limit = 10, leagueId?: string): Promise<PlayerRankingEntry[]> {
  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      demo: {
        status: 'COMPLETED',
        isPersonal: false,
        matchId: { not: null },
        ...(leagueId && {
          match: { leagueId },
        }),
      },
    },
    select: {
      steamId: true,
      playerName: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
    },
    orderBy: { id: 'desc' },
    take: 4000,
  });

  const byKey = new Map<
    string,
    {
      playerName: string;
      steamId: string | null;
      demos: number;
      kills: number;
      deaths: number;
      adrSum: number;
      hsSum: number;
      kastSum: number;
    }
  >();

  for (const stat of stats) {
    const key = (stat.steamId?.trim() || stat.playerName).toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.demos += 1;
      existing.kills += stat.kills;
      existing.deaths += stat.deaths;
      existing.adrSum += stat.adr;
      existing.hsSum += stat.hsPercent;
      existing.kastSum += stat.kast;
      if (!existing.steamId && stat.steamId) existing.steamId = stat.steamId;
    } else {
      byKey.set(key, {
        playerName: stat.playerName,
        steamId: stat.steamId,
        demos: 1,
        kills: stat.kills,
        deaths: stat.deaths,
        adrSum: stat.adr,
        hsSum: stat.hsPercent,
        kastSum: stat.kast,
      });
    }
  }

  const steamIds = [...byKey.values()]
    .map((p) => p.steamId)
    .filter((id): id is string => !!id?.trim());

  const users = steamIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: steamIds } },
        select: { steamId: true, displayName: true },
      })
    : [];

  const displayBySteam = new Map(users.map((u) => [u.steamId!, u.displayName]));

  const ranked = [...byKey.values()]
    .map((p) => {
      const kd = p.deaths > 0 ? p.kills / p.deaths : p.kills;
      const adr = p.adrSum / p.demos;
      const hsPercent = p.hsSum / p.demos;
      const kast = p.kastSum / p.demos;
      const rating = calcRating(kd, adr, kast, hsPercent);
      return {
        playerName: p.playerName,
        displayName: p.steamId ? displayBySteam.get(p.steamId) || null : null,
        steamId: p.steamId,
        demos: p.demos,
        kills: p.kills,
        deaths: p.deaths,
        kd: Math.round(kd * 100) / 100,
        adr: Math.round(adr * 10) / 10,
        hsPercent: Math.round(hsPercent * 10) / 10,
        kast: Math.round(kast * 10) / 10,
        rating,
      };
    })
    .sort((a, b) => b.rating - a.rating || b.kd - a.kd || b.adr - a.adr)
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  return ranked;
}

export type PlayerProfileStats = {
  steamId: string;
  playerName: string;
  displayName: string | null;
  demos: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export async function getPlayerProfileBySteamId(steamId: string): Promise<PlayerProfileStats | null> {
  const normalized = steamId.trim();
  if (!normalized) return null;

  const stats = await prisma.matchPlayerStat.findMany({
    where: {
      steamId: normalized,
      demo: {
        status: 'COMPLETED',
        isPersonal: false,
        matchId: { not: null },
      },
    },
    select: {
      playerName: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
    },
  });

  if (stats.length === 0) return null;

  const kills = stats.reduce((sum, s) => sum + s.kills, 0);
  const deaths = stats.reduce((sum, s) => sum + s.deaths, 0);
  const kd = deaths > 0 ? kills / deaths : kills;
  const adr = stats.reduce((sum, s) => sum + s.adr, 0) / stats.length;
  const hsPercent = stats.reduce((sum, s) => sum + s.hsPercent, 0) / stats.length;
  const kast = stats.reduce((sum, s) => sum + s.kast, 0) / stats.length;
  const rating = calcRating(kd, adr, kast, hsPercent);

  const user = await prisma.user.findFirst({
    where: { steamId: normalized },
    select: { displayName: true },
  });

  return {
    steamId: normalized,
    playerName: stats[0].playerName,
    displayName: user?.displayName || null,
    demos: stats.length,
    kills,
    deaths,
    kd: Math.round(kd * 100) / 100,
    adr: Math.round(adr * 10) / 10,
    hsPercent: Math.round(hsPercent * 10) / 10,
    kast: Math.round(kast * 10) / 10,
    rating,
  };
}

export async function getTeamRankings(limit = 10): Promise<TeamRankingEntry[]> {
  const grouped = await prisma.leagueTeam.groupBy({
    by: ['teamId'],
    _sum: { wins: true, losses: true },
    _count: { _all: true },
  });

  const ranked = grouped
    .map((g) => ({
      teamId: g.teamId,
      wins: g._sum.wins ?? 0,
      losses: g._sum.losses ?? 0,
      leagues: g._count._all,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const teams = await prisma.team.findMany({
    where: { id: { in: ranked.map((r) => r.teamId) } },
    select: { id: true, name: true, tag: true, logoUrl: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  return ranked
    .map((entry, index) => {
      const team = teamMap.get(entry.teamId);
      if (!team) return null;
      return {
        rank: index + 1,
        teamId: team.id,
        name: team.name,
        tag: team.tag,
        logoUrl: team.logoUrl,
        wins: entry.wins,
        losses: entry.losses,
        leagues: entry.leagues,
      };
    })
    .filter((e): e is TeamRankingEntry => e !== null);
}
