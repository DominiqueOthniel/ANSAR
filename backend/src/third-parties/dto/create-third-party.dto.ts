import { Type } from 'class-transformer';
import { IsString, IsOptional, IsIn, IsNumber, Min } from 'class-validator';

export class CreateThirdPartyDto {
  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  adresse?: string;

  @IsString()
  @IsIn(['proprietaire', 'client', 'fournisseur', 'employe'])
  type: 'proprietaire' | 'client' | 'fournisseur' | 'employe';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  plafondCredit?: number | null;
}
