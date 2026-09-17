import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePasswordInput, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from './passwordInput';

describe('passwordInput (limites Igreja 4.0 / TANDER)', () => {
  it('define mínimo 6 e máximo 128', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 6);
    assert.equal(MAX_PASSWORD_LENGTH, 128);
  });

  it('aceita senha no intervalo válido', () => {
    assert.equal(parsePasswordInput('123456'), '123456');
    assert.equal(parsePasswordInput('a'.repeat(128)), 'a'.repeat(128));
  });

  it('rejeita curta, longa, tipo inválido e não corta espaços extras como senha válida', () => {
    assert.equal(parsePasswordInput('12345'), null);
    assert.equal(parsePasswordInput('a'.repeat(129)), null);
    assert.equal(parsePasswordInput(123456), null);
    assert.equal(parsePasswordInput('secret '), 'secret ');
  });
});
