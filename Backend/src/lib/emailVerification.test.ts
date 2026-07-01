import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEmailVerificationCode,
  hashVerificationCode,
  maskEmail,
} from './emailVerification';

describe('email verification helpers', () => {
  it('gera código de 6 dígitos', () => {
    const code = generateEmailVerificationCode();
    assert.match(code, /^\d{6}$/);
    assert.ok(Number(code) >= 100000 && Number(code) <= 999999);
  });

  it('hash é estável para o mesmo código', () => {
    const a = hashVerificationCode('123456');
    const b = hashVerificationCode('123456');
    assert.equal(a, b);
    assert.notEqual(a, hashVerificationCode('654321'));
  });

  it('mascara e-mail para exibição', () => {
    assert.equal(maskEmail('joao.silva@example.com'), 'jo***@example.com');
    assert.equal(maskEmail('ab@test.com'), 'a***@test.com');
  });
});
