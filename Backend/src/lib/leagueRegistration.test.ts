import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canUserRegisterTeam, isLeagueAcceptingRegistration } from './leagueRegistration';

const openLeague = {
  registrationOpen: true,
  status: 'UPCOMING',
  maxTeams: null as number | null,
  teamCount: 2,
  matchCount: 0,
};

const team = { ownerId: 'user-1' };

describe('isLeagueAcceptingRegistration', () => {
  it('allows when open, upcoming, has slots and no matches', () => {
    assert.equal(isLeagueAcceptingRegistration(openLeague), true);
  });

  it('denies when registration closed', () => {
    assert.equal(
      isLeagueAcceptingRegistration({ ...openLeague, registrationOpen: false }),
      false
    );
  });

  it('denies when league is ongoing', () => {
    assert.equal(
      isLeagueAcceptingRegistration({ ...openLeague, status: 'ONGOING' }),
      false
    );
  });

  it('denies when at capacity', () => {
    assert.equal(
      isLeagueAcceptingRegistration({ ...openLeague, maxTeams: 8, teamCount: 8 }),
      false
    );
  });

  it('denies when bracket already generated', () => {
    assert.equal(
      isLeagueAcceptingRegistration({ ...openLeague, matchCount: 4 }),
      false
    );
  });
});

describe('canUserRegisterTeam', () => {
  it('allows team owner', () => {
    const result = canUserRegisterTeam('user-1', 'USER', openLeague, team, false);
    assert.equal(result.allowed, true);
  });

  it('allows admin for any team', () => {
    const result = canUserRegisterTeam('admin', 'ADMIN', openLeague, { ownerId: 'other' }, false);
    assert.equal(result.allowed, true);
  });

  it('denies non-owner', () => {
    const result = canUserRegisterTeam('user-2', 'USER', openLeague, team, false);
    assert.equal(result.allowed, false);
    assert.match(result.error ?? '', /dono do time/i);
  });

  it('denies duplicate registration', () => {
    const result = canUserRegisterTeam('user-1', 'USER', openLeague, team, true);
    assert.equal(result.allowed, false);
    assert.match(result.error ?? '', /já está inscrito/i);
  });
});
