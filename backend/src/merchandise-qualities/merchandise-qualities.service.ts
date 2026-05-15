import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { MerchandiseQuality } from '../entities/merchandise-quality.entity';
import { CreateMerchandiseQualityDto } from './dto/create-merchandise-quality.dto';
import { UpdateMerchandiseQualityDto } from './dto/update-merchandise-quality.dto';

@Injectable()
export class MerchandiseQualitiesService {
  constructor(
    @InjectRepository(MerchandiseQuality)
    private readonly repo: Repository<MerchandiseQuality>,
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
      .createQueryBuilder('m')
      .where('LOWER(TRIM(m.libelle)) = :norm', { norm });
    if (excludeId) {
      qb.andWhere('m.id != :excludeId', { excludeId });
    }
    return (await qb.getCount()) > 0;
  }

  async create(dto: CreateMerchandiseQualityDto): Promise<MerchandiseQuality> {
    const libelle = this.normalizeLibelle(dto.libelle);
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (await this.hasDuplicateLibelle(libelle)) {
      throw new BadRequestException(
        'Ce libellé existe déjà dans le catalogue (sans tenir compte des majuscules).',
      );
    }
    const row = this.repo.create({ id: uuidv4(), libelle });
    return this.repo.save(row);
  }

  async findAll(): Promise<MerchandiseQuality[]> {
    return this.repo.find({ order: { libelle: 'ASC' } });
  }

  async findOne(id: string): Promise<MerchandiseQuality> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Marchandise / qualité ${id} introuvable.`);
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdateMerchandiseQualityDto,
  ): Promise<MerchandiseQuality> {
    const existing = await this.findOne(id);
    const libelle =
      dto.libelle !== undefined
        ? this.normalizeLibelle(dto.libelle)
        : existing.libelle;
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (libelle !== existing.libelle && (await this.hasDuplicateLibelle(libelle, id))) {
      throw new BadRequestException(
        'Ce libellé existe déjà dans le catalogue (sans tenir compte des majuscules).',
      );
    }
    await this.repo.update(id, { libelle });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
