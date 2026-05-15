import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Invoice } from '../entities/invoice.entity';
import { Trip, TripStopPersisted } from '../entities/trip.entity';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripStopDto } from './dto/trip-stop.dto';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
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

  async create(dto: CreateTripDto): Promise<Trip> {
    const { stops: stopsIn, ...rest } = dto;
    const stops = this.normalizeStopsInput(stopsIn);
    const trip = this.tripRepository.create({
      id: uuidv4(),
      ...rest,
      stops: stops ?? null,
    });
    return this.tripRepository.save(trip);
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

  async update(id: string, dto: UpdateTripDto): Promise<Trip> {
    await this.findOne(id);
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
    if (dto.stops !== undefined) {
      patch.stops =
        this.normalizeStopsInput(dto.stops as TripStopDto[] | undefined) ??
        null;
    }
    await this.tripRepository.update(id, patch as Partial<Trip>);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tripRepository.delete(id);
  }
}
