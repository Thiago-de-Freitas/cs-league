import { compareTeamsByStandings, hasStandingsData, sortTeamsForClassification, sortTeamsByStandings } from './standings.util';
import { Team } from '../Models/interfaces';

function team(id: string, overrides: Partial<Team> = {}): Team {
  return {
    id,
    name: id,
    tag: id.slice(0, 2).toUpperCase(),
    players: [],
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    roundsWon: 0,
    roundsLost: 0,
    ...overrides,
  };
}

describe('standings.util', () => {
  it('ordena por pontos e saldo de rounds', () => {
    const sorted = sortTeamsByStandings([
      team('aa', { points: 9, wins: 3, losses: 1, roundsWon: 50, roundsLost: 28 }),
      team('cw', { points: 9, wins: 3, losses: 0, roundsWon: 52, roundsLost: 28 }),
      team('bt', { points: 6, wins: 2, losses: 1 }),
    ]);

    expect(sorted.map((t) => t.id)).toEqual(['cw', 'aa', 'bt']);
  });

  it('desempata por menos derrotas com mesmos pontos e saldo', () => {
    const a = team('a', { points: 9, wins: 3, losses: 1, roundDifference: 10 });
    const b = team('b', { points: 9, wins: 3, losses: 0, roundDifference: 10 });
    expect(compareTeamsByStandings(a, b)).toBeGreaterThan(0);
  });

  it('usa seed antes de existirem resultados', () => {
    const sorted = sortTeamsForClassification(
      [team('b', { seed: 2 }), team('a', { seed: 1 })],
      false
    );
    expect(sorted.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('detecta quando há dados de classificação', () => {
    expect(hasStandingsData([team('a')])).toBeFalse();
    expect(hasStandingsData([team('a', { points: 3 })])).toBeTrue();
  });
});
