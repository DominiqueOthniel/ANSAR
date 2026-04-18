import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ParcelExpedition, ParcelExpeditionLotJson } from '../entities/parcel-expedition.entity';
import { CreateParcelExpeditionDto } from './dto/create-parcel-expedition.dto';
import { UpdateParcelExpeditionDto } from './dto/update-parcel-expedition.dto';
import { ParcelExpeditionQueryDto } from './dto/parcel-expedition-query.dto';

@Injectable()
export class ParcelExpeditionsService {
  constructor(
    @InjectRepository(ParcelExpedition)
    private readonly repo: Repository<ParcelExpedition>,
  ) {}

  private normalizeLots(
    dtoLots: Array<{
      id?: string;
      entreprise?: string;
      marchandise?: string;
      poidsKg?: number;
      notes?: string;
    }>,
  ): ParcelExpeditionLotJson[] {
    return (dtoLots || []).map((l) => {
      const entreprise = (l.entreprise ?? '').trim();
      const marchandise = (l.marchandise ?? '').trim();
      if (!entreprise || !marchandise) {
        throw new BadRequestException(
          'Chaque lot doit avoir une entreprise et une marchandise renseignées',
        );
      }
      return {
        id: l.id && l.id.length > 0 ? l.id : uuidv4(),
        entreprise,
        marchandise,
        poidsKg: l.poidsKg,
        notes: l.notes?.trim() || undefined,
      };
    });
  }

  async create(dto: CreateParcelExpeditionDto): Promise<ParcelExpedition> {
    if (!dto.tracteurId && !dto.remorqueuseId) {
      throw new BadRequestException(
        'Au moins un tracteur ou une remorqueuse est requis pour une expédition colis',
      );
    }
    if (!dto.lots?.length) {
      throw new BadRequestException('Au moins une ligne marchandise (lot) est requise');
    }
    const today = new Date().toISOString().split('T')[0];
    const row = this.repo.create({
      id: uuidv4(),
      reference: dto.reference,
      origine: dto.origine,
      origineLat: dto.origineLat,
      origineLng: dto.origineLng,
      destination: dto.destination,
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      tracteurId: dto.tracteurId || undefined,
      remorqueuseId: dto.remorqueuseId || undefined,
      chauffeurId: dto.chauffeurId,
      dateDepart: dto.dateDepart.includes('T') ? dto.dateDepart.split('T')[0] : dto.dateDepart,
      dateArrivee: dto.dateArrivee
        ? dto.dateArrivee.includes('T')
          ? dto.dateArrivee.split('T')[0]
          : dto.dateArrivee
        : undefined,
      statut: dto.statut,
      lots: this.normalizeLots(dto.lots),
      description: dto.description,
      dateCreation: dto.dateCreation?.split('T')[0] ?? today,
    });
    return this.repo.save(row);
  }

  async findAll(query?: ParcelExpeditionQueryDto): Promise<ParcelExpedition[]> {
    const qb = this.repo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.tracteur', 'tracteur')
      .leftJoinAndSelect('e.remorqueuse', 'remorqueuse')
      .leftJoinAndSelect('e.chauffeur', 'chauffeur')
      .orderBy('e.dateDepart', 'DESC');

    if (query?.statut) {
      qb.andWhere('e.statut = :statut', { statut: query.statut });
    }
    if (query?.destination) {
      qb.andWhere('e.destination = :destination', { destination: query.destination });
    }
    if (query?.chauffeurId) {
      qb.andWhere('e.chauffeurId = :chauffeurId', { chauffeurId: query.chauffeurId });
    }
    if (query?.tracteurId) {
      qb.andWhere('e.tracteurId = :tracteurId', { tracteurId: query.tracteurId });
    }
    if (query?.remorqueuseId) {
      qb.andWhere('e.remorqueuseId = :remorqueuseId', { remorqueuseId: query.remorqueuseId });
    }
    if (query?.dateDepartFrom) {
      qb.andWhere('e.dateDepart >= :df', { df: query.dateDepartFrom.split('T')[0] });
    }
    if (query?.dateDepartTo) {
      qb.andWhere('e.dateDepart <= :dt', { dt: query.dateDepartTo.split('T')[0] });
    }
    if (query?.q?.trim()) {
      const raw = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(e.reference) LIKE :q OR LOWER(e.destination) LIKE :q OR LOWER(COALESCE(e.description, '')) LIKE :q OR LOWER(CAST(e.lots AS TEXT)) LIKE :q)`,
        { q: raw },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<ParcelExpedition> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['tracteur', 'remorqueuse', 'chauffeur'],
    });
    if (!row) throw new NotFoundException(`Expédition colis ${id} introuvable`);
    return row;
  }

  async update(id: string, dto: UpdateParcelExpeditionDto): Promise<ParcelExpedition> {
    const current = await this.findOne(id);
    const keys = [
      'reference',
      'origine',
      'origineLat',
      'origineLng',
      'destination',
      'destinationLat',
      'destinationLng',
      'tracteurId',
      'remorqueuseId',
      'chauffeurId',
      'dateDepart',
      'dateArrivee',
      'statut',
      'description',
      'lots',
      'dateCreation',
    ] as const;
    const patch: Partial<ParcelExpedition> = {};
    for (const k of keys) {
      const v = dto[k];
      if (v === undefined) continue;
      (patch as Record<string, unknown>)[k] = v;
    }
    if (dto.dateDepart) {
      patch.dateDepart = dto.dateDepart.includes('T')
        ? dto.dateDepart.split('T')[0]
        : dto.dateDepart;
    }
    if (dto.dateArrivee !== undefined) {
      patch.dateArrivee = dto.dateArrivee
        ? dto.dateArrivee.includes('T')
          ? dto.dateArrivee.split('T')[0]
          : dto.dateArrivee
        : undefined;
    }
    if (dto.dateCreation) {
      patch.dateCreation = dto.dateCreation.split('T')[0];
    }
    if (dto.lots) {
      if (!dto.lots.length) {
        throw new BadRequestException('Au moins une ligne marchandise (lot) est requise');
      }
      patch.lots = this.normalizeLots(dto.lots);
    }
    if (patch.tracteurId === null) patch.tracteurId = undefined;
    if (patch.remorqueuseId === null) patch.remorqueuseId = undefined;

    const nextT =
      patch.tracteurId !== undefined ? patch.tracteurId : current.tracteurId;
    const nextR =
      patch.remorqueuseId !== undefined ? patch.remorqueuseId : current.remorqueuseId;
    if (!nextT && !nextR) {
      throw new BadRequestException(
        'Au moins un tracteur ou une remorqueuse est requis pour une expédition colis',
      );
    }

    await this.repo.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
