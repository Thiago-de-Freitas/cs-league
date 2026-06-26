import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAdminUserEntries, formatUserSearchResults } from './userSearch';

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

describe('formatAdminUserEntries', () => {
  it('inclui rótulo de posição e contagem de times', () => {
    const rows = formatAdminUserEntries([
      {
        id: 'u1',
        email: 'a@b.com',
        displayName: 'Allan',
        steamId: null,
        position: 'RIFLER',
        avatarUrl: null,
        role: 'USER',
        createdAt: new Date('2025-01-15T12:00:00Z'),
        _count: { memberships: 2 },
      },
    ]);
    assert.equal(rows[0].position, 'rifler');
    assert.equal(rows[0].positionLabel, 'Rifler');
    assert.equal(rows[0].teamCount, 2);
    assert.equal(rows[0].role, 'USER');
  });
});
