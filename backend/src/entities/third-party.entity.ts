import { Entity, PrimaryColumn, Column } from 'typeorm';

export type ThirdPartyType = 'proprietaire' | 'client' | 'fournisseur' | 'employe';

@Entity('third_parties')
export class ThirdParty {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  nom: string;

  @Column({ type: 'varchar', nullable: true })
  telephone?: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  adresse?: string;

  @Column({ type: 'varchar', length: 20 })
  type: ThirdPartyType;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Plafond d’encours (prêts accordés, FCFA) pour les fiches client ; optionnel. */
  @Column({ name: 'plafondCredit', type: 'decimal', precision: 15, scale: 2, nullable: true })
  plafondCredit?: string | null;
}
