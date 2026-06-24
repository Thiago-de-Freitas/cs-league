import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  normalizePublicUploadUrl,
  publicUploadFileExists,
  sanitizePublicUploadUrl,
} from './uploadAssets';

describe('uploadAssets', () => {
  let tempDir = '';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-league-uploads-'));
    process.env.TEAM_LOGO_STORAGE_PATH = path.join(tempDir, 'team-logos');
    fs.mkdirSync(process.env.TEAM_LOGO_STORAGE_PATH, { recursive: true });
    fs.writeFileSync(path.join(process.env.TEAM_LOGO_STORAGE_PATH, 'abc.png'), 'x');
  });

  after(() => {
    delete process.env.TEAM_LOGO_STORAGE_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('normaliza URL pública e nome legado', () => {
    assert.equal(
      normalizePublicUploadUrl('/uploads/team-logos/abc.png'),
      '/uploads/team-logos/abc.png'
    );
    assert.equal(
      normalizePublicUploadUrl('eb187ec3-f586-46ae-a4a7-faf76f176305.png'),
      '/uploads/team-logos/eb187ec3-f586-46ae-a4a7-faf76f176305.png'
    );
  });

  it('sanitiza URL inexistente para null', () => {
    assert.equal(publicUploadFileExists('/uploads/team-logos/abc.png'), true);
    assert.equal(sanitizePublicUploadUrl('/uploads/team-logos/missing.png'), null);
  });
});
