import { PartialType } from '@nestjs/mapped-types';
import { CreateParcelExpeditionDto } from './create-parcel-expedition.dto';

export class UpdateParcelExpeditionDto extends PartialType(
  CreateParcelExpeditionDto,
) {}
