import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAllDemoHighlights, deleteDemoHighlightById } from './highlightDelete';

describe('highlightDelete', () => {
  it('exporta funções de exclusão', () => {
    assert.equal(typeof deleteDemoHighlightById, 'function');
    assert.equal(typeof deleteAllDemoHighlights, 'function');
  });
});
