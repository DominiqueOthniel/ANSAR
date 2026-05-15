import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchandiseQuality } from '../entities/merchandise-quality.entity';
import { MerchandiseQualitiesService } from './merchandise-qualities.service';
import { MerchandiseQualitiesController } from './merchandise-qualities.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MerchandiseQuality])],
  controllers: [MerchandiseQualitiesController],
  providers: [MerchandiseQualitiesService],
  exports: [MerchandiseQualitiesService],
})
export class MerchandiseQualitiesModule {}
