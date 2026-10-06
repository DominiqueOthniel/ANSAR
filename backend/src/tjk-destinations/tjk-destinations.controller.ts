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
import { TjkDestinationsService } from './tjk-destinations.service';
import { CreateTjkDestinationDto } from './dto/create-tjk-destination.dto';
import { UpdateTjkDestinationDto } from './dto/update-tjk-destination.dto';

@Controller('tjk-destinations')
export class TjkDestinationsController {
  constructor(private readonly service: TjkDestinationsService) {}

  @Post()
  create(@Body() dto: CreateTjkDestinationDto) {
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
    @Body() dto: UpdateTjkDestinationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
