import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { serializeHighlight } from './highlightSerialization';

describe('highlightSerialization', () => {
  it('serializa destaque com URL pública do vídeo', () => {
    const row = {
      id: 'hl-1',
      round: 5,
      tick: 12000,
      clipStartTick: 11680,
      clipEndTick: 12320,
      clipRenderStatus: 'COMPLETED',
      clipVideoPath: 'hl-1.mp4',
      clipRenderError: null,
      steamId: '76561198000000000',
      playerName: 'Player',
      type: 'CLUTCH',
      description: 'Clutch 1v3',
      score: 9,
      metadata: { enemies: 3 },
    };

    const serialized = serializeHighlight(row, { matchId: 'match-1' });
    assert.equal(serialized.matchId, 'match-1');
    assert.equal(serialized.clipVideoUrl, '/uploads/highlights/hl-1.mp4');
    assert.equal(serialized.type, 'CLUTCH');
  });
});
