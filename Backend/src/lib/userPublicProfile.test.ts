import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlayerPositionLabel } from './playerPosition';
import { canViewInactiveUserProfile, shouldExposeProfileEmail } from './userPublicProfile';

describe('userPublicProfile helpers', () => {
  it('position label usa helper existente', () => {
    assert.equal(getPlayerPositionLabel('AWP'), 'AWPer');
  });

  it('canViewInactiveUserProfile permite dono e admin ver conta inativa', () => {
    assert.equal(canViewInactiveUserProfile(false, true, false), true);
    assert.equal(canViewInactiveUserProfile(false, false, true), true);
    assert.equal(canViewInactiveUserProfile(false, false, false), false);
    assert.equal(canViewInactiveUserProfile(true, false, false), true);
  });

  it('shouldExposeProfileEmail só para próprio usuário ou admin', () => {
    assert.equal(shouldExposeProfileEmail(true, false), true);
    assert.equal(shouldExposeProfileEmail(false, true), true);
    assert.equal(shouldExposeProfileEmail(false, false), false);
  });
});
