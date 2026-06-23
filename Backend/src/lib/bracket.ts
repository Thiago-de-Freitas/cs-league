/** Mínimo de times para gerar chaveamento; máximo suportado pelo algoritmo (potências de 2). */
export const MIN_LEAGUE_TEAMS = 2;
export const MAX_LEAGUE_TEAMS = 64;

/** Próxima potência de 2 >= n (chaveamento single-elimination com BYEs para favoritos). */
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

/** Tamanho do bracket em uso: fixado após gerar chaveamento ou estimado pelos times atuais. */
export function resolveBracketSize(teamCount: number, storedBracketSize?: number | null): number {
  if (storedBracketSize != null && storedBracketSize >= MIN_LEAGUE_TEAMS) {
    return storedBracketSize;
  }
  return getFairBracketSize(teamCount);
}

export function isValidRegistrationCap(value: unknown): value is number | null | undefined {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_LEAGUE_TEAMS && n <= MAX_LEAGUE_TEAMS;
}

export function parseRegistrationCap(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_LEAGUE_TEAMS || n > MAX_LEAGUE_TEAMS) {
    return null;
  }
  return n;
}

export function hasRegistrationSlots(teamCount: number, maxTeams: number | null | undefined): boolean {
  if (maxTeams == null) {
    return teamCount < MAX_LEAGUE_TEAMS;
  }
  return teamCount < maxTeams;
}

export function remainingRegistrationSlots(teamCount: number, maxTeams: number | null | undefined): number | null {
  if (maxTeams == null) {
    return null;
  }
  return Math.max(0, maxTeams - teamCount);
}

/** @deprecated Use getFairBracketSize — mantido para compatibilidade de imports antigos */
export const ALLOWED_BRACKET_SIZES = [4, 8, 16, 32] as const;

export function isValidBracketSize(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_LEAGUE_TEAMS && n <= MAX_LEAGUE_TEAMS && (n & (n - 1)) === 0;
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

/** Times que avançam por BYE na 1ª rodada (posição do bracket → teamId) */
export function computeWalkoverWinners(
  seedToTeamId: Map<number, string>,
  bracketSize: number
): Map<number, string> {
  const walkoverWinners = new Map<number, string>();
  const pairings = getFirstRoundPairings(bracketSize);
  pairings.forEach(([seedA, seedB], position) => {
    const pos = position + 1;
    const teamA = seedToTeamId.get(seedA);
    const teamB = seedToTeamId.get(seedB);
    if (teamA && !teamB) walkoverWinners.set(pos, teamA);
    else if (!teamA && teamB) walkoverWinners.set(pos, teamB);
  });
  return walkoverWinners;
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

/** Par de partidas da mesma rodada que alimenta um jogo da próxima */
export function getFeederPositions(bracketPosition: number): [number, number] {
  const base = bracketPosition % 2 === 1 ? bracketPosition : bracketPosition - 1;
  return [base, base + 1];
}

export function getNextBracketSlot(
  round: number,
  bracketPosition: number
): { round: number; bracketPosition: number } | null {
  const nextRound = round + 1;
  const nextPosition = Math.ceil(bracketPosition / 2);
  return { round: nextRound, bracketPosition: nextPosition };
}
