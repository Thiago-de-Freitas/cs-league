import type { Request, Response, NextFunction } from 'express';
import { recordAuditFromRequest } from '../lib/audit';

export function auditResponseMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  res.on('finish', () => {
    void recordAuditFromRequest(req, res.statusCode);
  });

  next();
}
