import { Request } from 'express';
import { AuditActor } from './audit-logs.service';

export function getAuditActor(req: Request): AuditActor {
  const login = req.headers['x-actor-login'];
  const role = req.headers['x-actor-role'];
  return {
    login: typeof login === 'string' && login.trim() ? login.trim() : undefined,
    role: typeof role === 'string' && role.trim() ? role.trim() : undefined,
  };
}
