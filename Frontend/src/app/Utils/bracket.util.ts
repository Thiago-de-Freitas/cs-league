export const ALLOWED_BRACKET_SIZES = [4, 8, 16, 32] as const;
export type BracketSize = (typeof ALLOWED_BRACKET_SIZES)[number];

export function isValidBracketSize(n: number): n is BracketSize {
  return (ALLOWED_BRACKET_SIZES as readonly number[]).includes(n);
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
  teamId?: string;
  isBye: boolean;
  isWinner?: boolean;
}

export interface BracketMatchView {
  teamA: BracketSlot;
  teamB: BracketSlot;
  matchId?: string;
}

export interface BracketRoundView {
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

function slotFromSeed(
  seed: number,
  seedMap: Map<number, TeamSeedInput>
): BracketSlot {
  const team = seedMap.get(seed);
  if (!team) {
    return { name: 'BYE', isBye: true };
  }
  return { name: team.tag ? `${team.name} [${team.tag}]` : team.name, teamId: team.id, isBye: false };
}

function emptyMatch(): BracketMatchView {
  return {
    teamA: { name: '—', isBye: false },
    teamB: { name: '—', isBye: false },
  };
}

function winnerName(match: BracketMatchView): string {
  if (match.teamA.isWinner) return match.teamA.name;
  if (match.teamB.isWinner) return match.teamB.name;
  return '—';
}

function applyMatchResult(match: BracketMatchView, m: MatchInput): BracketMatchView {
  const updated = { ...match, matchId: m.id };
  if (m.status === 'completed' && m.winnerId) {
    updated.teamA = { ...updated.teamA, isWinner: m.winnerId === updated.teamA.teamId };
    updated.teamB = { ...updated.teamB, isWinner: m.winnerId === updated.teamB.teamId };
  }
  return updated;
}

export function buildBracketView(
  teams: TeamSeedInput[],
  maxTeams: number,
  matches: MatchInput[] = []
): {
  bracketSize: number;
  leftRounds: BracketRoundView[];
  rightRounds: BracketRoundView[];
  semiFinals: BracketRoundView;
  finalRound: BracketRoundView;
  totalRounds: number;
} {
  const bracketSize = maxTeams || 8;
  const ranked = rankTeamsForSeeding(teams);
  const seedMap = new Map<number, TeamSeedInput>();
  ranked.forEach((t, i) => seedMap.set(i + 1, t));

  const pairings = getFirstRoundPairings(bracketSize);
  const r1Matches: BracketMatchView[] = pairings.map(([s1, s2], idx) => {
    const base: BracketMatchView = {
      teamA: slotFromSeed(s1, seedMap),
      teamB: slotFromSeed(s2, seedMap),
    };
    const dbMatch = matches.find((m) => m.round === 1 && m.bracketPosition === idx + 1);
    return dbMatch ? applyMatchResult(base, dbMatch) : base;
  });

  const half = bracketSize / 4;
  const leftR1 = r1Matches.slice(0, half);
  const rightR1 = [...r1Matches.slice(half)].reverse();

  const totalRounds = Math.log2(bracketSize);
  const leftRounds: BracketRoundView[] = [{ matches: leftR1 }];
  const rightRounds: BracketRoundView[] = [{ matches: rightR1 }];

  let leftPrev = leftR1;
  let rightPrev = rightR1;

  for (let r = 2; r < totalRounds; r++) {
    const count = leftPrev.length / 2;
    const leftNext: BracketMatchView[] = [];
    const rightNext: BracketMatchView[] = [];

    for (let i = 0; i < count; i++) {
      const lm = emptyMatch();
      const rm = emptyMatch();
      const w1 = winnerName(leftPrev[i * 2]);
      const w2 = winnerName(leftPrev[i * 2 + 1]);
      if (w1 !== '—') lm.teamA = { name: w1, isBye: false };
      if (w2 !== '—') lm.teamB = { name: w2, isBye: false };

      const rw1 = winnerName(rightPrev[i * 2]);
      const rw2 = winnerName(rightPrev[i * 2 + 1]);
      if (rw1 !== '—') rm.teamA = { name: rw1, isBye: false };
      if (rw2 !== '—') rm.teamB = { name: rw2, isBye: false };

      leftNext.push(lm);
      rightNext.push(rm);
    }

    leftRounds.push({ matches: leftNext });
    rightRounds.unshift({ matches: rightNext });
    leftPrev = leftNext;
    rightPrev = rightNext;
  }

  const semiFinals: BracketRoundView = {
    matches: [
      {
        teamA: leftPrev[0] ? { name: winnerName(leftPrev[0]), isBye: false } : { name: '—', isBye: false },
        teamB: { name: '—', isBye: false },
      },
      {
        teamA: rightPrev[0] ? { name: winnerName(rightPrev[0]), isBye: false } : { name: '—', isBye: false },
        teamB: { name: '—', isBye: false },
      },
    ],
  };

  const finalRound: BracketRoundView = {
    matches: [
      {
        teamA: { name: winnerName(semiFinals.matches[0]), isBye: false },
        teamB: { name: winnerName(semiFinals.matches[1]), isBye: false },
      },
    ],
  };

  return {
    bracketSize,
    leftRounds,
    rightRounds,
    semiFinals,
    finalRound,
    totalRounds,
  };
}
