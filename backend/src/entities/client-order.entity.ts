import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { ThirdParty } from './third-party.entity';
import { ClientDelivery } from './client-delivery.entity';

export type ClientOrderStatus =
  | 'brouillon'
  | 'confirmee'
  | 'en_preparation'
  | 'partiellement_livree'
  | 'livree'
  | 'annulee';

/** Commande client (donneur d’ordre / intermédiation). */
@Entity('client_orders')
export class ClientOrder {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  clientId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  clientNom?: string;

  @Column({ type: 'uuid', nullable: true })
  articleId?: string;

  @Column({ type: 'uuid', nullable: true })
  invoiceId?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  reference?: string;

  @Column({ type: 'varchar', length: 255 })
  designation: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  destination?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montant?: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  prixUnitaire?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantite?: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unite?: string;

  @Column({ type: 'varchar', length: 32 })
  statut: ClientOrderStatus;

  @Column({ type: 'date' })
  dateCommande: string;

  @Column({ type: 'date', nullable: true })
  dateLivraisonSouhaitee?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'clientId' })
  client?: ThirdParty;

  @OneToMany(() => ClientDelivery, (d) => d.order)
  deliveries?: ClientDelivery[];
}
