import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParcelExpedition } from '../entities/parcel-expedition.entity';
import { ParcelExpeditionsController } from './parcel-expeditions.controller';
import { ParcelExpeditionsService } from './parcel-expeditions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ParcelExpedition])],
  controllers: [ParcelExpeditionsController],
  providers: [ParcelExpeditionsService],
  exports: [ParcelExpeditionsService],
})
export class ParcelExpeditionsModule {}
