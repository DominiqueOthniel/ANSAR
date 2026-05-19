import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class UpdateArticleSupplierPriceDto {
  @IsOptional()
  @IsUUID()
  fournisseurId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  prixUnitaire?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
