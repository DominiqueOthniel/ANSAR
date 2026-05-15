import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCreditDto {
  @IsString()
  @IsIn(['emprunt', 'pret_accorde'])
  type: 'emprunt' | 'pret_accorde';

  @IsString()
  intitule: string;

  @IsString()
  preteur: string;

  @IsNumber()
  @Min(0.01)
  montantTotal: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxInteret?: number;

  @IsString()
  dateDebut: string;

  @IsOptional()
  @IsString()
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Rattachement explicite à une fiche client (prêt accordé). */
  @IsOptional()
  @IsUUID('4')
  clientTierId?: string;
}
