import { PartialType } from '@nestjs/mapped-types';
import { CreateMerchandiseQualityDto } from './create-merchandise-quality.dto';

export class UpdateMerchandiseQualityDto extends PartialType(CreateMerchandiseQualityDto) {}
