import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HIGHLIGHT_RENDER_QUEUE, readRenderableClipTicks } from './highlightRenderQueue';

describe('highlightRenderQueue', () => {
  it('expõe fila de renderização', () => {
    assert.equal(HIGHLIGHT_RENDER_QUEUE, 'highlight:render:queue');
  });

  it('readRenderableClipTicks aceita ticks válidos', () => {
    assert.deepEqual(readRenderableClipTicks(1000, 2000), {
      clipStartTick: 1000,
      clipEndTick: 2000,
    });
    assert.deepEqual(readRenderableClipTicks(0, 64), {
      clipStartTick: 0,
      clipEndTick: 64,
    });
  });

  it('readRenderableClipTicks rejeita ticks inválidos', () => {
    assert.equal(readRenderableClipTicks(null, 2000), null);
    assert.equal(readRenderableClipTicks(1000, null), null);
    assert.equal(readRenderableClipTicks(1000, 1000), null);
    assert.equal(readRenderableClipTicks(2000, 1000), null);
    assert.equal(readRenderableClipTicks(-1, 100), null);
  });
});
