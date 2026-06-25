import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { AuditActorType } from '@prisma/client';
import { prisma } from './prisma';
import type { AuthRequest } from '../middleware/auth';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'secret',
  'internal_service_key',
  'x-internal-service-key',
]);

export type AuditContextInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  parentType?: string | null;
  parentId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  success?: boolean;
  errorCode?: string | null;
  actorType?: AuditActorType;
  actorUserId?: string | null;
  actorLabel?: string | null;
};

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      auditContext?: AuditContextInput;
      auditSkip?: boolean;
    }
  }
}

export function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeAuditValue(nested);
      }
    }
    return out;
  }
  return value;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const sanitized = sanitizeAuditValue(value);
  if (sanitized === undefined) return undefined;
  return sanitized as Prisma.InputJsonValue;
}

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.socket.remoteAddress ?? null;
}

function resolveActor(req: Request): {
  actorType: AuditActorType;
  actorUserId: string | null;
  actorLabel: string | null;
} {
  const override = req.auditContext;
  if (override?.actorType) {
    return {
      actorType: override.actorType,
      actorUserId: override.actorUserId ?? null,
      actorLabel: override.actorLabel ?? null,
    };
  }

  const authReq = req as AuthRequest;
  if (authReq.user?.userId) {
    return {
      actorType: AuditActorType.USER,
      actorUserId: authReq.user.userId,
      actorLabel: authReq.user.email,
    };
  }

  const internalKey = req.headers['x-internal-service-key'];
  if (typeof internalKey === 'string' && internalKey.trim()) {
    return {
      actorType: AuditActorType.WORKER,
      actorUserId: null,
      actorLabel: 'worker',
    };
  }

  return {
    actorType: AuditActorType.ANONYMOUS,
    actorUserId: null,
    actorLabel: null,
  };
}

