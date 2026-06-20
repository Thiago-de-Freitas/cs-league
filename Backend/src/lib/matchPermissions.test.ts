import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkMatchViewAccess, checkMatchResultAccess } from './matchPermissions';

const match = {
  team1Id: 'team-a',
  team2Id: 'team-b',
  league: { ownerId: 'owner-1', status: 'ONGOING' },
};

describe('checkMatchViewAccess', () => {
  it('allows admin', () => {
    assert.equal(checkMatchViewAccess('u1', 'ADMIN', match, []), true);
  });

  it('allows league owner', () => {
    assert.equal(checkMatchViewAccess('owner-1', 'USER', match, []), true);
  });

  it('allows team member', () => {
    assert.equal(checkMatchViewAccess('u1', 'USER', match, ['team-a']), true);
  });

  it('denies unrelated user', () => {
    assert.equal(checkMatchViewAccess('u1', 'USER', match, []), false);
  });
});

describe('checkMatchResultAccess', () => {
  it('allows captain of participating team', () => {
    assert.equal(checkMatchResultAccess('u1', 'USER', match, ['team-b']), true);
  });

  it('denies regular member without captain role', () => {
    assert.equal(checkMatchResultAccess('u1', 'USER', match, []), false);
  });

  it('allows league owner', () => {
    assert.equal(checkMatchResultAccess('owner-1', 'USER', match, []), true);
  });
});
