import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildVdmClipSpec, computeClipTicks } from './clipExport';

describe('clipExport', () => {
  it('computeClipTicks retorna null sem tick central', () => {
    assert.deepEqual(computeClipTicks(null), { clipStartTick: null, clipEndTick: null });
    assert.deepEqual(computeClipTicks(0), { clipStartTick: null, clipEndTick: null });
  });

  it('computeClipTicks aplica padding de 5s em 64 tick/s', () => {
    assert.deepEqual(computeClipTicks(1000), {
      clipStartTick: 680,
      clipEndTick: 1320,
    });
  });

  it('buildVdmClipSpec inclui ticks e metadados', () => {
    const spec = buildVdmClipSpec({
      clipStartTick: 100,
      clipEndTick: 200,
      playerName: 'Player',
      round: 3,
      description: 'ACE no round 3',
    });
    assert.match(spec, /Player/);
    assert.match(spec, /mirv_cmd addAtTick 100/);
    assert.match(spec, /mirv_cmd addAtTick 200/);
  });
});
