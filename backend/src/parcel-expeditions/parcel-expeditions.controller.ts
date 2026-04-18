import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  Query,
} from '@nestjs/common';
import { ParcelExpeditionsService } from './parcel-expeditions.service';
import { CreateParcelExpeditionDto } from './dto/create-parcel-expedition.dto';
import { UpdateParcelExpeditionDto } from './dto/update-parcel-expedition.dto';
import { ParcelExpeditionQueryDto } from './dto/parcel-expedition-query.dto';

@Controller('parcel-expeditions')
export class ParcelExpeditionsController {
  constructor(private readonly service: ParcelExpeditionsService) {}

  @Post()
  create(@Body() dto: CreateParcelExpeditionDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: ParcelExpeditionQueryDto) {
    const hasAny =
      query.statut ||
      query.destination ||
      query.chauffeurId ||
      query.tracteurId ||
      query.remorqueuseId ||
      query.q ||
      query.dateDepartFrom ||
      query.dateDepartTo;
    return this.service.findAll(hasAny ? query : undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParcelExpeditionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
