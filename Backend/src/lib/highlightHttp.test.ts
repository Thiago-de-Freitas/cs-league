import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildHighlightsListResponse, sendHighlightClipSpec, sendHighlightVideo } from './highlightHttp';

const baseHighlight = {
  id: 'hl-test',
  round: 2,
  tick: 5000,
  clipStartTick: 4680,
  clipEndTick: 5320,
  clipRenderStatus: 'COMPLETED',
  clipVideoPath: null as string | null,
  clipRenderError: null as string | null,
  steamId: '76561198000000000',
  playerName: 'Tester',
  type: 'OPENING_KILL',
  description: 'Opening kill round 2',
  score: 3,
  metadata: null,
};

function mockResponse(accept = '', query: Record<string, string> = {}) {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    req: { headers: { accept }, query },
    status(code: number) {
      state.status = code;
      return this;
    },
    json(payload: unknown) {
      state.body = payload;
      return this;
    },
    setHeader(key: string, value: string) {
      state.headers[key] = value;
      return this;
    },
    send(payload: unknown) {
      state.body = payload;
      return this;
    },
    sendFile(filePath: string) {
      state.body = { filePath };
      return this;
    },
  } as unknown as Response;
  return { res, state };
}

describe('highlightHttp', () => {
  it('buildHighlightsListResponse indica vídeo disponível', () => {
    const payload = buildHighlightsListResponse(
      [
        {
          ...baseHighlight,
          clipVideoPath: 'hl-test.mp4',
        },
      ],
      { matchId: 'm1' }
    );
    assert.equal(payload.highlights.length, 1);
    assert.equal(payload.videoExportAvailable, true);
    assert.equal(payload.highlights[0].clipVideoUrl, '/uploads/highlights/hl-test.mp4');
  });

  it('sendHighlightClipSpec retorna VDM em texto', () => {
    const { res, state } = mockResponse('text/plain');
    sendHighlightClipSpec(res, baseHighlight);
    assert.equal(state.headers['Content-Type'], 'text/plain; charset=utf-8');
    assert.match(String(state.body), /mirv_cmd addAtTick 4680/);
  });

  it('sendHighlightVideo responde 202 enquanto processa', () => {
    const { res, state } = mockResponse();
    sendHighlightVideo(res, { ...baseHighlight, clipRenderStatus: 'PROCESSING' });
    assert.equal(state.status, 202);
    assert.match(String((state.body as { error?: string }).error), /renderização/i);
  });

  it('sendHighlightVideo envia arquivo quando concluído', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hl-test-'));
    const fileName = 'hl-video.mp4';
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, 'fake-mp4');

    process.env.HIGHLIGHT_CLIPS_PATH = dir;
    const { res, state } = mockResponse();
    sendHighlightVideo(res, {
      ...baseHighlight,
      clipVideoPath: fileName,
    });
    assert.equal(state.headers['Content-Type'], 'video/mp4');
    assert.deepEqual(state.body, { filePath });

    delete process.env.HIGHLIGHT_CLIPS_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
