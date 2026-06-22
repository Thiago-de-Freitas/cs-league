import { Response, NextFunction } from 'express';
import { getRedisEnvErrors } from '../lib/env';

/** Bloqueia apenas operações que enfileiram jobs (upload/reprocess). Leituras usam só o banco. */
export function requireDemoQueue(_req: unknown, res: Response, next: NextFunction): void {
  const redisErrors = getRedisEnvErrors();
  if (redisErrors.length > 0) {
    res.status(503).json({
      error: 'Fila de demos indisponível. Configure REDIS_URL na API (plugin Redis, não o Worker).',
      errors: redisErrors,
      code: 'DEMO_QUEUE_UNAVAILABLE',
    });
    return;
  }
  next();
}
