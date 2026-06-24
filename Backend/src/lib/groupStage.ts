import { rankTeamsForSeeding } from './bracket';

export const MIN_GROUP_COUNT = 1;
export const MAX_GROUP_COUNT = 8;
export const MIN_ADVANCE_PER_GROUP = 1;
export const MAX_ADVANCE_PER_GROUP = 4;
export const MAX_ADVANCE_SINGLE_GROUP = 32;
export const MIN_TEAMS_SINGLE_GROUP = 3;
export const MIN_TEAMS_MULTI_GROUP = 4;
export const MIN_MATCHES_PER_MATCH_DAY = 1;
export const MAX_MATCHES_PER_MATCH_DAY = 16;

export interface TeamForGroupDistribution {
  teamId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  seed: number | null;
}

export interface GroupDistribution {
  name: string;
  order: number;
  teamIds: string[];
}

export interface RoundRobinMatch {
  team1Id: string;
  team2Id: string;
  groupRound: number;
}

export interface GroupStanding {
  teamId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
  roundDifference: number;
  played: number;
  rank: number;
}

export interface GroupMatchResult {
  team1Id: string;
  team2Id: string;
  winnerId: string | null;
  status: string;
  team1Rounds?: number | null;
  team2Rounds?: number | null;
}

export function isValidMatchesPerMatchDay(value: unknown): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_MATCHES_PER_MATCH_DAY;
}

export function parseHomeAndAway(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function parseMatchesPerMatchDay(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_MATCHES_PER_MATCH_DAY) return fallback;
  return n;
}

export function isValidGroupCount(value: unknown): value is number {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_GROUP_COUNT && n <= MAX_GROUP_COUNT;
}

export function isValidAdvancePerGroup(value: unknown, groupCount = 2): value is number {
  const n = Number(value);
  const max = groupCount === 1 ? MAX_ADVANCE_SINGLE_GROUP : MAX_ADVANCE_PER_GROUP;
  return Number.isInteger(n) && n >= MIN_ADVANCE_PER_GROUP && n <= max;
}

export function getMinTeamsForGroupStage(groupCount: number): number {
  return groupCount === 1 ? MIN_TEAMS_SINGLE_GROUP : MIN_TEAMS_MULTI_GROUP;
}

