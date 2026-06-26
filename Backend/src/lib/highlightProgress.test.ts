import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHighlightRenderPercent } from './highlightProgress';

describe('highlightProgress', () => {
  it('computeHighlightRenderPercent inicia em 55% com primeiro vídeo', () => {
    assert.equal(computeHighlightRenderPercent(1, 3), 70);
  });

  it('computeHighlightRenderPercent chega a 100% no último vídeo', () => {
    assert.equal(computeHighlightRenderPercent(3, 3), 100);
    assert.equal(computeHighlightRenderPercent(1, 1), 100);
  });

  it('computeHighlightRenderPercent trata total zero como concluído', () => {
    assert.equal(computeHighlightRenderPercent(0, 0), 100);
  });
});
