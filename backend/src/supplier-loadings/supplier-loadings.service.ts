import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  SupplierLoading,
  SupplierLoadingStatus,
} from '../entities/supplier-loading.entity';
import { SupplierLoadingAssignment } from '../entities/supplier-loading-assignment.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { ClientOrder } from '../entities/client-order.entity';
import { Article } from '../entities/article.entity';
import { CreateSupplierLoadingDto } from './dto/create-supplier-loading.dto';
import { UpdateSupplierLoadingDto } from './dto/update-supplier-loading.dto';
import { SetLoadingAssignmentsDto } from './dto/set-loading-assignments.dto';

@Injectable()
export class SupplierLoadingsService {
  constructor(
    @InjectRepository(SupplierLoading)
    private readonly loadingRepo: Repository<SupplierLoading>,
    @InjectRepository(SupplierLoadingAssignment)
    private readonly assignmentRepo: Repository<SupplierLoadingAssignment>,
    @InjectRepository(ThirdParty)
    private readonly thirdPartyRepo: Repository<ThirdParty>,
    @InjectRepository(ClientOrder)
    private readonly orderRepo: Repository<ClientOrder>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
  ) {}

  private async assertFournisseur(fournisseurId: string): Promise<ThirdParty> {
    const tp = await this.thirdPartyRepo.findOne({ where: { id: fournisseurId } });
    if (!tp) throw new BadRequestException('Fournisseur introuvable.');
    if (tp.type !== 'fournisseur') {
      throw new BadRequestException('Le tiers doit être une fiche fournisseur.');
    }
    return tp;
  }

  private parseQty(val?: string | number | null): number | undefined {
    if (val == null || val === '') return undefined;
    const n = typeof val === 'number' ? val : parseFloat(String(val));
    return Number.isFinite(n) ? n : undefined;
  }

  private computeStatut(
    loading: Pick<SupplierLoading, 'statut' | 'quantite'>,
    assignments: SupplierLoadingAssignment[],
  ): SupplierLoadingStatus {
    if (loading.statut === 'annule') return 'annule';
    if (loading.statut === 'brouillon' && assignments.length === 0) return 'brouillon';
    if (assignments.length === 0) return 'en_attente_affectation';

    const totalQty = this.parseQty(loading.quantite);
    if (totalQty == null || totalQty <= 0) return 'affecte';

    const assignedSum = assignments.reduce((sum, a) => {
      const q = this.parseQty(a.quantiteAffectee) ?? 0;
      return sum + q;
    }, 0);

    if (assignedSum <= 0) return 'en_attente_affectation';
    if (assignedSum < totalQty - 1e-6) return 'partiellement_affecte';
    return 'affecte';
  }

  private loadingRelations() {
    return {
      fournisseur: true,
      assignments: {
        clientOrder: {
          client: true,
        },
      },
    } as const;
  }

  async create(dto: CreateSupplierLoadingDto): Promise<SupplierLoading> {
    await this.assertFournisseur(dto.fournisseurId);

    let designation = dto.designation.trim();
    let unite = dto.unite?.trim();

    if (dto.articleId) {
      const article = await this.articleRepo.findOne({ where: { id: dto.articleId } });
      if (!article) throw new BadRequestException('Article introuvable.');
      if (!designation) designation = article.libelle;
      if (!unite) unite = article.unite;
    }

    if (!designation) throw new BadRequestException('Désignation requise.');

    const statut: SupplierLoadingStatus =
      dto.statut === 'brouillon' ? 'brouillon' : 'en_attente_affectation';

    const entity = this.loadingRepo.create({
      id: uuidv4(),
      fournisseurId: dto.fournisseurId,
      numeroBon: dto.numeroBon?.trim() || undefined,
      articleId: dto.articleId,
      designation,
      quantite: dto.quantite != null ? String(dto.quantite) : undefined,
      unite,
      montantBon: dto.montantBon != null ? String(dto.montantBon) : undefined,
      dateChargement: dto.dateChargement,
      statut,
      lieu: dto.lieu?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
    });

    await this.loadingRepo.save(entity);
    return this.findOne(entity.id);
  }

  async findAll(params?: {
    fournisseurId?: string;
    statut?: SupplierLoadingStatus;
    unassignedOnly?: boolean;
  }): Promise<SupplierLoading[]> {
    const qb = this.loadingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.fournisseur', 'fournisseur')
      .leftJoinAndSelect('l.assignments', 'assignments')
      .leftJoinAndSelect('assignments.clientOrder', 'clientOrder')
      .leftJoinAndSelect('clientOrder.client', 'client')
      .orderBy('l.dateChargement', 'DESC')
      .addOrderBy('l.numeroBon', 'ASC');

    if (params?.fournisseurId) {
      qb.andWhere('l.fournisseurId = :fournisseurId', {
        fournisseurId: params.fournisseurId,
      });
    }
    if (params?.statut) {
      qb.andWhere('l.statut = :statut', { statut: params.statut });
    }

    let list = await qb.getMany();

    if (params?.unassignedOnly) {
      list = list.filter(
        (l) =>
          l.statut !== 'annule' &&
          (!l.assignments || l.assignments.length === 0),
      );
    }

    return list;
  }

