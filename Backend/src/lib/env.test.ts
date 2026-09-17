import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCoreEnvErrors } from './env';

describe('getCoreEnvErrors (produção)', () => {
  const snapshot = {
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    JWT_SECRET: process.env.JWT_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
  };

  after(() => {
    restore('NODE_ENV', snapshot.NODE_ENV);
    restore('CORS_ORIGIN', snapshot.CORS_ORIGIN);
    restore('JWT_SECRET', snapshot.JWT_SECRET);
    restore('DATABASE_URL', snapshot.DATABASE_URL);
  });

  it('fora de produção não bloqueia', () => {
    process.env.NODE_ENV = 'test';
    assert.deepEqual(getCoreEnvErrors(), []);
  });

  it('em produção exige CORS_ORIGIN, JWT_SECRET forte e DATABASE_URL', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    process.env.JWT_SECRET = 'dev-secret';
    delete process.env.DATABASE_URL;

    const errors = getCoreEnvErrors();
    assert.ok(errors.some((error) => error.includes('CORS_ORIGIN')));
    assert.ok(errors.some((error) => error.includes('JWT_SECRET')));
    assert.ok(errors.some((error) => error.includes('DATABASE_URL')));
  });

  it('rejeita referência Railway não resolvida no CORS', () => {
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = '${{Frontend.URL}}';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.DATABASE_URL = 'postgres://local';

    const errors = getCoreEnvErrors();
    assert.ok(errors.some((error) => error.includes('CORS_ORIGIN não foi resolvida')));
  });
});

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
