import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Article } from '../entities/article.entity';
import { ArticleSupplierPrice } from '../entities/article-supplier-price.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CreateArticleSupplierPriceDto } from './dto/create-article-supplier-price.dto';
import { UpdateArticleSupplierPriceDto } from './dto/update-article-supplier-price.dto';

@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(ArticleSupplierPrice)
    private readonly priceRepo: Repository<ArticleSupplierPrice>,
    @InjectRepository(ThirdParty)
    private readonly thirdPartyRepo: Repository<ThirdParty>,
  ) {}

  private normalizeLibelle(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim();
  }

  private async assertFournisseur(fournisseurId: string): Promise<ThirdParty> {
    const tp = await this.thirdPartyRepo.findOne({ where: { id: fournisseurId } });
    if (!tp) {
      throw new BadRequestException('Fournisseur introuvable.');
    }
    if (tp.type !== 'fournisseur') {
      throw new BadRequestException('Le tiers sélectionné doit être de type fournisseur.');
    }
    return tp;
  }

  private async hasDuplicateLibelle(libelle: string, excludeId?: string): Promise<boolean> {
    const norm = libelle.trim().toLowerCase();
    if (!norm) return false;
    const qb = this.articleRepo
      .createQueryBuilder('a')
      .where('LOWER(TRIM(a.libelle)) = :norm', { norm });
    if (excludeId) {
      qb.andWhere('a.id != :excludeId', { excludeId });
    }
    return (await qb.getCount()) > 0;
  }

  async create(dto: CreateArticleDto): Promise<Article> {
    const libelle = this.normalizeLibelle(dto.libelle);
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (await this.hasDuplicateLibelle(libelle)) {
      throw new BadRequestException(
        'Cet article existe déjà dans le catalogue (sans tenir compte des majuscules).',
      );
    }
    const unite = (dto.unite ?? 'unité').trim() || 'unité';
    const row = this.articleRepo.create({
      id: uuidv4(),
      libelle,
      unite,
      actif: dto.actif !== false,
      prixVente: dto.prixVente != null ? Number(dto.prixVente) : undefined,
    });
    return this.articleRepo.save(row);
  }

  async findAll(): Promise<Article[]> {
    return this.articleRepo.find({
      relations: ['supplierPrices', 'supplierPrices.fournisseur'],
      order: { libelle: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Article> {
    const row = await this.articleRepo.findOne({
      where: { id },
      relations: ['supplierPrices', 'supplierPrices.fournisseur'],
    });
    if (!row) {
      throw new NotFoundException(`Article ${id} introuvable.`);
    }
    return row;
  }

  async update(id: string, dto: UpdateArticleDto): Promise<Article> {
    const existing = await this.findOne(id);
    const libelle =
      dto.libelle !== undefined ? this.normalizeLibelle(dto.libelle) : existing.libelle;
    if (!libelle) {
      throw new BadRequestException('Le libellé ne peut pas être vide.');
    }
    if (libelle !== existing.libelle && (await this.hasDuplicateLibelle(libelle, id))) {
      throw new BadRequestException(
        'Cet article existe déjà dans le catalogue (sans tenir compte des majuscules).',
      );
    }
    const patch: Partial<Article> = { libelle };
    if (dto.unite !== undefined) {
      patch.unite = dto.unite.trim() || 'unité';
    }
    if (dto.actif !== undefined) {
      patch.actif = dto.actif;
    }
    if (dto.prixVente !== undefined) {
      patch.prixVente = dto.prixVente != null ? Number(dto.prixVente) : undefined;
    }
    await this.articleRepo.update(id, patch);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.articleRepo.delete(id);
  }

  async createSupplierPrice(
    articleId: string,
    dto: CreateArticleSupplierPriceDto,
  ): Promise<ArticleSupplierPrice> {
    await this.findOne(articleId);
    await this.assertFournisseur(dto.fournisseurId);
    const existing = await this.priceRepo.findOne({
      where: { articleId, fournisseurId: dto.fournisseurId },
    });
    if (existing) {
      throw new BadRequestException(
        'Un prix forfaitaire existe déjà pour cet article chez ce fournisseur. Modifiez la ligne existante.',
      );
    }
    const prix = Number(dto.prixUnitaire);
    if (Number.isNaN(prix) || prix < 0) {
      throw new BadRequestException('Le prix unitaire doit être un nombre positif ou nul.');
    }
    const row = this.priceRepo.create({
      id: uuidv4(),
      articleId,
      fournisseurId: dto.fournisseurId,
      prixUnitaire: prix,
      notes: dto.notes?.trim() || undefined,
    });
    const saved = await this.priceRepo.save(row);
    return this.findSupplierPrice(saved.id);
  }

  async findSupplierPrice(id: string): Promise<ArticleSupplierPrice> {
    const row = await this.priceRepo.findOne({
      where: { id },
      relations: ['fournisseur', 'article'],
    });
    if (!row) {
      throw new NotFoundException(`Tarif fournisseur ${id} introuvable.`);
    }
    return row;
  }

  async updateSupplierPrice(
    priceId: string,
    dto: UpdateArticleSupplierPriceDto,
  ): Promise<ArticleSupplierPrice> {
    const existing = await this.findSupplierPrice(priceId);
    if (dto.fournisseurId !== undefined && dto.fournisseurId !== existing.fournisseurId) {
      await this.assertFournisseur(dto.fournisseurId);
      const dup = await this.priceRepo.findOne({
        where: { articleId: existing.articleId, fournisseurId: dto.fournisseurId },
      });
      if (dup && dup.id !== priceId) {
        throw new BadRequestException(
          'Un prix forfaitaire existe déjà pour cet article chez ce fournisseur.',
        );
      }
    }
    const patch: Partial<ArticleSupplierPrice> = {};
    if (dto.fournisseurId !== undefined) {
      patch.fournisseurId = dto.fournisseurId;
    }
    if (dto.prixUnitaire !== undefined) {
      const prix = Number(dto.prixUnitaire);
      if (Number.isNaN(prix) || prix < 0) {
        throw new BadRequestException('Le prix unitaire doit être un nombre positif ou nul.');
      }
      patch.prixUnitaire = prix;
    }
    if (dto.notes !== undefined) {
      patch.notes = dto.notes.trim() || undefined;
    }
    await this.priceRepo.update(priceId, patch);
    return this.findSupplierPrice(priceId);
  }

  async removeSupplierPrice(priceId: string): Promise<void> {
    await this.findSupplierPrice(priceId);
    await this.priceRepo.delete(priceId);
  }
}
