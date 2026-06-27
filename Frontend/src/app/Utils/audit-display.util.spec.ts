import { formatAuditActor } from './audit-display.util';
import { AuditEvent } from '../Models/interfaces';

describe('formatAuditActor', () => {
  it('prioriza actorLabel', () => {
    const event: AuditEvent = {
      id: 'e1',
      occurredAt: '2025-06-01T12:00:00Z',
      action: 'league.create',
      entityType: 'League',
      actorType: 'user',
      actorLabel: 'Admin',
      success: true,
    };
    expect(formatAuditActor(event)).toBe('Admin');
  });

  it('resolve login antigo marcado como anonymous', () => {
    const event: AuditEvent = {
      id: 'e2',
      occurredAt: '2025-06-01T12:00:00Z',
      action: 'auth.login.success',
      entityType: 'User',
      entityId: 'user-1',
      actorType: 'anonymous',
      success: true,
      after: { email: 'player@test.com', role: 'USER' },
    };
    expect(formatAuditActor(event)).toBe('player@test.com');
  });

  it('usa actorEmail quando actorLabel está ausente', () => {
    const event: AuditEvent = {
      id: 'e3',
      occurredAt: '2025-06-01T12:00:00Z',
      action: 'team.create',
      entityType: 'Team',
      actorType: 'user',
      actorEmail: 'admin@test.com',
      success: true,
    };
    expect(formatAuditActor(event)).toBe('admin@test.com');
  });
});
