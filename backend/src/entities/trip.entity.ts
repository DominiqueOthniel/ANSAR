import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Truck } from './truck.entity';
import { Driver } from './driver.entity';

export type TripStatus = 'planifie' | 'en_cours' | 'termine' | 'annule';

export type TripStopType = 'chargement' | 'livraison' | 'autre';
export type TripStopStatut = 'prevu' | 'fait' | 'annule';

/** Élément du tableau JSON `stops` (chargements / livraisons variables) */
export interface TripStopPersisted {
  id: string;
  ordre: number;
  type: TripStopType;
  lieu: string;
  clientRef?: string;
  lat?: number;
  lng?: number;
  statut: TripStopStatut;
  notes?: string;
}

/** Client / structure rattaché au trajet (parts, facturation, règlement). */
export interface TripClientParticipantPersisted {
  id: string;
  tierId?: string;
  libelle: string;
  montantAttribue?: number;
}

@Entity('trips')
export class Trip {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  tracteurId?: string;

  @Column({ type: 'uuid', nullable: true })
  remorqueuseId?: string;

  @Column()
  origine: string;

  @Column()
  destination: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  origineLat?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  origineLng?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  destinationLat?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  destinationLng?: number;

  @Column({ type: 'uuid' })
  chauffeurId: string;

  @Column({ type: 'date' })
  dateDepart: string;

  @Column({ type: 'date', nullable: true })
  dateArrivee?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  recette: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  prefinancement?: number;

  @Column({ type: 'varchar', nullable: true })
  client?: string;

  @Column({ type: 'varchar', nullable: true })
  marchandise?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Référence commande / ATC. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  referenceAtc?: string;

  /** Destinataire effectif de la livraison (distinct du client facturé si besoin). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  destinataire?: string;

  /** Quantité chargée / livrée (sacs, tonnes… — unité libre côté métier). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantiteChargee?: number;

  /** Statut retour bordereaux (ex. ok, en attente). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  retourBordereaux?: string;

  @Column({ type: 'varchar', length: 20 })
  statut: TripStatus;

  /** Chaîne d’arrêts : chargements chez les fournisseurs, livraisons chez les clients (simple-json). */
  @Column({ type: 'simple-json', nullable: true })
  stops?: TripStopPersisted[] | null;

  /** Clients / parts liés au trajet (JSON). */
  @Column({ type: 'simple-json', nullable: true })
  clientParticipants?: TripClientParticipantPersisted[] | null;

  /** `id` d’une entrée de `clientParticipants` : client désigné pour le règlement / facture par défaut. */
  @Column({ type: 'varchar', length: 36, nullable: true })
  payeurParticipantId?: string | null;

  @ManyToOne(() => Truck, { nullable: true })
  @JoinColumn({ name: 'tracteurId' })
  tracteur?: Truck;

  @ManyToOne(() => Truck, { nullable: true })
  @JoinColumn({ name: 'remorqueuseId' })
  remorqueuse?: Truck;

  @ManyToOne(() => Driver)
  @JoinColumn({ name: 'chauffeurId' })
  chauffeur: Driver;
}
