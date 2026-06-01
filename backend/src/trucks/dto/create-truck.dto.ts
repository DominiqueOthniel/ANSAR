import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateTruckDto {
  @IsString()
  immatriculation: string;

  @IsOptional()
  @IsString()
  nom?: string;

  @IsString()
  modele: string;

  @IsString()
  @IsIn(['tracteur', 'remorqueuse'])
  type: 'tracteur' | 'remorqueuse';

  @IsOptional()
  @IsString()
  @IsIn(['tracteur_seul', 'tracteur_jumele', 'remorque_seule'])
  sousType?: 'tracteur_seul' | 'tracteur_jumele' | 'remorque_seule';

  @IsOptional()
  @IsString()
  remorqueImmatriculation?: string;

  @IsString()
  @IsIn(['actif', 'inactif'])
  statut: 'actif' | 'inactif';

  @IsString()
  dateMiseEnCirculation: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsString()
  proprietaireId?: string;

  @IsOptional()
  @IsString()
  chauffeurId?: string;
}
