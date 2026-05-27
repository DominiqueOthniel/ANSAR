import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Response } from 'express';

/** Ordre DELETE pour SQLite / sql.js (enfants → parents). */
const PURGE_DELETE_ORDER = [
  'audit_logs',
  'credit_remboursements',
  'credits',
  'caisse_transactions',
  'invoices',
  'expenses',
  'client_deliveries',
  'client_orders',
  'article_supplier_prices',
  'articles',
  'parcel_expeditions',
  'trips',
  'driver_transactions',
  'bank_transactions',
  'bank_accounts',
  'trucks',
  'drivers',
  'third_parties',
  'merchandise_qualities',
  'caisse_config',
] as const;

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): { name: string; version: string; api: string } {
    return {
      name: 'ANSAR API',
      version: '1.0.0',
      api: '/api',
    };
  }

  /** Routes métier récentes — présentes dans le binaire si `capabilities` les liste toutes. */
  private static readonly API_CAPABILITIES = [
    'articles',
    'merchandise-qualities',
    'client-orders',
    'client-deliveries',
    'supplier-loadings',
  ] as const;

  @Get('health')
  health(): { status: string; version: string; capabilities: string[] } {
    return {
      status: 'ok',
      version: '1.1.0',
      capabilities: [...AppController.API_CAPABILITIES],
    };
  }

  @Delete('admin/purge')
  async purge(): Promise<{ message: string }> {
    const dbType = this.dataSource.options.type;
    if (dbType === 'postgres') {
      await this.purgePostgres();
    } else if (dbType === 'sqljs' || dbType === 'sqlite' || dbType === 'better-sqlite3') {
      await this.purgeSqliteLike();
    } else {
      this.logger.warn(`Purge: type SGBD non géré explicitement (${String(dbType)}), tentative PostgreSQL.`);
      await this.purgePostgres();
    }
    return { message: 'Base de données purgée avec succès' };
  }

  /** TRUNCATE complet (toutes les tables métier + audit + caisse + crédits). */
  private async purgePostgres(): Promise<void> {
    try {
      await this.dataSource.query(`
        TRUNCATE TABLE
          audit_logs,
          credit_remboursements,
          credits,
          caisse_transactions,
          invoices,
          expenses,
          client_deliveries,
          client_orders,
          article_supplier_prices,
          articles,
          trips,
          parcel_expeditions,
          driver_transactions,
          bank_transactions,
          bank_accounts,
          trucks,
          drivers,
          third_parties,
          merchandise_qualities,
          caisse_config
        RESTART IDENTITY CASCADE
      `);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      this.logger.error(`Purge PostgreSQL : ${msg}`, e instanceof Error ? e.stack : undefined);
      throw new HttpException(`Purge PostgreSQL : ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** sql.js / SQLite : pas de TRUNCATE … CASCADE — DELETE dans l’ordre des dépendances. */
  private async purgeSqliteLike(): Promise<void> {
    try {
      await this.dataSource.query('PRAGMA foreign_keys = OFF');
      try {
        for (const table of PURGE_DELETE_ORDER) {
          try {
            await this.dataSource.query(`DELETE FROM "${table}"`);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!/no such table/i.test(msg)) {
              throw e;
            }
          }
        }
      } finally {
        await this.dataSource.query('PRAGMA foreign_keys = ON');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      this.logger.error(`Purge SQLite : ${msg}`, e instanceof Error ? e.stack : undefined);
      throw new HttpException(`Purge SQLite : ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('admin/backup')
  async backup(@Res() res: Response): Promise<void> {
    const [
      thirdParties,
      merchandiseQualities,
      articles,
      articleSupplierPrices,
      drivers,
      driverTransactions,
      trucks,
      trips,
      expenses,
      invoices,
      bankAccounts,
      bankTransactions,
      parcelExpeditions,
      clientOrders,
      clientDeliveries,
    ] = await Promise.all([
      this.dataSource.query('SELECT * FROM third_parties'),
      this.dataSource.query('SELECT * FROM merchandise_qualities ORDER BY libelle ASC'),
      this.dataSource.query('SELECT * FROM articles ORDER BY libelle ASC'),
      this.dataSource.query('SELECT * FROM article_supplier_prices'),
      this.dataSource.query('SELECT * FROM drivers'),
      this.dataSource.query('SELECT * FROM driver_transactions ORDER BY date ASC'),
      this.dataSource.query('SELECT * FROM trucks'),
      this.dataSource.query('SELECT * FROM trips'),
      this.dataSource.query('SELECT * FROM expenses ORDER BY date ASC'),
      this.dataSource.query('SELECT * FROM invoices'),
      this.dataSource.query('SELECT * FROM bank_accounts'),
      this.dataSource.query('SELECT * FROM bank_transactions ORDER BY date ASC'),
      this.dataSource.query('SELECT * FROM parcel_expeditions ORDER BY "dateDepart" DESC'),
      this.dataSource.query('SELECT * FROM client_orders ORDER BY "dateCommande" DESC'),
      this.dataSource.query('SELECT * FROM client_deliveries'),
    ]);

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        thirdParties,
        merchandiseQualities,
        articles,
        articleSupplierPrices,
        drivers,
        driverTransactions,
        trucks,
        trips,
        expenses,
        invoices,
        bankAccounts,
        bankTransactions,
        parcelExpeditions,
        clientOrders,
        clientDeliveries,
      },
    };

    const filename = `ansar-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  @Post('admin/restore')
  @HttpCode(200)
  async restore(@Body() body: any): Promise<{ message: string; counts: Record<string, number> }> {
    const { data } = body;
    if (!data) throw new Error('Corps invalide : propriété "data" manquante');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Vider les tables dans l'ordre des dépendances
      await queryRunner.query(`
        TRUNCATE TABLE
          audit_logs,
          credit_remboursements,
          credits,
          caisse_transactions,
          invoices,
          expenses,
          client_deliveries,
          client_orders,
          article_supplier_prices,
          articles,
          trips,
          parcel_expeditions,
          driver_transactions,
          bank_transactions,
          bank_accounts,
          trucks,
          drivers,
          third_parties,
          merchandise_qualities,
          caisse_config
        RESTART IDENTITY CASCADE
      `);

      // Réinsérer dans l'ordre (respecter les FK)
      const insert = async (table: string, rows: any[]) => {
        if (!rows?.length) return;
        for (const row of rows) {
          const cols = Object.keys(row).map(k => `"${k}"`).join(', ');
          const vals = Object.keys(row).map((_, i) => `$${i + 1}`).join(', ');
          await queryRunner.query(
            `INSERT INTO ${table} (${cols}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING`,
            Object.values(row),
          );
        }
      };

      await insert('third_parties', data.thirdParties);
      await insert('merchandise_qualities', data.merchandiseQualities ?? []);
      await insert('articles', data.articles ?? []);
      await insert('article_supplier_prices', data.articleSupplierPrices ?? []);
      await insert('client_orders', data.clientOrders ?? []);
      await insert('client_deliveries', data.clientDeliveries ?? []);
      await insert('drivers', data.drivers);
      await insert('driver_transactions', data.driverTransactions);
      await insert('trucks', data.trucks);
      await insert('trips', data.trips);
      await insert('parcel_expeditions', data.parcelExpeditions);
      await insert('expenses', data.expenses);
      await insert('invoices', data.invoices);
      await insert('bank_accounts', data.bankAccounts);
      await insert('bank_transactions', data.bankTransactions);

      await queryRunner.commitTransaction();

      return {
        message: 'Restauration réussie',
        counts: {
          thirdParties: data.thirdParties?.length ?? 0,
          merchandiseQualities: data.merchandiseQualities?.length ?? 0,
          articles: data.articles?.length ?? 0,
          articleSupplierPrices: data.articleSupplierPrices?.length ?? 0,
          clientOrders: data.clientOrders?.length ?? 0,
          clientDeliveries: data.clientDeliveries?.length ?? 0,
          drivers: data.drivers?.length ?? 0,
          trucks: data.trucks?.length ?? 0,
          trips: data.trips?.length ?? 0,
          expenses: data.expenses?.length ?? 0,
          invoices: data.invoices?.length ?? 0,
          bankAccounts: data.bankAccounts?.length ?? 0,
          bankTransactions: data.bankTransactions?.length ?? 0,
          parcelExpeditions: data.parcelExpeditions?.length ?? 0,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
