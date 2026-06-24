import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOwnerAsMember } from './teamCreation';

describe('parseOwnerAsMember', () => {
  it('retorna true quando omitido', () => {
    assert.equal(parseOwnerAsMember(undefined), true);
  });

  it('retorna true para boolean true e string "true"', () => {
    assert.equal(parseOwnerAsMember(true), true);
    assert.equal(parseOwnerAsMember('true'), true);
  });

  it('retorna false para boolean false, string "false" e "0"', () => {
    assert.equal(parseOwnerAsMember(false), false);
    assert.equal(parseOwnerAsMember('false'), false);
    assert.equal(parseOwnerAsMember('0'), false);
  });
});
