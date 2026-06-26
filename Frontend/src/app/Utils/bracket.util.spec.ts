import { buildBracketView, type MatchInput, type TeamSeedInput } from './bracket.util';

describe('bracket.util — BO3 no chaveamento', () => {
  const teams: TeamSeedInput[] = [
    { id: 't1', name: 'Alpha', wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0, seed: 1 },
    { id: 't2', name: 'Beta', wins: 0, losses: 0, draws: 0, points: 0, roundsWon: 0, roundsLost: 0, seed: 2 },
  ];

  const baseMatch = (overrides: Partial<MatchInput>): MatchInput => ({
    id: 'match-1',
    round: 1,
    bracketPosition: 1,
    status: 'scheduled',
    team1: { id: 't1', name: 'Alpha' },
    team2: { id: 't2', name: 'Beta' },
    ...overrides,
  });

  it('série BO3 em andamento mostra placar e status in_progress', () => {
    const matches: MatchInput[] = [
      baseMatch({
        seriesId: 'series-1',
        seriesGameNumber: 1,
        seriesStatus: 'in_progress',
        team1MapWins: 1,
        team2MapWins: 0,
        status: 'completed',
        winnerId: 't1',
      }),
    ];

    const view = buildBracketView(teams, 2, 2, matches);
    const finalMatch = view.columns[0].matches[0];
    expect(finalMatch.seriesScore).toBe('1–0');
    expect(finalMatch.status).toBe('in_progress');
    expect(finalMatch.teamA.isWinner).toBe(false);
    expect(finalMatch.teamB.isWinner).toBe(false);
  });

  it('série BO3 completa usa seriesWinnerId e não marca vitória por mapa isolado', () => {
    const matches: MatchInput[] = [
      baseMatch({
        seriesId: 'series-1',
        seriesGameNumber: 1,
        seriesStatus: 'completed',
        seriesWinnerId: 't2',
        team1MapWins: 1,
        team2MapWins: 2,
        status: 'completed',
        winnerId: 't1',
      }),
    ];

    const view = buildBracketView(teams, 2, 2, matches);
    const finalMatch = view.columns[0].matches[0];
    expect(finalMatch.seriesScore).toBe('1–2');
    expect(finalMatch.status).toBe('completed');
    expect(finalMatch.teamB.isWinner).toBe(true);
    expect(finalMatch.teamA.isWinner).toBe(false);
  });

  it('BO1 sem série — vitória na partida marca vencedor', () => {
    const matches: MatchInput[] = [
      baseMatch({
        status: 'completed',
        winnerId: 't1',
      }),
    ];

    const view = buildBracketView(teams, 2, 2, matches);
    const finalMatch = view.columns[0].matches[0];
    expect(finalMatch.teamA.isWinner).toBe(true);
    expect(finalMatch.seriesScore).toBeUndefined();
  });

  it('usa partida com seriesGameNumber 1 como representante do slot', () => {
    const matches: MatchInput[] = [
      baseMatch({
        id: 'game-2',
        seriesId: 'series-1',
        seriesGameNumber: 2,
        team1MapWins: 1,
        team2MapWins: 1,
        seriesStatus: 'in_progress',
      }),
      baseMatch({
        id: 'game-1',
        seriesId: 'series-1',
        seriesGameNumber: 1,
        team1MapWins: 1,
        team2MapWins: 1,
        seriesStatus: 'in_progress',
      }),
    ];

    const view = buildBracketView(teams, 2, 2, matches);
    expect(view.columns[0].matches[0].matchId).toBe('game-1');
    expect(view.columns[0].matches[0].seriesScore).toBe('1–1');
  });
});
