import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatUserSearchResults } from './userSearch';

describe('formatUserSearchResults', () => {
  it('normaliza position para lowercase e avatar via helper', () => {
    const rows = formatUserSearchResults([
      {
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Allan',
        steamId: '76561198000000000',
        position: 'AWP',
        avatarUrl: null,
      },
    ]);
    assert.equal(rows[0].position, 'awp');
    assert.equal(rows[0].avatarUrl, null);
  });
});
