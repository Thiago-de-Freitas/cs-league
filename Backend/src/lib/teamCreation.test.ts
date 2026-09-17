import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOwnerAsMember, parseTeamName } from './teamCreation';

describe('parseOwnerAsMember', () => {
  it('retorna true quando omitido', () => {
    assert.equal(parseOwnerAsMember(undefined), true);
  });

  it('retorna true para boolean true e string "true"', () => {
    assert.equal(parseOwnerAsMember(true), true);
    assert.equal(parseOwnerAsMember('true'), true);
  });

  it('retorna false para boolean false, string "false" e "0"', () => {
    assert.equal(parseOwnerAsMember(false), false);
    assert.equal(parseOwnerAsMember('false'), false);
    assert.equal(parseOwnerAsMember('0'), false);
  });
});

describe('parseTeamName', () => {
  it('aceita nome válido e remove espaços nas pontas', () => {
    assert.equal(parseTeamName('FURIA'), 'FURIA');
    assert.equal(parseTeamName('  Os Vingadores  '), 'Os Vingadores');
  });

  it('rejeita vazio, tipo inválido e nome longo demais', () => {
    assert.equal(parseTeamName(''), null);
    assert.equal(parseTeamName('   '), null);
    assert.equal(parseTeamName(42), null);
    assert.equal(parseTeamName('a'.repeat(101)), null);
  });
});
