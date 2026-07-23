import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Logger, Post, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { Response } from 'express';

/** Ordre DELETE pour SQLite / sql.js (enfants → parents). */
const PURGE_DELETE_ORDER = [
  'audit_logs',
  'credit_remboursements',
  'credits',
  'caisse_transactions',
  'supplier_loading_assignments',
  'supplier_loadings',
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

/** Tables métier à vider (PostgreSQL TRUNCATE … CASCADE). */
const PURGE_TABLES_SQL = `
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
`;

const INSERT_BATCH_SIZE = 80;

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
      name: 'SIA-ANSAR API',
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
          ${PURGE_TABLES_SQL}
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

  private async safeQuery(sql: string): Promise<any[]> {
    try {
      return await this.dataSource.query(sql);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/does not exist|no such table/i.test(msg)) return [];
      throw e;
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
      supplierLoadings,
      supplierLoadingAssignments,
      caisseConfig,
      caisseTransactions,
      credits,
      creditRemboursements,
    ] = await Promise.all([
      this.safeQuery('SELECT * FROM third_parties'),
      this.safeQuery('SELECT * FROM merchandise_qualities ORDER BY libelle ASC'),
      this.safeQuery('SELECT * FROM articles ORDER BY libelle ASC'),
      this.safeQuery('SELECT * FROM article_supplier_prices'),
      this.safeQuery('SELECT * FROM drivers'),
      this.safeQuery('SELECT * FROM driver_transactions ORDER BY date ASC'),
      this.safeQuery('SELECT * FROM trucks'),
      this.safeQuery('SELECT * FROM trips'),
      this.safeQuery('SELECT * FROM expenses ORDER BY date ASC'),
      this.safeQuery('SELECT * FROM invoices'),
      this.safeQuery('SELECT * FROM bank_accounts'),
      this.safeQuery('SELECT * FROM bank_transactions ORDER BY date ASC'),
      this.safeQuery('SELECT * FROM parcel_expeditions ORDER BY "dateDepart" DESC'),
      this.safeQuery('SELECT * FROM client_orders ORDER BY "dateCommande" DESC'),
      this.safeQuery('SELECT * FROM client_deliveries'),
      this.safeQuery('SELECT * FROM supplier_loadings ORDER BY "dateChargement" DESC'),
      this.safeQuery('SELECT * FROM supplier_loading_assignments'),
      this.safeQuery('SELECT * FROM caisse_config'),
      this.safeQuery('SELECT * FROM caisse_transactions ORDER BY date ASC'),
      this.safeQuery('SELECT * FROM credits'),
      this.safeQuery('SELECT * FROM credit_remboursements ORDER BY date ASC'),
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
        supplierLoadings,
        supplierLoadingAssignments,
        caisseConfig,
        caisseTransactions,
        credits,
        creditRemboursements,
      },
    };

    const filename = `sia-ansar-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  /** Normalise une valeur JSON pour INSERT PostgreSQL / SQLite. */
  private normalizeSqlValue(value: unknown): unknown {
    if (value === undefined) return null;
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      return JSON.stringify(value);
    }
    return value;
  }

  /**
   * Insert par lots (évite le timeout Netlify 504 sur des centaines d’INSERT unitaires).
   */
  private async insertBatched(
    queryRunner: QueryRunner,
    table: string,
    rows: Record<string, unknown>[] | null | undefined,
  ): Promise<number> {
    if (!rows?.length) return 0;

    const keySet = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) keySet.add(k);
    }
    const keys = [...keySet];
    if (!keys.length) return 0;

    const cols = keys.map((k) => `"${k}"`).join(', ');
    let inserted = 0;

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
      const params: unknown[] = [];
      const valueGroups = chunk.map((row) => {
        const placeholders = keys.map((k) => {
          params.push(this.normalizeSqlValue(row[k]));
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      await queryRunner.query(
        `INSERT INTO ${table} (${cols}) VALUES ${valueGroups.join(', ')} ON CONFLICT (id) DO NOTHING`,
        params,
      );
      inserted += chunk.length;
    }

    return inserted;
  }

  @Post('admin/restore')
  @HttpCode(200)
  async restore(@Body() body: any): Promise<{ message: string; counts: Record<string, number> }> {
    const data = body?.data ?? body;
    if (!data || typeof data !== 'object') {
      throw new HttpException('Corps invalide : propriété "data" manquante', HttpStatus.BAD_REQUEST);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`
        TRUNCATE TABLE
          ${PURGE_TABLES_SQL}
        RESTART IDENTITY CASCADE
      `);

      const thirdPartyIds = new Set(
        (data.thirdParties ?? [])
          .map((r: { id?: string }) => r?.id)
          .filter((id: string | undefined): id is string => Boolean(id)),
      );

      const credits = (data.credits ?? []).map((row: Record<string, unknown>) => {
        const clientTierId = row.clientTierId;
        if (typeof clientTierId === 'string' && clientTierId && !thirdPartyIds.has(clientTierId)) {
          return { ...row, clientTierId: null };
        }
        return row;
      });

      // Ordre FK : parents → enfants (commandes avant livraisons/factures ; chauffeurs/camions avant livraisons)
      await this.insertBatched(queryRunner, 'third_parties', data.thirdParties);
      await this.insertBatched(queryRunner, 'merchandise_qualities', data.merchandiseQualities);
      await this.insertBatched(queryRunner, 'articles', data.articles);
      await this.insertBatched(queryRunner, 'article_supplier_prices', data.articleSupplierPrices);
      await this.insertBatched(queryRunner, 'drivers', data.drivers);
      await this.insertBatched(queryRunner, 'driver_transactions', data.driverTransactions);
      await this.insertBatched(queryRunner, 'trucks', data.trucks);
      await this.insertBatched(queryRunner, 'trips', data.trips);
      await this.insertBatched(queryRunner, 'parcel_expeditions', data.parcelExpeditions);
      await this.insertBatched(queryRunner, 'bank_accounts', data.bankAccounts);
      await this.insertBatched(queryRunner, 'bank_transactions', data.bankTransactions);
      await this.insertBatched(queryRunner, 'client_orders', data.clientOrders);
      await this.insertBatched(queryRunner, 'client_deliveries', data.clientDeliveries);
      await this.insertBatched(queryRunner, 'expenses', data.expenses);
      await this.insertBatched(queryRunner, 'invoices', data.invoices);
      await this.insertBatched(queryRunner, 'supplier_loadings', data.supplierLoadings);
      await this.insertBatched(queryRunner, 'supplier_loading_assignments', data.supplierLoadingAssignments);
      await this.insertBatched(queryRunner, 'caisse_config', data.caisseConfig);
      await this.insertBatched(queryRunner, 'caisse_transactions', data.caisseTransactions);
      await this.insertBatched(queryRunner, 'credits', credits);
      await this.insertBatched(queryRunner, 'credit_remboursements', data.creditRemboursements);

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
          supplierLoadings: data.supplierLoadings?.length ?? 0,
          supplierLoadingAssignments: data.supplierLoadingAssignments?.length ?? 0,
          caisseConfig: data.caisseConfig?.length ?? 0,
          caisseTransactions: data.caisseTransactions?.length ?? 0,
          credits: credits.length,
          creditRemboursements: data.creditRemboursements?.length ?? 0,
        },
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      this.logger.error(`Restauration échouée : ${msg}`, err instanceof Error ? err.stack : undefined);
      throw new HttpException(`Restauration échouée : ${msg}`, HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }
}
