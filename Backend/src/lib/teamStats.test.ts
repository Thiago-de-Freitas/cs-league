import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sumLeagueTeamStats } from './teamStats';

describe('sumLeagueTeamStats', () => {
  it('soma vitórias, derrotas, empates, pontos e rounds', () => {
    const result = sumLeagueTeamStats([
      { wins: 3, losses: 1, draws: 2, points: 11, roundsWon: 50, roundsLost: 40 },
      { wins: 2, losses: 2, draws: 0, points: 6, roundsWon: 30, roundsLost: 28 },
    ]);
    assert.deepEqual(result, {
      wins: 5,
      losses: 3,
      draws: 2,
      points: 17,
      roundsWon: 80,
      roundsLost: 68,
    });
  });

  it('retorna zeros para lista vazia', () => {
    assert.deepEqual(sumLeagueTeamStats([]), {
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      roundsWon: 0,
      roundsLost: 0,
    });
  });
});
