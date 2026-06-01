import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ThirdParty } from './third-party.entity';
import { Driver } from './driver.entity';
import { Trip } from './trip.entity';
import { Expense } from './expense.entity';

export type TruckType = 'tracteur' | 'remorqueuse';
export type TruckStatus = 'actif' | 'inactif';
export type TruckSousType = 'tracteur_seul' | 'tracteur_jumele' | 'remorque_seule';

@Entity('trucks')
export class Truck {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  immatriculation: string;

  @Column({ type: 'varchar', nullable: true })
  nom?: string;

  @Column()
  modele: string;

  @Column({ type: 'varchar', length: 20 })
  type: TruckType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  sousType?: TruckSousType;

  /** Immatriculation de la remorque quand le tracteur est jumelé. */
  @Column({ type: 'varchar', nullable: true })
  remorqueImmatriculation?: string;

  @Column({ type: 'varchar', length: 20 })
  statut: TruckStatus;

  @Column({ type: 'date' })
  dateMiseEnCirculation: string;

  @Column({ type: 'varchar', nullable: true })
  photo?: string;

  @Column({ type: 'uuid', nullable: true })
  proprietaireId?: string;

  @Column({ type: 'uuid', nullable: true })
  chauffeurId?: string;

  @ManyToOne(() => ThirdParty, { nullable: true })
  @JoinColumn({ name: 'proprietaireId' })
  proprietaire?: ThirdParty;

  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: 'chauffeurId' })
  chauffeur?: Driver;

  @OneToMany(() => Trip, (trip) => trip.tracteur)
  trajetsTracteur?: Trip[];

  @OneToMany(() => Expense, (expense) => expense.camion)
  depenses?: Expense[];
}
