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
  Query,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { getAuditActor } from '../audit-logs/audit-request.util';
import { ClientOperationsService } from './client-operations.service';
import { CreateClientOrderDto } from './dto/create-client-order.dto';
import { UpdateClientOrderDto } from './dto/update-client-order.dto';
import { CreateClientDeliveryDto } from './dto/create-client-delivery.dto';
import { UpdateClientDeliveryDto } from './dto/update-client-delivery.dto';
import {
  QueryClientDeliveriesDto,
  QueryClientOrdersDto,
} from './dto/query-client-operations.dto';

@Controller()
export class ClientOperationsController {
  constructor(private readonly service: ClientOperationsService) {}

  @Post('client-orders')
  createOrder(@Body() dto: CreateClientOrderDto, @Req() req: Request) {
    return this.service.createOrder(dto, getAuditActor(req));
  }

  @Get('client-orders')
  findOrders(@Query() query: QueryClientOrdersDto) {
    return this.service.findOrders(query);
  }

  @Get('client-orders/:id')
  findOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOrder(id);
  }

  @Patch('client-orders/:id')
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientOrderDto,
    @Req() req: Request,
  ) {
    return this.service.updateOrder(id, dto, getAuditActor(req));
  }

  @Delete('client-orders/:id')
  @HttpCode(204)
  async removeOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.service.removeOrder(id, getAuditActor(req));
  }

  @Post('client-deliveries')
  createDelivery(@Body() dto: CreateClientDeliveryDto, @Req() req: Request) {
    return this.service.createDelivery(dto, getAuditActor(req));
  }

  @Get('client-deliveries')
  findDeliveries(@Query() query: QueryClientDeliveriesDto) {
    return this.service.findDeliveries(query);
  }

  @Get('client-deliveries/:id')
  findDelivery(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findDelivery(id);
  }

  @Patch('client-deliveries/:id')
  updateDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDeliveryDto,
    @Req() req: Request,
  ) {
    return this.service.updateDelivery(id, dto, getAuditActor(req));
  }

  @Delete('client-deliveries/:id')
  @HttpCode(204)
  async removeDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.service.removeDelivery(id, getAuditActor(req));
  }
}
