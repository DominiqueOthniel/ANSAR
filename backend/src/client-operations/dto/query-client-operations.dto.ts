import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class QueryClientOrdersDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  walkIn?: string;
}

export class QueryClientDeliveriesDto {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  clientOrderId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  walkIn?: string;
}
