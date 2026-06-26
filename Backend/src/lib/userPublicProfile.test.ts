import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPlayerPositionLabel } from './playerPosition';

describe('userPublicProfile helpers', () => {
  it('position label usa helper existente', () => {
    assert.equal(getPlayerPositionLabel('AWP'), 'AWPer');
  });
});
