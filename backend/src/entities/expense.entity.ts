import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Truck } from './truck.entity';
import { ThirdParty } from './third-party.entity';

@Entity('expenses')
export class Expense {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  camionId?: string;

  @Column({ type: 'uuid', nullable: true })
  tripId?: string;

  @Column({ type: 'uuid', nullable: true })
  chauffeurId?: string;

  @Column()
  categorie: string;

  @Column({ type: 'varchar', nullable: true })
  sousCategorie?: string;

  @Column({ type: 'uuid', nullable: true })
  fournisseurId?: string;

  /** Article catalogue (tarif forfaitaire fournisseur). */
  @Column({ type: 'uuid', nullable: true })
  articleId?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  montant: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantite?: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  prixUnitaire?: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text' })
  description: string;

  @ManyToOne(() => Truck, (truck) => truck.depenses, { nullable: true })
  @JoinColumn({ name: 'camionId' })
  camion?: Truck;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'fournisseurId' })
  fournisseur?: ThirdParty;
}
