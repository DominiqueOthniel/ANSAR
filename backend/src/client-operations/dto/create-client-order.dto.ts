import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClientOrderDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;

  @IsString()
  @MaxLength(255)
  designation: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montant?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prixUnitaire?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantite?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unite?: string;

  @IsOptional()
  @IsString()
  @IsIn(['brouillon', 'confirmee', 'en_preparation', 'partiellement_livree', 'livree', 'annulee'])
  statut?: 'brouillon' | 'confirmee' | 'en_preparation' | 'partiellement_livree' | 'livree' | 'annulee';

  @IsString()
  dateCommande: string;

  @IsOptional()
  @IsString()
  dateLivraisonSouhaitee?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
