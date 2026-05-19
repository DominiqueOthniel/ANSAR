import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { BankAccount } from '../entities/bank-account.entity';
import { BankTransaction } from '../entities/bank-transaction.entity';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';
import { CreateBankTransactionDto } from './dto/create-bank-transaction.dto';
import { UpdateBankTransactionDto } from './dto/update-bank-transaction.dto';
import {
  isBankDebitType,
  transactionDeltaOnBalance,
} from './bank-rules';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class BankService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly accountRepository: Repository<BankAccount>,
    @InjectRepository(BankTransaction)
    private readonly transactionRepository: Repository<BankTransaction>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /** Solde = soldeInitial + somme des effets de chaque transaction (aligné front). */
  private async computeBalanceFromDb(accountId: string): Promise<number> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId },
    });
    if (!account) return 0;
    const txs = await this.transactionRepository.find({
      where: { compteId: accountId },
    });
    let balance = Number(account.soldeInitial);
    for (const t of txs) {
      balance += transactionDeltaOnBalance(t.type, Number(t.montant));
    }
    return balance;
  }

  async recalculateSoldeForAccount(accountId: string): Promise<void> {
    const balance = await this.computeBalanceFromDb(accountId);
    await this.accountRepository.update(accountId, {
      soldeActuel: balance,
    } as Partial<BankAccount>);
  }

  // --- Comptes ---
  async createAccount(dto: CreateBankAccountDto, actor?: AuditActor): Promise<BankAccount> {
    const account = this.accountRepository.create({
      id: uuidv4(),
      ...dto,
      soldeActuel: dto.soldeInitial,
      devise: dto.devise || 'FCFA',
    });
    const saved = await this.accountRepository.save(account);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Ouverture compte bancaire ${saved.nom}`,
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
    return saved;
  }

  async findAllAccounts(): Promise<BankAccount[]> {
    return this.accountRepository.find({
      relations: ['transactions'],
      order: { nom: 'ASC' },
    });
  }

  async findOneAccount(id: string): Promise<BankAccount> {
    const account = await this.accountRepository.findOne({
      where: { id },
      relations: ['transactions'],
    });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    return account;
  }

  async updateAccount(
    id: string,
    dto: UpdateBankAccountDto,
    actor?: AuditActor,
  ): Promise<BankAccount> {
    const before = await this.findOneAccount(id);
    await this.accountRepository.update(id, dto as Partial<BankAccount>);
    await this.recalculateSoldeForAccount(id);
    const after = await this.findOneAccount(id);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification compte bancaire ${after.nom}`,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  async removeAccount(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOneAccount(id);
    await this.accountRepository.delete(id);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression compte bancaire ${before.nom}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }

  // --- Transactions ---
  async createTransaction(
    dto: CreateBankTransactionDto,
    actor?: AuditActor,
  ): Promise<BankTransaction> {
    const montant = Number(dto.montant);
    if (!Number.isFinite(montant) || montant <= 0) {
      throw new BadRequestException('Le montant doit être un nombre positif.');
    }

    await this.findOneAccount(dto.compteId);

    const balanceBefore = await this.computeBalanceFromDb(dto.compteId);
    const balanceAfter =
      balanceBefore + transactionDeltaOnBalance(dto.type, montant);
    if (isBankDebitType(dto.type) && balanceAfter < 0) {
      throw new BadRequestException(
        `Solde insuffisant sur ce compte. Disponible : ${balanceBefore.toLocaleString('fr-FR')} FCFA`,
      );
    }

    const transaction = this.transactionRepository.create({
      id: uuidv4(),
      ...dto,
      montant,
    });
    const saved = await this.transactionRepository.save(transaction);
    await this.recalculateSoldeForAccount(dto.compteId);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Mouvement banque ${saved.type} ${montant.toLocaleString('fr-FR')} FCFA — ${saved.description ?? ''}`.trim(),
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
    return saved;
  }

  async findAllTransactions(): Promise<BankTransaction[]> {
    return this.transactionRepository.find({
      relations: ['compte'],
      order: { date: 'DESC' },
    });
  }

  async findTransactionsByAccount(compteId: string): Promise<BankTransaction[]> {
    return this.transactionRepository.find({
      where: { compteId },
      relations: ['compte'],
      order: { date: 'DESC' },
    });
  }

  async findOneTransaction(id: string): Promise<BankTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['compte'],
    });
    if (!transaction)
      throw new NotFoundException(`Transaction ${id} introuvable`);
    return transaction;
  }

  async updateTransaction(
    id: string,
    dto: UpdateBankTransactionDto,
    actor?: AuditActor,
  ): Promise<BankTransaction> {
    const prev = await this.findOneTransaction(id);

    const nextMontant =
      dto.montant !== undefined ? Number(dto.montant) : Number(prev.montant);
    const nextCompte = dto.compteId ?? prev.compteId;
    const nextType = dto.type ?? prev.type;

    if (!Number.isFinite(nextMontant) || nextMontant <= 0) {
      throw new BadRequestException('Le montant doit être un nombre positif.');
    }

    await this.transactionRepository.update(id, dto as Partial<BankTransaction>);

    const affected = new Set<string>([prev.compteId, nextCompte]);
    for (const accId of affected) {
      await this.recalculateSoldeForAccount(accId);
    }

    for (const accId of affected) {
      const acc = await this.accountRepository.findOne({ where: { id: accId } });
      if (acc && Number(acc.soldeActuel) < 0) {
        await this.transactionRepository.update(id, {
          compteId: prev.compteId,
          type: prev.type,
          montant: prev.montant,
          date: prev.date,
          description: prev.description,
          reference: prev.reference,
          beneficiaire: prev.beneficiaire,
          categorie: prev.categorie,
        } as Partial<BankTransaction>);
        for (const a of affected) {
          await this.recalculateSoldeForAccount(a);
        }
        throw new BadRequestException(
          'Solde insuffisant : modification annulée.',
        );
      }
    }

    const updated = await this.findOneTransaction(id);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification mouvement banque ${updated.type} ${Number(updated.montant).toLocaleString('fr-FR')} FCFA`,
      beforeData: prev as unknown as Record<string, unknown>,
      afterData: updated as unknown as Record<string, unknown>,
      actor,
    });
    return updated;
  }

  async removeTransaction(id: string, actor?: AuditActor): Promise<void> {
    const tx = await this.findOneTransaction(id);
    const compteId = tx.compteId;
    await this.transactionRepository.delete(id);
    await this.recalculateSoldeForAccount(compteId);
    await this.auditLogsService.log({
      module: 'bank',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression mouvement banque ${tx.type} ${Number(tx.montant).toLocaleString('fr-FR')} FCFA`,
      beforeData: tx as unknown as Record<string, unknown>,
      actor,
    });
  }
}
