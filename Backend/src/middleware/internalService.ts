import { Request, Response, NextFunction } from 'express';
import { secureCompare } from '../lib/secureCompare';

/** Autenticação service-to-service (worker → API) via header compartilhado. */
export function internalServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SERVICE_KEY?.trim();
  if (!expected) {
    res.status(503).json({ error: 'INTERNAL_SERVICE_KEY não configurado na API' });
    return;
  }

  const provided = req.headers['x-internal-service-key'];
  if (typeof provided !== 'string' || !secureCompare(expected, provided)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}
