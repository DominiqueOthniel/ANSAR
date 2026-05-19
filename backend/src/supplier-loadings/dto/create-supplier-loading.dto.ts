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

const STATUTS = [
  'brouillon',
  'en_transit',
  'au_hub',
  'en_dispatch',
  'solde',
  'en_attente_affectation',
  'partiellement_affecte',
  'affecte',
  'annule',
] as const;

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
  @IsIn(STATUTS)
  statut?: (typeof STATUTS)[number];

  @IsOptional()
  @IsString()
  @IsIn(['camion', 'rail', 'autre'])
  modeEntree?: 'camion' | 'rail' | 'autre';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  hubArrivee?: string;

  @IsOptional()
  @IsString()
  dateArriveeHub?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lieu?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
