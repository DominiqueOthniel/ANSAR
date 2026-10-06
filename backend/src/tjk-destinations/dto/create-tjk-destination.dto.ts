import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTjkDestinationDto {
  @IsString()
  @IsNotEmpty()
  libelle: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantiteDefaut?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  poidsUniteKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prixTonnage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prixTrans?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prixTransport?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalTransport?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prixVoyage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPaiement?: number;
}
