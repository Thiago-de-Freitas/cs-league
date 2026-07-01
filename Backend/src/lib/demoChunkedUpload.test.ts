import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import {
  assembleDemoUploadSession,
  createDemoUploadSession,
  destroyDemoUploadSession,
  getChunkPath,
  isDemoUploadSessionComplete,
  loadDemoUploadSession,
  markChunkReceived,
  validateChunkedUploadParams,
} from './demoChunkedUpload';

describe('demoChunkedUpload', () => {
  it('validates chunk count from file size', () => {
    const result = validateChunkedUploadParams('match.dem', 10 * 1024 * 1024, 3);
    assert.equal(result.valid, true);
  });

  it('rejects wrong chunk count', () => {
    const result = validateChunkedUploadParams('match.dem', 10, 5);
    assert.equal(result.valid, false);
  });

  it('assembles chunks into a single file', async () => {
    const session = createDemoUploadSession({
      userId: 'user-1',
      fileName: 'match.dem',
      fileSize: 10,
      totalChunks: 1,
      isPersonal: true,
    });

    fs.writeFileSync(getChunkPath(session.uploadId, 0), 'helloworld');
    markChunkReceived(session.uploadId, 'user-1', 0);

    const meta = loadDemoUploadSession(session.uploadId, 'user-1');
    assert.ok(meta);
    assert.equal(isDemoUploadSessionComplete(meta), true);

    const assembled = await assembleDemoUploadSession(session.uploadId, 'user-1');
    assert.equal(fs.readFileSync(assembled, 'utf8'), 'helloworld');
    destroyDemoUploadSession(session.uploadId);
  });
});
