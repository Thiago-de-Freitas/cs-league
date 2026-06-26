import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { splitBySearchQuery } from './user-search.util';

describe('splitBySearchQuery', () => {
  it('destaca trecho case-insensitive', () => {
    assert.deepEqual(splitBySearchQuery('Allan Vieira', 'al'), {
      pre: '',
      hit: 'Al',
      post: 'lan Vieira',
    });
  });

  it('retorna texto inteiro quando não há match', () => {
    assert.deepEqual(splitBySearchQuery('Ditador', 'xyz'), {
      pre: 'Ditador',
      hit: '',
      post: '',
    });
  });
});
