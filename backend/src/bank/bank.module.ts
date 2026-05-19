import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { BankController } from './bank.controller';
import { BankService } from './bank.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount, BankTransaction]),
    AuditLogsModule,
  ],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
