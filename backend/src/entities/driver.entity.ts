import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { DriverTransaction } from './driver-transaction.entity';

@Entity('drivers')
export class Driver {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  nom: string;

  @Column()
  prenom: string;

  @Column()
  telephone: string;

  @Column({ type: 'varchar', nullable: true })
  cni?: string;

  @Column({ type: 'varchar', nullable: true })
  numeroPermis?: string;

  @Column({ type: 'varchar', nullable: true })
  photo?: string;

  @OneToMany(() => DriverTransaction, (tx) => tx.driver, { cascade: true })
  transactions: DriverTransaction[];
}
