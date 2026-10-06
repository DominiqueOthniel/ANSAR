import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TjkDestination } from '../entities/tjk-destination.entity';
import { TjkDestinationsController } from './tjk-destinations.controller';
import { TjkDestinationsService } from './tjk-destinations.service';

@Module({
  imports: [TypeOrmModule.forFeature([TjkDestination])],
  controllers: [TjkDestinationsController],
  providers: [TjkDestinationsService],
  exports: [TjkDestinationsService],
})
export class TjkDestinationsModule {}
