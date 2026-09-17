import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { internalServiceAuth } from './internalService';

function mockRes() {
  let statusCode = 200;
  let body: unknown;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
    get result() {
      return { statusCode, body };
    },
  };
}

describe('internalServiceAuth (padrão APIs internas Punk Code)', () => {
  const previous = process.env.INTERNAL_SERVICE_KEY;

  after(() => {
    if (previous === undefined) delete process.env.INTERNAL_SERVICE_KEY;
    else process.env.INTERNAL_SERVICE_KEY = previous;
  });

  it('503 quando INTERNAL_SERVICE_KEY não está configurado', () => {
    delete process.env.INTERNAL_SERVICE_KEY;
    const res = mockRes();
    let nextCalled = false;
    internalServiceAuth(
      { headers: {} } as Request,
      res as unknown as Response,
      (() => {
        nextCalled = true;
      }) as NextFunction
    );
    assert.equal(res.result.statusCode, 503);
    assert.equal(nextCalled, false);
  });

  it('403 com token ausente ou errado', () => {
    process.env.INTERNAL_SERVICE_KEY = 'unit-internal-key';
    const resMissing = mockRes();
    internalServiceAuth({ headers: {} } as Request, resMissing as unknown as Response, (() => undefined) as NextFunction);
    assert.equal(resMissing.result.statusCode, 403);

    const resWrong = mockRes();
    internalServiceAuth(
      { headers: { 'x-internal-service-key': 'wrong-key-value' } } as unknown as Request,
      resWrong as unknown as Response,
      (() => undefined) as NextFunction
    );
    assert.equal(resWrong.result.statusCode, 403);
  });

  it('segue com Bearer/header correto (compare timing-safe)', () => {
    process.env.INTERNAL_SERVICE_KEY = 'unit-internal-key';
    const res = mockRes();
    let nextCalled = false;
    internalServiceAuth(
      { headers: { 'x-internal-service-key': 'unit-internal-key' } } as unknown as Request,
      res as unknown as Response,
      (() => {
        nextCalled = true;
      }) as NextFunction
    );
    assert.equal(nextCalled, true);
    assert.equal(res.result.statusCode, 200);
  });
});
