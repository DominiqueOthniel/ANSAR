import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientOrder,
  ClientOrderStatus,
} from '../entities/client-order.entity';
import {
  ClientDelivery,
  ClientDeliveryStatus,
} from '../entities/client-delivery.entity';
import { ThirdParty } from '../entities/third-party.entity';
import { Article } from '../entities/article.entity';
import { Invoice } from '../entities/invoice.entity';
import { SupplierLoadingAssignment } from '../entities/supplier-loading-assignment.entity';
import { CreateClientOrderDto } from './dto/create-client-order.dto';
import { UpdateClientOrderDto } from './dto/update-client-order.dto';
import { CreateClientDeliveryDto } from './dto/create-client-delivery.dto';
import { UpdateClientDeliveryDto } from './dto/update-client-delivery.dto';
import {
  QueryClientDeliveriesDto,
  QueryClientOrdersDto,
} from './dto/query-client-operations.dto';
import { AuditActor, AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class ClientOperationsService {
  constructor(
    @InjectRepository(ClientOrder)
    private readonly orderRepo: Repository<ClientOrder>,
    @InjectRepository(ClientDelivery)
    private readonly deliveryRepo: Repository<ClientDelivery>,
    @InjectRepository(ThirdParty)
    private readonly thirdPartyRepo: Repository<ThirdParty>,
    @InjectRepository(Article)
    private readonly articleRepo: Repository<Article>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(SupplierLoadingAssignment)
    private readonly loadingAssignmentRepo: Repository<SupplierLoadingAssignment>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  private async assertClient(clientId: string): Promise<ThirdParty> {
    const tp = await this.thirdPartyRepo.findOne({ where: { id: clientId } });
    if (!tp) throw new BadRequestException('Client introuvable.');
    if (tp.type !== 'client') {
      throw new BadRequestException('Le tiers doit être une fiche client.');
    }
    return tp;
  }

  private resolveMontant(
    quantite?: number,
    prixUnitaire?: number,
    montantManual?: number,
  ): number | undefined {
    const q = quantite != null ? Number(quantite) : undefined;
    const pu = prixUnitaire != null ? Number(prixUnitaire) : undefined;
    if (q != null && pu != null && q > 0 && pu > 0) {
      return Math.round(q * pu * 100) / 100;
    }
    if (montantManual != null && Number(montantManual) > 0) {
      return Math.round(Number(montantManual) * 100) / 100;
    }
    return undefined;
  }

  private async resolveArticlePricing(
    articleId: string | undefined,
    prixUnitaireInput?: number,
  ): Promise<{ articleId?: string; prixUnitaire?: number; unite?: string; designation?: string }> {
    if (!articleId) {
      return { prixUnitaire: prixUnitaireInput };
    }
    const article = await this.articleRepo.findOne({ where: { id: articleId } });
    if (!article) throw new BadRequestException('Article introuvable.');
    let pu = prixUnitaireInput;
    if (pu == null || pu <= 0) {
      if (article.prixVente != null && Number(article.prixVente) > 0) {
        pu = Number(article.prixVente);
      } else {
        const prices = await this.articleRepo
          .createQueryBuilder('a')
          .leftJoinAndSelect('a.supplierPrices', 'sp')
          .where('a.id = :id', { id: articleId })
          .getOne();
        const supplierPu = prices?.supplierPrices
          ?.map((p) => Number(p.prixUnitaire))
          .filter((n) => n > 0);
        if (supplierPu?.length) {
          pu = Math.max(...supplierPu);
        }
      }
    }
    return {
      articleId: article.id,
      prixUnitaire: pu,
      unite: article.unite,
      designation: article.libelle,
    };
  }

  private async nextInvoiceNum(prefix: string): Promise<string> {
    const year = new Date().getFullYear();
    const fullPrefix = `${prefix}-${year}-`;
    const count = await this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.numero LIKE :p', { p: `${fullPrefix}%` })
      .getCount();
    return `${fullPrefix}${String(count + 1).padStart(3, '0')}`;
  }

  private async syncInvoiceAmount(
    invoiceId: string,
    montant: number,
    patch: Partial<Invoice>,
  ): Promise<void> {
    await this.invoiceRepo.update(invoiceId, {
      montantHT: montant,
      montantTTC: montant,
      montantHTApresRemise: montant,
      ...patch,
    });
  }

  /** Facture FAC-CMD liée à la commande (par invoiceId ou clientOrderId). */
  private async findOrderInvoice(order: ClientOrder): Promise<Invoice | null> {
    if (order.invoiceId) {
      const byId = await this.invoiceRepo.findOne({ where: { id: order.invoiceId } });
      if (byId) return byId;
    }
    return this.invoiceRepo.findOne({ where: { clientOrderId: order.id } });
  }

  private resolveOrderPayment(
    montant: number,
    order: ClientOrder,
    existing: Invoice | null,
    payment?: { montantPaye?: number; datePaiement?: string },
  ): { montantPaye: number; statut: 'en_attente' | 'payee'; datePaiement?: string } {
    if (payment?.montantPaye !== undefined && payment.montantPaye !== null) {
      const montantPaye = Math.min(Math.max(0, Number(payment.montantPaye)), montant);
      return {
        montantPaye,
        statut: montantPaye >= montant - 0.01 ? 'payee' : 'en_attente',
        datePaiement:
          montantPaye > 0
            ? payment.datePaiement?.trim() || order.dateCommande
            : undefined,
      };
    }
    if (existing) {
      const montantPaye = Math.min(Math.max(0, Number(existing.montantPaye ?? 0)), montant);
      return {
        montantPaye,
        statut: montantPaye >= montant - 0.01 ? 'payee' : existing.statut,
        datePaiement: existing.datePaiement,
      };
    }
    return { montantPaye: 0, statut: 'en_attente' };
  }

  /** Transport facturable sur la facture commande (une seule FAC-CMD, transport détaillé en notes). */
  private deliveryBillsTransport(delivery: ClientDelivery): boolean {
    if (delivery.modeSortie === 'retrait_hub') return false;
    const montant = this.deliveryTransportMontant(delivery);
    if (montant <= 0) return false;
    if (delivery.statut === 'annulee') return false;
    if (this.isTransportBilledBySupplier(delivery)) return true;
    return this.hasTransportMission(delivery);
  }

  private formatExitModeFr(mode: ClientDelivery['modeSortie']): string {
    if (mode === 'retrait_hub') return 'retrait au hub';
    if (mode === 'livraison_agent') return 'livraison par agent';
    return 'livraison directe';
  }

  private async loadBillableDeliveriesForOrder(orderId: string): Promise<ClientDelivery[]> {
    const rows = await this.deliveryRepo.find({
      where: { clientOrderId: orderId },
      relations: ['chauffeur', 'tracteur', 'transportFournisseur'],
    });
    return rows.filter((d) => this.deliveryBillsTransport(d));
  }

  private buildDeliveryTransportLine(delivery: ClientDelivery): string {
    const montant = this.deliveryTransportMontant(delivery);
    const details: string[] = [this.formatExitModeFr(delivery.modeSortie)];
    if (delivery.transportFournisseur?.nom) {
      details.push(`fournisseur ${delivery.transportFournisseur.nom}`);
    }
    const ch = delivery.chauffeur;
    if (ch) details.push(`${ch.prenom} ${ch.nom}`.trim());
    const tr = delivery.tracteur;
    if (tr?.immatriculation) details.push(tr.immatriculation);
    const detailStr = details.length ? ` (${details.join(' · ')})` : '';
    return `Livraison ${delivery.lieuLivraison} — transport : ${montant.toLocaleString('fr-FR')} FCFA${detailStr}`;
  }

  private buildOrderInvoiceNotes(
    order: ClientOrder,
    billableDeliveries: ClientDelivery[],
  ): string {
    const lines: string[] = [];
    if (order.reference) lines.push(`Commande ${order.reference}`);
    const marchandise = Number(order.montant ?? 0);
    if (marchandise > 0) {
      lines.push(`Marchandise : ${marchandise.toLocaleString('fr-FR')} FCFA`);
    }
    for (const d of billableDeliveries) {
      lines.push(this.buildDeliveryTransportLine(d));
    }
    return lines.join('\n');
  }

  /**
   * Anciennes FAC-LIV : fusion des encaissements puis suppression (transport inclus dans FAC-CMD).
   */
  private async absorbLegacyDeliveryInvoices(
    orderId: string,
    actor?: AuditActor,
  ): Promise<{ mergedPaye: number; mergedDatePaiement?: string }> {
    let mergedPaye = 0;
    let mergedDatePaiement: string | undefined;
    const deliveries = await this.deliveryRepo.find({ where: { clientOrderId: orderId } });
    for (const d of deliveries) {
      if (!d.invoiceId) continue;
      const inv = await this.invoiceRepo.findOne({ where: { id: d.invoiceId } });
      if (!inv || inv.clientDeliveryId !== d.id) continue;
      mergedPaye += Number(inv.montantPaye ?? 0);
      if (inv.datePaiement) mergedDatePaiement = inv.datePaiement;
      await this.invoiceRepo.delete(inv.id);
      await this.deliveryRepo.update(d.id, { invoiceId: undefined });
      await this.auditLogsService.log({
        module: 'invoices',
        action: 'DELETE',
        entityId: inv.id,
        summary: `Fusion facture transport ${inv.numero} dans la facture commande`,
        beforeData: inv as unknown as Record<string, unknown>,
        actor,
      });
    }
    return { mergedPaye, mergedDatePaiement };
  }

  private async ensureOrderInvoice(
    order: ClientOrder,
    payment?: { montantPaye?: number; datePaiement?: string },
    actor?: AuditActor,
  ): Promise<void> {
    const { mergedPaye, mergedDatePaiement } = await this.absorbLegacyDeliveryInvoices(
      order.id,
      actor,
    );
    const billableDeliveries = await this.loadBillableDeliveriesForOrder(order.id);
    const marchandise = Number(order.montant ?? 0);
    const transportTotal = billableDeliveries.reduce(
      (sum, d) => sum + this.deliveryTransportMontant(d),
      0,
    );
    const montant = marchandise + transportTotal;
    if (montant <= 0) return;

    const designationLibelle =
      transportTotal > 0 && marchandise > 0
        ? `${order.designation} (marchandise + transport)`
        : transportTotal > 0
          ? `${order.designation} — transport`
          : order.designation;
    const walkInName = !order.clientId?.trim() ? order.clientNom?.trim() : undefined;
    const libelle = walkInName ? `${walkInName} — ${designationLibelle}` : designationLibelle;
    const notes = this.buildOrderInvoiceNotes(order, billableDeliveries);
    const existing = await this.findOrderInvoice(order);
    let paymentResolved = payment;
    if (!paymentResolved && mergedPaye > 0 && existing) {
      const basePaye = Number(existing.montantPaye ?? 0);
      paymentResolved = {
        montantPaye: Math.min(basePaye + mergedPaye, montant),
        datePaiement: mergedDatePaiement ?? existing.datePaiement,
      };
    } else if (!paymentResolved && mergedPaye > 0 && !existing) {
      paymentResolved = {
        montantPaye: Math.min(mergedPaye, montant),
        datePaiement: mergedDatePaiement,
      };
    }
    const { montantPaye, statut, datePaiement } = this.resolveOrderPayment(
      montant,
      order,
      existing,
      paymentResolved,
    );

    if (existing) {
      const beforePaye = Number(existing.montantPaye ?? 0);
      await this.syncInvoiceAmount(existing.id, montant, {
        clientTierId: order.clientId?.trim() || undefined,
        clientOrderId: order.id,
        clientDeliveryId: null,
        factureClientLibelle: libelle,
        notes,
        montantPaye,
        statut,
        datePaiement,
      });
      if (!order.invoiceId || order.invoiceId !== existing.id) {
        await this.orderRepo.update(order.id, { invoiceId: existing.id });
      }
      const after = await this.invoiceRepo.findOne({ where: { id: existing.id } });
      const payeChanged =
        payment?.montantPaye !== undefined &&
        after &&
        Math.abs(Number(after.montantPaye ?? 0) - beforePaye) > 0.01;
      await this.auditLogsService.log({
        module: 'invoices',
        action: payeChanged ? 'ENCAISSEMENT' : 'UPDATE',
        entityId: existing.id,
        summary: payeChanged
          ? `Encaissement facture ${existing.numero} : ${Number(after?.montantPaye ?? 0).toLocaleString('fr-FR')} FCFA (commande)`
          : `Mise à jour facture ${existing.numero} (commande ${order.reference ?? order.designation})`,
        beforeData: existing as unknown as Record<string, unknown>,
        afterData: (after ?? existing) as unknown as Record<string, unknown>,
        actor,
      });
      return;
    }

    const inv = this.invoiceRepo.create({
      id: uuidv4(),
      numero: await this.nextInvoiceNum('FAC-CMD'),
      clientOrderId: order.id,
      clientTierId: order.clientId?.trim() || undefined,
      statut,
      montantHT: montant,
      montantHTApresRemise: montant,
      montantTTC: montant,
      montantPaye,
      dateCreation: order.dateCommande,
      datePaiement,
      factureClientLibelle: libelle,
      notes,
    });
    const saved = await this.invoiceRepo.save(inv);
    await this.orderRepo.update(order.id, { invoiceId: saved.id });
    const paye = Number(saved.montantPaye ?? 0);
    await this.auditLogsService.log({
      module: 'invoices',
      action: paye > 0 ? 'ENCAISSEMENT' : 'CREATE',
      entityId: saved.id,
      summary:
        paye > 0
          ? `Facture ${saved.numero} créée (commande) avec encaissement ${paye.toLocaleString('fr-FR')} FCFA`
          : `Création facture ${saved.numero} pour commande ${order.reference ?? order.designation}`,
      afterData: saved as unknown as Record<string, unknown>,
      actor,
    });
  }

  private deliveryTransportMontant(delivery: ClientDelivery): number {
    return Number(delivery.montantTransport ?? 0);
  }

  private hasTransportMission(delivery: ClientDelivery): boolean {
    return !!(delivery.chauffeurId || delivery.tracteurId);
  }

  private isTransportBilledBySupplier(delivery: ClientDelivery): boolean {
    return delivery.transportFactureParFournisseur === true;
  }

  private async assertTransportFournisseur(fournisseurId?: string): Promise<void> {
    if (!fournisseurId) return;
    const tp = await this.thirdPartyRepo.findOne({ where: { id: fournisseurId } });
    if (!tp) throw new BadRequestException('Fournisseur transport introuvable.');
    if (tp.type !== 'fournisseur') {
      throw new BadRequestException('Le tiers transport doit être une fiche fournisseur.');
    }
  }

  private assertTransportBilling(delivery: ClientDelivery): void {
    if (delivery.modeSortie === 'retrait_hub') {
      return;
    }
    if (this.isTransportBilledBySupplier(delivery)) {
      if (!delivery.transportFournisseurId) {
        throw new BadRequestException('Indiquez le fournisseur qui vous facture le transport.');
      }
      if (this.deliveryTransportMontant(delivery) <= 0) {
        throw new BadRequestException(
          'Indiquez le montant transport refacturé au client lorsque le fournisseur vous facture le transport.',
        );
      }
      return;
    }
    if (this.hasTransportMission(delivery) && this.deliveryTransportMontant(delivery) <= 0) {
      throw new BadRequestException(
        'Indiquez le montant du transport lorsqu’un chauffeur ou un camion est attribué à la livraison.',
      );
    }
  }

  /** Recalcule la FAC-CMD (marchandise + transports des livraisons). */
  private async syncOrderInvoiceFromDeliveries(
    order: ClientOrder,
    actor?: AuditActor,
  ): Promise<void> {
    await this.ensureOrderInvoice(order, undefined, actor);
  }

  private deriveOrderStatus(deliveries: ClientDelivery[]): ClientOrderStatus {
    const active = deliveries.filter((d) => d.statut !== 'annulee');
    if (active.length === 0) return 'confirmee';
    const allLivree = active.every((d) => d.statut === 'livree');
    if (allLivree) return 'livree';
    const someLivree = active.some((d) => d.statut === 'livree');
    const someEnCours = active.some(
      (d) => d.statut === 'en_cours' || d.statut === 'livree',
    );
    if (someLivree && !allLivree) return 'partiellement_livree';
    if (someEnCours) return 'en_preparation';
    return 'confirmee';
  }

  private async syncOrderStatusFromDeliveries(orderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || order.statut === 'annulee' || order.statut === 'brouillon') {
      return;
    }
    const deliveries = await this.deliveryRepo.find({ where: { clientOrderId: orderId } });
    const next = this.deriveOrderStatus(deliveries);
    if (next !== order.statut) {
      await this.orderRepo.update(orderId, { statut: next });
    }
  }

  private async buildOrderPayloadAsync(
    dto: CreateClientOrderDto | UpdateClientOrderDto,
    existing?: ClientOrder,
  ): Promise<Partial<ClientOrder>> {
    const articleId =
      dto.articleId !== undefined ? dto.articleId : existing?.articleId;
    const articlePricing = await this.resolveArticlePricing(
      articleId,
      dto.prixUnitaire !== undefined ? dto.prixUnitaire : existing?.prixUnitaire,
    );

    const quantite =
      dto.quantite !== undefined
        ? dto.quantite != null
          ? Number(dto.quantite)
          : undefined
        : existing?.quantite;
    const prixUnitaire = articlePricing.prixUnitaire;
    const montant = this.resolveMontant(
      quantite,
      prixUnitaire,
      dto.montant !== undefined ? dto.montant : existing?.montant,
    );

    const designation =
      dto.designation !== undefined
        ? dto.designation.trim()
        : articlePricing.designation ?? existing?.designation ?? '';
    const unite =
      dto.unite !== undefined
        ? dto.unite?.trim() || undefined
        : articlePricing.unite ?? existing?.unite;

    return {
      articleId: articlePricing.articleId,
      prixUnitaire,
      quantite,
      montant,
      designation,
      unite,
    };
  }

  async createOrder(dto: CreateClientOrderDto, actor?: AuditActor): Promise<ClientOrder> {
    if (dto.clientId) await this.assertClient(dto.clientId);
    const clientNom = dto.clientId ? undefined : dto.clientNom?.trim() || 'Client comptoir';
    const clientTelephone = dto.clientId ? undefined : dto.clientTelephone?.trim() || undefined;
    const clientAdresse = dto.clientId ? undefined : dto.clientAdresse?.trim() || undefined;
    const built = await this.buildOrderPayloadAsync(dto);
    const designation = (dto.designation?.trim() || built.designation || '').trim();
    if (!designation) {
      throw new BadRequestException('La désignation de la commande est obligatoire.');
    }
    const row = this.orderRepo.create({
      id: uuidv4(),
      clientId: dto.clientId,
      clientNom,
      clientTelephone,
      clientAdresse,
      articleId: built.articleId,
      reference: dto.reference?.trim() || undefined,
      designation,
      destination: dto.destination?.trim() || undefined,
      montant: built.montant,
      prixUnitaire: built.prixUnitaire,
      quantite: built.quantite,
      unite: built.unite,
      statut: dto.statut ?? 'confirmee',
      dateCommande: dto.dateCommande,
      dateLivraisonSouhaitee: dto.dateLivraisonSouhaitee || undefined,
      notes: dto.notes?.trim() || undefined,
    });
    const saved = await this.orderRepo.save(row);
    await this.ensureOrderInvoice(
      saved,
      {
        montantPaye: dto.montantPaye,
        datePaiement: dto.datePaiement,
      },
      actor,
    );
    const result = await this.findOrder(saved.id);
    await this.auditLogsService.log({
      module: 'client-orders',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Commande client ${result.reference ?? result.designation} (${Number(result.montant ?? 0).toLocaleString('fr-FR')} FCFA)`,
      afterData: result as unknown as Record<string, unknown>,
      actor,
    });
    return result;
  }

  async findOrders(query?: QueryClientOrdersDto): Promise<ClientOrder[]> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.client', 'client')
      .leftJoinAndSelect('o.deliveries', 'deliveries')
      .orderBy('o.dateCommande', 'DESC');
    if (query?.clientId) {
      qb.andWhere('o.clientId = :clientId', { clientId: query.clientId });
    } else if (query?.walkIn === 'true') {
      qb.andWhere('o.clientId IS NULL');
    }
    return qb.getMany();
  }

  async findOrder(id: string): Promise<ClientOrder> {
    const row = await this.orderRepo.findOne({
      where: { id },
      relations: ['client', 'deliveries', 'deliveries.chauffeur', 'deliveries.tracteur'],
    });
    if (!row) throw new NotFoundException(`Commande ${id} introuvable.`);
    return row;
  }

  async updateOrder(
    id: string,
    dto: UpdateClientOrderDto,
    actor?: AuditActor,
  ): Promise<ClientOrder> {
    const existing = await this.findOrder(id);
    if (existing.statut === 'livree' || existing.statut === 'annulee') {
      throw new BadRequestException(
        'Une commande livrée ou annulée ne peut plus être modifiée.',
      );
    }
    if (dto.clientId !== undefined && dto.clientId) await this.assertClient(dto.clientId);

    const built = await this.buildOrderPayloadAsync(dto, existing);
    const patch: Partial<ClientOrder> = {};

    if (dto.clientId !== undefined) patch.clientId = dto.clientId;
    if (dto.clientNom !== undefined && !dto.clientId) {
      patch.clientNom = dto.clientNom.trim() || 'Client comptoir';
    }
    if (dto.clientTelephone !== undefined && !dto.clientId) {
      patch.clientTelephone = dto.clientTelephone.trim() || undefined;
    }
    if (dto.clientAdresse !== undefined && !dto.clientId) {
      patch.clientAdresse = dto.clientAdresse.trim() || undefined;
    }
    if (dto.articleId !== undefined || built.articleId !== undefined) {
      patch.articleId = built.articleId;
    }
    if (dto.reference !== undefined) patch.reference = dto.reference.trim() || undefined;
    if (dto.designation !== undefined || built.designation) {
      const d = (dto.designation?.trim() || built.designation || existing.designation).trim();
      if (!d) throw new BadRequestException('La désignation ne peut pas être vide.');
      patch.designation = d;
    }
    if (dto.destination !== undefined) patch.destination = dto.destination.trim() || undefined;
    if (
      dto.montant !== undefined ||
      dto.quantite !== undefined ||
      dto.prixUnitaire !== undefined ||
      dto.articleId !== undefined
    ) {
      patch.montant = built.montant;
      patch.prixUnitaire = built.prixUnitaire;
      patch.quantite = built.quantite;
    }
    if (dto.unite !== undefined || built.unite) patch.unite = built.unite;
    if (dto.statut !== undefined) patch.statut = dto.statut;
    if (dto.dateCommande !== undefined) patch.dateCommande = dto.dateCommande;
    if (dto.dateLivraisonSouhaitee !== undefined) {
      patch.dateLivraisonSouhaitee = dto.dateLivraisonSouhaitee || undefined;
    }
    if (dto.notes !== undefined) patch.notes = dto.notes.trim() || undefined;

    await this.orderRepo.update(id, patch);
    if (
      (dto.clientId !== undefined && dto.clientId !== existing.clientId) ||
      (dto.clientNom !== undefined && dto.clientNom !== existing.clientNom) ||
      (dto.clientTelephone !== undefined && dto.clientTelephone !== existing.clientTelephone) ||
      (dto.clientAdresse !== undefined && dto.clientAdresse !== existing.clientAdresse)
    ) {
      const nextClientId = dto.clientId !== undefined ? dto.clientId : existing.clientId;
      const nextClientNom =
        dto.clientNom !== undefined ? dto.clientNom.trim() || 'Client comptoir' : existing.clientNom;
      const nextClientTelephone =
        dto.clientTelephone !== undefined
          ? dto.clientTelephone.trim() || undefined
          : existing.clientTelephone;
      const nextClientAdresse =
        dto.clientAdresse !== undefined
          ? dto.clientAdresse.trim() || undefined
          : existing.clientAdresse;
      await this.deliveryRepo.update(
        { clientOrderId: id },
        {
          clientId: nextClientId || undefined,
          clientNom: nextClientId ? undefined : nextClientNom || 'Client comptoir',
          clientTelephone: nextClientId ? undefined : nextClientTelephone,
          clientAdresse: nextClientId ? undefined : nextClientAdresse,
        },
      );
    }

    const updated = await this.findOrder(id);
    const payment =
      dto.montantPaye !== undefined
        ? {
            montantPaye: dto.montantPaye,
            datePaiement: dto.datePaiement,
          }
        : undefined;
    await this.ensureOrderInvoice(updated, payment, actor);
    await this.auditLogsService.log({
      module: 'client-orders',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification commande ${updated.reference ?? updated.designation}`,
      beforeData: existing as unknown as Record<string, unknown>,
      afterData: updated as unknown as Record<string, unknown>,
      actor,
    });
    return updated;
  }

  async removeOrder(id: string, actor?: AuditActor): Promise<void> {
    const existing = await this.findOrder(id);
    let linkedInvoice = existing.invoiceId
      ? await this.invoiceRepo.findOne({ where: { id: existing.invoiceId } })
      : null;
    if (!linkedInvoice) {
      linkedInvoice = await this.invoiceRepo.findOne({ where: { clientOrderId: id } });
    }
    if (linkedInvoice) {
      throw new BadRequestException(
        'Impossible de supprimer : une facture est liée à cette commande. Annulez la commande ou retirez la facture d’abord.',
      );
    }
    await this.loadingAssignmentRepo.delete({ clientOrderId: id });
    await this.orderRepo.delete(id);
    await this.auditLogsService.log({
      module: 'client-orders',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression commande ${existing.reference ?? existing.designation}`,
      beforeData: existing as unknown as Record<string, unknown>,
      actor,
    });
  }

  async createDelivery(dto: CreateClientDeliveryDto, actor?: AuditActor): Promise<ClientDelivery> {
    const order = await this.findOrder(dto.clientOrderId);
    if (order.statut === 'annulee') {
      throw new BadRequestException('Impossible d’ajouter une livraison à une commande annulée.');
    }
    const lieu = dto.lieuLivraison.trim();
    if (!lieu) throw new BadRequestException('Le lieu de livraison est obligatoire.');
    const statut: ClientDeliveryStatus = dto.statut ?? 'planifiee';
    const modeSortie = dto.modeSortie ?? 'livraison_directe';
    const transportFactureParFournisseur =
      modeSortie !== 'retrait_hub' && dto.transportFactureParFournisseur === true;
    if (transportFactureParFournisseur) {
      await this.assertTransportFournisseur(dto.transportFournisseurId);
    }
    const row = this.deliveryRepo.create({
      id: uuidv4(),
      clientOrderId: order.id,
      clientId: order.clientId,
      clientNom: order.clientNom,
      clientTelephone: order.clientTelephone,
      clientAdresse: order.clientAdresse,
      lieuLivraison: lieu,
      modeSortie,
      statut,
      datePrevue: dto.datePrevue || undefined,
      dateLivraison:
        statut === 'livree' ? dto.dateLivraison || dto.datePrevue || undefined : dto.dateLivraison,
      chauffeurId:
        modeSortie === 'retrait_hub' ? undefined : dto.chauffeurId || undefined,
      tracteurId: modeSortie === 'retrait_hub' ? undefined : dto.tracteurId || undefined,
      montantTransport:
        modeSortie === 'retrait_hub'
          ? undefined
          : dto.montantTransport != null
            ? Number(dto.montantTransport)
            : undefined,
      transportFactureParFournisseur,
      transportFournisseurId: transportFactureParFournisseur
        ? dto.transportFournisseurId || undefined
        : undefined,
      notes: dto.notes?.trim() || undefined,
    });
    this.assertTransportBilling(row);
    const saved = await this.deliveryRepo.save(row);
    await this.syncOrderStatusFromDeliveries(order.id);
    const freshOrder = await this.findOrder(order.id);
    await this.syncOrderInvoiceFromDeliveries(freshOrder, actor);
    const result = await this.findDelivery(saved.id);
    await this.auditLogsService.log({
      module: 'client-deliveries',
      action: 'CREATE',
      entityId: saved.id,
      summary: `Livraison ${result.lieuLivraison} (commande ${order.reference ?? order.designation})`,
      afterData: result as unknown as Record<string, unknown>,
      actor,
    });
    return result;
  }

  async findDeliveries(query?: QueryClientDeliveriesDto): Promise<ClientDelivery[]> {
    const qb = this.deliveryRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.order', 'order')
      .leftJoinAndSelect('d.client', 'client')
      .leftJoinAndSelect('d.chauffeur', 'chauffeur')
      .leftJoinAndSelect('d.tracteur', 'tracteur')
      .leftJoinAndSelect('d.transportFournisseur', 'transportFournisseur')
      .orderBy('d.datePrevue', 'DESC')
      .addOrderBy('d.id', 'DESC');
    if (query?.clientId) {
      qb.andWhere('d.clientId = :clientId', { clientId: query.clientId });
    } else if (query?.walkIn === 'true') {
      qb.andWhere('d.clientId IS NULL');
    }
    if (query?.clientOrderId) {
      qb.andWhere('d.clientOrderId = :clientOrderId', {
        clientOrderId: query.clientOrderId,
      });
    }
    return qb.getMany();
  }

  async findDelivery(id: string): Promise<ClientDelivery> {
    const row = await this.deliveryRepo.findOne({
      where: { id },
      relations: ['order', 'client', 'chauffeur', 'tracteur', 'transportFournisseur'],
    });
    if (!row) throw new NotFoundException(`Livraison ${id} introuvable.`);
    return row;
  }

  async updateDelivery(
    id: string,
    dto: UpdateClientDeliveryDto,
    actor?: AuditActor,
  ): Promise<ClientDelivery> {
    const existing = await this.findDelivery(id);
    const patch: Partial<ClientDelivery> = {};
    if (dto.clientOrderId !== undefined && dto.clientOrderId !== existing.clientOrderId) {
      const order = await this.findOrder(dto.clientOrderId);
      patch.clientOrderId = order.id;
      patch.clientId = order.clientId;
      patch.clientNom = order.clientNom;
      patch.clientTelephone = order.clientTelephone;
      patch.clientAdresse = order.clientAdresse;
    }
    if (dto.lieuLivraison !== undefined) {
      const l = dto.lieuLivraison.trim();
      if (!l) throw new BadRequestException('Le lieu de livraison ne peut pas être vide.');
      patch.lieuLivraison = l;
    }
    if (dto.modeSortie !== undefined) patch.modeSortie = dto.modeSortie;
    if (dto.statut !== undefined) patch.statut = dto.statut;
    if (dto.datePrevue !== undefined) patch.datePrevue = dto.datePrevue || undefined;
    if (dto.dateLivraison !== undefined) patch.dateLivraison = dto.dateLivraison || undefined;
    if (dto.chauffeurId !== undefined) patch.chauffeurId = dto.chauffeurId || undefined;
    if (dto.tracteurId !== undefined) patch.tracteurId = dto.tracteurId || undefined;
    if (dto.transportFactureParFournisseur !== undefined) {
      patch.transportFactureParFournisseur = dto.transportFactureParFournisseur === true;
    }
    if (dto.transportFournisseurId !== undefined) {
      patch.transportFournisseurId = dto.transportFournisseurId || undefined;
    }
    if (dto.montantTransport !== undefined) {
      patch.montantTransport =
        dto.montantTransport != null ? Number(dto.montantTransport) : undefined;
    }
    if (dto.notes !== undefined) patch.notes = dto.notes.trim() || undefined;
    if (dto.transportFactureParFournisseur === true) {
      await this.assertTransportFournisseur(dto.transportFournisseurId ?? existing.transportFournisseurId);
    }
    if (dto.transportFactureParFournisseur === false) {
      patch.transportFournisseurId = undefined;
    }
    if (dto.statut === 'livree' && !patch.dateLivraison && !existing.dateLivraison) {
      patch.dateLivraison = new Date().toISOString().slice(0, 10);
    }
    const merged: ClientDelivery = { ...existing, ...patch };
    if (merged.modeSortie === 'retrait_hub') {
      patch.chauffeurId = undefined;
      patch.tracteurId = undefined;
      patch.montantTransport = undefined;
      patch.transportFactureParFournisseur = false;
      patch.transportFournisseurId = undefined;
      merged.chauffeurId = undefined;
      merged.tracteurId = undefined;
      merged.montantTransport = undefined;
      merged.transportFactureParFournisseur = false;
      merged.transportFournisseurId = undefined;
    }
    this.assertTransportBilling(merged);
    await this.deliveryRepo.update(id, patch);
    await this.syncOrderStatusFromDeliveries(
      patch.clientOrderId ?? existing.clientOrderId,
    );
    const updated = await this.findDelivery(id);
    const order = await this.findOrder(updated.clientOrderId);
    await this.syncOrderInvoiceFromDeliveries(order, actor);
    await this.auditLogsService.log({
      module: 'client-deliveries',
      action: 'UPDATE',
      entityId: id,
      summary: `Modification livraison ${updated.lieuLivraison}`,
      beforeData: existing as unknown as Record<string, unknown>,
      afterData: updated as unknown as Record<string, unknown>,
      actor,
    });
    return updated;
  }

  async removeDelivery(id: string, actor?: AuditActor): Promise<void> {
    const existing = await this.findDelivery(id);
    const orderId = existing.clientOrderId;
    await this.deliveryRepo.delete(id);
    await this.syncOrderStatusFromDeliveries(orderId);
    const order = await this.findOrder(orderId);
    await this.syncOrderInvoiceFromDeliveries(order, actor);
    await this.auditLogsService.log({
      module: 'client-deliveries',
      action: 'DELETE',
      entityId: id,
      summary: `Suppression livraison ${existing.lieuLivraison}`,
      beforeData: existing as unknown as Record<string, unknown>,
      actor,
    });
  }
}
