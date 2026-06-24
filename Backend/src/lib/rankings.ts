import { prisma } from './prisma';
import { ARCHIVED_LEAGUE_TEAM_WHERE } from './teamStats';

export type PlayerRankingEntry = {
  rank: number;
  playerName: string;
  displayName: string | null;
  steamId: string | null;
  /** Jogos de liga com demo analisada (não inclui uploads pessoais). */
  demos: number;
  matches: number;
  kills: number;
  deaths: number;
  kd: number;
  adr: number;
  hsPercent: number;
  kast: number;
  rating: number;
};

export type LeaguePlayerStatRow = {
  steamId: string | null;
  playerName: string;
  matchId: string;
  kills: number;
  deaths: number;
  adr: number;
  hsPercent: number;
  kast: number;
};

export type AggregatedPlayerRanking = Omit<PlayerRankingEntry, 'rank' | 'displayName'>;

export function playerStatKey(steamId: string | null | undefined, playerName: string): string {
  return (steamId?.trim() || playerName).toLowerCase();
}

/** ADR e stats derivados da média por jogo de liga; ignora demos pessoais no caller. */
export function aggregatePlayerRankingsByLeagueMatches(
  stats: LeaguePlayerStatRow[],
  limit: number
): AggregatedPlayerRanking[] {
  const perMatch = new Map<
    string,
    {
      playerName: string;
      steamId: string | null;
      killsSum: number;
      deathsSum: number;
      adrSum: number;
      hsSum: number;
      kastSum: number;
      rows: number;
    }
  >();

  for (const stat of stats) {
    if (!stat.matchId) continue;
    const key = `${playerStatKey(stat.steamId, stat.playerName)}|${stat.matchId}`;
    const existing = perMatch.get(key);
    if (existing) {
      existing.killsSum += stat.kills;
      existing.deathsSum += stat.deaths;
      existing.adrSum += stat.adr;
      existing.hsSum += stat.hsPercent;
      existing.kastSum += stat.kast;
      existing.rows += 1;
      if (!existing.steamId && stat.steamId) existing.steamId = stat.steamId;
    } else {
      perMatch.set(key, {
        playerName: stat.playerName,
        steamId: stat.steamId,
        killsSum: stat.kills,
        deathsSum: stat.deaths,
        adrSum: stat.adr,
        hsSum: stat.hsPercent,
        kastSum: stat.kast,
        rows: 1,
      });
    }
  }

  const perPlayer = new Map<
    string,
    {
      playerName: string;
      steamId: string | null;
      matches: number;
      kills: number;
      deaths: number;
      adrSum: number;
      hsSum: number;
      kastSum: number;
    }
  >();

  for (const bucket of perMatch.values()) {
    const playerKey = playerStatKey(bucket.steamId, bucket.playerName);
    const matchKills = bucket.killsSum / bucket.rows;
    const matchDeaths = bucket.deathsSum / bucket.rows;
    const matchAdr = bucket.adrSum / bucket.rows;
    const matchHs = bucket.hsSum / bucket.rows;
    const matchKast = bucket.kastSum / bucket.rows;

    const existing = perPlayer.get(playerKey);
    if (existing) {
      existing.matches += 1;
      existing.kills += matchKills;
      existing.deaths += matchDeaths;
      existing.adrSum += matchAdr;
      existing.hsSum += matchHs;
      existing.kastSum += matchKast;
      if (!existing.steamId && bucket.steamId) existing.steamId = bucket.steamId;
    } else {
      perPlayer.set(playerKey, {
        playerName: bucket.playerName,
        steamId: bucket.steamId,
        matches: 1,
        kills: matchKills,
        deaths: matchDeaths,
        adrSum: matchAdr,
        hsSum: matchHs,
        kastSum: matchKast,
      });
    }
  }

  return [...perPlayer.values()]
    .map((p) => {
      const kills = Math.round(p.kills);
      const deaths = Math.round(p.deaths);
      const kd = deaths > 0 ? kills / deaths : kills;
      const adr = p.adrSum / p.matches;
      const hsPercent = p.hsSum / p.matches;
      const kast = p.kastSum / p.matches;
      const rating = calcRating(kd, adr, kast, hsPercent);
      return {
        playerName: p.playerName,
        steamId: p.steamId,
        demos: p.matches,
        matches: p.matches,
        kills,
        deaths,
        kd: Math.round(kd * 100) / 100,
        adr: Math.round(adr * 10) / 10,
        hsPercent: Math.round(hsPercent * 10) / 10,
        kast: Math.round(kast * 10) / 10,
        rating,
      };
    })
    .sort((a, b) => b.adr - a.adr || b.kd - a.kd || b.matches - a.matches)
    .slice(0, limit);
}

