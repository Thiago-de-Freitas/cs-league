import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePersonalDemoUpload } from './demoValidation';

describe('validatePersonalDemoUpload', () => {
  it('permite admin sem consultar Steam ID', async () => {
    const result = await validatePersonalDemoUpload('any-user-id', 'ADMIN');
    assert.deepEqual(result, { valid: true });
  });
});
