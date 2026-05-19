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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { getAuditActor } from '../audit-logs/audit-request.util';
import { ThirdPartiesService } from './third-parties.service';
import { CreateThirdPartyDto } from './dto/create-third-party.dto';
import { UpdateThirdPartyDto } from './dto/update-third-party.dto';

@Controller('third-parties')
export class ThirdPartiesController {
  constructor(private readonly thirdPartiesService: ThirdPartiesService) {}

  @Post()
  create(@Body() createThirdPartyDto: CreateThirdPartyDto, @Req() req: Request) {
    return this.thirdPartiesService.create(createThirdPartyDto, getAuditActor(req));
  }

  @Get()
  findAll() {
    return this.thirdPartiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.thirdPartiesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateThirdPartyDto: UpdateThirdPartyDto,
    @Req() req: Request,
  ) {
    return this.thirdPartiesService.update(id, updateThirdPartyDto, getAuditActor(req));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.thirdPartiesService.remove(id, getAuditActor(req));
  }
}
