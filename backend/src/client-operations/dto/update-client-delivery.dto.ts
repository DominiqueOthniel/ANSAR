import { PartialType } from '@nestjs/mapped-types';
import { CreateClientDeliveryDto } from './create-client-delivery.dto';

export class UpdateClientDeliveryDto extends PartialType(CreateClientDeliveryDto) {}
