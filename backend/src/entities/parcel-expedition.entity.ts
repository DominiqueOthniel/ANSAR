import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Truck } from './truck.entity';
import { Driver } from './driver.entity';

export type ParcelExpeditionLotJson = {
  id: string;
  clients: string;
  unite: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
  observations?: string;
};

export type ParcelExpeditionStatus =
  | 'planifie'
  | 'en_cours'
  | 'termine'
  | 'annule';

@Entity('parcel_expeditions')
export class ParcelExpedition {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  reference: string;

  @Column()
  origine: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  origineLat?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  origineLng?: number;

  @Column()
  destination: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  destinationLat?: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  destinationLng?: number;

  @Column({ type: 'uuid', nullable: true })
  tracteurId?: string;

  @Column({ type: 'uuid', nullable: true })
  remorqueuseId?: string;

  @Column({ type: 'uuid' })
  chauffeurId: string;

  @Column({ type: 'date' })
  dateDepart: string;

  @Column({ type: 'date', nullable: true })
  dateArrivee?: string;

  @Column({ type: 'varchar', length: 20 })
  statut: ParcelExpeditionStatus;

  @Column({ type: 'jsonb' })
  lots: ParcelExpeditionLotJson[];

  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Commission société sur le CA des lignes (pourcentage, ex. 10 = 10 %). */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  commissionPct?: number;

  @Column({ type: 'date' })
  dateCreation: string;

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
