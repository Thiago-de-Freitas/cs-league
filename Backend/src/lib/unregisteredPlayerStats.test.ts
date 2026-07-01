import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUnregisteredGroupKey,
  parseUnregisteredGroupKey,
} from './unregisteredPlayerStats';

describe('unregisteredPlayerStats helpers', () => {
  it('monta e interpreta groupKey por steam id', () => {
    const key = buildUnregisteredGroupKey('76561198000000001', 'Player');
    assert.equal(key, 'steam:76561198000000001');
    assert.deepEqual(parseUnregisteredGroupKey(key), {
      steamId: '76561198000000001',
      playerName: null,
    });
  });

  it('monta e interpreta groupKey por nome quando não há steam id', () => {
    const key = buildUnregisteredGroupKey(null, 'Guest Player');
    assert.equal(key, 'name:guest player');
    assert.deepEqual(parseUnregisteredGroupKey(key), {
      steamId: null,
      playerName: 'guest player',
    });
  });

  it('rejeita groupKey inválido', () => {
    assert.equal(parseUnregisteredGroupKey('invalid'), null);
    assert.equal(parseUnregisteredGroupKey('steam:'), null);
  });
});
