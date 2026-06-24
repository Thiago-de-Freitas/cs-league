import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePlayerPosition,
  parsePlayerPositionOptional,
  parseRankingPositionFilter,
} from './playerPosition';

describe('player position parsing', () => {
  it('aceita posições válidas', () => {
    assert.equal(parsePlayerPosition('awp'), 'AWP');
    assert.equal(parsePlayerPosition('RIFLER'), 'RIFLER');
    assert.equal(parsePlayerPosition(' lurker '), 'LURKER');
  });

  it('rejeita posição inválida', () => {
    assert.equal(parsePlayerPosition('sniper'), null);
    assert.equal(parsePlayerPosition(''), null);
  });

  it('parse opcional limpa valor vazio', () => {
    assert.equal(parsePlayerPositionOptional(undefined), undefined);
    assert.equal(parsePlayerPositionOptional(null), null);
    assert.equal(parsePlayerPositionOptional(''), null);
    assert.equal(parsePlayerPositionOptional('IGL'), 'IGL');
  });

  it('parse filtro de ranking inclui capitão', () => {
    assert.equal(parseRankingPositionFilter('captain'), 'CAPTAIN');
    assert.equal(parseRankingPositionFilter('ENTRY'), 'ENTRY');
    assert.equal(parseRankingPositionFilter('invalid'), null);
  });
});