  async findOne(id: string): Promise<SupplierLoading> {
    const loading = await this.loadingRepo.findOne({
      where: { id },
      relations: this.loadingRelations(),
    });
    if (!loading) throw new NotFoundException('Bon de chargement introuvable.');
    return loading;
  }

  async update(id: string, dto: UpdateSupplierLoadingDto): Promise<SupplierLoading> {
    const loading = await this.findOne(id);
    if (loading.statut === 'annule') {
      throw new BadRequestException('Un bon annulé ne peut plus être modifié.');
    }

    if (dto.fournisseurId) await this.assertFournisseur(dto.fournisseurId);

    if (dto.articleId) {
      const article = await this.articleRepo.findOne({ where: { id: dto.articleId } });
      if (!article) throw new BadRequestException('Article introuvable.');
    }

    if (dto.fournisseurId != null) loading.fournisseurId = dto.fournisseurId;
    if (dto.numeroBon !== undefined) loading.numeroBon = dto.numeroBon?.trim() || undefined;
    if (dto.articleId !== undefined) loading.articleId = dto.articleId || undefined;
    if (dto.designation != null) loading.designation = dto.designation.trim();
    if (dto.quantite !== undefined) {
      loading.quantite = dto.quantite != null ? String(dto.quantite) : undefined;
    }
    if (dto.unite !== undefined) loading.unite = dto.unite?.trim() || undefined;
    if (dto.montantBon !== undefined) {
      loading.montantBon = dto.montantBon != null ? String(dto.montantBon) : undefined;
    }
    if (dto.dateChargement != null) loading.dateChargement = dto.dateChargement;
    if (dto.lieu !== undefined) loading.lieu = dto.lieu?.trim() || undefined;
    if (dto.notes !== undefined) loading.notes = dto.notes?.trim() || undefined;

    if (dto.statut === 'annule') {
      loading.statut = 'annule';
    } else if (dto.statut === 'brouillon') {
      loading.statut = 'brouillon';
    } else if (dto.statut) {
      loading.statut = dto.statut;
    }

    const assignments = loading.assignments ?? [];
    if (loading.statut !== 'annule' && dto.statut !== 'brouillon') {
      loading.statut = this.computeStatut(loading, assignments);
    }

    await this.loadingRepo.save(loading);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const loading = await this.findOne(id);
    await this.loadingRepo.remove(loading);
  }

  async setAssignments(
    id: string,
    dto: SetLoadingAssignmentsDto,
  ): Promise<SupplierLoading> {
    const loading = await this.findOne(id);
    if (loading.statut === 'annule') {
      throw new BadRequestException('Un bon annulé ne peut plus être affecté.');
    }

    const orderIds = dto.assignments.map((a) => a.clientOrderId);
    const uniqueIds = new Set(orderIds);
    if (uniqueIds.size !== orderIds.length) {
      throw new BadRequestException('Une commande ne peut être liée qu’une fois par bon.');
    }

    if (orderIds.length > 0) {
      const orders = await this.orderRepo.find({
        where: { id: In(orderIds) },
        relations: { client: true },
      });
      if (orders.length !== orderIds.length) {
        throw new BadRequestException('Une ou plusieurs commandes client sont introuvables.');
      }
      const cancelled = orders.filter((o) => o.statut === 'annulee');
      if (cancelled.length > 0) {
        throw new BadRequestException('Impossible d’affecter à une commande annulée.');
      }
      const clientIds = new Set(orders.map((o) => o.clientId));
      if (clientIds.size > 1) {
        throw new BadRequestException(
          'Un bon ne peut être affecté qu’à un seul client.',
        );
      }
    }

    await this.assignmentRepo.delete({ loadingId: id });

    for (const item of dto.assignments) {
      const row = this.assignmentRepo.create({
        id: uuidv4(),
        loadingId: id,
        clientOrderId: item.clientOrderId,
        quantiteAffectee:
          item.quantiteAffectee != null ? String(item.quantiteAffectee) : undefined,
        notes: item.notes?.trim() || undefined,
      });
      await this.assignmentRepo.save(row);
    }

    const refreshed = await this.findOne(id);
    const assignments = refreshed.assignments ?? [];
    if (refreshed.statut !== 'brouillon') {
      refreshed.statut = this.computeStatut(refreshed, assignments);
      await this.loadingRepo.save(refreshed);
    }

    return this.findOne(id);
  }
}
