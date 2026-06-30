import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAvailableTeamsWhere } from './leagueAvailableTeams';

describe('buildAvailableTeamsWhere', () => {
  it('exclui times já inscritos na liga', () => {
    const where = buildAvailableTeamsWhere('league-1', ['team-a', 'team-b']);
    assert.deepEqual(where.id, { notIn: ['team-a', 'team-b'] });
  });

  it('inclui times globais e efêmeros da própria liga', () => {
    const where = buildAvailableTeamsWhere('league-1', []);
    assert.deepEqual(where.OR, [{ leagueId: null }, { leagueId: 'league-1' }]);
    assert.equal(where.id, undefined);
  });
});
