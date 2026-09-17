import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { securityHeaders } from './securityHeaders';

function mockRes() {
  const headers = new Map<string, string>();
  const removed: string[] = [];
  return {
    headers,
    removed,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    removeHeader(name: string) {
      removed.push(name);
      headers.delete(name);
    },
  };
}

describe('securityHeaders (suite Igreja / Finanças News — headers HTTP)', () => {
  it('define nosniff, DENY e remove X-Powered-By', () => {
    const res = mockRes();
    let nextCalled = false;
    securityHeaders({} as Request, res as unknown as Response, (() => {
      nextCalled = true;
    }) as NextFunction);

    assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    assert.equal(res.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.removed.includes('X-Powered-By'));
    assert.equal(nextCalled, true);
  });

  it('só envia HSTS em produção', () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const devRes = mockRes();
    securityHeaders({} as Request, devRes as unknown as Response, (() => undefined) as NextFunction);
    assert.equal(devRes.headers.has('Strict-Transport-Security'), false);

    process.env.NODE_ENV = 'production';
    const prodRes = mockRes();
    securityHeaders({} as Request, prodRes as unknown as Response, (() => undefined) as NextFunction);
    assert.ok((prodRes.headers.get('Strict-Transport-Security') ?? '').includes('max-age='));

    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
});
