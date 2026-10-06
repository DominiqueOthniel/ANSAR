import { PartialType } from '@nestjs/mapped-types';
import { CreateTjkDestinationDto } from './create-tjk-destination.dto';

export class UpdateTjkDestinationDto extends PartialType(CreateTjkDestinationDto) {}
