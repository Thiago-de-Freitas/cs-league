import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapHighlightPayload, normalizeHighlightType, normalizeSteamId, filterHighlightsForPersonalDemo } from './highlightPayload';
import { getHighlightClipPublicUrl } from './highlightStorage';

describe('highlightPayload', () => {
  it('normaliza tipos válidos', () => {
    assert.equal(normalizeHighlightType('clutch'), 'CLUTCH');
    assert.equal(normalizeHighlightType('invalid'), 'MULTI_KILL');
  });

  it('mapeia payload do worker', () => {
    const mapped = mapHighlightPayload({
      round: 5,
      tick: 12000,
      clipStartTick: 11680,
      clipEndTick: 12320,
      steamId: '76561198000000000',
      playerName: 'Player',
      type: 'OPENING_KILL',
      description: 'Opening',
      score: 3,
      metadata: { headshot: true },
    });
    assert.equal(mapped.type, 'OPENING_KILL');
    assert.equal(mapped.round, 5);
    assert.equal(mapped.clipStartTick, 11680);
  });

  it('normaliza Steam ID e filtra destaques de demo pessoal', () => {
    assert.equal(normalizeSteamId('76561198000000000.0'), '76561198000000000');

    const highlights = [
      { steamId: '76561198000000000', playerName: 'Eu' },
      { steamId: '76561198999999999', playerName: 'Outro' },
    ];

    const filtered = filterHighlightsForPersonalDemo(highlights, '76561198000000000');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].playerName, 'Eu');
    assert.equal(filterHighlightsForPersonalDemo(highlights, '').length, 0);
  });

  it('filterHighlightsForPersonalDemo compara Steam ID normalizado', () => {
    const highlights = [
      { steamId: '76561198000000000.0', playerName: 'Eu' },
      { steamId: '76561198999999999', playerName: 'Outro' },
    ];
    const filtered = filterHighlightsForPersonalDemo(highlights, '76561198000000000');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].playerName, 'Eu');
  });

  it('mapHighlightPayload normaliza steamId do worker', () => {
    const mapped = mapHighlightPayload({ steamId: '76561198000000000.0', round: 1, playerName: 'P', type: 'ACE', description: 'x' });
    assert.equal(mapped.steamId, '76561198000000000');
  });
});

describe('highlightStorage', () => {
  it('monta URL pública do clipe', () => {
    assert.equal(
      getHighlightClipPublicUrl('abc123.mp4'),
      '/uploads/highlights/abc123.mp4'
    );
    assert.equal(getHighlightClipPublicUrl(null), null);
  });
});
