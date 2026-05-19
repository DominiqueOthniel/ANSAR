import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsNumber, ValidateIf } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
};

export class CreateExpenseDto {
  @Transform(emptyToUndefined)
  @ValidateIf((_: unknown, value: unknown) => value !== null && value !== undefined && value !== '')
  @IsString()
  camionId?: string;

  @Transform(emptyToUndefined)
  @ValidateIf((_: unknown, value: unknown) => value !== null && value !== undefined && value !== '')
  @IsString()
  tripId?: string;

  @Transform(emptyToUndefined)
  @ValidateIf((_: unknown, value: unknown) => value !== null && value !== undefined && value !== '')
  @IsString()
  chauffeurId?: string;

  @IsString()
  categorie: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  sousCategorie?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  fournisseurId?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  articleId?: string;

  @IsNumber()
  montant: number;

  @IsOptional()
  @IsNumber()
  quantite?: number;

  @IsOptional()
  @IsNumber()
  prixUnitaire?: number;

  @IsString()
  date: string;

  @IsString()
  description: string;
}
