import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('caisse_config')
export class CaisseConfig {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ name: 'soldeInitial', type: 'decimal', precision: 15, scale: 2, default: 0 })
  soldeInitial: string;

  @Column({ name: 'updatedAt', type: 'timestamptz', nullable: true })
  updatedAt?: Date;
}
