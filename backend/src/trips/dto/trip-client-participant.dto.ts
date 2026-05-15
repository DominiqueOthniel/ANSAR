import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/** Ligne « client / part » liée au trajet (multi-clients, règlement). */
export class TripClientParticipantDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  /** Fiche tiers type client (optionnel). */
  @IsOptional()
  @IsUUID()
  tierId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  libelle: string;

  /** Part de recette attribuée (FCFA), optionnelle (aide au suivi). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantAttribue?: number;
}
