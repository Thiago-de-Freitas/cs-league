export type Bo3SeriesAdvanceInput = {
  team1Id: string;
  team2Id: string;
  winningTeamId: string;
  team1MapWins: number;
  team2MapWins: number;
  activeGameNumber: number;
};

export type Bo3SeriesAdvanceResult = {
  completed: boolean;
  winnerId: string | null;
  team1MapWins: number;
  team2MapWins: number;
  activeGameNumber: number;
};

/** Lógica pura de avanço BO3 após vitória em um mapa (melhor de 3). */
export function computeBo3SeriesAfterMapWin(input: Bo3SeriesAdvanceInput): Bo3SeriesAdvanceResult {
  const team1Win = input.winningTeamId === input.team1Id;
  const team1MapWins = input.team1MapWins + (team1Win ? 1 : 0);
  const team2MapWins = input.team2MapWins + (team1Win ? 0 : 1);

  if (team1MapWins >= 2 || team2MapWins >= 2) {
    const winnerId = team1MapWins >= 2 ? input.team1Id : input.team2Id;
    return {
      completed: true,
      winnerId,
      team1MapWins,
      team2MapWins,
      activeGameNumber: input.activeGameNumber,
    };
  }

  return {
    completed: false,
    winnerId: null,
    team1MapWins,
    team2MapWins,
    activeGameNumber: input.activeGameNumber + 1,
  };
}
