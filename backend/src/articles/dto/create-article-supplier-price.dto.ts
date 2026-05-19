import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateArticleSupplierPriceDto {
  @IsUUID()
  fournisseurId: string;

  @IsNumber()
  @Min(0)
  prixUnitaire: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
