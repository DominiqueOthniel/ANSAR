import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditActor {
  login?: string;
  role?: string;
}

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'REMBOURSEMENT'
  | 'PAYMENT'
  | 'ENCAISSEMENT';

export interface AuditPayload {
  module: string;
  action: AuditAction;
  entityId?: string;
  summary?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  actor?: AuditActor;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(payload: AuditPayload): Promise<void> {
    const row = this.repo.create({
      module: payload.module,
      action: payload.action,
      entityId: payload.entityId,
      actorLogin: payload.actor?.login,
      actorRole: payload.actor?.role,
      summary: payload.summary,
      beforeData: payload.beforeData ?? null,
      afterData: payload.afterData ?? null,
    });
    await this.repo.save(row);
  }

  async findAll(query: QueryAuditLogsDto): Promise<AuditLog[]> {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');
    if (query.module) qb.andWhere('a.module = :module', { module: query.module });
    if (query.action) qb.andWhere('a.action = :action', { action: query.action });
    if (query.actorLogin) qb.andWhere('a.actorLogin ILIKE :actorLogin', { actorLogin: `%${query.actorLogin}%` });
    if (query.from) qb.andWhere('a.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: query.to });
    qb.take(query.limit ?? 5000);
    return qb.getMany();
  }
}

