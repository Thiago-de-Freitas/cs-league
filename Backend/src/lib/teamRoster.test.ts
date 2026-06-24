import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAdmin } from './permissions';

function canManageTeamRoster(user: { userId: string; role: string }, team: { ownerId: string }): boolean {
  return team.ownerId === user.userId || isAdmin(user);
}

const MEMBER_TAG_MAX_LENGTH = 12;

function parseMemberTag(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MEMBER_TAG_MAX_LENGTH) return undefined;
  return trimmed;
}

describe('team roster permissions', () => {  it('permite dono do time', () => {
    assert.equal(canManageTeamRoster({ userId: 'u1', role: 'USER' }, { ownerId: 'u1' }), true);
  });

  it('permite administrador do sistema', () => {
    assert.equal(canManageTeamRoster({ userId: 'admin', role: 'ADMIN' }, { ownerId: 'u2' }), true);
  });

  it('nega membro comum', () => {
    assert.equal(canManageTeamRoster({ userId: 'u3', role: 'USER' }, { ownerId: 'u1' }), false);
  });
});

describe('member tag parsing', () => {
  it('aceita tag válida', () => {
    assert.equal(parseMemberTag('AWP'), 'AWP');
    assert.equal(parseMemberTag('  IGL  '), 'IGL');
  });

  it('limpa tag vazia', () => {
    assert.equal(parseMemberTag(''), null);
    assert.equal(parseMemberTag('   '), null);
    assert.equal(parseMemberTag(null), null);
  });

  it('rejeita tag longa ou tipo inválido', () => {
    assert.equal(parseMemberTag('a'.repeat(13)), undefined);
    assert.equal(parseMemberTag(42), undefined);
  });
});