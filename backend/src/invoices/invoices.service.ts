import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Invoice, InvoicePaymentEncaissementPersisted } from '../entities/invoice.entity';
import { Trip } from '../entities/trip.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
  ) {}

  /** Somme des TTC déjà facturés sur ce trajet (hors une facture exclue, ex. PATCH). */
  private async sumMontantTTCForTripInvoices(
    trajetId: string,
    excludeInvoiceId?: string,
  ): Promise<number> {
    const rows = await this.invoiceRepository.find({ where: { trajetId } });
    return rows
      .filter((i) => (excludeInvoiceId ? i.id !== excludeInvoiceId : true))
      .reduce((s, i) => s + Number(i.montantTTC), 0);
  }

  private async assertTripInvoicesTTCWithinRecette(
    trajetId: string,
    proposedTTC: number,
    excludeInvoiceId?: string,
  ): Promise<void> {
    const trip = await this.tripRepository.findOne({ where: { id: trajetId } });
    if (!trip) throw new BadRequestException('Trajet introuvable pour cette facture');
    const sumOthers = await this.sumMontantTTCForTripInvoices(trajetId, excludeInvoiceId);
    const rec = Number(trip.recette);
    const total = sumOthers + proposedTTC;
    if (total > rec + 0.01) {
      const reste = Math.max(0, rec - sumOthers);
      throw new BadRequestException(
        `Le total des factures sur ce trajet (${total.toFixed(0)} FCFA) dépasse la recette du trajet (${rec.toFixed(0)} FCFA). Reste facturable : ${reste.toFixed(0)} FCFA.`,
      );
    }
  }

  /** Ventilation des encaissements : somme des lignes = montant payé (tolérance 0,02 FCFA). */
  private normalizePaiementsEncaissements(
    montantPaye: number,
    raw: unknown,
  ): InvoicePaymentEncaissementPersisted[] | null {
    if (raw === undefined || raw === null) return null;
    if (!Array.isArray(raw)) {
      throw new BadRequestException('Le champ paiementsEncaissements doit être un tableau.');
    }
    if (raw.length === 0) return null;
    const rows: InvoicePaymentEncaissementPersisted[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const m = Number(o.montant);
      if (!Number.isFinite(m) || m <= 0) {
        throw new BadRequestException('Chaque ligne de paiement doit avoir un montant positif.');
      }
      const tid =
        o.clientTierId != null && String(o.clientTierId).trim() !== ''
          ? String(o.clientTierId).trim()
          : undefined;
      const lib =
        o.payeurLibelle != null && String(o.payeurLibelle).trim() !== ''
          ? String(o.payeurLibelle).trim()
          : undefined;
      rows.push({ montant: m, clientTierId: tid, payeurLibelle: lib });
    }
    const sum = rows.reduce((s, r) => s + r.montant, 0);
    if (Math.abs(sum - montantPaye) > 0.02) {
      throw new BadRequestException(
        `Somme des encaissements ventilés (${sum.toFixed(0)} FCFA) ≠ montant payé (${montantPaye.toFixed(0)} FCFA).`,
      );
    }
    return rows;
  }

  async create(dto: CreateInvoiceDto): Promise<Invoice> {
    const ttc = Number(dto.montantTTC);
    const paye = dto.montantPaye != null ? Number(dto.montantPaye) : 0;
    if (paye < 0) throw new BadRequestException('Le montant payé ne peut pas être négatif');
    if (paye > ttc + 0.01) {
      throw new BadRequestException(
        `Le montant payé (${paye}) ne peut pas dépasser le montant TTC (${ttc}).`,
      );
    }
    if (dto.trajetId) {
      await this.assertTripInvoicesTTCWithinRecette(dto.trajetId, ttc);
    }
    const { paiementsEncaissements: rawSlices, ...rest } = dto;
    const slices =
      rawSlices !== undefined && rawSlices !== null
        ? this.normalizePaiementsEncaissements(paye, rawSlices)
        : null;
    const invoice = this.invoiceRepository.create({
      id: uuidv4(),
      ...rest,
      paiementsEncaissements: slices,
    });
    return this.invoiceRepository.save(invoice);
  }

  async findAll(): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      order: { dateCreation: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(`Facture ${id} introuvable`);
    return invoice;
  }

  async update(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const before = await this.findOne(id);
    const ttc =
      dto.montantTTC !== undefined ? Number(dto.montantTTC) : Number(before.montantTTC);
    if (dto.montantPaye !== undefined) {
      const paye = Number(dto.montantPaye);
      if (Number.isNaN(paye) || paye < 0) {
        throw new BadRequestException('Le montant payé est invalide');
      }
      if (paye > ttc + 0.01) {
        throw new BadRequestException(
          `Le montant payé (${paye}) ne peut pas dépasser le montant TTC (${ttc}).`,
        );
      }
    }
    const trajetId =
      dto.trajetId !== undefined ? dto.trajetId : before.trajetId;
    if (trajetId) {
      await this.assertTripInvoicesTTCWithinRecette(trajetId, ttc, id);
    }
    const payeFinal =
      dto.montantPaye !== undefined ? Number(dto.montantPaye) : Number(before.montantPaye ?? 0);
    const patch = { ...dto } as Partial<Invoice>;
    if (dto.paiementsEncaissements !== undefined) {
      patch.paiementsEncaissements = this.normalizePaiementsEncaissements(
        payeFinal,
        dto.paiementsEncaissements,
      );
    }
    await this.invoiceRepository.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.invoiceRepository.delete(id);
  }
}
