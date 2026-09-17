import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkLeagueAccess } from './leagueAccess';
import { checkMatchViewAccess, checkMatchResultAccess, checkLeagueManagerMatchDataAccess } from './matchPermissions';
import { buildUserLeagueAccessWhere } from './userLeaguesSnapshot';

const league = {
  ownerId: 'owner-1',
  registrationOpen: false,
  status: 'ONGOING',
};

const match = {
  team1Id: 'team-a',
  team2Id: 'team-b',
  league: { ownerId: 'owner-1', status: 'ONGOING' },
};

describe('IDOR matrix — ligas e partidas (padrão Igreja 4.0)', () => {
  it('admin acessa qualquer liga', () => {
    assert.equal(
      checkLeagueAccess({
        userId: 'u1',
        role: 'ADMIN',
        league: null,
        isTeamMember: false,
        isPlayerEntry: false,
      }).allowed,
      true
    );
  });

  it('liga inexistente é negada para usuário comum', () => {
    const result = checkLeagueAccess({
      userId: 'u1',
      role: 'USER',
      league: null,
      isTeamMember: false,
      isPlayerEntry: false,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.error, 'Liga não encontrada.');
  });

  it('gestor (owner) acessa a própria liga', () => {
    assert.equal(
      checkLeagueAccess({
        userId: 'owner-1',
        role: 'USER',
        league,
        isTeamMember: false,
        isPlayerEntry: false,
      }).allowed,
      true
    );
  });

  it('inscrição aberta em liga upcoming libera leitura', () => {
    assert.equal(
      checkLeagueAccess({
        userId: 'u1',
        role: 'USER',
        league: { ownerId: 'owner-1', registrationOpen: true, status: 'UPCOMING' },
        isTeamMember: false,
        isPlayerEntry: false,
      }).allowed,
      true
    );
  });

  it('membro de time inscrito acessa', () => {
    assert.equal(
      checkLeagueAccess({
        userId: 'u1',
        role: 'USER',
        league,
        isTeamMember: true,
        isPlayerEntry: false,
      }).allowed,
      true
    );
  });

  it('inscrito individual (pickup) acessa', () => {
    assert.equal(
      checkLeagueAccess({
        userId: 'u1',
        role: 'USER',
        league,
        isTeamMember: false,
        isPlayerEntry: true,
      }).allowed,
      true
    );
  });

  it('usuário sem vínculo é IDOR — sem acesso', () => {
    const result = checkLeagueAccess({
      userId: 'intruder',
      role: 'USER',
      league,
      isTeamMember: false,
      isPlayerEntry: false,
    });
    assert.equal(result.allowed, false);
    assert.equal(result.error, 'Sem permissão para acessar esta liga.');
  });

  it('filtro de listagem inclui owner, time e pickup — nunca liga de terceiro', () => {
    const where = buildUserLeagueAccessWhere('user-1');
    assert.deepEqual(where.OR, [
      { ownerId: 'user-1' },
      { teams: { some: { team: { members: { some: { userId: 'user-1' } } } } } },
      { playerEntries: { some: { userId: 'user-1' } } },
    ]);
  });

  it('partida: admin e gestor veem; terceiro sem participação não vê', () => {
    assert.equal(checkMatchViewAccess('admin', 'ADMIN', match, []), true);
    assert.equal(checkMatchViewAccess('owner-1', 'USER', match, []), true);
    assert.equal(checkMatchViewAccess('intruder', 'USER', match, [], false), false);
  });

  it('upload de demo da liga só gestor/admin — capitão não eleva privilégio', () => {
    assert.equal(checkLeagueManagerMatchDataAccess('owner-1', 'USER', match), true);
    assert.equal(checkLeagueManagerMatchDataAccess('captain', 'USER', match), false);
    assert.equal(checkMatchResultAccess('captain', 'USER', match, ['team-a']), true);
  });
});
