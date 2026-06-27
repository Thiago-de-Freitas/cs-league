import { AuditEvent } from '../Models/interfaces';

export function formatAuditActor(event: AuditEvent): string {
  if (event.actorLabel) return event.actorLabel;
  if (event.actorEmail) return event.actorEmail;

  if (event.actorUserId || (event.entityType === 'User' && event.entityId)) {
    const metadata = event.metadata as { email?: string } | null | undefined;
    const after = event.after as { email?: string; displayName?: string } | null | undefined;
    const email = after?.email ?? metadata?.email;
    if (after?.displayName?.trim()) return after.displayName.trim();
    if (email) return email;
    return 'Usuário';
  }

  if (event.actorType === 'worker') return 'Worker';
  if (event.actorType === 'system') return 'Sistema';
  if (event.actorType === 'anonymous') return 'Anônimo';
  return 'Usuário';
}
