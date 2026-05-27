import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ThirdParty } from './third-party.entity';
import { Truck } from './truck.entity';
import { SupplierLoadingAssignment } from './supplier-loading-assignment.entity';

export type SupplierLoadingEntryMode =
  | 'bon_simple'
  | 'camion_ansar'
  | 'rail'
  | 'rendu_fournisseur'
  | 'camion'
  | 'autre';

export type SupplierLoadingStatus =
  | 'brouillon'
  | 'en_transit'
  | 'au_hub'
  | 'en_dispatch'
  | 'solde'
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

  /** Valeur totale du bon chez le fournisseur (FCFA). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantBon?: string;

  @Column({ type: 'date' })
  dateChargement: string;

  @Column({ type: 'date', nullable: true })
  dateLivraison?: string;

  @Column({ type: 'varchar', length: 32 })
  statut: SupplierLoadingStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lieu?: string;

  /** bon_simple | camion_ansar | rail | rendu_fournisseur (+ anciennes valeurs camion/autre). */
  @Column({ type: 'varchar', length: 32, default: 'bon_simple' })
  modeEntree: SupplierLoadingEntryMode;

  @Column({ type: 'uuid', nullable: true })
  camionId?: string;

  /** Hub d’arrivée (ex. CAMRAIL Douala). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  hubArrivee?: string;

  @Column({ type: 'date', nullable: true })
  dateArriveeHub?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'fournisseurId' })
  fournisseur?: ThirdParty;

  @ManyToOne(() => Truck, { nullable: true })
  @JoinColumn({ name: 'camionId' })
  camion?: Truck;

  @OneToMany(() => SupplierLoadingAssignment, (a) => a.loading)
  assignments?: SupplierLoadingAssignment[];
}
