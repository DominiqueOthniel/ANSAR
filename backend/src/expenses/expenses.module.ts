import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../entities/expense.entity';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CaisseModule } from '../caisse/caisse.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense]), AuditLogsModule, CaisseModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
