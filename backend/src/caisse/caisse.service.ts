import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CaisseConfig } from '../entities/caisse-config.entity';
import { CaisseTransactionEntity } from '../entities/caisse-transaction.entity';
import { CreateCaisseTransactionDto } from './dto/create-caisse-transaction.dto';
import { UpdateCaisseTransactionDto } from './dto/update-caisse-transaction.dto';
import { UpdateCaisseConfigDto } from './dto/update-caisse-config.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class CaisseService {
  constructor(
    @InjectRepository(CaisseConfig)
    private readonly configRepo: Repository<CaisseConfig>,
    @InjectRepository(CaisseTransactionEntity)
    private readonly txRepo: Repository<CaisseTransactionEntity>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private async getOrCreateConfig(): Promise<CaisseConfig> {
    let row = await this.configRepo.findOne({ where: { id: 1 } });
    if (!row) {
      row = this.configRepo.create({ id: 1, soldeInitial: '0' });
      await this.configRepo.save(row);
    }
    return row;
  }

  async getConfig(): Promise<{ id: number; soldeInitial: number }> {
    const c = await this.getOrCreateConfig();
    return { id: c.id, soldeInitial: Number(c.soldeInitial) };
  }

  async updateConfig(dto: UpdateCaisseConfigDto): Promise<{ id: number; soldeInitial: number }> {
    await this.getOrCreateConfig();
    await this.configRepo.update(1, {
      soldeInitial: String(dto.soldeInitial),
      updatedAt: new Date(),
    });
    const c = await this.getOrCreateConfig();
    return { id: c.id, soldeInitial: Number(c.soldeInitial) };
  }

  async findAllTransactions(): Promise<CaisseTransactionEntity[]> {
    return this.txRepo.find({ order: { date: 'DESC', createdAt: 'DESC' } });
  }

  async getBalance(): Promise<{ soldeInitial: number; soldeActuel: number }> {
    const config = await this.getOrCreateConfig();
    const txs = await this.txRepo.find();
    let solde = Number(config.soldeInitial);
    for (const t of txs) {
      const m = Number(t.montant);
      solde += t.type === 'entree' ? m : -m;
    }
    return { soldeInitial: Number(config.soldeInitial), soldeActuel: solde };
  }

  private async computeBalanceExcluding(excludeId?: string): Promise<number> {
    const config = await this.getOrCreateConfig();
    const txs = await this.txRepo.find();
    let solde = Number(config.soldeInitial);
    for (const t of txs) {
      if (excludeId && t.id === excludeId) continue;
      const m = Number(t.montant);
      solde += t.type === 'entree' ? m : -m;
    }
    return solde;
  }

  private assertSortieAllowed(disponible: number, montant: number): void {
    if (montant > disponible) {
      throw new BadRequestException(
        `Solde caisse insuffisant. Solde disponible : ${Math.max(0, disponible).toLocaleString('fr-FR')} FCFA, sortie demandée : ${montant.toLocaleString('fr-FR')} FCFA.`,
      );
    }
  }

  async create(dto: CreateCaisseTransactionDto, actor?: AuditActor): Promise<CaisseTransactionEntity> {
    if (dto.type === 'sortie') {
      const disponible = await this.computeBalanceExcluding();
      this.assertSortieAllowed(disponible, dto.montant);
    }
    const id = dto.id?.trim() || uuidv4();
    const utilisateur = dto.utilisateur?.trim() || actor?.login || 'Système';
    const row = this.txRepo.create({
      id,
      type: dto.type,
      montant: String(dto.montant),
      date: dto.date.split('T')[0],
      description: dto.description,
      utilisateur,
      categorie: dto.categorie,
      reference: dto.reference,
      compteBanqueId: dto.compteBanqueId,
      bankTransactionId: dto.bankTransactionId,
      exclutRevenu: dto.exclutRevenu ?? false,
      createdAt: new Date(),
    });
    const created = await this.txRepo.save(row);
    await this.auditLogsService.log({
      module: 'caisse',
      action: 'CREATE',
      entityId: created.id,
      summary: `Création mouvement caisse ${created.type} (${Number(created.montant).toLocaleString('fr-FR')} FCFA)`,
      afterData: created as unknown as Record<string, unknown>,
      actor,
    });
    return created;
  }

  async update(id: string, dto: UpdateCaisseTransactionDto, actor?: AuditActor): Promise<CaisseTransactionEntity> {
    const existing = await this.txRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Mouvement caisse ${id} introuvable`);

    const newType = dto.type ?? existing.type;
    const newMontant = dto.montant !== undefined ? dto.montant : Number(existing.montant);
    if (newType === 'sortie') {
      const disponible = await this.computeBalanceExcluding(id);
      this.assertSortieAllowed(disponible, newMontant);
    }

    const patch: Partial<CaisseTransactionEntity> = {};
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.montant !== undefined) patch.montant = String(dto.montant);
    if (dto.date !== undefined) patch.date = dto.date.split('T')[0];
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.utilisateur !== undefined) patch.utilisateur = dto.utilisateur?.trim() || actor?.login || 'Système';
    if (dto.categorie !== undefined) patch.categorie = dto.categorie;
    if (dto.reference !== undefined) patch.reference = dto.reference;
    if (dto.compteBanqueId !== undefined) patch.compteBanqueId = dto.compteBanqueId;
    if (dto.bankTransactionId !== undefined) patch.bankTransactionId = dto.bankTransactionId;
    if (dto.exclutRevenu !== undefined) patch.exclutRevenu = dto.exclutRevenu;
    await this.txRepo.update(id, patch);
    const u = await this.txRepo.findOne({ where: { id } });
    if (!u) throw new NotFoundException(`Mouvement caisse ${id} introuvable`);
    await this.auditLogsService.log({
      module: 'caisse',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification mouvement caisse ${u.type}`,
      beforeData: existing as unknown as Record<string, unknown>,
      afterData: u as unknown as Record<string, unknown>,
      actor,
    });
    return u;
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.txRepo.findOne({ where: { id } });
    const r = await this.txRepo.delete(id);
    if (!r.affected) throw new NotFoundException(`Mouvement caisse ${id} introuvable`);
    await this.auditLogsService.log({
      module: 'caisse',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression mouvement caisse`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }

  /** Remplace la ligne si même reference (ex. depense:<uuid>). */
  async upsertByReference(
    reference: string,
    dto: CreateCaisseTransactionDto,
    actor?: AuditActor,
  ): Promise<CaisseTransactionEntity> {
    const existing = await this.txRepo.findOne({ where: { reference } });
    if (existing) {
      await this.update(existing.id, {
        type: dto.type,
        montant: dto.montant,
        date: dto.date,
        description: dto.description,
        utilisateur: dto.utilisateur,
        categorie: dto.categorie,
        reference: dto.reference,
        compteBanqueId: dto.compteBanqueId,
        bankTransactionId: dto.bankTransactionId,
        exclutRevenu: dto.exclutRevenu,
      }, actor);
      const u = await this.txRepo.findOne({ where: { id: existing.id } });
      return u!;
    }
    return this.create({ ...dto, reference }, actor);
  }

  async removeByReference(reference: string): Promise<void> {
    await this.txRepo.delete({ reference });
  }
}
