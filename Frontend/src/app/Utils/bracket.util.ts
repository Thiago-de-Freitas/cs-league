export const MIN_LEAGUE_TEAMS = 2;
export const MAX_LEAGUE_TEAMS = 64;

export function getFairBracketSize(teamCount: number): number {
  if (teamCount < MIN_LEAGUE_TEAMS) {
    return MIN_LEAGUE_TEAMS;
  }
  let size = MIN_LEAGUE_TEAMS;
  while (size < teamCount) {
    size *= 2;
  }
  return Math.min(size, MAX_LEAGUE_TEAMS);
}

export function resolveBracketSize(teamCount: number, storedBracketSize?: number | null): number {
  if (storedBracketSize != null && storedBracketSize >= MIN_LEAGUE_TEAMS) {
    return storedBracketSize;
  }
  return getFairBracketSize(teamCount);
}

export function formatTeamCapacity(teamCount: number, maxTeams?: number | null): string {
  if (maxTeams == null) {
    return `${teamCount} time${teamCount === 1 ? '' : 's'}`;
  }
  return `${teamCount} / ${maxTeams} times`;
}

export function getBracketSeedOrder(size: number): number[] {
  if (size < 2) return [1];
  if (size === 2) return [1, 2];
  const half = getBracketSeedOrder(size / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(size + 1 - seed);
  }
  return result;
}

export function getFirstRoundPairings(bracketSize: number): [number, number][] {
  const order = getBracketSeedOrder(bracketSize);
  const pairs: [number, number][] = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([order[i], order[i + 1]]);
  }
  return pairs;
}

export interface BracketSlot {
  name: string;
  shortName?: string;
  tag?: string;
  seed?: number;
  teamId?: string;
  isBye: boolean;
  isWinner?: boolean;
}

export interface BracketMatchView {
  teamA: BracketSlot;
  teamB: BracketSlot;
  matchId?: string;
  status?: string;
}

export interface BracketColumnView {
  round: number;
  label: string;
  matches: BracketMatchView[];
}

export interface TeamSeedInput {
  id: string;
  name: string;
  tag?: string;
  wins: number;
  losses: number;
  points: number;
  seed?: number;
}

export interface MatchInput {
  id: string;
  round?: number;
  bracketPosition?: number | null;
  status: string;
  team1: { id: string; name: string; tag?: string };
  team2: { id: string; name: string; tag?: string };
  winnerId?: string | null;
}

export function rankTeamsForSeeding(teams: TeamSeedInput[]): TeamSeedInput[] {
  const totalGames = teams.reduce((sum, t) => sum + t.wins + t.losses, 0);
  return [...teams].sort((a, b) => {
    if (totalGames > 0) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
    }
    return (a.seed ?? 9999) - (b.seed ?? 9999);
  });
}

function roundLabel(round: number, totalRounds: number): string {
  const remaining = totalRounds - round + 1;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Semifinais';
  if (remaining === 3) return 'Quartas de final';
  if (remaining === 4) return 'Oitavas de final';
  if (remaining === 5) return 'Round de 32';
  return `Rodada ${round}`;
}

function slotFromSeed(seed: number, seedMap: Map<number, TeamSeedInput>): BracketSlot {
  const team = seedMap.get(seed);
  if (!team) {
    return { name: 'BYE', shortName: 'BYE', isBye: true };
  }
  return {
    name: team.name,
    shortName: team.name,
    tag: team.tag,
    seed,
    teamId: team.id,
    isBye: false,
  };
}

function emptySlot(): BracketSlot {
  return { name: '—', shortName: '—', isBye: false };
}

function slotFromTeam(team: { id: string; name: string; tag?: string }, isWinner = false): BracketSlot {
  return {
    name: team.name,
    shortName: team.name,
    tag: team.tag,
    teamId: team.id,
    isBye: false,
    isWinner,
  };
}

function winnerSlot(match: BracketMatchView): BracketSlot | null {
  if (match.status === 'completed') {
    if (match.teamA.isWinner) return match.teamA;
    if (match.teamB.isWinner) return match.teamB;
  }
  if (match.teamA.isBye && !match.teamB.isBye && match.teamB.teamId) return match.teamB;
  if (match.teamB.isBye && !match.teamA.isBye && match.teamA.teamId) return match.teamA;
  return null;
}

function applyMatchResult(match: BracketMatchView, m: MatchInput): BracketMatchView {
  const completed = m.status === 'completed';
  const teamA = slotFromTeam(m.team1, completed && m.winnerId === m.team1.id);
  const teamB = slotFromTeam(m.team2, completed && m.winnerId === m.team2.id);
  return {
    teamA,
    teamB,
    matchId: m.id,
    status: m.status,
  };
}

function advanceRound(matches: BracketMatchView[]): BracketMatchView[] {
  const next: BracketMatchView[] = [];
  for (let i = 0; i < matches.length; i += 2) {
    const w1 = winnerSlot(matches[i]);
    const w2 = matches[i + 1] ? winnerSlot(matches[i + 1]) : null;
    next.push({
      teamA: w1 ?? emptySlot(),
      teamB: w2 ?? emptySlot(),
    });
  }
  return next;
}

function buildSeedMap(teams: TeamSeedInput[]): Map<number, TeamSeedInput> {
  const seeded = teams.filter((t) => t.seed != null && t.seed > 0);
  if (seeded.length >= 2) {
    const map = new Map<number, TeamSeedInput>();
    for (const t of seeded) {
      map.set(t.seed!, t);
    }
    return map;
  }
  const ranked = rankTeamsForSeeding(teams);
  const map = new Map<number, TeamSeedInput>();
  ranked.forEach((t, i) => map.set(i + 1, t));
  return map;
}

export function buildBracketView(
  teams: TeamSeedInput[],
  teamCount: number,
  storedBracketSize: number | null | undefined,
  matches: MatchInput[] = []
): {
  bracketSize: number;
  columns: BracketColumnView[];
  totalRounds: number;
} {
  const bracketSize = resolveBracketSize(teamCount, storedBracketSize);
  const totalRounds = Math.log2(bracketSize);
  const seedMap = buildSeedMap(teams);

  const pairings = getFirstRoundPairings(bracketSize);
  let previousRound: BracketMatchView[] = pairings.map(([s1, s2], idx) => {
    const base: BracketMatchView = {
      teamA: slotFromSeed(s1, seedMap),
      teamB: slotFromSeed(s2, seedMap),
    };
    const dbMatch = matches.find((m) => m.round === 1 && m.bracketPosition === idx + 1);
    return dbMatch ? applyMatchResult(base, dbMatch) : base;
  });

  const columns: BracketColumnView[] = [];
  for (let round = 1; round <= totalRounds; round++) {
    let roundMatches: BracketMatchView[];

    if (round === 1) {
      roundMatches = previousRound;
    } else {
      roundMatches = advanceRound(previousRound);
    }

    roundMatches = roundMatches.map((base, idx) => {
      const dbMatch = matches.find((m) => m.round === round && m.bracketPosition === idx + 1);
      return dbMatch ? applyMatchResult(base, dbMatch) : base;
    });

    columns.push({
      round,
      label: roundLabel(round, totalRounds),
      matches: roundMatches,
    });

    previousRound = roundMatches;
  }

  return { bracketSize, columns, totalRounds };
}
