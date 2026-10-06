import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TjkDestination } from '../entities/tjk-destination.entity';
import { CreateTjkDestinationDto } from './dto/create-tjk-destination.dto';
import { UpdateTjkDestinationDto } from './dto/update-tjk-destination.dto';

@Injectable()
export class TjkDestinationsService {
  constructor(
    @InjectRepository(TjkDestination)
    private readonly repo: Repository<TjkDestination>,
  ) {}

  private normalizeLibelle(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
  }

  private async hasDuplicateLibelle(
    libelle: string,
    excludeId?: string,
  ): Promise<boolean> {
    const norm = libelle.trim().toLowerCase();
    if (!norm) return false;
    const qb = this.repo
      .createQueryBuilder('d')
      .where('LOWER(TRIM(d.libelle)) = :norm', { norm });
    if (excludeId) {
      qb.andWhere('d.id != :excludeId', { excludeId });
    }
    return (await qb.getCount()) > 0;
  }

  async create(dto: CreateTjkDestinationDto): Promise<TjkDestination> {
    const libelle = this.normalizeLibelle(dto.libelle);
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (await this.hasDuplicateLibelle(libelle)) {
      throw new BadRequestException('Cette destination existe déjà.');
    }
    const row = this.repo.create({
      id: uuidv4(),
      libelle,
      quantiteDefaut: dto.quantiteDefaut ?? null,
      poidsUniteKg: dto.poidsUniteKg ?? 50,
      prixTrans: dto.prixTrans ?? null,
      prixTransport: dto.prixTransport ?? null,
      totalTransport: dto.totalTransport ?? null,
      prixVoyage: dto.prixVoyage ?? null,
      totalPaiement: dto.totalPaiement ?? null,
    });
    return this.repo.save(row);
  }

  async findAll(): Promise<TjkDestination[]> {
    return this.repo.find({ order: { libelle: 'ASC' } });
  }

  async findOne(id: string): Promise<TjkDestination> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Destination TJK ${id} introuvable.`);
    }
    return row;
  }

  async update(id: string, dto: UpdateTjkDestinationDto): Promise<TjkDestination> {
    const existing = await this.findOne(id);
    const libelle =
      dto.libelle !== undefined
        ? this.normalizeLibelle(dto.libelle)
        : existing.libelle;
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (libelle !== existing.libelle && (await this.hasDuplicateLibelle(libelle, id))) {
      throw new BadRequestException('Cette destination existe déjà.');
    }
    await this.repo.update(id, {
      libelle,
      quantiteDefaut: dto.quantiteDefaut !== undefined ? dto.quantiteDefaut ?? null : existing.quantiteDefaut,
      poidsUniteKg: dto.poidsUniteKg !== undefined ? dto.poidsUniteKg ?? null : existing.poidsUniteKg,
      prixTrans: dto.prixTrans !== undefined ? dto.prixTrans ?? null : existing.prixTrans,
      prixTransport:
        dto.prixTransport !== undefined ? dto.prixTransport ?? null : existing.prixTransport,
      totalTransport:
        dto.totalTransport !== undefined ? dto.totalTransport ?? null : existing.totalTransport,
      prixVoyage: dto.prixVoyage !== undefined ? dto.prixVoyage ?? null : existing.prixVoyage,
      totalPaiement:
        dto.totalPaiement !== undefined ? dto.totalPaiement ?? null : existing.totalPaiement,
    });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
