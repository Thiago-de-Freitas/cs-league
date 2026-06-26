import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getStatDeltasForTeams,
  parseMatchRounds,
  resolveMatchOutcome,
  roundDifference,
  getRoundsOnlyStatDeltas,
  getPlayoffSeriesWinStatDeltas,
} from './matchResult';

describe('matchResult', () => {
  it('parseMatchRounds rejeita placar inválido', () => {
    assert.equal('error' in parseMatchRounds(undefined, 10), true);
    assert.equal('error' in parseMatchRounds(16, -1), true);
    assert.equal('error' in parseMatchRounds(0, 0), true);
  });

  it('resolve empate na fase de grupos', () => {
    const outcome = resolveMatchOutcome('a', 'b', 15, 15, 'GROUP');
    assert.ok(!('error' in outcome));
    assert.equal(outcome.isDraw, true);
    assert.equal(outcome.winnerId, null);
  });

  it('rejeita empate no mata-mata', () => {
    const outcome = resolveMatchOutcome('a', 'b', 15, 15, 'PLAYOFF');
    assert.ok('error' in outcome);
  });

  it('empate concede 1 ponto e soma rounds para ambos', () => {
    const outcome = { winnerId: null, isDraw: true };
    const deltas = getStatDeltasForTeams('a', 'b', 15, 15, outcome);
    assert.deepEqual(deltas.get('a'), {
      wins: 0,
      losses: 0,
      draws: 1,
      points: 1,
      roundsWon: 15,
      roundsLost: 15,
    });
    assert.deepEqual(deltas.get('b'), {
      wins: 0,
      losses: 0,
      draws: 1,
      points: 1,
      roundsWon: 15,
      roundsLost: 15,
    });
  });

  it('vitória concede 3 pontos e rounds corretos', () => {
    const outcome = { winnerId: 'a', isDraw: false };
    const deltas = getStatDeltasForTeams('a', 'b', 16, 12, outcome);
    assert.deepEqual(deltas.get('a'), {
      wins: 1,
      losses: 0,
      draws: 0,
      points: 3,
      roundsWon: 16,
      roundsLost: 12,
    });
    assert.deepEqual(deltas.get('b'), {
      wins: 0,
      losses: 1,
      draws: 0,
      points: 0,
      roundsWon: 12,
      roundsLost: 16,
    });
    assert.equal(roundDifference(16, 12), 4);
  });

  it('BO3 mapa individual — getRoundsOnlyStatDeltas não altera vitórias/pontos', () => {
    const deltas = getRoundsOnlyStatDeltas('a', 'b', 16, 10);
    assert.deepEqual(deltas.get('a'), {
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      roundsWon: 16,
      roundsLost: 10,
    });
    assert.deepEqual(deltas.get('b'), {
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      roundsWon: 10,
      roundsLost: 16,
    });
  });

  it('BO3 série completa — getPlayoffSeriesWinStatDeltas concede 1 vitória na classificação', () => {
    const deltas = getPlayoffSeriesWinStatDeltas('a', 'b', 'a');
    assert.deepEqual(deltas.get('a'), {
      wins: 1,
      losses: 0,
      draws: 0,
      points: 3,
      roundsWon: 0,
      roundsLost: 0,
    });
    assert.deepEqual(deltas.get('b'), {
      wins: 0,
      losses: 1,
      draws: 0,
      points: 0,
      roundsWon: 0,
      roundsLost: 0,
    });
  });
});
