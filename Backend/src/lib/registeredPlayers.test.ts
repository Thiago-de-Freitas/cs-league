import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterStatsByRegisteredSteamIds,
  hasRegisteredSteamId,
  normalizeSteamId,
} from './registeredPlayers';
import { aggregateMatchStats } from './matchStats';

describe('registeredPlayers', () => {
  it('normaliza steam id com sufixo .0', () => {
    assert.equal(normalizeSteamId('76561198000000000.0'), '76561198000000000');
  });

  it('identifica steam id cadastrado', () => {
    const registered = new Set(['76561198000000001']);
    assert.equal(hasRegisteredSteamId('76561198000000001', registered), true);
    assert.equal(hasRegisteredSteamId('76561198000000002', registered), false);
    assert.equal(hasRegisteredSteamId(null, registered), false);
  });

  it('filtra stats para jogadores cadastrados', () => {
    const registered = new Set(['steam-a', 'steam-b']);
    const stats = [
      { steamId: 'steam-a', playerName: 'A' },
      { steamId: 'steam-x', playerName: 'X' },
      { steamId: null, playerName: 'Sem ID' },
    ];
    const filtered = filterStatsByRegisteredSteamIds(stats, registered);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.steamId, 'steam-a');
  });
});

describe('aggregateMatchStats', () => {
  it('ignora jogadores sem steam id cadastrado', () => {
    const registered = new Set(['steam-reg']);
    const demos = [
      {
        status: 'COMPLETED',
        isPersonal: false,
        stats: [
          {
            steamId: 'steam-reg',
            playerName: 'Registrado',
            kills: 20,
            deaths: 10,
            adr: 90,
            hsPercent: 40,
            kast: 70,
          },
          {
            steamId: 'steam-guest',
            playerName: 'Convidado',
            kills: 30,
            deaths: 5,
            adr: 120,
            hsPercent: 50,
            kast: 80,
          },
        ],
      },
    ] as Parameters<typeof aggregateMatchStats>[0];

    const aggregated = aggregateMatchStats(demos, registered);
    assert.equal(aggregated.length, 1);
    assert.equal(aggregated[0]?.steamId, 'steam-reg');
  });
});
