import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Invoice } from '../entities/invoice.entity';
import { Trip, TripStopPersisted, TripClientParticipantPersisted } from '../entities/trip.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripStopDto } from './dto/trip-stop.dto';
import { TripClientParticipantDto } from './dto/trip-client-participant.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private normalizeStopsInput(
    stops?: TripStopDto[],
  ): TripStopPersisted[] | undefined {
    if (!stops?.length) return undefined;
    const cleaned: TripStopPersisted[] = [];
    let i = 0;
    for (const s of stops) {
      const lieu = (s.lieu ?? '').trim();
      if (!lieu) continue;
      const id =
        s.id && /^[0-9a-f-]{36}$/i.test(String(s.id))
          ? String(s.id)
          : uuidv4();
      cleaned.push({
        id,
        ordre: typeof s.ordre === 'number' ? s.ordre : i,
        type: s.type,
        lieu,
        clientRef: s.clientRef?.trim() || undefined,
        lat: s.lat,
        lng: s.lng,
        statut: s.statut ?? 'prevu',
        notes: s.notes?.trim() || undefined,
      });
      i += 1;
    }
    if (cleaned.length === 0) return undefined;
    return cleaned.map((row, idx) => ({ ...row, ordre: idx }));
  }

  private normalizeClientParticipants(
    input: TripClientParticipantDto[] | undefined,
    payeurParticipantId: string | undefined | null,
    recette: number,
  ): { list: TripClientParticipantPersisted[] | null; payeurId: string | null } {
    if (!input?.length) {
      return { list: null, payeurId: null };
    }
    const out: TripClientParticipantPersisted[] = [];
    for (const row of input) {
      const lib = (row.libelle ?? '').trim();
      if (!lib) continue;
      const id =
        row.id && /^[0-9a-f-]{36}$/i.test(String(row.id)) ? String(row.id) : uuidv4();
      const mont =
        row.montantAttribue !== undefined && row.montantAttribue !== null
          ? Number(row.montantAttribue)
          : undefined;
      out.push({
        id,
        tierId: row.tierId?.trim() || undefined,
        libelle: lib,
        montantAttribue:
          mont !== undefined && !Number.isNaN(mont) && mont >= 0 ? mont : undefined,
      });
    }
    if (out.length === 0) {
      return { list: null, payeurId: null };
    }
    let payeurId: string | null = payeurParticipantId?.trim() || null;
    if (payeurId && !out.some((p) => p.id === payeurId)) {
      throw new BadRequestException(
        'Le client « payeur au règlement » doit être l’un des clients listés sur le trajet.',
      );
    }
    if (!payeurId && out.length === 1) {
      payeurId = out[0].id;
    }
    const avecMontant = out.filter(
      (p) => p.montantAttribue !== undefined && p.montantAttribue !== null,
    );
    if (avecMontant.length === out.length && avecMontant.length > 0) {
      const sum = avecMontant.reduce((s, p) => s + Number(p.montantAttribue), 0);
      if (sum > recette + 0.01) {
        throw new BadRequestException(
          `La somme des parts clients (${sum.toFixed(0)} FCFA) dépasse la recette du trajet (${recette.toFixed(0)} FCFA).`,
        );
      }
    }
    return { list: out, payeurId };
  }

  async create(dto: CreateTripDto, actor?: AuditActor): Promise<Trip> {
    const {
      stops: stopsIn,
      clientParticipants: cpIn,
      payeurParticipantId: payeurIn,
      ...rest
    } = dto;
    const stops = this.normalizeStopsInput(stopsIn);
    const { list: clientParticipants, payeurId } = this.normalizeClientParticipants(
      cpIn,
      payeurIn,
      Number(rest.recette),
    );
    const trip = this.tripRepository.create({
      id: uuidv4(),
      ...rest,
      destination: (rest.destination ?? '').trim(),
      stops: stops ?? null,
      clientParticipants: clientParticipants,
      payeurParticipantId: payeurId,
    });
    const saved = await this.tripRepository.save(trip);
    await this.auditLogsService.log({
      module: 'trips',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Création trajet ${saved.origine} → ${saved.destination} (recette ${Number(saved.recette).toLocaleString('fr-FR')} FCFA)`,
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
    return saved;
  }

  async findAll(): Promise<Trip[]> {
    return this.tripRepository.find({
      relations: ['tracteur', 'remorqueuse', 'chauffeur'],
      order: { dateDepart: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Trip> {
    const trip = await this.tripRepository.findOne({
      where: { id },
      relations: ['tracteur', 'remorqueuse', 'chauffeur'],
    });
    if (!trip) throw new NotFoundException(`Trajet ${id} introuvable`);
    return trip;
  }

  async update(id: string, dto: UpdateTripDto, actor?: AuditActor): Promise<Trip> {
    const existing = await this.findOne(id);
    if (dto.recette !== undefined && dto.recette !== null) {
      const newRecette = Number(dto.recette);
      if (Number.isNaN(newRecette) || newRecette < 0) {
        throw new BadRequestException('La recette doit être un nombre positif ou nul');
      }
      const rows = await this.invoiceRepository.find({
        where: { trajetId: id },
      });
      const sumTtc = rows.reduce((s, i) => s + Number(i.montantTTC), 0);
      if (sumTtc > newRecette + 0.01) {
        throw new BadRequestException(
          `La recette ne peut pas être inférieure au total déjà facturé (TTC) sur ce trajet : ${sumTtc.toFixed(0)} FCFA déjà couverts par les factures, recette minimale ${sumTtc.toFixed(0)} FCFA (valeur proposée : ${newRecette.toFixed(0)}).`,
        );
      }
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.destination !== undefined) {
      patch.destination = String(dto.destination ?? '').trim();
    }
    if (dto.stops !== undefined) {
      patch.stops =
        this.normalizeStopsInput(dto.stops as TripStopDto[] | undefined) ??
        null;
    }
    if (dto.clientParticipants !== undefined || dto.payeurParticipantId !== undefined) {
      const rec =
        dto.recette !== undefined && dto.recette !== null
          ? Number(dto.recette)
          : Number(existing.recette);
      const rawCp =
        dto.clientParticipants !== undefined
          ? (dto.clientParticipants as TripClientParticipantDto[])
          : ((existing.clientParticipants ?? undefined) as unknown as
              | TripClientParticipantDto[]
              | undefined);
      const payeur =
        dto.payeurParticipantId !== undefined
          ? dto.payeurParticipantId
          : existing.payeurParticipantId;
      const { list, payeurId } = this.normalizeClientParticipants(
        rawCp,
        payeur ?? undefined,
        rec,
      );
      patch.clientParticipants = list;
      patch.payeurParticipantId = payeurId;
    }
    await this.tripRepository.update(id, patch as Partial<Trip>);
    const after = await this.findOne(id);
    if (dto.statut === 'termine' && existing.statut !== 'termine') {
      await this.ensureTripInvoiceOnCompletion(after, actor);
    }
    await this.auditLogsService.log({
      module: 'trips',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification trajet ${after.origine} → ${after.destination}`,
      beforeData: existing as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  /** Crée une facture pour le reste de recette non encore facturé quand le trajet est terminé. */
  private async ensureTripInvoiceOnCompletion(
    trip: Trip,
    actor?: AuditActor,
  ): Promise<void> {
    const recette = Number(trip.recette ?? 0);
    if (recette <= 0) return;
    const existingInvoices = await this.invoiceRepository.find({
      where: { trajetId: trip.id },
    });
    const sumTtc = existingInvoices.reduce((s, i) => s + Number(i.montantTTC), 0);
    const reste = Math.max(0, recette - sumTtc);
    if (reste <= 0.01) return;

    const year = new Date().getFullYear();
    const count = (await this.invoiceRepository.count()) + 1;
    const numero = `FAC-${year}-${String(count).padStart(3, '0')}`;

    const parts = trip.clientParticipants ?? [];
    const payeurId = trip.payeurParticipantId;
    const payeur = payeurId
      ? parts.find((p) => p.id === payeurId)
      : parts[0];
    const clientTierId = payeur?.tierId?.trim() || undefined;
    const factureClientLibelle =
      (payeur?.libelle || trip.client || '').trim() || undefined;

    const inv = this.invoiceRepository.create({
      id: uuidv4(),
      numero,
      trajetId: trip.id,
      statut: 'en_attente',
      montantHT: reste,
      montantHTApresRemise: reste,
      montantTTC: reste,
      montantPaye: 0,
      dateCreation: new Date().toISOString().slice(0, 10),
      clientTierId,
      factureClientLibelle,
      notes: `Facture automatique — trajet ${trip.origine} → ${trip.destination}`,
    });
    const saved = await this.invoiceRepository.save(inv);
    await this.auditLogsService.log({
      module: 'invoices',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Facture auto ${saved.numero} (trajet terminé ${trip.origine} → ${trip.destination})`,
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOne(id);
    await this.tripRepository.delete(id);
    await this.auditLogsService.log({
      module: 'trips',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression trajet ${before.origine} → ${before.destination}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }
}
