import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class LoadingAssignmentItemDto {
  @IsUUID()
  clientOrderId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantiteAffectee?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SetLoadingAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LoadingAssignmentItemDto)
  assignments: LoadingAssignmentItemDto[];
}
