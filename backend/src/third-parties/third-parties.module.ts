import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ThirdParty } from '../entities/third-party.entity';
import { ThirdPartiesController } from './third-parties.controller';
import { ThirdPartiesService } from './third-parties.service';

@Module({
  imports: [TypeOrmModule.forFeature([ThirdParty]), AuditLogsModule],
  controllers: [ThirdPartiesController],
  providers: [ThirdPartiesService],
  exports: [ThirdPartiesService],
})
export class ThirdPartiesModule {}
