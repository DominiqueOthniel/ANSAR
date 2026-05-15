import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { MerchandiseQualitiesService } from './merchandise-qualities.service';
import { CreateMerchandiseQualityDto } from './dto/create-merchandise-quality.dto';
import { UpdateMerchandiseQualityDto } from './dto/update-merchandise-quality.dto';

@Controller('merchandise-qualities')
export class MerchandiseQualitiesController {
  constructor(private readonly service: MerchandiseQualitiesService) {}

  @Post()
  create(@Body() dto: CreateMerchandiseQualityDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMerchandiseQualityDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
