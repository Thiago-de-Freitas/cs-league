import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePlayerRankingsByLeagueMatches,
  aggregateTeamRankingsFromLeagueDemos,
  buildTeamRankingEntries,
  calcRating,
  filterPersonalStatsByPosition,
  filterStatsByPosition,
  membershipKey,
  mergeTeamRankingAggregates,
  resolvePlayerTeamId,
  resolveStatTeamId,
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

describe('buildTeamRankingEntries', () => {
  const teams = [
    { id: 't1', name: 'Alpha', tag: 'ALP', logoUrl: null },
    { id: 't2', name: 'Beta', tag: 'BET', logoUrl: null },
    { id: 't3', name: 'Gamma', tag: 'GAM', logoUrl: null },
  ];

  it('inclui times com vitórias registradas', () => {
    const entries = buildTeamRankingEntries(
      [
        {
          teamId: 't1',
          wins: 3,
          losses: 1,
          leagues: 1,
          matches: 2,
          teamAdr: 82.5,
          demosProcessing: 0,
        },
        {
          teamId: 't2',
          wins: 0,
          losses: 2,
          leagues: 1,
          matches: 0,
          teamAdr: 0,
          demosProcessing: 0,
        },
      ],
      teams,
      10
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].teamId, 't1');
    assert.equal(entries[0].wins, 3);
    assert.equal(entries[0].matches, 2);
    assert.equal(entries[0].teamAdr, 82.5);
  });

  it('inclui times com demos analisadas mesmo sem vitórias', () => {
    const entries = buildTeamRankingEntries(
      [
        {
          teamId: 't2',
          wins: 0,
          losses: 0,
          leagues: 1,
          matches: 1,
          teamAdr: 91.2,
          demosProcessing: 0,
        },
      ],
      teams,
      10
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].teamId, 't2');
    assert.equal(entries[0].matches, 1);
    assert.equal(entries[0].teamAdr, 91.2);
  });

  it('inclui times com demo em processamento', () => {
    const entries = buildTeamRankingEntries(
      [
        {
          teamId: 't3',
          wins: 0,
          losses: 0,
          leagues: 1,
          matches: 0,
          teamAdr: 0,
          demosProcessing: 2,
        },
      ],
      teams,
      10
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].demosProcessing, 2);
  });
});

describe('aggregateTeamRankingsFromLeagueDemos', () => {
  it('calcula ADR médio por jogo e conta demos em processamento', () => {
    const demoStats = aggregateTeamRankingsFromLeagueDemos(
      [
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          winnerId: null,
          status: 'SCHEDULED',
        },
      ],
      [
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          steamId: 'steam-a',
          adr: 80,
        },
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          steamId: 'steam-b',
          adr: 100,
        },
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          steamId: 'steam-c',
          adr: 70,
        },
      ],
      [
        {
          matchId: 'm2',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't3',
          winnerId: null,
          status: 'SCHEDULED',
        },
      ],
      new Map([
        [membershipKey('steam-a', 't1'), { position: 'RIFLER', role: 'MEMBER' }],
        [membershipKey('steam-b', 't1'), { position: 'AWP', role: 'MEMBER' }],
        [membershipKey('steam-c', 't2'), { position: 'IGL', role: 'CAPTAIN' }],
      ])
    );

    const team1 = demoStats.get('t1');
    const team2 = demoStats.get('t2');
    assert.equal(team1?.matches, 1);
    assert.equal(team1?.teamAdr, 90);
    assert.equal(team1?.demosProcessing, 1);
    assert.equal(team2?.matches, 1);
    assert.equal(team2?.teamAdr, 70);
  });

  it('usa teamId explícito de stats manuais sem depender de steamId', () => {
    const demoStats = aggregateTeamRankingsFromLeagueDemos(
      [
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          winnerId: null,
          status: 'SCHEDULED',
        },
      ],
      [
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          teamId: 't1',
          steamId: null,
          adr: 88.5,
        },
        {
          matchId: 'm1',
          leagueId: 'l1',
          team1Id: 't1',
          team2Id: 't2',
          teamId: 't2',
          steamId: null,
          adr: 72,
        },
      ],
      [],
      new Map()
    );

    assert.equal(demoStats.get('t1')?.matches, 1);
    assert.equal(demoStats.get('t1')?.teamAdr, 88.5);
    assert.equal(demoStats.get('t2')?.teamAdr, 72);
  });
});

describe('resolveStatTeamId', () => {
  it('prioriza teamId salvo nas stats manuais', () => {
    const teamId = resolveStatTeamId(
      {
        teamId: 't2',
        steamId: 'steam-a',
        team1Id: 't1',
        team2Id: 't2',
      },
      new Map([[membershipKey('steam-a', 't1'), { position: 'RIFLER', role: 'MEMBER' }]])
    );
    assert.equal(teamId, 't2');
  });
});

describe('mergeTeamRankingAggregates', () => {
  it('combina vitórias de liga com estatísticas de demo', () => {
    const merged = mergeTeamRankingAggregates(
      [{ teamId: 't1', wins: 2, losses: 1, leagues: 1 }],
      new Map([
        [
          't1',
          {
            wins: 0,
            losses: 0,
            leagues: 1,
            matches: 3,
            teamAdr: 85.4,
            demosProcessing: 1,
          },
        ],
      ])
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].wins, 2);
    assert.equal(merged[0].matches, 3);
    assert.equal(merged[0].teamAdr, 85.4);
    assert.equal(merged[0].demosProcessing, 1);
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
