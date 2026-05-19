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

export class CreateSupplierLoadingDto {
  @IsUUID()
  fournisseurId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  numeroBon?: string;

  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsString()
  @MaxLength(255)
  designation: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantBon?: number;

  @IsString()
  dateChargement: string;

  @IsOptional()
  @IsString()
  @IsIn(['brouillon', 'en_attente_affectation', 'partiellement_affecte', 'affecte', 'annule'])
  statut?: 'brouillon' | 'en_attente_affectation' | 'partiellement_affecte' | 'affecte' | 'annule';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lieu?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
