import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { audit, formatAuditEventForApi, resolveAuditActorFromContext, sanitizeAuditValue } from './audit';
import { AuditActorType } from '@prisma/client';

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

  it('identifica usuário autenticado em login via entityId', () => {
    const actor = resolveAuditActorFromContext(
      audit.of('auth.login.success', 'User', 'user-1', {
        after: { email: 'player@test.com', role: 'USER' },
      })
    );
    assert.ok(actor);
    assert.equal(actor!.actorType, AuditActorType.USER);
    assert.equal(actor!.actorUserId, 'user-1');
    assert.equal(actor!.actorLabel, 'player@test.com');
  });

  it('prioriza displayName do usuário no contexto de auditoria', () => {
    const actor = resolveAuditActorFromContext(
      audit.of('auth.register', 'User', 'user-2', {
        after: { email: 'player@test.com', displayName: 'Player One', role: 'USER' },
      })
    );
    assert.equal(actor?.actorLabel, 'Player One');
  });

  it('enriquece evento antigo de login sem actorUserId', () => {
    const formatted = formatAuditEventForApi({
      id: 'e1',
      occurredAt: new Date('2025-06-01T12:00:00Z'),
      actorType: AuditActorType.ANONYMOUS,
      actorUserId: null,
      actorLabel: null,
      action: 'auth.login.success',
      entityType: 'User',
      entityId: 'user-1',
      parentType: null,
      parentId: null,
      requestMethod: 'POST',
      requestPath: '/api/auth/login',
      correlationId: 'corr-1',
      before: null,
      after: { email: 'player@test.com', role: 'USER' },
      metadata: null,
      success: true,
      errorCode: null,
    });

    assert.equal(formatted.actorType, 'user');
    assert.equal(formatted.actorUserId, 'user-1');
    assert.equal(formatted.actorLabel, 'player@test.com');
    assert.equal(formatted.actorEmail, 'player@test.com');
  });
});
