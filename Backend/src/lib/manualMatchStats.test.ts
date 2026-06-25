import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calcPlayerAdr, parseManualPlayerStats, resolveTotalRounds } from './manualMatchStats';

describe('manualMatchStats', () => {
  it('calcula ADR com base no dano e rounds totais', () => {
    assert.equal(calcPlayerAdr(2452, 21), 116.8);
    assert.equal(calcPlayerAdr(0, 21), 0);
    assert.equal(calcPlayerAdr(100, 0), 0);
  });

  it('resolve total de rounds do placar ou fallback', () => {
    assert.equal(resolveTotalRounds(13, 8), 21);
    assert.equal(resolveTotalRounds(null, null, 21), 21);
    assert.equal(resolveTotalRounds(null, null, null), null);
  });

  it('valida stats manuais de jogadores', () => {
    const team1 = 'team-1';
    const team2 = 'team-2';
    const result = parseManualPlayerStats(
      [
        {
          teamId: team1,
          playerName: 'Player A',
          kills: 25,
          deaths: 14,
          assists: 5,
          hsPercent: 60,
          damage: 2452,
        },
      ],
      [team1, team2]
    );
    assert.ok('players' in result);
    assert.equal(result.players[0].kills, 25);
    assert.equal(result.players[0].damage, 2452);
  });

  it('rejeita %HS fora do intervalo', () => {
    const result = parseManualPlayerStats(
      [
        {
          teamId: 'team-1',
          playerName: 'Player A',
          kills: 1,
          deaths: 0,
          assists: 0,
          hsPercent: 150,
          damage: 100,
        },
      ],
      ['team-1', 'team-2']
    );
    assert.ok('error' in result);
  });
});
