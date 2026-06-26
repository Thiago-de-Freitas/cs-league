import { prisma } from './prisma';
import { ARCHIVED_LEAGUE_TEAM_WHERE } from './teamStats';
import { publicUploadUrlForResponse } from './uploadAssets';
import {
  CAPTAIN_RANKING_FILTER,
  getPlayerPositionLabel,
  type PlayerPosition,
  type RankingPositionFilter,
} from './playerPosition';

export type PlayerRankingEntry = {
  rank: number;
  playerName: string;
  displayName: string | null;
  steamId: string | null;
  position: PlayerPosition | null;
  positionLabel: string | null;
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
  team1Id: string;
  team2Id: string;
  kills: number;
  deaths: number;
  adr: number;
  hsPercent: number;
  kast: number;
};

export type AggregatedPlayerRanking = Omit<PlayerRankingEntry, 'rank' | 'displayName' | 'positionLabel'>;

export type TeamMembershipContext = {
  position: PlayerPosition | null;
  role: 'CAPTAIN' | 'MEMBER';
};

export function playerStatKey(steamId: string | null | undefined, playerName: string): string {
  return (steamId?.trim() || playerName).toLowerCase();
}

export function membershipKey(steamId: string, teamId: string): string {
  return `${steamId}|${teamId}`;
}

export function resolvePlayerTeamId(
  steamId: string | null,
  team1Id: string,
  team2Id: string,
  memberships: Map<string, TeamMembershipContext>
): string | null {
  if (!steamId?.trim()) return null;
  const inTeam1 = memberships.has(membershipKey(steamId, team1Id));
  const inTeam2 = memberships.has(membershipKey(steamId, team2Id));
  if (inTeam1 && !inTeam2) return team1Id;
  if (inTeam2 && !inTeam1) return team2Id;
  if (inTeam1) return team1Id;
  return null;
}

export function statRowMatchesPositionFilter(
  row: LeaguePlayerStatRow,
  filter: RankingPositionFilter,
  memberships: Map<string, TeamMembershipContext>
): boolean {
  const teamId = resolvePlayerTeamId(row.steamId, row.team1Id, row.team2Id, memberships);
  if (!teamId || !row.steamId?.trim()) return false;
  const membership = memberships.get(membershipKey(row.steamId, teamId));
  if (!membership) return false;
  if (filter === CAPTAIN_RANKING_FILTER) return membership.role === 'CAPTAIN';
  return membership.position === filter;
}

export function filterStatsByPosition(
  rows: LeaguePlayerStatRow[],
  filter: RankingPositionFilter | undefined,
  memberships: Map<string, TeamMembershipContext>
): LeaguePlayerStatRow[] {
  if (!filter) return rows;
  return rows.filter((row) => statRowMatchesPositionFilter(row, filter, memberships));
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
        position: null,
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

async function loadMembershipsForStats(
  rows: Array<{ team1Id: string; team2Id: string }>
): Promise<Map<string, TeamMembershipContext>> {
  const teamIds = new Set<string>();
  for (const row of rows) {
    teamIds.add(row.team1Id);
    teamIds.add(row.team2Id);
  }
  if (teamIds.size === 0) return new Map();

  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: [...teamIds] } },
    select: {
      teamId: true,
      role: true,
      user: { select: { steamId: true, position: true } },
    },
  });

  const memberships = new Map<string, TeamMembershipContext>();
  for (const member of members) {
    const steamId = member.user.steamId?.trim();
    if (!steamId) continue;
    memberships.set(membershipKey(steamId, member.teamId), {
      position: member.user.position,
      role: member.role,
    });
  }
  return memberships;
}

function resolveCurrentPosition(
  steamId: string | null,
  memberships: Map<string, TeamMembershipContext>
): PlayerPosition | null {
  if (!steamId?.trim()) return null;
  for (const [key, membership] of memberships) {
    if (!key.startsWith(`${steamId}|`)) continue;
    if (membership.position) return membership.position;
  }
  return null;
}

export type PlayerRankingOptions = {
  leagueId?: string;
  position?: RankingPositionFilter;
};

export async function getPlayerRankings(limit = 10, options: PlayerRankingOptions = {}): Promise<PlayerRankingEntry[]> {
  const { leagueId, position } = options;

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
      demo: {
        select: {
          matchId: true,
          match: { select: { team1Id: true, team2Id: true } },
        },
      },
    },
    orderBy: { id: 'desc' },
    take: 8000,
  });

  const rawRows: LeaguePlayerStatRow[] = stats
    .filter((stat) => stat.demo.matchId && stat.demo.match)
    .map((stat) => ({
      steamId: stat.steamId,
      playerName: stat.playerName,
      matchId: stat.demo.matchId!,
      team1Id: stat.demo.match!.team1Id,
      team2Id: stat.demo.match!.team2Id,
      kills: stat.kills,
      deaths: stat.deaths,
      adr: stat.adr,
      hsPercent: stat.hsPercent,
      kast: stat.kast,
    }));

  const memberships = await loadMembershipsForStats(rawRows);
  const rows = filterStatsByPosition(rawRows, position, memberships);

  const steamIds = [...new Set(rows.map((r) => r.steamId).filter((id): id is string => !!id?.trim()))];

  const users = steamIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: steamIds } },
        select: { steamId: true, displayName: true },
      })
    : [];

  const displayBySteam = new Map(users.map((u) => [u.steamId!, u.displayName]));

  const ranked = aggregatePlayerRankingsByLeagueMatches(rows, limit).map((entry, index) => {
    const currentPosition = resolveCurrentPosition(entry.steamId, memberships);
    return {
      rank: index + 1,
      ...entry,
      position: currentPosition,
      positionLabel: currentPosition ? getPlayerPositionLabel(currentPosition) : null,
      displayName: entry.steamId ? displayBySteam.get(entry.steamId) || null : null,
    };
  });

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
      demo: {
        select: {
          matchId: true,
          match: { select: { team1Id: true, team2Id: true } },
        },
      },
    },
  });

  if (stats.length === 0) return null;

  const rows: LeaguePlayerStatRow[] = stats
    .filter((s) => s.demo.matchId && s.demo.match)
    .map((s) => ({
      steamId: normalized,
      playerName: s.playerName,
      matchId: s.demo.matchId!,
      team1Id: s.demo.match!.team1Id,
      team2Id: s.demo.match!.team2Id,
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
        logoUrl: publicUploadUrlForResponse(team.logoUrl),
        wins: entry.wins,
        losses: entry.losses,
        leagues: entry.leagues,
      };
    })
    .filter((e): e is TeamRankingEntry => e !== null);
}
