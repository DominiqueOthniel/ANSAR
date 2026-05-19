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
} from 'class-validator';

export class CreateClientDeliveryDto {
  @IsUUID()
  clientOrderId: string;

  @IsString()
  @MaxLength(255)
  lieuLivraison: string;

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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantTransport?: number;

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