function leagueDemoStatsWhere(leagueId?: string) {
  return {
    status: 'COMPLETED' as const,
    isPersonal: false,
    matchId: { not: null },
    match: leagueId ? { is: { leagueId } } : { isNot: null },
  };
}

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
      demo: leagueDemoStatsWhere(leagueId),
    },
    select: {
      steamId: true,
      playerName: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
      demo: { select: { matchId: true } },
    },
    orderBy: { id: 'desc' },
    take: 8000,
  });

  const rows: LeaguePlayerStatRow[] = stats
    .map((stat) => ({
      steamId: stat.steamId,
      playerName: stat.playerName,
      matchId: stat.demo.matchId!,
      kills: stat.kills,
      deaths: stat.deaths,
      adr: stat.adr,
      hsPercent: stat.hsPercent,
      kast: stat.kast,
    }));

  const steamIds = [...new Set(rows.map((r) => r.steamId).filter((id): id is string => !!id?.trim()))];

  const users = steamIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: steamIds } },
        select: { steamId: true, displayName: true },
      })
    : [];

  const displayBySteam = new Map(users.map((u) => [u.steamId!, u.displayName]));

  const ranked = aggregatePlayerRankingsByLeagueMatches(rows, limit).map((entry, index) => ({
    rank: index + 1,
    ...entry,
    displayName: entry.steamId ? displayBySteam.get(entry.steamId) || null : null,
  }));

  return ranked;
}

export type PlayerProfileStats = {
  steamId: string;
  playerName: string;
  displayName: string | null;
  demos: number;
  matches: number;
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
      demo: leagueDemoStatsWhere(),
    },
    select: {
      playerName: true,
      kills: true,
      deaths: true,
      adr: true,
      hsPercent: true,
      kast: true,
      demo: { select: { matchId: true } },
    },
  });

  if (stats.length === 0) return null;

  const rows: LeaguePlayerStatRow[] = stats
    .filter((s) => s.demo.matchId)
    .map((s) => ({
      steamId: normalized,
      playerName: s.playerName,
      matchId: s.demo.matchId!,
      kills: s.kills,
      deaths: s.deaths,
      adr: s.adr,
      hsPercent: s.hsPercent,
      kast: s.kast,
    }));

  const aggregated = aggregatePlayerRankingsByLeagueMatches(rows, 1)[0];
  if (!aggregated) return null;

  const user = await prisma.user.findFirst({
    where: { steamId: normalized },
    select: { displayName: true },
  });

  return {
    steamId: normalized,
    playerName: aggregated.playerName,
    displayName: user?.displayName || null,
    demos: aggregated.matches,
    matches: aggregated.matches,
    kills: aggregated.kills,
    deaths: aggregated.deaths,
    kd: aggregated.kd,
    adr: aggregated.adr,
    hsPercent: aggregated.hsPercent,
    kast: aggregated.kast,
    rating: aggregated.rating,
  };
}

export async function getTeamRankings(limit = 10): Promise<TeamRankingEntry[]> {
  const grouped = await prisma.leagueTeam.groupBy({
    by: ['teamId'],
    where: ARCHIVED_LEAGUE_TEAM_WHERE,
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
