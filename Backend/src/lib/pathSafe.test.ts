import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import {
  isPathInsideBase,
  resolvePathInsideBase,
  sanitizeFileExtension,
  isValidResourceId,
  isSafeStaticRequestPath,
} from './pathSafe';

describe('isPathInsideBase', () => {
  const base = path.resolve('/data/demos');

  it('allows file inside base', () => {
    assert.equal(isPathInsideBase(path.join(base, 'abc.dem'), base), true);
  });

  it('blocks path traversal', () => {
    assert.equal(isPathInsideBase(path.resolve(base, '..', 'etc', 'passwd'), base), false);
  });
});

describe('resolvePathInsideBase', () => {
  it('returns resolved path when safe', () => {
    const base = path.resolve('/tmp/demos');
    const result = resolvePathInsideBase(base, 'file.dem');
    assert.equal(result, path.join(base, 'file.dem'));
  });

  it('returns null on traversal', () => {
    const base = path.resolve('/tmp/demos');
    assert.equal(resolvePathInsideBase(base, '..', 'secret.dem'), null);
  });
});

describe('sanitizeFileExtension', () => {
  it('accepts allowed extension', () => {
    assert.equal(sanitizeFileExtension('match.dem', ['.dem']), '.dem');
  });

  it('rejects disallowed extension', () => {
    assert.equal(sanitizeFileExtension('evil.exe', ['.dem']), null);
  });

  it('rejects double extension tricks', () => {
    assert.equal(sanitizeFileExtension('file.dem.exe', ['.dem']), null);
  });
});

describe('isValidResourceId', () => {
  it('accepts cuid', () => {
    assert.equal(isValidResourceId('clxyz1234567890abcdefghij'), true);
  });

  it('accepts uuid', () => {
    assert.equal(isValidResourceId('550e8400-e29b-41d4-a716-446655440000'), true);
  });

  it('rejects injection payloads', () => {
    assert.equal(isValidResourceId("'; DROP TABLE Demo; --"), false);
  });
});

describe('isSafeStaticRequestPath', () => {
  it('allows normal filenames', () => {
    assert.equal(isSafeStaticRequestPath('/logo.png'), true);
  });

  it('blocks traversal', () => {
    assert.equal(isSafeStaticRequestPath('/../secret.png'), false);
  });
});
