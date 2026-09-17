import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { resolveJwtExpiresIn } from './jwt';

describe('resolveJwtExpiresIn', () => {
  it('usa 7d quando ausente ou vazio', () => {
    assert.equal(resolveJwtExpiresIn(undefined), '7d');
    assert.equal(resolveJwtExpiresIn(''), '7d');
    assert.equal(resolveJwtExpiresIn('   '), '7d');
  });

  it('rejeita zero (causa token já expirado em produção)', () => {
    assert.equal(resolveJwtExpiresIn('0'), '7d');
    assert.equal(resolveJwtExpiresIn('0s'), '7d');
    assert.equal(resolveJwtExpiresIn('0d'), '7d');
    assert.equal(resolveJwtExpiresIn('00'), '7d');
  });

  it('aceita duração válida', () => {
    assert.equal(resolveJwtExpiresIn('2d'), '2d');
    assert.equal(resolveJwtExpiresIn('7d'), '7d');
    assert.equal(resolveJwtExpiresIn('3600'), 3600);
  });

  it('com expiresIn 0 o jsonwebtoken gera iat===exp; o resolver evita isso', () => {
    const bad = jwt.sign({ sub: 'x' }, 'secret', { expiresIn: 0 });
    const badDecoded = jwt.decode(bad) as { iat: number; exp: number };
    assert.equal(badDecoded.exp, badDecoded.iat);

    const expiresIn = resolveJwtExpiresIn('0');
    const good = jwt.sign({ sub: 'x' }, 'secret', {
      expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
    });
    const goodDecoded = jwt.decode(good) as { iat: number; exp: number };
    assert.ok(goodDecoded.exp > goodDecoded.iat);
  });
});
