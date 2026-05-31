import { Transform, Type } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsIn, IsUUID, IsArray, ValidateNested } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;
import { InvoicePaymentEncaissementDto } from './invoice-payment-encaissement.dto';

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

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientOrderId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientDeliveryId?: string;

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
  @Transform(emptyToUndefined)
  @IsUUID()
  clientTierId?: string;

  @IsOptional()
  @IsString()
  factureClientLibelle?: string;

  /** Ventilation des encaissements par payeur (somme des montants = montantPaye si renseigné). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentEncaissementDto)
  paiementsEncaissements?: InvoicePaymentEncaissementDto[];
}
