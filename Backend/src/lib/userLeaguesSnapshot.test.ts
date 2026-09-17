import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUserLeagueAccessWhere, partitionUserLeagues } from './userLeaguesSnapshot';
import { formatPlayerEntries } from './leagueDetails';
import { authenticateWithPassword, resolveLoginIdentifier } from './authenticateUser';

describe('buildUserLeagueAccessWhere', () => {
  it('inclui gestor, membro de time inscrito e inscrição individual', () => {
    const where = buildUserLeagueAccessWhere('user-1');
    assert.deepEqual(where.OR, [
      { ownerId: 'user-1' },
      { teams: { some: { team: { members: { some: { userId: 'user-1' } } } } } },
      { playerEntries: { some: { userId: 'user-1' } } },
    ]);
  });
});

describe('partitionUserLeagues', () => {
  it('separa ligas geridas das que o usuário só participa', () => {
    const result = partitionUserLeagues('u1', [
      { id: 'owned-a', ownerId: 'u1' },
      { id: 'playing', ownerId: 'u2' },
      { id: 'owned-b', ownerId: 'u1' },
    ]);
    assert.deepEqual(result.managedIds, ['owned-a', 'owned-b']);
    assert.deepEqual(result.participatingIds, ['playing']);
  });

  it('não coloca liga gerida em participating', () => {
    const result = partitionUserLeagues('owner', [{ id: 'league-1', ownerId: 'owner' }]);
    assert.deepEqual(result.managedIds, ['league-1']);
    assert.deepEqual(result.participatingIds, []);
  });

  it('lista vazia gera dois grupos vazios', () => {
    const result = partitionUserLeagues('u1', []);
    assert.deepEqual(result, { managedIds: [], participatingIds: [] });
  });
});

describe('formatPlayerEntries', () => {
  it('não inclui e-mail nem hash de senha do jogador', () => {
    const formatted = formatPlayerEntries([
      {
        id: 'entry-1',
        leagueId: 'league-1',
        userId: 'user-2',
        teamId: 'team-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        user: {
          id: 'user-2',
          displayName: 'Jogador',
          steamId: 'STEAM_1',
          avatarUrl: null,
          position: 'AWP',
        },
      },
    ]);

    assert.equal(formatted.length, 1);
    assert.equal(formatted[0]?.player.name, 'Jogador');
    assert.equal(formatted[0]?.player.steamId, 'STEAM_1');
    assert.equal('email' in (formatted[0]?.player ?? {}), false);
    assert.equal('passwordHash' in (formatted[0] ?? {}), false);
  });
});

describe('resolveLoginIdentifier', () => {
  it('aceita email ou login como identificador', () => {
    assert.equal(resolveLoginIdentifier({ email: 'a@b.com' }), 'a@b.com');
    assert.equal(resolveLoginIdentifier({ login: 'a@b.com' }), 'a@b.com');
    assert.equal(resolveLoginIdentifier({ email: 'a@b.com', login: 'other@b.com' }), 'a@b.com');
  });

  it('retorna undefined quando nenhum identificador veio no body', () => {
    assert.equal(resolveLoginIdentifier({}), undefined);
  });
});

describe('authenticateWithPassword', () => {
  it('rejeita input inválido sem consultar o banco', async () => {
    const result = await authenticateWithPassword('nao-e-email', '123456');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
      assert.equal(result.errorCode, 'INVALID_INPUT');
    }
  });
});
