import { Entity, PrimaryColumn, Column } from 'typeorm';

export type CaisseTxType = 'entree' | 'sortie';

@Entity('caisse_transactions')
export class CaisseTransactionEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: CaisseTxType;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  montant: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  utilisateur?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  categorie?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string;

  @Column({ name: 'compteBanqueId', type: 'uuid', nullable: true })
  compteBanqueId?: string;

  @Column({ name: 'bankTransactionId', type: 'varchar', length: 128, nullable: true })
  bankTransactionId?: string;

  @Column({ name: 'exclutRevenu', type: 'boolean', default: false })
  exclutRevenu: boolean;

  /** Tiers client métier rattaché au mouvement (versement / encaissement). */
  @Column({ name: 'clientTierId', type: 'uuid', nullable: true })
  clientTierId?: string;

  /** Mode de paiement métier (Espèces, MTN, Virement direct…). */
  @Column({ name: 'modePaiement', type: 'varchar', length: 80, nullable: true })
  modePaiement?: string;

  @Column({ name: 'createdAt', type: 'timestamp', nullable: true })
  createdAt?: Date;
}
