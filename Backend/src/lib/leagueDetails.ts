import { prisma } from './prisma';
import { resolveBracketSize } from './bracket';
import {
  areAllGroupMatchesComplete,
  computeGroupStandings,
  countRoundRobinMatches,
} from './groupStage';
import {
  isScheduleConfigured,
  parseDefaultMatchDays,
  parseWeekOverrideDays,
  weekStartKey,
} from './matchSchedule';
import { leagueToScheduleConfig } from './applyLeagueSchedule';
import { roundDifference } from './matchResult';
import { getAverageAdrBySteamIds, type PlayerAdrSummary } from './teamMemberStats';
import { publicUploadUrlForResponse } from './uploadAssets';
import { getMapLabel, parseMapPool } from './cs2Maps';
import { getGameConfig } from './games';
import { usesRoundTiebreaker } from './games/matchScoring';

export const teamWithRosterSelect = {
  id: true,
  name: true,
  tag: true,
  logoUrl: true,
  ownerId: true,
  members: {
    select: {
      role: true,
      memberTag: true,
      user: { select: { id: true, displayName: true, steamId: true, avatarUrl: true, position: true } },
    },
  },
} as const;

const matchWithTeamsSelect = {
  team1: { select: { id: true, name: true, tag: true } },
  team2: { select: { id: true, name: true, tag: true } },
  winner: { select: { id: true, name: true, tag: true } },
  series: {
    select: {
      id: true,
      format: true,
      team1MapWins: true,
      team2MapWins: true,
      winnerId: true,
      status: true,
    },
  },
};

const leagueDetailsInclude = {
  owner: { select: { id: true, displayName: true } },
  groups: {
    orderBy: { order: 'asc' as const },
    include: {
      teams: {
        include: {
          team: { select: teamWithRosterSelect },
        },
      },
    },
  },
  teams: {
    include: {
      team: { select: teamWithRosterSelect },
    },
    orderBy: [{ seed: 'asc' as const }, { points: 'desc' as const }, { wins: 'desc' as const }],
  },
  playerEntries: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          steamId: true,
          avatarUrl: true,
          position: true,
        },
      },
    },
  },
  matches: {
    include: matchWithTeamsSelect,
    orderBy: [
      { phase: 'asc' as const },
      { round: 'asc' as const },
      { groupRound: 'asc' as const },
      { bracketPosition: 'asc' as const },
      { seriesGameNumber: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
  },
};

export async function getMatchIdsWithGeneralDemo(leagueId: string): Promise<Set<string>> {
  const byLeague = await getMatchIdsWithGeneralDemoByLeague([leagueId]);
  return byLeague.get(leagueId) ?? new Set();
}

export async function getMatchIdsWithGeneralDemoByLeague(
  leagueIds: string[]
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (leagueIds.length === 0) return result;

  const demos = await prisma.demo.findMany({
    where: {
      isPersonal: false,
      status: { in: ['PENDING', 'PROCESSING', 'COMPLETED'] },
      match: { leagueId: { in: leagueIds } },
    },
    select: { matchId: true, match: { select: { leagueId: true } } },
  });

  for (const demo of demos) {
    const leagueId = demo.match?.leagueId;
    const matchId = demo.matchId;
    if (!leagueId || !matchId) continue;
    const set = result.get(leagueId) ?? new Set<string>();
    set.add(matchId);
    result.set(leagueId, set);
  }
  return result;
}

export async function getLeagueWithDetails(leagueId: string) {
  return prisma.league.findUnique({
    where: { id: leagueId },
    include: leagueDetailsInclude,
  });
}

export async function getLeaguesWithDetailsByIds(leagueIds: string[]) {
  if (leagueIds.length === 0) return [];
  return prisma.league.findMany({
    where: { id: { in: leagueIds } },
    include: leagueDetailsInclude,
    orderBy: { createdAt: 'desc' },
  });
}

function computeTeamAdr(players: { adr: number | null }[]): number | null {
  const values = players.map((p) => p.adr).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 10) / 10;
}

function collectSteamIdsFromRosters(
  leagueTeams: Array<{
    team: { members: { user: { steamId: string | null } }[] };
  }>
): string[] {
  return leagueTeams.flatMap((lt) =>
    lt.team.members.map((m) => m.user.steamId).filter((id): id is string => !!id?.trim())
  );
}

