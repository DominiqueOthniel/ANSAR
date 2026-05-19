import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplierLoading } from '../entities/supplier-loading.entity';
import { SupplierLoadingAssignment } from '../entities/supplier-loading-assignment.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { ClientOrder } from '../entities/client-order.entity';
import { Article } from '../entities/article.entity';
import { SupplierLoadingsService } from './supplier-loadings.service';
import { SupplierLoadingsController } from './supplier-loadings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupplierLoading,
      SupplierLoadingAssignment,
      ThirdParty,
      ClientOrder,
      Article,
    ]),
  ],
  controllers: [SupplierLoadingsController],
  providers: [SupplierLoadingsService],
  exports: [SupplierLoadingsService],
})
export class SupplierLoadingsModule {}
