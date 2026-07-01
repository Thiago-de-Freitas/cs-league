/// <reference types="node" />

import { describe, it } from 'node:test';
import * as assert from 'assert/strict';
import { parseEmailInput } from './emailInput';
import { secureCompare } from './secureCompare';

describe('parseEmailInput', () => {
  it('aceita e-mails válidos', () => {
    assert.equal(parseEmailInput('  User@Example.COM '), 'user@example.com');
    assert.equal(parseEmailInput('joao.silva+tag@empresa.com.br'), 'joao.silva+tag@empresa.com.br');
  });

  it('rejeita formatos inválidos', () => {
    assert.equal(parseEmailInput(''), null);
    assert.equal(parseEmailInput('sem-arroba'), null);
    assert.equal(parseEmailInput('@dominio.com'), null);
    assert.equal(parseEmailInput('user@'), null);
    assert.equal(parseEmailInput('user..name@mail.com'), null);
    assert.equal(parseEmailInput(123), null);
  });
});

describe('secureCompare', () => {
  it('compara segredos em tempo constante por tamanho', () => {
    assert.equal(secureCompare('abc', 'abc'), true);
    assert.equal(secureCompare('abc', 'abd'), false);
    assert.equal(secureCompare('abc', 'abcd'), false);
  });
});
