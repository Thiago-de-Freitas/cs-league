import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFairBracketSize,
  resolveBracketSize,
  hasRegistrationSlots,
  remainingRegistrationSlots,
  parseRegistrationCap,
  getFirstRoundPairings,
  computeWalkoverWinners,
} from './bracket';

describe('getFairBracketSize', () => {
  it('returns 2 for 2 teams', () => {
    assert.equal(getFairBracketSize(2), 2);
  });

  it('rounds up to next power of 2', () => {
    assert.equal(getFairBracketSize(3), 4);
    assert.equal(getFairBracketSize(5), 8);
    assert.equal(getFairBracketSize(9), 16);
    assert.equal(getFairBracketSize(12), 16);
  });

  it('caps at MAX_LEAGUE_TEAMS', () => {
    assert.equal(getFairBracketSize(50), 64);
  });
});

describe('resolveBracketSize', () => {
  it('uses stored bracket size when set', () => {
    assert.equal(resolveBracketSize(5, 8), 8);
  });

  it('estimates from team count when not generated yet', () => {
    assert.equal(resolveBracketSize(5, null), 8);
  });
});

describe('registration cap', () => {
  it('unlimited when maxTeams is null', () => {
    assert.equal(hasRegistrationSlots(10, null), true);
    assert.equal(remainingRegistrationSlots(10, null), null);
  });

  it('respects explicit cap', () => {
    assert.equal(hasRegistrationSlots(7, 8), true);
    assert.equal(hasRegistrationSlots(8, 8), false);
    assert.equal(remainingRegistrationSlots(6, 8), 2);
  });

  it('parses optional cap', () => {
    assert.equal(parseRegistrationCap(null), null);
    assert.equal(parseRegistrationCap(''), null);
    assert.equal(parseRegistrationCap(12), 12);
    assert.equal(parseRegistrationCap(1), null);
  });
});

describe('getFirstRoundPairings fairness', () => {
  it('pairs seed 1 with lowest seed in 8-team bracket', () => {
    const pairs = getFirstRoundPairings(8);
    assert.deepEqual(pairs[0], [1, 8]);
  });
});

describe('computeWalkoverWinners', () => {
  it('marks seed 1 as walkover when seed 8 slot is empty in 8-team bracket', () => {
    const seedToTeam = new Map<number, string>([
      [1, 'team-seed-1'],
      [2, 'team-seed-2'],
      [3, 'team-seed-3'],
      [4, 'team-seed-4'],
      [5, 'team-seed-5'],
    ]);
    const walkovers = computeWalkoverWinners(seedToTeam, 8);
    assert.equal(walkovers.get(1), 'team-seed-1');
    assert.ok(walkovers.size >= 1);
  });
});
