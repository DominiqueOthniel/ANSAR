import { IsString, IsOptional, IsNumber, IsIn, IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  numero: string;

  @IsOptional()
  @IsString()
  trajetId?: string;

  @IsOptional()
  @IsString()
  parcelExpeditionId?: string;

  @IsOptional()
  @IsString()
  expenseId?: string;

  @IsString()
  @IsIn(['en_attente', 'payee'])
  statut: 'en_attente' | 'payee';

  @IsNumber()
  montantHT: number;

  @IsOptional()
  @IsNumber()
  remise?: number;

  @IsOptional()
  @IsNumber()
  montantHTApresRemise?: number;

  @IsOptional()
  @IsNumber()
  tva?: number;

  @IsOptional()
  @IsNumber()
  tps?: number;

  @IsNumber()
  montantTTC: number;

  @IsOptional()
  @IsNumber()
  montantPaye?: number;

  @IsString()
  dateCreation: string;

  @IsOptional()
  @IsString()
  datePaiement?: string;

  @IsOptional()
  @IsString()
  modePaiement?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  clientTierId?: string;

  @IsOptional()
  @IsString()
  factureClientLibelle?: string;
}
