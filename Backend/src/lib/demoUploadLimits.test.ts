import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDemoMaxUploadLabel,
  getDemoMaxUploadBytes,
  getDemoMaxUploadErrorMessage,
  getDemoMaxUploadMb,
} from './demoUploadLimits';

describe('demoUploadLimits', () => {
  const original = process.env.DEMO_MAX_UPLOAD_MB;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DEMO_MAX_UPLOAD_MB;
    } else {
      process.env.DEMO_MAX_UPLOAD_MB = original;
    }
  });

  it('defaults to 1024 MB', () => {
    delete process.env.DEMO_MAX_UPLOAD_MB;
    assert.equal(getDemoMaxUploadMb(), 1024);
    assert.equal(getDemoMaxUploadBytes(), 1024 * 1024 * 1024);
    assert.equal(formatDemoMaxUploadLabel(), '1 GB');
    assert.equal(getDemoMaxUploadErrorMessage(), 'Arquivo muito grande. O limite é 1 GB.');
  });

  it('respects DEMO_MAX_UPLOAD_MB within bounds', () => {
    process.env.DEMO_MAX_UPLOAD_MB = '750';
    assert.equal(getDemoMaxUploadMb(), 750);
    assert.equal(formatDemoMaxUploadLabel(), '750 MB');
  });

  it('falls back to default for invalid values', () => {
    process.env.DEMO_MAX_UPLOAD_MB = '10';
    assert.equal(getDemoMaxUploadMb(), 1024);
  });
});
