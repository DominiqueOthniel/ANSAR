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
  SupplierLoadingEntryMode,
  SupplierLoadingStatus,
} from '../entities/supplier-loading.entity';
import { SupplierLoadingAssignment } from '../entities/supplier-loading-assignment.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { ClientOrder } from '../entities/client-order.entity';
import { Article } from '../entities/article.entity';
import { Truck } from '../entities/truck.entity';
import { CreateSupplierLoadingDto } from './dto/create-supplier-loading.dto';
import { UpdateSupplierLoadingDto } from './dto/update-supplier-loading.dto';
import { SetLoadingAssignmentsDto } from './dto/set-loading-assignments.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

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
    @InjectRepository(Truck)
    private readonly truckRepo: Repository<Truck>,
    private readonly auditLogsService: AuditLogsService,
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

  private isHubFlow(loading: Pick<SupplierLoading, 'statut' | 'modeEntree' | 'hubArrivee'>): boolean {
    return (
      loading.modeEntree === 'rail' ||
      !!(loading.hubArrivee?.trim()) ||
      loading.statut === 'en_transit' ||
      loading.statut === 'au_hub' ||
      loading.statut === 'en_dispatch' ||
      loading.statut === 'solde'
    );
  }

  private resolveInitialStatut(dto: CreateSupplierLoadingDto): SupplierLoadingStatus {
    if (dto.statut === 'brouillon') return 'brouillon';
    if (
      dto.statut &&
      ['en_transit', 'au_hub', 'en_dispatch', 'solde'].includes(dto.statut)
    ) {
      return dto.statut;
    }
    const mode = dto.modeEntree ?? 'bon_simple';
    if (mode === 'rail' || dto.hubArrivee?.trim()) {
      return dto.dateArriveeHub?.trim() ? 'au_hub' : 'en_transit';
    }
    return 'en_attente_affectation';
  }

  private computeStatut(
    loading: Pick<SupplierLoading, 'statut' | 'quantite' | 'modeEntree' | 'hubArrivee'>,
    assignments: SupplierLoadingAssignment[],
  ): SupplierLoadingStatus {
    if (loading.statut === 'annule') return 'annule';
    if (loading.statut === 'brouillon' && assignments.length === 0) return 'brouillon';

    const hub = this.isHubFlow(loading);

    if (assignments.length === 0) {
      if (loading.statut === 'en_transit' || loading.statut === 'au_hub') {
        return loading.statut;
      }
      if (hub) return loading.statut === 'solde' || loading.statut === 'en_dispatch' ? loading.statut : 'au_hub';
      return 'en_attente_affectation';
    }

    const totalQty = this.parseQty(loading.quantite);
    const assignedSum = assignments.reduce((sum, a) => {
      const q = this.parseQty(a.quantiteAffectee) ?? 0;
      return sum + q;
    }, 0);

    if (hub) {
      if (assignedSum <= 0) {
        return loading.statut === 'en_transit' ? 'en_transit' : 'au_hub';
      }
      if (totalQty != null && totalQty > 0) {
        if (assignedSum >= totalQty - 1e-6) return 'solde';
        return 'en_dispatch';
      }
      return 'en_dispatch';
    }

    if (totalQty == null || totalQty <= 0) return 'affecte';
    if (assignedSum <= 0) return 'en_attente_affectation';
    if (assignedSum < totalQty - 1e-6) return 'partiellement_affecte';
    return 'affecte';
  }

  private loadingRelations() {
    return {
      fournisseur: true,
      camion: true,
      assignments: {
        clientOrder: {
          client: true,
        },
      },
    } as const;
  }

  async create(dto: CreateSupplierLoadingDto, actor?: AuditActor): Promise<SupplierLoading> {
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

    const modeEntree: SupplierLoadingEntryMode = dto.modeEntree ?? 'bon_simple';
    const camionId =
      modeEntree === 'camion_ansar' || modeEntree === 'camion' ? dto.camionId : undefined;
    if (modeEntree === 'camion_ansar' && !camionId) {
      throw new BadRequestException('Choisissez le camion SIA-ANSAR utilisé pour ce bon.');
    }
    if ((modeEntree === 'camion_ansar' || modeEntree === 'camion') && camionId) {
      const truck = await this.truckRepo.findOne({ where: { id: camionId } });
      if (!truck) throw new BadRequestException('Camion SIA-ANSAR introuvable.');
      if (truck.statut !== 'actif') throw new BadRequestException('Ce camion n’est pas actif.');
    }
    const hubArrivee = dto.hubArrivee?.trim() || undefined;
    const statut = this.resolveInitialStatut(dto);

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
      dateLivraison: dto.dateLivraison?.trim() || undefined,
      statut,
      modeEntree,
      camionId,
      hubArrivee,
      dateArriveeHub: dto.dateArriveeHub?.trim() || undefined,
      lieu: dto.lieu?.trim() || hubArrivee || undefined,
      notes: dto.notes?.trim() || undefined,
    });

    await this.loadingRepo.save(entity);
    return this.findOne(entity.id);
  }

  async findAll(params?: {
    fournisseurId?: string;
    statut?: SupplierLoadingStatus;
    unassignedOnly?: boolean;
    auHubOnly?: boolean;
    hubArrivee?: string;
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

    if (params?.auHubOnly) {
      list = list.filter(
        (l) =>
          l.statut === 'au_hub' ||
          l.statut === 'en_dispatch' ||
          (l.statut === 'en_transit' && !!l.hubArrivee),
      );
    }

    if (params?.hubArrivee?.trim()) {
      const h = params.hubArrivee.trim().toLowerCase();
      list = list.filter((l) => (l.hubArrivee ?? '').toLowerCase().includes(h));
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

  async update(
    id: string,
    dto: UpdateSupplierLoadingDto,
    actor?: AuditActor,
  ): Promise<SupplierLoading> {
    const before = await this.findOne(id);
    const loading = before;
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
    if (dto.dateLivraison !== undefined) loading.dateLivraison = dto.dateLivraison?.trim() || undefined;
    if (dto.modeEntree != null) loading.modeEntree = dto.modeEntree;
    if (dto.camionId !== undefined || dto.modeEntree != null) {
      const nextMode = dto.modeEntree ?? loading.modeEntree;
      const nextCamionId =
        nextMode === 'camion_ansar' || nextMode === 'camion'
          ? dto.camionId ?? loading.camionId
          : undefined;
      if (nextMode === 'camion_ansar' && !nextCamionId) {
        throw new BadRequestException('Choisissez le camion SIA-ANSAR utilisé pour ce bon.');
      }
      if (nextCamionId) {
        const truck = await this.truckRepo.findOne({ where: { id: nextCamionId } });
        if (!truck) throw new BadRequestException('Camion SIA-ANSAR introuvable.');
        if (truck.statut !== 'actif') throw new BadRequestException('Ce camion n’est pas actif.');
      }
      loading.camionId = nextCamionId;
    }
    if (dto.hubArrivee !== undefined) loading.hubArrivee = dto.hubArrivee?.trim() || undefined;
    if (dto.dateArriveeHub !== undefined) {
      loading.dateArriveeHub = dto.dateArriveeHub?.trim() || undefined;
    }
    if (dto.lieu !== undefined) loading.lieu = dto.lieu?.trim() || undefined;
    if (dto.notes !== undefined) loading.notes = dto.notes?.trim() || undefined;

    if (dto.statut === 'annule') {
      loading.statut = 'annule';
    } else if (dto.statut === 'brouillon') {
      loading.statut = 'brouillon';
    } else if (dto.statut) {
      loading.statut = dto.statut;
    } else if (dto.dateArriveeHub && loading.statut === 'en_transit') {
      loading.statut = 'au_hub';
    }

    const assignments = loading.assignments ?? [];
    if (loading.statut !== 'annule' && dto.statut !== 'brouillon') {
      loading.statut = this.computeStatut(loading, assignments);
    }

    await this.loadingRepo.save(loading);
    const after = await this.findOne(id);
    await this.auditLogsService.log({
      module: 'supplier-loadings',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification bon de chargement ${after.numeroBon ?? after.designation}`,
      beforeData: before as unknown as Record<string, unknown>,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }

  async remove(id: string, actor?: AuditActor): Promise<void> {
    const before = await this.findOne(id);
    await this.loadingRepo.remove(before);
    await this.auditLogsService.log({
      module: 'supplier-loadings',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression bon de chargement ${before.numeroBon ?? before.designation}`,
      beforeData: before as unknown as Record<string, unknown>,
      actor,
    });
  }

  async setAssignments(
    id: string,
    dto: SetLoadingAssignmentsDto,
    actor?: AuditActor,
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
      const clientKeys = new Set(
        orders.map((o) => o.clientId ?? `comptoir:${o.clientNom ?? 'Client comptoir'}`),
      );
      if (clientKeys.size > 1) {
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

    const after = await this.findOne(id);
    await this.auditLogsService.log({
      module: 'supplier-loadings',
      action: 'UPDATE',
      entityId: id,
      summary: `Affectation commandes sur bon ${after.numeroBon ?? after.designation} (${dto.assignments.length} ligne(s))`,
      afterData: after as unknown as Record<string, unknown>,
      actor,
    });
    return after;
  }
}
