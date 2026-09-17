import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  buildAdrMapForLeagueTeams,
  formatLeague,
  formatWeekOverridesForLeague,
  getLeaguesWithDetailsByIds,
  getMatchIdsWithGeneralDemoByLeague,
  type LeagueWithDetails,
} from './leagueDetails';

export function buildUserLeagueAccessWhere(userId: string): Prisma.LeagueWhereInput {
  return {
    OR: [
      { ownerId: userId },
      { teams: { some: { team: { members: { some: { userId } } } } } },
      { playerEntries: { some: { userId } } },
    ],
  };
}

export function partitionUserLeagues(
  userId: string,
  leagues: Array<{ id: string; ownerId: string }>
): { managedIds: string[]; participatingIds: string[] } {
  const managedIds: string[] = [];
  const participatingIds: string[] = [];
  for (const league of leagues) {
    if (league.ownerId === userId) {
      managedIds.push(league.id);
    } else {
      participatingIds.push(league.id);
    }
  }
  return { managedIds, participatingIds };
}

export async function getUserLeaguesSnapshot(userId: string) {
  const summaries = await prisma.league.findMany({
    where: buildUserLeagueAccessWhere(userId),
    select: { id: true, ownerId: true },
    orderBy: { createdAt: 'desc' },
  });

  const { managedIds, participatingIds } = partitionUserLeagues(userId, summaries);
  const orderedIds = summaries.map((league) => league.id);
  const leagues = await getLeaguesWithDetailsByIds(orderedIds);
  const leagueById = new Map(leagues.map((league) => [league.id, league]));
  const orderedLeagues = orderedIds
    .map((id) => leagueById.get(id))
    .filter((league): league is LeagueWithDetails => league != null);

  const allLeagueTeams = orderedLeagues.flatMap((league) => [
    ...league.teams,
    ...league.groups.flatMap((group) => group.teams),
  ]);

  const [adrBySteam, demosByLeague, weekOverrideRows] = await Promise.all([
    buildAdrMapForLeagueTeams(allLeagueTeams),
    getMatchIdsWithGeneralDemoByLeague(orderedIds),
    prisma.leagueScheduleWeek.findMany({
      where: { leagueId: { in: orderedIds } },
      orderBy: { weekStart: 'asc' },
      select: { leagueId: true, weekStart: true, daysOfWeek: true },
    }),
  ]);

  const weeksByLeague = new Map<string, typeof weekOverrideRows>();
  for (const row of weekOverrideRows) {
    const list = weeksByLeague.get(row.leagueId) ?? [];
    list.push(row);
    weeksByLeague.set(row.leagueId, list);
  }

  const managedIdSet = new Set(managedIds);
  const participatingIdSet = new Set(participatingIds);
  const managed: ReturnType<typeof formatLeague>[] = [];
  const participating: ReturnType<typeof formatLeague>[] = [];

  for (const league of orderedLeagues) {
    const formatted = formatLeague(
      league,
      demosByLeague.get(league.id) ?? new Set(),
      formatWeekOverridesForLeague(league, weeksByLeague.get(league.id) ?? []),
      adrBySteam
    );
    if (managedIdSet.has(league.id)) {
      managed.push(formatted);
    } else if (participatingIdSet.has(league.id)) {
      participating.push(formatted);
    }
  }

  return { managed, participating };
}