/** Distribui times em grupos com snake draft por seed/desempenho */
export function distributeTeamsIntoGroups<T extends TeamForGroupDistribution>(
  teams: T[],
  groupCount: number
): GroupDistribution[] {
  const ranked = rankTeamsForSeeding(teams);
  const groups: GroupDistribution[] = Array.from({ length: groupCount }, (_, i) => ({
    name: String.fromCharCode(65 + i),
    order: i,
    teamIds: [],
  }));

  let direction = 1;
  let groupIndex = 0;
  for (const team of ranked) {
    groups[groupIndex].teamIds.push(team.teamId);
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

/** Número de jogos em turno único ou ida e volta */
export function countRoundRobinMatches(teamCount: number, homeAndAway = false): number {
  if (teamCount < 2) return 0;
  const single = (teamCount * (teamCount - 1)) / 2;
  return homeAndAway ? single * 2 : single;
}

/** Lista todos os pares únicos (todos contra todos, 1 vez) */
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

/** Verifica se os confrontos cobrem todos os pares (1x ou ida e volta) */
export function isCompleteRoundRobin(
  teamIds: string[],
  matches: { team1Id: string; team2Id: string }[],
  homeAndAway = false
): boolean {
  const teams = [...new Set(teamIds)];
  if (teams.length < 2) return matches.length === 0;
  const expected = countRoundRobinMatches(teams.length, homeAndAway);
  if (matches.length !== expected) return false;

  if (!homeAndAway) {
    const seen = new Set<string>();
    for (const m of matches) {
      if (!teams.includes(m.team1Id) || !teams.includes(m.team2Id) || m.team1Id === m.team2Id) return false;
      const key = [m.team1Id, m.team2Id].sort().join('|');
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return seen.size === expected;
  }

  const pairCounts = new Map<string, number>();
  const directed = new Set<string>();
  for (const m of matches) {
    if (!teams.includes(m.team1Id) || !teams.includes(m.team2Id) || m.team1Id === m.team2Id) return false;
    const undirected = [m.team1Id, m.team2Id].sort().join('|');
    pairCounts.set(undirected, (pairCounts.get(undirected) ?? 0) + 1);
    directed.add(`${m.team1Id}|${m.team2Id}`);
  }
  const expectedPairs = (teams.length * (teams.length - 1)) / 2;
  if (pairCounts.size !== expectedPairs) return false;
  for (const count of pairCounts.values()) {
    if (count !== 2) return false;
  }
  return directed.size === expected;
}

/** Gera rodadas round-robin (turno único) */
function generateSingleRoundRobinPairings(teamIds: string[]): RoundRobinMatch[] {
  const teams = [...new Set(teamIds)];
  if (teams.length < 2) return [];

  const slots = [...teams];
  if (slots.length % 2 === 1) {
    slots.push('__BYE__');
  }

  const n = slots.length;
  const rounds = n - 1;
  const matches: RoundRobinMatch[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = slots[i];
      const away = slots[n - 1 - i];
      if (home === '__BYE__' || away === '__BYE__') continue;
      matches.push({
        team1Id: home,
        team2Id: away,
        groupRound: round + 1,
      });
    }

    const fixed = slots[0];
    const rotating = slots.slice(1);
    rotating.unshift(rotating.pop()!);
    slots.splice(0, slots.length, fixed, ...rotating);
  }

  if (!isCompleteRoundRobin(teams, matches)) {
    const allPairs = getAllRoundRobinPairs(teams);
    const perRound = Math.max(1, Math.floor(teams.length / 2));
    return allPairs.map((pair, index) => ({
      team1Id: pair.team1Id,
      team2Id: pair.team2Id,
      groupRound: Math.floor(index / perRound) + 1,
    }));
  }

  return matches;
}

/** Gera confrontos todos contra todos; opcional ida e volta (mando invertido no 2º turno) */
export function generateRoundRobinPairings(teamIds: string[], homeAndAway = false): RoundRobinMatch[] {
  const firstLeg = generateSingleRoundRobinPairings(teamIds);
  if (!homeAndAway) return firstLeg;

  const maxRound = firstLeg.reduce((max, m) => Math.max(max, m.groupRound), 0);
  const secondLeg = firstLeg.map((m) => ({
    team1Id: m.team2Id,
    team2Id: m.team1Id,
    groupRound: m.groupRound + maxRound,
  }));
  const combined = [...firstLeg, ...secondLeg];
  if (!isCompleteRoundRobin(teamIds, combined, true)) {
    throw new Error('ROUND_ROBIN_HOME_AND_AWAY_INVALID');
  }
  return combined;
}

export function computeGroupStandings(
  teamIds: string[],
  matches: GroupMatchResult[]
): GroupStanding[] {
  const stats = new Map<
    string,
    { wins: number; losses: number; draws: number; points: number; roundsWon: number; roundsLost: number; played: number }
  >();
  for (const teamId of teamIds) {
    stats.set(teamId, { wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0, played: 0 });
  }

  for (const match of matches) {
    if (match.status !== 'COMPLETED') continue;
    if (!stats.has(match.team1Id) || !stats.has(match.team2Id)) continue;

    const team1 = stats.get(match.team1Id)!;
    const team2 = stats.get(match.team2Id)!;

    const hasRounds =
      match.team1Rounds != null &&
      match.team2Rounds != null &&
      Number.isInteger(match.team1Rounds) &&
      Number.isInteger(match.team2Rounds);

    if (hasRounds) {
      team1.roundsWon += match.team1Rounds!;
      team1.roundsLost += match.team2Rounds!;
      team2.roundsWon += match.team2Rounds!;
      team2.roundsLost += match.team1Rounds!;
      team1.played += 1;
      team2.played += 1;

      if (match.team1Rounds === match.team2Rounds) {
        team1.draws += 1;
        team1.points += 1;
        team2.draws += 1;
        team2.points += 1;
      } else if (match.winnerId === match.team1Id) {
        team1.wins += 1;
        team1.points += 3;
        team2.losses += 1;
      } else if (match.winnerId === match.team2Id) {
        team2.wins += 1;
        team2.points += 3;
        team1.losses += 1;
      } else if (match.team1Rounds! > match.team2Rounds!) {
        team1.wins += 1;
        team1.points += 3;
        team2.losses += 1;
      } else {
        team2.wins += 1;
        team2.points += 3;
        team1.losses += 1;
      }
      continue;
    }

    if (!match.winnerId) continue;

    const winner = stats.get(match.winnerId)!;
    const loserId = match.winnerId === match.team1Id ? match.team2Id : match.team1Id;
    const loser = stats.get(loserId)!;

    winner.wins += 1;
    winner.points += 3;
    winner.played += 1;
    loser.losses += 1;
    loser.played += 1;
  }

  const standings = teamIds.map((teamId) => {
    const s = stats.get(teamId)!;
    return {
      teamId,
      ...s,
      roundDifference: s.roundsWon - s.roundsLost,
      rank: 0,
    };
  });

  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.roundDifference !== a.roundDifference) return b.roundDifference - a.roundDifference;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.teamId.localeCompare(b.teamId);
  });

  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

