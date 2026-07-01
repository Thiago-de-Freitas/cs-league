/// <reference types="node" />

import { describe, it } from 'node:test';
import * as assert from 'assert/strict';
import {
  cancelEmailChange,
  startEmailChange,
  verifyNewEmailForChange,
  verifyOldEmailForChange,
} from './emailChange';
import { buildEmailChangeCodeBody } from './email';

describe('buildEmailChangeCodeBody', () => {
  it('monta assunto para confirmação do e-mail atual', () => {
    const body = buildEmailChangeCodeBody('João', '123456', 'old', 'novo@test.com');
    assert.match(body.subject, /123 456/);
    assert.match(body.text, /novo@test.com/);
  });

  it('monta assunto para confirmação do novo e-mail', () => {
    const body = buildEmailChangeCodeBody('João', '654321', 'new');
    assert.match(body.subject, /654 321/);
    assert.match(body.text, /novo e-mail/i);
  });
});

describe('emailChange flow', () => {
  const userId = 'test-user-email-change';
  const currentEmail = 'atual@test.com';
  const newEmail = 'novo@test.com';
  const displayName = 'Tester';

  it('inicia troca e valida código do e-mail antigo', async () => {
    await cancelEmailChange(userId);

    const started = await startEmailChange(userId, currentEmail, newEmail, displayName);
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const invalid = await verifyOldEmailForChange(userId, '000000', displayName);
    assert.equal(invalid.ok, false);
  });
});
