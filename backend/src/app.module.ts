import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
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

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Supabase fournit une DATABASE_URL complète — on la prioritise
      url: process.env.DATABASE_URL,
      // Fallback variables individuelles pour dev local
      host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST || 'localhost'),
      port: process.env.DATABASE_URL ? undefined : parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DATABASE_URL ? undefined : (process.env.DB_USERNAME || 'postgres'),
      password: process.env.DATABASE_URL ? undefined : (process.env.DB_PASSWORD || 'postgres'),
      database: process.env.DATABASE_URL ? undefined : (process.env.DB_DATABASE || 'truck_track'),
      // SSL requis pour Supabase en production
      ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false,
      // Timeout pour éviter que Render bloque indéfiniment si la DB est injoignable
      extra: process.env.DATABASE_URL
        ? { connectionTimeoutMillis: 15000 }
        : undefined,
      autoLoadEntities: true,
      // En production : false (sécurité), on laisse synchronize actif au 1er déploiement via env
      synchronize: process.env.DB_SYNCHRONIZE === 'true' || process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
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
  ],
})
export class AppModule {}
