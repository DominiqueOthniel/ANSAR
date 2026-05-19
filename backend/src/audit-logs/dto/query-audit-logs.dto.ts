import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryAuditLogsDto {
  @IsOptional()
  @IsString()
  module?: string;

  @IsOptional()
  @IsIn(['CREATE', 'UPDATE', 'DELETE', 'REMBOURSEMENT', 'PAYMENT', 'ENCAISSEMENT'])
  action?: string;

  @IsOptional()
  @IsString()
  actorLogin?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

