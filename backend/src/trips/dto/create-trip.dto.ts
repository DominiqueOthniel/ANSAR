import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsArray,
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { TripStopDto } from './trip-stop.dto';

export class CreateTripDto {
  @IsOptional()
  @IsString()
  tracteurId?: string;

  @IsOptional()
  @IsString()
  remorqueuseId?: string;

  @IsString()
  origine: string;

  @IsString()
  destination: string;

  @IsOptional()
  @IsNumber()
  origineLat?: number;

  @IsOptional()
  @IsNumber()
  origineLng?: number;

  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @IsString()
  chauffeurId: string;

  @IsString()
  dateDepart: string;

  @IsOptional()
  @IsString()
  dateArrivee?: string;

  @IsNumber()
  recette: number;

  @IsOptional()
  @IsNumber()
  prefinancement?: number;

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsString()
  marchandise?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceAtc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destinataire?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantiteChargee?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  retourBordereaux?: string;

  @IsString()
  @IsIn(['planifie', 'en_cours', 'termine', 'annule'])
  statut: 'planifie' | 'en_cours' | 'termine' | 'annule';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripStopDto)
  stops?: TripStopDto[];
}
