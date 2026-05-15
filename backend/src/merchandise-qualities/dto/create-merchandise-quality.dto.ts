import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMerchandiseQualityDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  libelle: string;
}
