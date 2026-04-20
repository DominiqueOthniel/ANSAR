import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDriverTransactionDto {
  @IsString()
  @IsIn(['apport', 'sortie'])
  type: 'apport' | 'sortie';

  @IsNumber()
  montant: number;

  @IsString()
  date: string;

  @IsString()
  description: string;
}

export class CreateDriverDto {
  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsString()
  telephone: string;

  @IsOptional()
  @IsString()
  cni?: string;

  @IsOptional()
  @IsString()
  numeroPermis?: string;

  @IsOptional()
  @IsString()
  photo?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDriverTransactionDto)
  transactions?: CreateDriverTransactionDto[];
}
