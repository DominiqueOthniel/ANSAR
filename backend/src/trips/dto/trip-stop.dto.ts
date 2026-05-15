import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Arrêt de trajet (chargement, livraison, etc.) — persistant en JSONB */
export class TripStopDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsInt()
  @Min(0)
  ordre: number;

  @IsIn(['chargement', 'livraison', 'autre'])
  type: 'chargement' | 'livraison' | 'autre';

  @IsString()
  @IsNotEmpty()
  lieu: string;

  @IsOptional()
  @IsString()
  clientRef?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsIn(['prevu', 'fait', 'annule'])
  statut: 'prevu' | 'fait' | 'annule';

  @IsOptional()
  @IsString()
  notes?: string;
}
