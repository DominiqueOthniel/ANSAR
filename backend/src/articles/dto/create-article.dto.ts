import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @MaxLength(255)
  libelle: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unite?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prixVente?: number;
}
