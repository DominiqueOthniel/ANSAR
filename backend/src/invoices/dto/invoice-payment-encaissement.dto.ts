import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

/** Une ligne d’encaissement ventilée par payeur (facture trajet). */
export class InvoicePaymentEncaissementDto {
  @IsNumber()
  montant!: number;

  @IsOptional()
  @IsUUID()
  clientTierId?: string;

  @IsOptional()
  @IsString()
  payeurLibelle?: string;
}
