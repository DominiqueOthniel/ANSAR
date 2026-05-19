import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { getAuditActor } from '../audit-logs/audit-request.util';
import { SupplierLoadingsService } from './supplier-loadings.service';
import { CreateSupplierLoadingDto } from './dto/create-supplier-loading.dto';
import { UpdateSupplierLoadingDto } from './dto/update-supplier-loading.dto';
import { SetLoadingAssignmentsDto } from './dto/set-loading-assignments.dto';
import { SupplierLoadingStatus } from '../entities/supplier-loading.entity';

@Controller('supplier-loadings')
export class SupplierLoadingsController {
  constructor(private readonly service: SupplierLoadingsService) {}

  @Post()
  create(@Body() dto: CreateSupplierLoadingDto, @Req() req: Request) {
    return this.service.create(dto, getAuditActor(req));
  }

  @Get()
  findAll(
    @Query('fournisseurId') fournisseurId?: string,
    @Query('statut') statut?: SupplierLoadingStatus,
    @Query('unassignedOnly') unassignedOnly?: string,
  ) {
    return this.service.findAll({
      fournisseurId,
      statut,
      unassignedOnly: unassignedOnly === 'true' || unassignedOnly === '1',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierLoadingDto, @Req() req: Request) {
    return this.service.update(id, dto, getAuditActor(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.service.remove(id, getAuditActor(req));
  }

  @Put(':id/assignments')
  setAssignments(
    @Param('id') id: string,
    @Body() dto: SetLoadingAssignmentsDto,
    @Req() req: Request,
  ) {
    return this.service.setAssignments(id, dto, getAuditActor(req));
  }
}