export async function buildAdrMapForLeagueTeams(
  leagueTeams: Array<{
    team: { members: { user: { steamId: string | null } }[] };
  }>
): Promise<Map<string, PlayerAdrSummary>> {
  return getAverageAdrBySteamIds(collectSteamIdsFromRosters(leagueTeams));
}

export function formatTeamFromLeagueTeam(
  lt: {
    team: {
      id: string;
      name: string;
      tag: string;
      logoUrl: string | null;
      ownerId: string;
      members: {
        user: {
          id: string;
          displayName: string;
          steamId: string | null;
          avatarUrl: string | null;
          position: string | null;
        };
        role: string;
        memberTag: string | null;
      }[];
    };
    wins: number;
    losses: number;
    draws: number;
    points: number;
    roundsWon: number;
    roundsLost: number;
    seed: number | null;
    groupId?: string | null;
  },
  adrBySteam: Map<string, PlayerAdrSummary> = new Map()
) {
  const players = lt.team.members.map((m) => {
    const steamKey = m.user.steamId?.trim().toLowerCase() ?? '';
    const adrSummary = steamKey ? adrBySteam.get(steamKey) : undefined;
    return {
      id: m.user.id,
      name: m.user.displayName,
      IGN: m.user.displayName,
      role: m.role,
      memberTag: m.memberTag,
      position: m.user.position,
      steamId: m.user.steamId,
      avatarUrl: publicUploadUrlForResponse(m.user.avatarUrl),
      adr: adrSummary?.adr ?? null,
      matches: adrSummary?.matches ?? 0,
    };
  });

  return {
    id: lt.team.id,
    name: lt.team.name,
    tag: lt.team.tag,
    logoUrl: publicUploadUrlForResponse(lt.team.logoUrl),
    ownerId: lt.team.ownerId,
    wins: lt.wins,
    losses: lt.losses,
    draws: lt.draws,
    points: lt.points,
    roundsWon: lt.roundsWon,
    roundsLost: lt.roundsLost,
    roundDifference: roundDifference(lt.roundsWon, lt.roundsLost),
    seed: lt.seed,
    groupId: lt.groupId ?? null,
    teamAdr: computeTeamAdr(players),
    players,
  };
}

export type LeagueWithDetails = NonNullable<Awaited<ReturnType<typeof getLeagueWithDetails>>>;

export function formatPlayerEntries(
  entries: LeagueWithDetails['playerEntries']
) {
  return entries.map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    teamId: entry.teamId,
    createdAt: entry.createdAt,
    player: {
      id: entry.user.id,
      name: entry.user.displayName,
      steamId: entry.user.steamId,
      position: entry.user.position,
      avatarUrl: publicUploadUrlForResponse(entry.user.avatarUrl),
    },
  }));
}

