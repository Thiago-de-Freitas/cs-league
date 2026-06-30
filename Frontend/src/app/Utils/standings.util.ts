import { Team } from '../Models/interfaces';

export function getTeamRoundDifference(team: Team): number {
  if (team.roundDifference != null) return team.roundDifference;
  return (team.roundsWon ?? 0) - (team.roundsLost ?? 0);
}

export function compareTeamsByStandings(a: Team, b: Team): number {
  if (b.points !== a.points) return b.points - a.points;

  const roundDiffA = getTeamRoundDifference(a);
  const roundDiffB = getTeamRoundDifference(b);
  if (roundDiffB !== roundDiffA) return roundDiffB - roundDiffA;

  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;

  return a.id.localeCompare(b.id);
}

export function sortTeamsByStandings(teams: Team[]): Team[] {
  return [...teams].sort(compareTeamsByStandings);
}

export function hasStandingsData(teams: Team[]): boolean {
  return teams.some((team) => team.points > 0 || team.wins > 0 || team.losses > 0 || team.draws > 0);
}

export function sortTeamsForClassification(teams: Team[], useStandingsOrder: boolean): Team[] {
  if (useStandingsOrder) {
    return sortTeamsByStandings(teams);
  }

  return [...teams].sort((a, b) => {
    const seedA = a.seed ?? Number.MAX_SAFE_INTEGER;
    const seedB = b.seed ?? Number.MAX_SAFE_INTEGER;
    if (seedA !== seedB) return seedA - seedB;
    return a.name.localeCompare(b.name);
  });
}