function buildDefaultAction(req: Request): string {
  const method = req.method.toLowerCase();
  const base = (req.baseUrl || '').replace(/^\/api\//, '').replace(/\//g, '.') || 'api';
  const routePath = req.route?.path ? String(req.route.path) : req.path;
  const normalizedRoute = routePath.replace(/^\//, '').replace(/\//g, '.') || 'root';
  return `${base}.${method}.${normalizedRoute}`;
}

export function ensureCorrelationId(req: Request): string {
  if (!req.correlationId) {
    const header = req.headers['x-correlation-id'];
    req.correlationId =
      (typeof header === 'string' && header.trim()) || randomUUID();
  }
  return req.correlationId;
}

export function setAuditContext(req: Request, context: AuditContextInput): void {
  req.auditContext = {
    ...req.auditContext,
    ...context,
  };
}

export function skipAudit(req: Request): void {
  req.auditSkip = true;
}

type RecordAuditOptions = {
  req?: Request;
  correlationId?: string;
  requestMethod?: string | null;
  requestPath?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function recordAuditEvent(
  input: AuditContextInput,
  options: RecordAuditOptions = {}
): Promise<void> {
  const req = options.req;
  const actor = req ? resolveActor(req) : {
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? 'system',
  };

  const correlationId = options.correlationId ?? (req ? ensureCorrelationId(req) : null);

  try {
    await prisma.auditEvent.create({
      data: {
        actorType: input.actorType ?? actor.actorType,
        actorUserId: input.actorUserId ?? actor.actorUserId,
        actorLabel: input.actorLabel ?? actor.actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        parentType: input.parentType ?? null,
        parentId: input.parentId ?? null,
        requestMethod: options.requestMethod ?? req?.method ?? null,
        requestPath: options.requestPath ?? req?.originalUrl ?? null,
        ipAddress: options.ipAddress ?? (req ? getClientIp(req) : null),
        userAgent: options.userAgent ?? (typeof req?.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null),
        correlationId,
        before: toJsonValue(input.before),
        after: toJsonValue(input.after),
        metadata: toJsonValue(input.metadata),
        success: input.success ?? true,
        errorCode: input.errorCode ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] falha ao registrar evento', input.action, err);
  }
}

export async function recordAuditFromRequest(
  req: Request,
  statusCode: number
): Promise<void> {
  if (req.auditSkip) return;
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;

  const ctx = req.auditContext;
  const success = statusCode < 400;

  await recordAuditEvent(
    {
      action: ctx?.action ?? buildDefaultAction(req),
      entityType: ctx?.entityType ?? 'HttpRequest',
      entityId: ctx?.entityId ?? req.params?.id ?? null,
      parentType: ctx?.parentType ?? null,
      parentId: ctx?.parentId ?? null,
      before: ctx?.before,
      after: ctx?.after,
      metadata: {
        params: sanitizeAuditValue(req.params),
        query: sanitizeAuditValue(req.query),
        statusCode,
        ...(ctx?.metadata ?? {}),
      },
      success,
      errorCode: success ? null : String(statusCode),
    },
    { req }
  );
}

export async function recordAuditInTransaction(
  tx: Prisma.TransactionClient,
  input: AuditContextInput,
  options: RecordAuditOptions = {}
): Promise<void> {
  const req = options.req;
  const actor = req ? resolveActor(req) : {
    actorType: input.actorType ?? AuditActorType.SYSTEM,
    actorUserId: input.actorUserId ?? null,
    actorLabel: input.actorLabel ?? 'system',
  };

  try {
    await tx.auditEvent.create({
      data: {
        actorType: input.actorType ?? actor.actorType,
        actorUserId: input.actorUserId ?? actor.actorUserId,
        actorLabel: input.actorLabel ?? actor.actorLabel,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        parentType: input.parentType ?? null,
        parentId: input.parentId ?? null,
        requestMethod: options.requestMethod ?? req?.method ?? null,
        requestPath: options.requestPath ?? req?.originalUrl ?? null,
        ipAddress: options.ipAddress ?? (req ? getClientIp(req) : null),
        userAgent: options.userAgent ?? (typeof req?.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null),
        correlationId: options.correlationId ?? (req ? ensureCorrelationId(req) : null),
        before: toJsonValue(input.before),
        after: toJsonValue(input.after),
        metadata: toJsonValue(input.metadata),
        success: input.success ?? true,
        errorCode: input.errorCode ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] falha ao registrar evento na transação', input.action, err);
    throw err;
  }
}

export async function recordWorkerAudit(input: AuditContextInput): Promise<void> {
  await recordAuditEvent({
    ...input,
    actorType: AuditActorType.WORKER,
    actorLabel: input.actorLabel ?? 'worker',
  });
}

export function formatAuditEventForApi(event: {
  id: string;
  occurredAt: Date;
  actorType: AuditActorType;
  actorUserId: string | null;
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  parentType: string | null;
  parentId: string | null;
  requestMethod: string | null;
  requestPath: string | null;
  correlationId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  success: boolean;
  errorCode: string | null;
  actorUser?: { id: string; displayName: string; email: string } | null;
}) {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    actorType: event.actorType.toLowerCase(),
    actorUserId: event.actorUserId,
    actorLabel: event.actorLabel ?? event.actorUser?.displayName ?? null,
    actorEmail: event.actorUser?.email ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    parentType: event.parentType,
    parentId: event.parentId,
    requestMethod: event.requestMethod,
    requestPath: event.requestPath,
    correlationId: event.correlationId,
    before: event.before,
    after: event.after,
    metadata: event.metadata,
    success: event.success,
    errorCode: event.errorCode,
  };
}

/** Atalhos para handlers de rota. */
export const audit = {
  of(
    action: string,
    entityType: string,
    entityId?: string | null,
    extra?: Omit<AuditContextInput, 'action' | 'entityType' | 'entityId'>
  ): AuditContextInput {
    return { action, entityType, entityId, ...extra };
  },
  withParent(
    action: string,
    entityType: string,
    entityId: string | null | undefined,
    parentType: string,
    parentId: string,
    extra?: Omit<AuditContextInput, 'action' | 'entityType' | 'entityId' | 'parentType' | 'parentId'>
  ): AuditContextInput {
    return { action, entityType, entityId, parentType, parentId, ...extra };
  },
};
