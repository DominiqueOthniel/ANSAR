import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { TrucksModule } from './trucks/trucks.module';
import { DriversModule } from './drivers/drivers.module';
import { TripsModule } from './trips/trips.module';
import { ExpensesModule } from './expenses/expenses.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ThirdPartiesModule } from './third-parties/third-parties.module';
import { BankModule } from './bank/bank.module';
import { CaisseModule } from './caisse/caisse.module';
import { CreditsModule } from './credits/credits.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ParcelExpeditionsModule } from './parcel-expeditions/parcel-expeditions.module';
import { MerchandiseQualitiesModule } from './merchandise-qualities/merchandise-qualities.module';
import { ArticlesModule } from './articles/articles.module';
import { ClientOperationsModule } from './client-operations/client-operations.module';
import { SupplierLoadingsModule } from './supplier-loadings/supplier-loadings.module';

function buildTypeOrmOptions(): TypeOrmModuleOptions {
  const synchronize =
    process.env.DB_SYNCHRONIZE === 'true' || process.env.NODE_ENV !== 'production';
  const logging = process.env.NODE_ENV === 'development';

  const useSqlite =
    process.env.USE_SQLITE === 'true' && !process.env.DATABASE_URL?.trim();

  if (useSqlite) {
    return {
      type: 'sqljs',
      autoSave: true,
      location: join(process.cwd(), 'dev.sqlite'),
      autoLoadEntities: true,
      synchronize,
      logging,
    };
  }

  return {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST || 'localhost',
    port: process.env.DATABASE_URL
      ? undefined
      : parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DATABASE_URL
      ? undefined
      : process.env.DB_USERNAME || 'postgres',
    password: process.env.DATABASE_URL
      ? undefined
      : process.env.DB_PASSWORD || 'postgres',
    database: process.env.DATABASE_URL
      ? undefined
      : process.env.DB_DATABASE || 'truck_track',
    ssl: process.env.DATABASE_URL
      ? { rejectUnauthorized: false }
      : false,
    extra: process.env.DATABASE_URL
      ? { connectionTimeoutMillis: 15000 }
      : undefined,
    autoLoadEntities: true,
    synchronize,
    logging,
  };
}

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    TrucksModule,
    DriversModule,
    TripsModule,
    ExpensesModule,
    InvoicesModule,
    ThirdPartiesModule,
    BankModule,
    CaisseModule,
    CreditsModule,
    AuditLogsModule,
    ParcelExpeditionsModule,
    MerchandiseQualitiesModule,
    ArticlesModule,
    ClientOperationsModule,
    SupplierLoadingsModule,
  ],
})
export class AppModule {}
