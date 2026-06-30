import { LeagueStatus, type Prisma } from '@prisma/client';

export type LeagueTeamStatRow = {
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
};

/** Estatísticas de participações em ligas (inclui resultados manuais e ligas em andamento). */
export const TEAM_LEAGUE_STATS_WHERE: Prisma.LeagueTeamWhereInput = {
  league: {
    status: {
      in: [
        LeagueStatus.UPCOMING,
        LeagueStatus.ONGOING,
        LeagueStatus.COMPLETED,
        LeagueStatus.ARCHIVED,
      ],
    },
  },
};

/** @deprecated Alias legado — use TEAM_LEAGUE_STATS_WHERE */
export const ARCHIVED_LEAGUE_TEAM_WHERE = TEAM_LEAGUE_STATS_WHERE;

export function sumLeagueTeamStats(rows: LeagueTeamStatRow[]): LeagueTeamStatRow {
  return rows.reduce(
    (acc, row) => ({
      wins: acc.wins + row.wins,
      losses: acc.losses + row.losses,
      draws: acc.draws + row.draws,
      points: acc.points + row.points,
      roundsWon: acc.roundsWon + row.roundsWon,
      roundsLost: acc.roundsLost + row.roundsLost,
    }),
    { wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0 }
  );
}

export function roundDifferenceFromStats(stats: Pick<LeagueTeamStatRow, 'roundsWon' | 'roundsLost'>): number {
  return stats.roundsWon - stats.roundsLost;
}
