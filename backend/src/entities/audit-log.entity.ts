import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ type: 'varchar', length: 20 })
  action: string;

  @Column({ name: 'entityId', type: 'varchar', length: 128, nullable: true })
  entityId?: string;

  @Column({ name: 'actorLogin', type: 'varchar', length: 120, nullable: true })
  actorLogin?: string;

  @Column({ name: 'actorRole', type: 'varchar', length: 30, nullable: true })
  actorRole?: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ name: 'beforeData', type: 'simple-json', nullable: true })
  beforeData?: Record<string, unknown> | null;

  @Column({ name: 'afterData', type: 'simple-json', nullable: true })
  afterData?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'createdAt', type: 'datetime' })
  createdAt: Date;
}

