import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class QueryClientOrdersDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  walkIn?: string;
}

export class QueryClientDeliveriesDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  clientOrderId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  walkIn?: string;
}
