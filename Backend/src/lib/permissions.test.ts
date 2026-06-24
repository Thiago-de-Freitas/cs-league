import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAdmin } from './permissions';

describe('isAdmin', () => {
  it('identifica role ADMIN', () => {
    assert.equal(isAdmin({ role: 'ADMIN' }), true);
  });

  it('rejeita role USER e valores desconhecidos', () => {
    assert.equal(isAdmin({ role: 'USER' }), false);
    assert.equal(isAdmin({ role: 'captain' }), false);
  });
});
