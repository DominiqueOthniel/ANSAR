import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsIn,
  IsUUID,
  MaxLength,
  IsNumber,
  Min,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class CreateClientDeliveryDto {
  @IsUUID()
  clientOrderId: string;

  @IsString()
  @MaxLength(255)
  lieuLivraison: string;

  @IsOptional()
  @IsString()
  @IsIn(['retrait_hub', 'livraison_agent', 'livraison_directe'])
  modeSortie?: 'retrait_hub' | 'livraison_agent' | 'livraison_directe';

  @IsOptional()
  @IsString()
  @IsIn(['planifiee', 'en_cours', 'livree', 'annulee'])
  statut?: 'planifiee' | 'en_cours' | 'livree' | 'annulee';

  @IsOptional()
  @IsString()
  datePrevue?: string;

  @IsOptional()
  @IsString()
  dateLivraison?: string;

  @IsOptional()
  @IsUUID()
  chauffeurId?: string;

  @IsOptional()
  @IsUUID()
  tracteurId?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantTransport?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  transportFactureParFournisseur?: boolean;

  @IsOptional()
  @IsUUID()
  transportFournisseurId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
