import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  balancePlayersIntoTeams,
  buildDefaultPlayerStats,
  parsePickupBalanceModesFromApi,
  serializePickupBalanceModesForApi,
} from './pickupBalance';

describe('balancePlayersIntoTeams', () => {
  it('distribui jogadores em snake draft por rating', () => {
    const players = [
      buildDefaultPlayerStats('p1', null, 90, 40, 2.0),
      buildDefaultPlayerStats('p2', null, 80, 40, 1.8),
      buildDefaultPlayerStats('p3', null, 70, 40, 1.5),
      buildDefaultPlayerStats('p4', null, 60, 40, 1.2),
    ];
    const assignments = balancePlayersIntoTeams(players, 2, 2, 'RATING');
    const team0 = assignments.filter((a) => a.teamIndex === 0).map((a) => a.userId);
    const team1 = assignments.filter((a) => a.teamIndex === 1).map((a) => a.userId);
    assert.deepEqual(team0, ['p1', 'p3']);
    assert.deepEqual(team1, ['p2', 'p4']);
  });

  it('POSITION_MIX coloca AWP em times diferentes quando possível', () => {
    const players = [
      buildDefaultPlayerStats('a1', 'AWP', 85, 45, 1.9),
      buildDefaultPlayerStats('a2', 'AWP', 80, 42, 1.7),
      buildDefaultPlayerStats('r1', 'RIFLER', 75, 38, 1.5),
      buildDefaultPlayerStats('r2', 'RIFLER', 70, 36, 1.4),
    ];
    const assignments = balancePlayersIntoTeams(players, 2, 2, 'POSITION_MIX');
    const team0Awps = assignments.filter((a) => a.teamIndex === 0 && ['a1', 'a2'].includes(a.userId));
    const team1Awps = assignments.filter((a) => a.teamIndex === 1 && ['a1', 'a2'].includes(a.userId));
    assert.equal(team0Awps.length, 1);
    assert.equal(team1Awps.length, 1);
  });

  it('aceita múltiplos critérios numéricos', () => {
    const players = [
      buildDefaultPlayerStats('p1', null, 100, 10, 2.0),
      buildDefaultPlayerStats('p2', null, 60, 90, 1.0),
      buildDefaultPlayerStats('p3', null, 80, 50, 1.5),
      buildDefaultPlayerStats('p4', null, 70, 40, 1.2),
    ];
    const assignments = balancePlayersIntoTeams(players, 2, 2, ['RATING', 'ADR']);
    assert.equal(assignments.length, 4);
    assert.equal(new Set(assignments.map((item) => item.userId)).size, 4);
  });
});

describe('pickup balance mode parsing', () => {
  it('normaliza modos da API em lowercase', () => {
    assert.deepEqual(parsePickupBalanceModesFromApi(['rating', 'adr']), ['RATING', 'ADR']);
    assert.deepEqual(serializePickupBalanceModesForApi(['RATING', 'HS_PERCENT']), ['rating', 'hs_percent']);
  });

  it('aceita valor único legado', () => {
    assert.deepEqual(parsePickupBalanceModesFromApi('hs_percent'), ['HS_PERCENT']);
  });
});
