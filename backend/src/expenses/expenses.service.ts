import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Expense } from '../entities/expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';
import { CaisseService } from '../caisse/caisse.service';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly auditLogsService: AuditLogsService,
    private readonly caisseService: CaisseService,
  ) {}

  private normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private sanitizeDto<T extends Record<string, unknown>>(dto: T): T {
    return {
      ...dto,
      camionId: this.normalizeOptionalString(dto.camionId),
      tripId: this.normalizeOptionalString(dto.tripId),
      chauffeurId: this.normalizeOptionalString(dto.chauffeurId),
      fournisseurId: this.normalizeOptionalString(dto.fournisseurId),
      sousCategorie: this.normalizeOptionalString(dto.sousCategorie),
    } as T;
  }

  async create(dto: CreateExpenseDto, actor?: AuditActor): Promise<Expense> {
    const safeDto = this.sanitizeDto(dto as unknown as Record<string, unknown>);
    await this.caisseService.assertSortieAvailable(Number(safeDto.montant) || 0);
    const expense = this.expenseRepository.create({
      id: uuidv4(),
      ...safeDto,
    });
    const created = await this.expenseRepository.save(expense);
    await this.auditLogsService.log({
      module: 'expenses',
      action: 'CREATE',
      entityId: created.id,
      summary: `Création dépense ${created.categorie} (${Number(created.montant).toLocaleString('fr-FR')} FCFA)`,
      afterData: created as unknown as Record<string, unknown>,
      actor,
    });
    return created;
  }

  async findAll(): Promise<Expense[]> {
    return this.expenseRepository.find({
      relations: ['camion', 'fournisseur'],
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Expense> {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: ['camion', 'fournisseur'],
    });
    if (!expense) throw new NotFoundException(`Dépense ${id} introuvable`);
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, actor?: AuditActor): Promise<Expense> {
    const before = await this.findOne(id);
    const safeDto = this.sanitizeDto(dto as unknown as Record<string, unknown>);
    if (safeDto.montant !== undefined) {
      await this.caisseService.assertSortieAvailable(Number(safeDto.montant) || 0, `depense:${id}`);
    }
    await this.expenseRepository.update(id, safeDto as Partial<Expense>);
    const after = await this.findOne(id);
    await this.auditLogsService.log({
      module: 'expenses',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification dépense ${after.categorie}`,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOne(id);
    await this.expenseRepository.delete(id);
    await this.auditLogsService.log({
      module: 'expenses',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression dépense ${before.categorie}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }
}
