import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsIn,
  IsDateString,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { ParcelExpeditionLotDto } from './parcel-expedition-lot.dto';

export class CreateParcelExpeditionDto {
  @IsString()
  @MinLength(1)
  reference: string;

  @IsString()
  @MinLength(1)
  origine: string;

  @IsOptional()
  @IsNumber()
  origineLat?: number;

  @IsOptional()
  @IsNumber()
  origineLng?: number;

  @IsString()
  @MinLength(1)
  destination: string;

  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @IsOptional()
  @IsString()
  tracteurId?: string;

  @IsOptional()
  @IsString()
  remorqueuseId?: string;

  @IsString()
  chauffeurId: string;

  @IsDateString()
  dateDepart: string;

  @IsOptional()
  @IsDateString()
  dateArrivee?: string;

  @IsString()
  @IsIn(['planifie', 'en_cours', 'termine', 'annule'])
  statut: 'planifie' | 'en_cours' | 'termine' | 'annule';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParcelExpeditionLotDto)
  lots: ParcelExpeditionLotDto[];

  @IsOptional()
  @IsString()
  description?: string;

  /** Commission sur le CA des lignes (0–100 %). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPct?: number;

  @IsOptional()
  @IsDateString()
  dateCreation?: string;
}
