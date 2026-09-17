import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCorsOriginAllowed, normalizeOrigin, parseOriginList } from './corsOrigin';

describe('CORS origins (suite Igreja 4.0 / Finanças News)', () => {
  it('parseOriginList normaliza vírgulas, espaços e barra final', () => {
    assert.deepEqual(parseOriginList(' https://a.com/,http://b.com '), [
      'https://a.com',
      'http://b.com',
    ]);
    assert.deepEqual(parseOriginList(undefined), ['http://localhost:4200']);
  });

  it('normalizeOrigin remove barra final', () => {
    assert.equal(normalizeOrigin('https://app.example.com/'), 'https://app.example.com');
  });

  it('permite chamadas sem Origin (health/server-to-server)', () => {
    assert.equal(isCorsOriginAllowed(undefined, ['https://app.example.com']), true);
  });

  it('aceita origem listada mesmo com barra final no request', () => {
    const allowed = parseOriginList('https://cs-league-front.up.railway.app/');
    assert.equal(isCorsOriginAllowed('https://cs-league-front.up.railway.app', allowed), true);
    assert.equal(isCorsOriginAllowed('https://cs-league-front.up.railway.app/', allowed), true);
  });

  it('rejeita origens estranhas fora da lista', () => {
    const allowed = parseOriginList('https://cs-league-front.up.railway.app');
    assert.equal(isCorsOriginAllowed('https://evil.example', allowed), false);
    assert.equal(isCorsOriginAllowed('http://localhost:51547', allowed), false);
  });
});
