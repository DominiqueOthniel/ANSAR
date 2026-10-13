import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCaisseConfigDto {
  @IsNumber()
  @Min(0)
  soldeInitial: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoriesDepense?: string[];
}
