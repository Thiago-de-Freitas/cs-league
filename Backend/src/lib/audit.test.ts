import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit, sanitizeAuditValue } from './audit';

describe('audit', () => {
  it('redige campos sensíveis', () => {
    const sanitized = sanitizeAuditValue({
      email: 'a@b.com',
      password: 'secret',
      nested: { token: 'abc', wins: 3 },
    }) as Record<string, unknown>;

    assert.equal(sanitized.email, 'a@b.com');
    assert.equal(sanitized.password, '[redacted]');
    assert.deepEqual(sanitized.nested, { token: '[redacted]', wins: 3 });
  });

  it('monta contexto com parent', () => {
    const ctx = audit.withParent('match.result.register', 'Match', 'm1', 'League', 'l1', {
      after: { winnerId: 't1' },
    });
    assert.equal(ctx.action, 'match.result.register');
    assert.equal(ctx.parentId, 'l1');
    assert.deepEqual(ctx.after, { winnerId: 't1' });
  });
});
