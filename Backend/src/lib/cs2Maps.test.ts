import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CS2_MAP_POOL,
  parseMapPool,
  validateMapPoolForSeriesFormat,
  isValidMapId,
} from './cs2Maps';

describe('cs2Maps — parseMapPool', () => {
  it('retorna pool padrão para input inválido', () => {
    assert.deepEqual(parseMapPool(null), [...DEFAULT_CS2_MAP_POOL]);
    assert.deepEqual(parseMapPool(['x']), [...DEFAULT_CS2_MAP_POOL]);
    assert.deepEqual(parseMapPool([]), [...DEFAULT_CS2_MAP_POOL]);
  });

  it('normaliza e deduplica mapas válidos', () => {
    const pool = parseMapPool(['DE_DUST2', 'de_dust2', 'de_mirage', 'invalid']);
    assert.deepEqual(pool, ['de_dust2', 'de_mirage']);
  });

  it('isValidMapId reconhece mapas CS2', () => {
    assert.equal(isValidMapId('de_dust2'), true);
    assert.equal(isValidMapId('de_fake'), false);
  });
});

describe('cs2Maps — validateMapPoolForSeriesFormat', () => {
  const twoMaps = ['de_dust2', 'de_mirage'];
  const fiveMaps = ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno', 'de_mirage'];

  it('BO1 aceita pool com 2+ mapas', () => {
    assert.equal(validateMapPoolForSeriesFormat(twoMaps, 'BO1'), null);
    assert.equal(validateMapPoolForSeriesFormat(fiveMaps, 'BO1'), null);
  });

  it('BO1 rejeita pool com menos de 2 mapas', () => {
    assert.match(validateMapPoolForSeriesFormat(['de_dust2'], 'BO1')!, /pelo menos 2/);
  });

  it('BO3 exige pelo menos 5 mapas', () => {
    assert.equal(validateMapPoolForSeriesFormat(fiveMaps, 'BO3'), null);
    assert.match(validateMapPoolForSeriesFormat(twoMaps, 'BO3')!, /pelo menos 5/);
    assert.match(validateMapPoolForSeriesFormat(fourMaps(), 'BO3')!, /pelo menos 5/);
  });
});

function fourMaps(): string[] {
  return ['de_ancient', 'de_anubis', 'de_dust2', 'de_inferno'];
}
