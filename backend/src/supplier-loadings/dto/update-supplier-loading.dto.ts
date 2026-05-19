import { PartialType } from '@nestjs/mapped-types';
import { CreateSupplierLoadingDto } from './create-supplier-loading.dto';

export class UpdateSupplierLoadingDto extends PartialType(CreateSupplierLoadingDto) {}
