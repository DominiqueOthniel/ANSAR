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
import { BankService } from './bank.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { CreateBankTransactionDto } from './dto/create-bank-transaction.dto';
import { UpdateBankTransactionDto } from './dto/update-bank-transaction.dto';

@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // --- Comptes ---
  @Post('accounts')
  createAccount(@Body() dto: CreateBankAccountDto, @Req() req: Request) {
    return this.bankService.createAccount(dto, getAuditActor(req));
  }

  @Get('accounts')
  findAllAccounts() {
    return this.bankService.findAllAccounts();
  }

  @Get('accounts/:compteId/transactions')
  findTransactionsByAccount(@Param('compteId', ParseUUIDPipe) compteId: string) {
    return this.bankService.findTransactionsByAccount(compteId);
  }

  @Get('accounts/:id')
  findOneAccount(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankService.findOneAccount(id);
  }

  @Patch('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
    @Req() req: Request,
  ) {
    return this.bankService.updateAccount(id, dto, getAuditActor(req));
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  async removeAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.bankService.removeAccount(id, getAuditActor(req));
  }

  // --- Transactions ---
  @Post('transactions')
  createTransaction(@Body() dto: CreateBankTransactionDto, @Req() req: Request) {
    return this.bankService.createTransaction(dto, getAuditActor(req));
  }

  @Get('transactions')
  findAllTransactions() {
    return this.bankService.findAllTransactions();
  }

  @Get('transactions/:id')
  findOneTransaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.bankService.findOneTransaction(id);
  }

  @Patch('transactions/:id')
  updateTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankTransactionDto,
    @Req() req: Request,
  ) {
    return this.bankService.updateTransaction(id, dto, getAuditActor(req));
  }

  @Delete('transactions/:id')
  @HttpCode(204)
  async removeTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.bankService.removeTransaction(id, getAuditActor(req));
  }
}
