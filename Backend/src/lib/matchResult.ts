export interface ParsedMatchRounds {
  team1Rounds: number;
  team2Rounds: number;
}

export interface MatchOutcome {
  winnerId: string | null;
  isDraw: boolean;
}

export interface LeagueTeamStatDelta {
  wins: number;
  losses: number;
  draws: number;
  points: number;
  roundsWon: number;
  roundsLost: number;
}

export function parseMatchRounds(
  team1Rounds: unknown,
  team2Rounds: unknown
): ParsedMatchRounds | { error: string } {
  if (team1Rounds === undefined || team1Rounds === null || team2Rounds === undefined || team2Rounds === null) {
    return { error: 'Informe o placar de rounds dos dois times.' };
  }

  const r1 = Number(team1Rounds);
  const r2 = Number(team2Rounds);

  if (!Number.isInteger(r1) || !Number.isInteger(r2) || r1 < 0 || r2 < 0) {
    return { error: 'Placar de rounds deve ser um número inteiro não negativo.' };
  }

  if (r1 === 0 && r2 === 0) {
    return { error: 'Informe um placar válido (pelo menos um time com rounds > 0).' };
  }

  return { team1Rounds: r1, team2Rounds: r2 };
}

export function resolveMatchOutcome(
  team1Id: string,
  team2Id: string,
  team1Rounds: number,
  team2Rounds: number,
  phase: string,
  winnerIdFromBody?: string | null
): MatchOutcome | { error: string } {
  const isDraw = team1Rounds === team2Rounds;
  const phaseUpper = phase.toUpperCase();

  if (isDraw) {
    if (phaseUpper === 'PLAYOFF') {
      return { error: 'Empate não é permitido na fase eliminatória.' };
    }
    if (winnerIdFromBody) {
      return { error: 'Não informe vencedor em caso de empate.' };
    }
    return { winnerId: null, isDraw: true };
  }

  const winnerFromScore = team1Rounds > team2Rounds ? team1Id : team2Id;

  if (winnerIdFromBody && winnerIdFromBody !== winnerFromScore) {
    return { error: 'O vencedor informado não corresponde ao placar de rounds.' };
  }

  return { winnerId: winnerFromScore, isDraw: false };
}

export function getStatDeltasForTeams(
  team1Id: string,
  team2Id: string,
  team1Rounds: number,
  team2Rounds: number,
  outcome: MatchOutcome
): Map<string, LeagueTeamStatDelta> {
  const zero = (): LeagueTeamStatDelta => ({
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    roundsWon: 0,
    roundsLost: 0,
  });

  const team1 = zero();
  const team2 = zero();

  team1.roundsWon = team1Rounds;
  team1.roundsLost = team2Rounds;
  team2.roundsWon = team2Rounds;
  team2.roundsLost = team1Rounds;

  if (outcome.isDraw) {
    team1.draws = 1;
    team1.points = 1;
    team2.draws = 1;
    team2.points = 1;
  } else if (outcome.winnerId === team1Id) {
    team1.wins = 1;
    team1.points = 3;
    team2.losses = 1;
  } else {
    team2.wins = 1;
    team2.points = 3;
    team1.losses = 1;
  }

  return new Map([
    [team1Id, team1],
    [team2Id, team2],
  ]);
}

export function roundDifference(roundsWon: number, roundsLost: number): number {
  return roundsWon - roundsLost;
}
