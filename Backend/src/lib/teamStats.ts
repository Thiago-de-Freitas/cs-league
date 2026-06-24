import { LeagueStatus } from '@prisma/client';

export type LeagueTeamStatRow = {
  wins: number;
  losses: number;
  points: number;
};

/** Somente ligas arquivadas entram no histórico agregado dos times. */
export const ARCHIVED_LEAGUE_TEAM_WHERE = {
  league: { status: LeagueStatus.ARCHIVED },
} as const;

export function sumLeagueTeamStats(rows: LeagueTeamStatRow[]): LeagueTeamStatRow {
  return rows.reduce(
    (acc, row) => ({
      wins: acc.wins + row.wins,
      losses: acc.losses + row.losses,
      points: acc.points + row.points,
    }),
    { wins: 0, losses: 0, points: 0 }
  );
}
