import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ThirdParty } from './third-party.entity';
import { ClientOrder } from './client-order.entity';
import { Driver } from './driver.entity';
import { Truck } from './truck.entity';

export type ClientDeliveryStatus = 'planifiee' | 'en_cours' | 'livree' | 'annulee';

export type ClientDeliveryExitMode =
  | 'retrait_hub'
  | 'livraison_agent'
  | 'livraison_directe';

/** Livraison chez le client (exécution d’une commande). */
@Entity('client_deliveries')
export class ClientDelivery {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientOrderId: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @Column({ type: 'uuid', nullable: true })
  invoiceId?: string;

  @Column({ type: 'varchar', length: 255 })
  lieuLivraison: string;

  /** retrait_hub | livraison_agent | livraison_directe */
  @Column({ type: 'varchar', length: 32, default: 'livraison_directe' })
  modeSortie: ClientDeliveryExitMode;

  @Column({ type: 'varchar', length: 32 })
  statut: ClientDeliveryStatus;

  @Column({ type: 'date', nullable: true })
  datePrevue?: string;

  @Column({ type: 'date', nullable: true })
  dateLivraison?: string;

  @Column({ type: 'uuid', nullable: true })
  chauffeurId?: string;

  @Column({ type: 'uuid', nullable: true })
  tracteurId?: string;

  /** Frais de transport facturés au client pour cette livraison. */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  montantTransport?: number;

  /**
   * Transport sous-traité : le fournisseur facture la société, montant refacturé sur la FAC-CMD.
   */
  @Column({ type: 'boolean', default: false })
  transportFactureParFournisseur: boolean;

  @Column({ type: 'uuid', nullable: true })
  transportFournisseurId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => ClientOrder, (o) => o.deliveries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientOrderId' })
  order?: ClientOrder;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'clientId' })
  client?: ThirdParty;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'chauffeurId' })
  chauffeur?: Driver;

  @ManyToOne(() => Truck, { nullable: true })
  @JoinColumn({ name: 'tracteurId' })
  tracteur?: Truck;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'transportFournisseurId' })
  transportFournisseur?: ThirdParty;
}
