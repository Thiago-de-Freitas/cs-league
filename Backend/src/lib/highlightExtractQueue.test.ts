import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_EXTRACT_QUEUE } from './highlightExtractQueue';

describe('highlightExtractQueue', () => {
  it('expõe fila de extração', () => {
    assert.equal(HIGHLIGHT_EXTRACT_QUEUE, 'highlight:extract:queue');
  });
});
