import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sumLeagueTeamStats } from './teamStats';

describe('sumLeagueTeamStats', () => {
  it('soma vitórias, derrotas e pontos', () => {
    const result = sumLeagueTeamStats([
      { wins: 3, losses: 1, points: 9 },
      { wins: 2, losses: 2, points: 6 },
    ]);
    assert.deepEqual(result, { wins: 5, losses: 3, points: 15 });
  });

  it('retorna zeros para lista vazia', () => {
    assert.deepEqual(sumLeagueTeamStats([]), { wins: 0, losses: 0, points: 0 });
  });
});
