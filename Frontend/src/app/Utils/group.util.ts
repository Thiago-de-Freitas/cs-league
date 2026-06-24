import { rankTeamsForSeeding, TeamSeedInput } from './bracket.util';

export function countRoundRobinMatches(teamCount: number, homeAndAway = false): number {
  if (teamCount < 2) return 0;
  const single = (teamCount * (teamCount - 1)) / 2;
  return homeAndAway ? single * 2 : single;
}

export interface GroupPreviewPlan {
  name: string;
  order: number;
  teams: { id: string; name: string; tag?: string }[];
  matchCount: number;
  pairs: { team1: string; team2: string }[];
}

export function distributeTeamsIntoGroups<T extends TeamSeedInput>(
  teams: T[],
  groupCount: number
): { name: string; order: number; teamIds: string[] }[] {
  const ranked = rankTeamsForSeeding(teams);
  const groups = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i),
    order: i,
    teamIds: [] as string[],
  }));

  let direction = 1;
  let groupIndex = 0;
  for (const team of ranked) {
    groups[groupIndex].teamIds.push(team.id);
    if (groupCount > 1) {
      groupIndex += direction;
      if (groupIndex >= groupCount) {
        groupIndex = groupCount - 1;
        direction = -1;
      } else if (groupIndex < 0) {
        groupIndex = 0;
        direction = 1;
      }
    }
  }

  return groups;
}

export function getAllRoundRobinPairs(teamIds: string[]): { team1Id: string; team2Id: string }[] {
  const teams = [...new Set(teamIds)];
  const pairs: { team1Id: string; team2Id: string }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      pairs.push({ team1Id: teams[i], team2Id: teams[j] });
    }
  }
  return pairs;
}

export function buildGroupPreviewPlans(
  teams: TeamSeedInput[],
  groupCount: number,
  homeAndAway = false
): GroupPreviewPlan[] {
  const distributions = distributeTeamsIntoGroups(teams, groupCount);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  return distributions.map((dist) => {
    const groupTeams = dist.teamIds
      .map((id) => teamById.get(id))
      .filter((t): t is TeamSeedInput => !!t)
      .map((t) => ({ id: t.id, name: t.name, tag: t.tag }));

    const pairs = getAllRoundRobinPairs(dist.teamIds).map((p) => {
      const t1 = teamById.get(p.team1Id);
      const t2 = teamById.get(p.team2Id);
      return {
        team1: t1 ? (t1.tag || t1.name) : p.team1Id,
        team2: t2 ? (t2.tag || t2.name) : p.team2Id,
      };
    });

    return {
      name: dist.name,
      order: dist.order,
      teams: groupTeams,
      matchCount: countRoundRobinMatches(dist.teamIds.length, homeAndAway),
      pairs,
    };
  });
}
