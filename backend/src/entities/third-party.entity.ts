import { Entity, PrimaryColumn, Column } from 'typeorm';

export type ThirdPartyType = 'proprietaire' | 'client' | 'fournisseur' | 'employe';

export type ClientSexe = 'homme' | 'femme' | 'autre';
export type ClientSegment = 'particulier' | 'professionnel' | 'gros_compte' | 'institution';

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

  /** Profil client (optionnel, type = client). */
  @Column({ type: 'varchar', length: 16, nullable: true })
  sexe?: ClientSexe;

  @Column({ type: 'varchar', length: 32, nullable: true })
  segmentClient?: ClientSegment;

  @Column({ type: 'varchar', length: 128, nullable: true })
  ville?: string;

  @Column({ type: 'date', nullable: true })
  dateNaissance?: string;
}
