import type { Request, Response, NextFunction } from 'express';
import { ensureCorrelationId } from '../lib/audit';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = ensureCorrelationId(req);
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
