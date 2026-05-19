import { IsOptional, IsUUID } from 'class-validator';

export class QueryClientOrdersDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class QueryClientDeliveriesDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  clientOrderId?: string;
}
