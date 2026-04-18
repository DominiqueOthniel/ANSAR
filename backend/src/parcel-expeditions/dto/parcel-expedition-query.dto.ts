import { IsOptional, IsString, IsIn } from 'class-validator';

export class ParcelExpeditionQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['planifie', 'en_cours', 'termine', 'annule'])
  statut?: 'planifie' | 'en_cours' | 'termine' | 'annule';

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  chauffeurId?: string;

  @IsOptional()
  @IsString()
  tracteurId?: string;

  @IsOptional()
  @IsString()
  remorqueuseId?: string;

  /** Recherche libre (réf., destination, description, entreprises, marchandises) */
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  dateDepartFrom?: string;

  @IsOptional()
  @IsString()
  dateDepartTo?: string;
}
