import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** Libellés marchandise / qualité réutilisables pour les trajets (catalogue métier). */
@Entity('merchandise_qualities')
export class MerchandiseQuality {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  libelle: string;

  @CreateDateColumn({ name: 'createdAt', type: 'timestamptz' })
  createdAt: Date;
}