export function formatLeague(
  league: LeagueWithDetails,
  matchIdsWithDemo: Set<string> = new Set(),
  weekOverrides: { weekStart: string; daysOfWeek: number[] }[] = [],
  adrBySteam: Map<string, PlayerAdrSummary> = new Map()
) {
  const groupMatches = league.matches.filter((m) => m.phase === 'GROUP');
  const playoffMatches = league.matches.filter((m) => m.phase === 'PLAYOFF');
  const groupPhaseComplete = groupMatches.length > 0 && areAllGroupMatchesComplete(groupMatches);
  const playoffGenerated = playoffMatches.some((m) => m.round > 0);

  const matchesByGroupId = new Map<string, typeof league.matches>();
  for (const m of groupMatches) {
    if (!m.groupId) continue;
    const list = matchesByGroupId.get(m.groupId) ?? [];
    list.push(m);
    matchesByGroupId.set(m.groupId, list);
  }

  const formatMatch = (m: (typeof league.matches)[number]) => ({
    id: m.id,
    leagueId: m.leagueId,
    team1: m.team1,
    team2: m.team2,
    winner: m.winner,
    winnerId: m.winnerId,
    status: m.status.toLowerCase(),
    phase: m.phase.toLowerCase(),
    groupId: m.groupId,
    groupRound: m.groupRound,
    round: m.round,
    bracketPosition: m.bracketPosition,
    map: m.map,
    mapLabel: m.map ? getMapLabel(m.map, league.game) : null,
    seriesId: m.seriesId,
    seriesGameNumber: m.seriesGameNumber,
    seriesStatus: m.series?.status?.toLowerCase() ?? null,
    seriesWinnerId: m.series?.winnerId ?? null,
    team1MapWins: m.series?.team1MapWins ?? null,
    team2MapWins: m.series?.team2MapWins ?? null,
    team1Rounds: m.team1Rounds,
    team2Rounds: m.team2Rounds,
    scheduledAt: m.scheduledAt,
    playedAt: m.playedAt,
    hasGeneralDemo: matchIdsWithDemo.has(m.id),
  });

  const groups = league.groups.map((g) => {
    const gMatches = matchesByGroupId.get(g.id) ?? [];
    const teamIds = g.teams.map((lt) => lt.teamId);
    const standings = computeGroupStandings(
      teamIds,
      gMatches.map((m) => ({
        team1Id: m.team1Id,
        team2Id: m.team2Id,
        winnerId: m.winnerId,
        status: m.status,
        team1Rounds: m.team1Rounds,
        team2Rounds: m.team2Rounds,
      })),
      { useRoundTiebreaker: usesRoundTiebreaker(league.game) }
    );
    return {
      id: g.id,
      name: g.name,
      order: g.order,
      teams: g.teams.map((lt) => formatTeamFromLeagueTeam(lt, adrBySteam)),
      standings: standings.map((s) => {
        const lt = g.teams.find((t) => t.teamId === s.teamId);
        return {
          ...s,
          team: lt
            ? { id: lt.team.id, name: lt.team.name, tag: lt.team.tag }
            : { id: s.teamId, name: '', tag: '' },
        };
      }),
      matches: gMatches.map(formatMatch),
      expectedMatches: countRoundRobinMatches(teamIds.length, league.homeAndAway),
      matchesComplete: gMatches.length > 0 && areAllGroupMatchesComplete(gMatches),
    };
  });

  return {
    id: league.id,
    name: league.name,
    description: league.description,
    game: league.game.toLowerCase(),
    gameLabel: getGameConfig(league.game).label,
    status: league.status.toLowerCase(),
    format: league.format.toLowerCase(),
    maxTeams: league.maxTeams,
    bracketSize: league.bracketSize,
    groupCount: league.groupCount,
    advancePerGroup: league.advancePerGroup,
    homeAndAway: league.homeAndAway,
    matchesPerMatchDay: league.matchesPerMatchDay,
    effectiveBracketSize: resolveBracketSize(league.teams.length, league.bracketSize),
    registrationOpen: league.registrationOpen,
    groupPhaseGenerated: groupMatches.length > 0,
    groupPhaseComplete,
    playoffGenerated,
    ownerId: league.ownerId,
    owner: league.owner,
    startDate: league.startDate,
    endDate: league.endDate,
    defaultMatchDays: parseDefaultMatchDays(league.defaultMatchDays) ?? [],
    defaultMatchTime: league.defaultMatchTime,
    scheduleTimezone: league.scheduleTimezone,
    scheduleConfigured: isScheduleConfigured(leagueToScheduleConfig(league)),
    scheduleWeekOverrides: weekOverrides,
    mapPool: parseMapPool(league.mapPool, league.game),
    mapVetoEnabled: league.mapVetoEnabled,
    seriesFormat: league.seriesFormat.toLowerCase(),
    pickupTeamCount: league.pickupTeamCount,
    pickupPlayersPerTeam: league.pickupPlayersPerTeam,
    pickupBalanceMode: league.pickupBalanceMode?.toLowerCase() ?? 'rating',
    pickupBalanceModes: (league.pickupBalanceModes?.length
      ? league.pickupBalanceModes
      : [league.pickupBalanceMode ?? 'RATING']
    ).map((mode) => mode.toLowerCase()),
    pickupBalancedAt: league.pickupBalancedAt,
    groups,
    teams: league.teams.map((lt) => formatTeamFromLeagueTeam(lt, adrBySteam)),
    playerEntries: formatPlayerEntries(league.playerEntries),
    matches: league.matches.map(formatMatch),
    createdAt: league.createdAt,
  };
}

export function formatWeekOverridesForLeague(
  league: { id: string; scheduleTimezone: string },
  weekOverrideRows: { leagueId?: string; weekStart: Date; daysOfWeek: unknown }[]
) {
  return weekOverrideRows
    .filter((row) => row.leagueId == null || row.leagueId === league.id)
    .map((row) => ({
      weekStart: weekStartKey(row.weekStart, league.scheduleTimezone),
      daysOfWeek: parseWeekOverrideDays(row.daysOfWeek) ?? [],
    }));
}
