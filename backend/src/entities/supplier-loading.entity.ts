import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ThirdParty } from './third-party.entity';
import { SupplierLoadingAssignment } from './supplier-loading-assignment.entity';

export type SupplierLoadingStatus =
  | 'brouillon'
  | 'en_attente_affectation'
  | 'partiellement_affecte'
  | 'affecte'
  | 'annule';

/** Bon / chargement chez un fournisseur (site de ramassage). */
@Entity('supplier_loadings')
export class SupplierLoading {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  fournisseurId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  numeroBon?: string;

  @Column({ type: 'uuid', nullable: true })
  articleId?: string;

  @Column({ type: 'varchar', length: 255 })
  designation: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantite?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unite?: string;

  @Column({ type: 'date' })
  dateChargement: string;

  @Column({ type: 'varchar', length: 32 })
  statut: SupplierLoadingStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lieu?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'fournisseurId' })
  fournisseur?: ThirdParty;

  @OneToMany(() => SupplierLoadingAssignment, (a) => a.loading)
  assignments?: SupplierLoadingAssignment[];
}
