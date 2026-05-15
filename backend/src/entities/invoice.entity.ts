import { Entity, PrimaryColumn, Column } from 'typeorm';

export type InvoiceStatus = 'en_attente' | 'payee';

export interface InvoicePaymentEncaissementPersisted {
  montant: number;
  clientTierId?: string;
  payeurLibelle?: string;
}

@Entity('invoices')
export class Invoice {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  numero: string;

  @Column({ type: 'uuid', nullable: true })
  trajetId?: string;

  @Column({ type: 'uuid', nullable: true })
  parcelExpeditionId?: string;

  @Column({ type: 'uuid', nullable: true })
  expenseId?: string;

  @Column({ type: 'varchar', length: 20 })
  statut: InvoiceStatus;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  montantHT: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  remise?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantHTApresRemise?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  tva?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  tps?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  montantTTC: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantPaye?: number;

  @Column({ type: 'date' })
  dateCreation: string;

  @Column({ type: 'date', nullable: true })
  datePaiement?: string;

  @Column({ type: 'varchar', nullable: true })
  modePaiement?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Fiche client lorsque la facture couvre une part de trajet (multi-clients). */
  @Column({ type: 'uuid', nullable: true })
  clientTierId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  factureClientLibelle?: string;

  /** Encaissements partiels ventilés par payeur (multi-clients sur une même facture trajet). */
  @Column({ type: 'simple-json', nullable: true })
  paiementsEncaissements?: InvoicePaymentEncaissementPersisted[] | null;
}
