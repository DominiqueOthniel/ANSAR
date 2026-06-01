import { Transform, Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateClientOrderDto {
  @ValidateIf((o) => o.clientId != null && o.clientId !== '')
  @Transform(emptyToUndefined)
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientNom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientTelephone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  clientAdresse?: string;

  @ValidateIf((o) => o.articleId != null && o.articleId !== '')
  @Transform(emptyToUndefined)
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;

  @IsString()
  @MaxLength(255)
  designation: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montant?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prixUnitaire?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantite?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  unite?: string;

  @IsOptional()
  @IsString()
  @IsIn(['brouillon', 'confirmee', 'en_preparation', 'partiellement_livree', 'livree', 'annulee'])
  statut?: 'brouillon' | 'confirmee' | 'en_preparation' | 'partiellement_livree' | 'livree' | 'annulee';

  @IsString()
  dateCommande: string;

  @IsOptional()
  @IsString()
  dateLivraisonSouhaitee?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Encaissement déjà reçu à la création (acompte ou solde). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  montantPaye?: number;

  @IsOptional()
  @IsString()
  datePaiement?: string;
}
