import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePlayerRankingsByLeagueMatches,
  calcRating,
  filterPersonalStatsByPosition,
  filterStatsByPosition,
  membershipKey,
  resolvePlayerTeamId,
  statRowMatchesPositionFilter,
  type LeaguePlayerStatRow,
  type TeamMembershipContext,
} from './rankings';

const memberships = new Map<string, TeamMembershipContext>([
  [membershipKey('steam-awp', 'team-a'), { position: 'AWP', role: 'MEMBER' }],
  [membershipKey('steam-cap', 'team-a'), { position: 'IGL', role: 'CAPTAIN' }],
  [membershipKey('steam-rifler', 'team-b'), { position: 'RIFLER', role: 'MEMBER' }],
]);

const baseRow = (overrides: Partial<LeaguePlayerStatRow>): LeaguePlayerStatRow => ({
  steamId: 'steam-awp',
  playerName: 'Player',
  matchId: 'm1',
  team1Id: 'team-a',
  team2Id: 'team-b',
  kills: 20,
  deaths: 10,
  adr: 80,
  hsPercent: 40,
  kast: 70,
  ...overrides,
});

describe('calcRating', () => {
  it('returns higher rating for stronger stats', () => {
    const strong = calcRating(1.5, 90, 80, 50);
    const weak = calcRating(0.8, 60, 60, 30);
    assert.ok(strong > weak);
  });

  it('handles zero deaths kd edge case via caller', () => {
    const rating = calcRating(2, 85, 75, 40);
    assert.ok(rating > 0 && rating < 5);
  });
});

describe('position ranking filters', () => {
  it('resolve time do jogador na partida', () => {
    assert.equal(resolvePlayerTeamId('steam-awp', 'team-a', 'team-b', memberships), 'team-a');
    assert.equal(resolvePlayerTeamId('steam-rifler', 'team-a', 'team-b', memberships), 'team-b');
    assert.equal(resolvePlayerTeamId(null, 'team-a', 'team-b', memberships), null);
  });

  it('filtra por posição e capitão', () => {
    const rows = [
      baseRow({ steamId: 'steam-awp', adr: 90 }),
      baseRow({ steamId: 'steam-cap', adr: 70, matchId: 'm2' }),
      baseRow({ steamId: 'steam-rifler', adr: 95, matchId: 'm3' }),
    ];

    const awpRows = filterStatsByPosition(rows, 'AWP', memberships);
    assert.equal(awpRows.length, 1);
    assert.equal(awpRows[0].steamId, 'steam-awp');

    const captainRows = filterStatsByPosition(rows, 'CAPTAIN', memberships);
    assert.equal(captainRows.length, 1);
    assert.equal(captainRows[0].steamId, 'steam-cap');

    assert.equal(statRowMatchesPositionFilter(baseRow({ steamId: 'steam-rifler' }), 'RIFLER', memberships), true);
    assert.equal(statRowMatchesPositionFilter(baseRow({ steamId: 'steam-rifler' }), 'AWP', memberships), false);
  });
});

describe('aggregatePlayerRankingsByLeagueMatches', () => {
  it('ordena por ADR médio em jogos de liga e ignora múltiplas demos do mesmo jogo', () => {
    const ranked = aggregatePlayerRankingsByLeagueMatches(
      [
        {
          steamId: '1',
          playerName: 'Alpha',
          matchId: 'm1',
          team1Id: 't1',
          team2Id: 't2',
          kills: 20,
          deaths: 10,
          adr: 80,
          hsPercent: 40,
          kast: 70,
        },
        {
          steamId: '1',
          playerName: 'Alpha',
          matchId: 'm1',
          team1Id: 't1',
          team2Id: 't2',
          kills: 22,
          deaths: 12,
          adr: 100,
          hsPercent: 50,
          kast: 80,
        },
        {
          steamId: '1',
          playerName: 'Alpha',
          matchId: 'm2',
          team1Id: 't1',
          team2Id: 't2',
          kills: 18,
          deaths: 16,
          adr: 60,
          hsPercent: 30,
          kast: 60,
        },
        {
          steamId: '2',
          playerName: 'Bravo',
          matchId: 'm3',
          team1Id: 't1',
          team2Id: 't2',
          kills: 24,
          deaths: 14,
          adr: 95,
          hsPercent: 45,
          kast: 75,
        },
      ],
      10
    );

    assert.equal(ranked[0].playerName, 'Bravo');
    assert.equal(ranked[0].adr, 95);
    assert.equal(ranked[0].matches, 1);
    assert.equal(ranked[1].playerName, 'Alpha');
    assert.equal(ranked[1].matches, 2);
    assert.equal(ranked[1].adr, 75);
  });

  it('inclui demos pessoais no agregado quando presentes nas linhas', () => {
    const ranked = aggregatePlayerRankingsByLeagueMatches(
      [
        {
          steamId: 'steam-league',
          playerName: 'League',
          matchId: 'm1',
          team1Id: 't1',
          team2Id: 't2',
          kills: 20,
          deaths: 10,
          adr: 70,
          hsPercent: 40,
          kast: 70,
        },
        {
          steamId: 'steam-personal',
          playerName: 'Personal',
          matchId: 'personal:d1',
          team1Id: '',
          team2Id: '',
          kills: 25,
          deaths: 15,
          adr: 95,
          hsPercent: 50,
          kast: 75,
        },
      ],
      10
    );

    assert.equal(ranked[0].steamId, 'steam-personal');
    assert.equal(ranked[0].adr, 95);
    assert.equal(ranked[1].steamId, 'steam-league');
  });
});

describe('filterPersonalStatsByPosition', () => {
  const personalRow = (steamId: string): LeaguePlayerStatRow => ({
    steamId,
    playerName: steamId,
    matchId: `personal:${steamId}`,
    team1Id: '',
    team2Id: '',
    kills: 10,
    deaths: 5,
    adr: 80,
    hsPercent: 40,
    kast: 70,
  });

  it('filtra demos pessoais pela posição cadastrada no perfil', () => {
    const rows = [personalRow('awp-user'), personalRow('rifler-user')];
    const positions = new Map([
      ['awp-user', 'AWP' as const],
      ['rifler-user', 'RIFLER' as const],
    ]);

    const filtered = filterPersonalStatsByPosition(rows, 'AWP', positions);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].steamId, 'awp-user');
  });

  it('exclui demos pessoais do filtro de capitão', () => {
    const filtered = filterPersonalStatsByPosition([personalRow('awp-user')], 'CAPTAIN', new Map());
    assert.equal(filtered.length, 0);
  });
});
