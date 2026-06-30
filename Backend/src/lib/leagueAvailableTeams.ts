import type { Prisma } from '@prisma/client';

/**
 * Times que podem ser adicionados à liga:
 * - não estão em LeagueTeam desta liga
 * - são globais (leagueId null) ou efêmeros vinculados só a esta liga
 */
export function buildAvailableTeamsWhere(
  leagueId: string,
  excludeTeamIds: string[]
): Prisma.TeamWhereInput {
  return {
    ...(excludeTeamIds.length > 0 ? { id: { notIn: excludeTeamIds } } : {}),
    OR: [{ leagueId: null }, { leagueId }],
  };
}
