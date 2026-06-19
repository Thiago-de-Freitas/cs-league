export const ALLOWED_BRACKET_SIZES = [4, 8, 16, 32] as const;
export type BracketSize = (typeof ALLOWED_BRACKET_SIZES)[number];

export function isValidBracketSize(n: number): n is BracketSize {
  return (ALLOWED_BRACKET_SIZES as readonly number[]).includes(n);
}

/** Ordem clássica de chaveamento: 1×N, evita confronto precoce entre favoritos */
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

export interface LeagueTeamForSeed {
  teamId: string;
  wins: number;
  losses: number;
  points: number;
  seed: number | null;
}

/** Seeding justo: desempenho (jogos) > seed manual */
export function rankTeamsForSeeding<T extends LeagueTeamForSeed>(teams: T[]): T[] {
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
