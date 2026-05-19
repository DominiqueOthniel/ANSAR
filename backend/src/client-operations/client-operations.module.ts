import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ClientOrder } from '../entities/client-order.entity';
import { ClientDelivery } from '../entities/client-delivery.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { Article } from '../entities/article.entity';
import { Invoice } from '../entities/invoice.entity';
import { SupplierLoadingAssignment } from '../entities/supplier-loading-assignment.entity';
import { ClientOperationsService } from './client-operations.service';
import { ClientOperationsController } from './client-operations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientOrder,
      ClientDelivery,
      ThirdParty,
      Article,
      Invoice,
      SupplierLoadingAssignment,
    ]),
    AuditLogsModule,
  ],
  controllers: [ClientOperationsController],
  providers: [ClientOperationsService],
  exports: [ClientOperationsService],
})
export class ClientOperationsModule {}
