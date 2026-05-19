import { PartialType } from '@nestjs/mapped-types';
import { CreateClientOrderDto } from './create-client-order.dto';

export class UpdateClientOrderDto extends PartialType(CreateClientOrderDto) {}
