import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aggregateAdrBySteamId } from './teamMemberStats';

describe('teamMemberStats', () => {
  it('média ADR por steamId com uma entrada por partida', () => {
    const result = aggregateAdrBySteamId([
      { steamId: 'STEAM_1', adr: 80, matchId: 'm1' },
      { steamId: 'STEAM_1', adr: 100, matchId: 'm1' },
      { steamId: 'STEAM_1', adr: 60, matchId: 'm2' },
    ]);

    assert.equal(result.get('steam_1')?.matches, 2);
    assert.equal(result.get('steam_1')?.adr, 75);
  });
});
