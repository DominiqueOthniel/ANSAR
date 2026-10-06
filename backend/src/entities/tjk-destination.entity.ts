import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** Destination TJK avec montants forfaitaires pour préremplir une opération. */
@Entity('tjk_destinations')
export class TjkDestination {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  libelle: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantiteDefaut: number | null;

  @Column({ type: 'decimal', precision: 8, scale: 3, nullable: true, default: 50 })
  poidsUniteKg: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  prixTrans: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  prixTransport: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  totalTransport: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  prixVoyage: number | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  totalPaiement: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
