import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  encodeUploadedImageToDataUrl,
  isDataImageUrl,
  normalizePublicUploadUrl,
  publicUploadFileExists,
  publicUploadUrlForResponse,
  sanitizePublicUploadUrl,
} from './uploadAssets';

describe('uploadAssets', () => {
  let tempDir = '';

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamers-league-uploads-'));
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

  it('preserva data URLs de imagem', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    assert.equal(isDataImageUrl(dataUrl), true);
    assert.equal(normalizePublicUploadUrl(dataUrl), dataUrl);
    assert.equal(publicUploadUrlForResponse(dataUrl), dataUrl);
    assert.equal(sanitizePublicUploadUrl(dataUrl), dataUrl);
    assert.equal(publicUploadFileExists(dataUrl), true);
  });

  it('converte buffer de upload em data URL', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const dataUrl = encodeUploadedImageToDataUrl({
      originalname: 'logo.png',
      buffer: pngHeader,
    } as import('express').Express.Multer.File);
    assert.match(dataUrl, /^data:image\/png;base64,/);
  });

  it('publicUploadUrlForResponse preserva URL legada mesmo sem arquivo no disco', () => {
    assert.equal(publicUploadFileExists('/uploads/team-logos/abc.png'), true);
    assert.equal(sanitizePublicUploadUrl('/uploads/team-logos/missing.png'), null);
    assert.equal(
      publicUploadUrlForResponse('/uploads/team-logos/missing.png'),
      '/uploads/team-logos/missing.png'
    );
  });
});
