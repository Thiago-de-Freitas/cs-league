import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validatePersonalDemoUpload } from './demoValidation';

describe('validatePersonalDemoUpload', () => {
  it('rejeita usuário sem Steam ID', async () => {
    const result = await validatePersonalDemoUpload('nonexistent-user-id');
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, 'NO_STEAM_ID');
    }
  });
});
