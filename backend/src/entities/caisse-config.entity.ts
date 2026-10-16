import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('caisse_config')
export class CaisseConfig {
  @PrimaryColumn({ type: 'smallint' })
  id: number;

  @Column({ name: 'soldeInitial', type: 'decimal', precision: 15, scale: 2, default: 0 })
  soldeInitial: string;

  /** Cas de dépenses configurables (JSON array de libellés). */
  @Column({ name: 'categoriesDepense', type: 'simple-json', nullable: true })
  categoriesDepense?: string[] | null;

  @Column({ name: 'updatedAt', type: 'timestamp', nullable: true })
  updatedAt?: Date;
}
