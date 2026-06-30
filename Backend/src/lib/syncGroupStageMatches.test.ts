import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGroupMatchSignature,
  findMissingRoundRobinMatches,
} from './syncGroupStageMatches';

describe('syncGroupStageMatches helpers', () => {
  it('buildGroupMatchSignature ignora ordem dos times no turno único', () => {
    const a = buildGroupMatchSignature('t1', 't2', 1, false);
    const b = buildGroupMatchSignature('t2', 't1', 3, false);
    assert.equal(a, b);
  });

  it('buildGroupMatchSignature preserva mando no ida e volta', () => {
    const a = buildGroupMatchSignature('t1', 't2', 2, true);
    const b = buildGroupMatchSignature('t2', 't1', 2, true);
    assert.notEqual(a, b);
  });

  it('findMissingRoundRobinMatches cria confrontos do time novo', () => {
    const missing = findMissingRoundRobinMatches(
      ['t1', 't2', 't3'],
      [
        { team1Id: 't1', team2Id: 't2', groupRound: 1 },
        { team1Id: 't1', team2Id: 't3', groupRound: 1 },
      ],
      false
    );

    assert.equal(missing.length, 1);
    assert.deepEqual(
      [missing[0].team1Id, missing[0].team2Id].sort(),
      ['t2', 't3']
    );
  });
});
