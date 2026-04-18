import { IsString, IsOptional, IsNumber, MinLength } from 'class-validator';

export class ParcelExpeditionLotDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1, { message: 'Chaque lot doit avoir une entreprise' })
  entreprise: string;

  @IsString()
  @MinLength(1, { message: 'Chaque lot doit avoir une marchandise' })
  marchandise: string;

  @IsOptional()
  @IsNumber()
  poidsKg?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
