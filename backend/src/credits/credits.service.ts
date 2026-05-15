/**
 * Crédits : domaine isolé (tables credits / credit_remboursements uniquement).
 * Aucun lien avec caisse, banque ou factures — ne pas y déclencher d’écritures trésorerie.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Credit } from '../entities/credit.entity';
import { CreditRemboursement } from '../entities/credit-remboursement.entity';
import { CreateCreditDto } from './dto/create-credit.dto';
import { UpdateCreditDto } from './dto/update-credit.dto';
import { CreateRemboursementDto } from './dto/create-remboursement.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(Credit)
    private readonly creditRepo: Repository<Credit>,
    @InjectRepository(CreditRemboursement)
    private readonly rembRepo: Repository<CreditRemboursement>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(): Promise<Credit[]> {
    return this.creditRepo.find({
      relations: ['remboursements'],
      order: { dateDebut: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Credit> {
    const c = await this.creditRepo.findOne({
      where: { id },
      relations: ['remboursements'],
    });
    if (!c) throw new NotFoundException(`Crédit ${id} introuvable`);
    return c;
  }

  async create(dto: CreateCreditDto, actor?: AuditActor): Promise<Credit> {
    const c = this.creditRepo.create({
      id: uuidv4(),
      type: dto.type,
      intitule: dto.intitule,
      preteur: dto.preteur,
      montantTotal: String(dto.montantTotal),
      montantRembourse: '0',
      tauxInteret: dto.tauxInteret != null ? String(dto.tauxInteret) : undefined,
      dateDebut: dto.dateDebut.split('T')[0],
      dateEcheance: dto.dateEcheance?.split('T')[0],
      statut: 'en_cours',
      notes: dto.notes,
      clientTierId:
        dto.type === 'pret_accorde' && dto.clientTierId ? dto.clientTierId : undefined,
      remboursements: [],
    });
    const created = await this.creditRepo.save(c);
    await this.auditLogsService.log({
      module: 'credits',
      action: 'CREATE',
      entityId: created.id,
      summary: `Création crédit ${created.intitule}`,
      afterData: created as unknown as Record<string, unknown>,
      actor,
    });
    return created;
  }

  async update(id: string, dto: UpdateCreditDto, actor?: AuditActor): Promise<Credit> {
    const before = await this.findOne(id);
    const patch: Partial<Credit> = {};
    if (dto.type !== undefined) patch.type = dto.type;
    if (dto.intitule !== undefined) patch.intitule = dto.intitule;
    if (dto.preteur !== undefined) patch.preteur = dto.preteur;
    if (dto.montantTotal !== undefined) patch.montantTotal = String(dto.montantTotal);
    if (dto.montantRembourse !== undefined)
      patch.montantRembourse = String(dto.montantRembourse);
    if (dto.tauxInteret !== undefined)
      patch.tauxInteret = dto.tauxInteret != null ? String(dto.tauxInteret) : undefined;
    if (dto.dateDebut !== undefined) patch.dateDebut = dto.dateDebut.split('T')[0];
    if (dto.dateEcheance !== undefined)
      patch.dateEcheance = dto.dateEcheance?.split('T')[0];
    if (dto.statut !== undefined) patch.statut = dto.statut;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.clientTierId !== undefined) {
      patch.clientTierId =
        dto.clientTierId === null || dto.clientTierId === ''
          ? undefined
          : dto.clientTierId;
    }
    const effectiveType = patch.type ?? before.type;
    if (effectiveType === 'emprunt') {
      patch.clientTierId = undefined;
    }
    await this.creditRepo.update(id, patch);
    const after = await this.findOne(id);
    await this.auditLogsService.log({
      module: 'credits',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification crédit ${after.intitule}`,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOne(id);
    const r = await this.creditRepo.delete(id);
    if (!r.affected) throw new NotFoundException(`Crédit ${id} introuvable`);
    await this.auditLogsService.log({
      module: 'credits',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression crédit ${before.intitule}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }

  async addRemboursement(
    creditId: string,
    dto: CreateRemboursementDto,
    actor?: AuditActor,
  ): Promise<Credit> {
    const credit = await this.findOne(creditId);
    const total = Number(credit.montantTotal);
    const taux = credit.tauxInteret != null ? Number(credit.tauxInteret) : 0;
    const montantCible = total + (total * taux) / 100;
    const deja = Number(credit.montantRembourse);
    const reste = Math.max(0, montantCible - deja);
    if (dto.montant > reste + 0.01) {
      throw new BadRequestException(
        `Montant refusé : le reste dû est de ${reste.toLocaleString('fr-FR')} FCFA (total dû ${montantCible.toLocaleString('fr-FR')} − déjà remboursé ${deja.toLocaleString('fr-FR')}).`,
      );
    }
    const remb = this.rembRepo.create({
      id: uuidv4(),
      creditId,
      date: dto.date.split('T')[0],
      montant: String(dto.montant),
      note: dto.note,
    });
    await this.rembRepo.save(remb);
    const totalRemb =
      Number(credit.montantRembourse) + dto.montant;
    let statut = credit.statut;
    if (totalRemb >= montantCible - 0.01) statut = 'solde';
    else if (credit.statut === 'solde' && totalRemb < montantCible - 0.01) statut = 'en_cours';
    await this.creditRepo.update(creditId, {
      montantRembourse: String(totalRemb),
      statut,
    });
    const after = await this.findOne(creditId);
    await this.auditLogsService.log({
      module: 'credits',
      action: 'REMBOURSEMENT',
      entityId: creditId,
      summary: `Remboursement crédit ${after.intitule} (+${dto.montant.toLocaleString('fr-FR')} FCFA)`,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }
}
