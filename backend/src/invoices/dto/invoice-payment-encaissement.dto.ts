import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

/** Une ligne d’encaissement ventilée par payeur (facture trajet). */
export class InvoicePaymentEncaissementDto {
  @IsNumber()
  montant!: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientTierId?: string;

  @IsOptional()
  @IsString()
  payeurLibelle?: string;
}
