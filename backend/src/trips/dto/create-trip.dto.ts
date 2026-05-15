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
import { TripClientParticipantDto } from './trip-client-participant.dto';

export class CreateTripDto {
  @IsOptional()
  @IsString()
  tracteurId?: string;

  @IsOptional()
  @IsString()
  remorqueuseId?: string;

  @IsString()
  origine: string;

  /** Résumé itinéraire ; peut être vide si le détail est porté par les arrêts. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripClientParticipantDto)
  clientParticipants?: TripClientParticipantDto[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payeurParticipantId?: string;
}