export function areAllGroupMatchesComplete(matches: { status: string }[]): boolean {
  if (matches.length === 0) return false;
  return matches.every((m) => m.status === 'COMPLETED');
}

export function getQualifiersFromGroups(
  groups: GroupDistribution[],
  standingsByGroup: Map<string, GroupStanding[]>,
  advancePerGroup: number
): string[] {
  const qualifiers: string[] = [];
  for (let rank = 1; rank <= advancePerGroup; rank++) {
    for (const group of groups) {
      const standings = standingsByGroup.get(group.name) ?? [];
      const team = standings.find((s) => s.rank === rank);
      if (team) qualifiers.push(team.teamId);
    }
  }
  return qualifiers;
}

export function validateGroupStageConfig(
  teamCount: number,
  groupCount: number,
  advancePerGroup: number
): { valid: boolean; error?: string } {
  const minTeams = getMinTeamsForGroupStage(groupCount);
  if (teamCount < minTeams) {
    const label = groupCount === 1 ? 'grupo único' : 'fase de grupos';
    return { valid: false, error: `Adicione pelo menos ${minTeams} times para ${label}.` };
  }
  if (!isValidGroupCount(groupCount)) {
    return { valid: false, error: `Número de grupos deve ser entre ${MIN_GROUP_COUNT} e ${MAX_GROUP_COUNT}.` };
  }
  if (!isValidAdvancePerGroup(advancePerGroup, groupCount)) {
    const max = groupCount === 1 ? MAX_ADVANCE_SINGLE_GROUP : MAX_ADVANCE_PER_GROUP;
    return {
      valid: false,
      error: `Classificados deve ser entre ${MIN_ADVANCE_PER_GROUP} e ${max}.`,
    };
  }
  if (groupCount > teamCount) {
    return { valid: false, error: 'Número de grupos não pode ser maior que o total de times.' };
  }

  if (groupCount === 1) {
    if (advancePerGroup >= teamCount) {
      return { valid: false, error: 'Classificados deve ser menor que o total de times inscritos.' };
    }
  } else {
    const minPerGroup = Math.floor(teamCount / groupCount);
    if (minPerGroup < 2) {
      return { valid: false, error: 'Cada grupo precisa de pelo menos 2 times.' };
    }
  }

  const qualifierCount = groupCount * advancePerGroup;
  if (qualifierCount < 2) {
    return { valid: false, error: 'Pelo menos 2 times devem avançar para a fase de liga.' };
  }

  return { valid: true };
}
