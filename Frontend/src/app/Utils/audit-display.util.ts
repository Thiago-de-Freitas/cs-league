import { AuditEvent } from '../Models/interfaces';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'auth.register': 'Cadastro de usuário',
  'auth.login.success': 'Login realizado',
  'auth.login.failed': 'Tentativa de login falhou',
  'user.profile.update': 'Perfil atualizado',
  'user.avatar.upload': 'Foto de perfil enviada',
  'user.avatar.delete': 'Foto de perfil removida',
  'team.create': 'Time criado',
  'team.update': 'Time atualizado',
  'team.delete': 'Time excluído',
  'team.logo.upload': 'Logo do time enviado',
  'team.logo.delete': 'Logo do time removido',
  'team.invite.send': 'Convite enviado',
  'team.invite.accept': 'Convite aceito',
  'team.invite.reject': 'Convite recusado',
  'team.member.add': 'Membro adicionado',
  'team.member.update': 'Membro atualizado',
  'team.member.remove': 'Membro removido',
  'league.create': 'Liga criada',
  'league.update': 'Liga atualizada',
  'league.delete': 'Liga excluída',
  'league.archive': 'Liga arquivada',
  'league.unarchive': 'Liga desarquivada',
  'league.team.register': 'Time inscrito na liga',
  'league.team.bulk_add': 'Times inscritos em massa',
  'league.team.add': 'Time adicionado à liga',
  'league.team.remove': 'Time removido da liga',
  'league.team.reorder': 'Ordem dos times alterada',
  'league.schedule.save': 'Calendário salvo',
  'league.schedule.week.override': 'Exceção semanal aplicada',
  'league.schedule.week.remove': 'Exceção semanal removida',
  'league.schedule.regenerate': 'Calendário regenerado',
  'league.groups.generate': 'Grupos gerados',
  'league.bracket.generate': 'Chaveamento gerado',
  'league.match.create': 'Partida criada',
  'match.result.register': 'Resultado registrado',
  'match.schedule.update': 'Partida remarcada',
  'match.manual_stats.save': 'Stats manuais salvas',
  'demo.upload': 'Demo enviada',
  'demo.delete': 'Demo excluída',
  'demo.reprocess': 'Demo reprocessada',
  'demo.requeue_pending': 'Demos pendentes reenfileiradas',
  'match.demo.link': 'Demo vinculada à partida',
  'demo.processing.start': 'Processamento de demo iniciado',
  'demo.processing.complete': 'Demo processada',
  'demo.processing.fail': 'Falha no processamento da demo',
  'demo.match.map_update': 'Mapa atualizado pela demo',
};

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

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/\./g, ' · ');
}

export function hasAuditDetails(event: AuditEvent): boolean {
  return !!(
    event.before != null ||
    event.after != null ||
    event.metadata != null ||
    event.parentType ||
    event.parentId ||
    event.requestMethod ||
    event.requestPath ||
    event.correlationId ||
    event.errorCode
  );
}

export function formatAuditJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export interface AuditDetailsPayload {
  parent?: { type: string | null; id: string | null };
  request?: { method: string | null; path: string | null };
  correlationId?: string;
  errorCode?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

export function buildAuditDetailsPayload(event: AuditEvent): AuditDetailsPayload {
  const payload: AuditDetailsPayload = {};

  if (event.parentType || event.parentId) {
    payload.parent = { type: event.parentType ?? null, id: event.parentId ?? null };
  }
  if (event.requestMethod || event.requestPath) {
    payload.request = { method: event.requestMethod ?? null, path: event.requestPath ?? null };
  }
  if (event.correlationId) payload.correlationId = event.correlationId;
  if (event.errorCode) payload.errorCode = event.errorCode;
  if (event.before != null) payload.before = event.before;
  if (event.after != null) payload.after = event.after;
  if (event.metadata != null) payload.metadata = event.metadata;

  return payload;
}
