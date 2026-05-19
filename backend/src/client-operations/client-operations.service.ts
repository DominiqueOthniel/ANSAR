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
    const rows = await this.invoiceRepo.find();
    const count = rows.filter((i) => i.numero.startsWith(fullPrefix)).length;
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

  private async ensureOrderInvoice(
    order: ClientOrder,
    payment?: { montantPaye?: number; datePaiement?: string },
  ): Promise<void> {
    const montant = Number(order.montant ?? 0);
    if (montant <= 0) return;

    const libelle = order.designation;
    const notes = order.reference ? `Commande ${order.reference}` : undefined;
    const existing = await this.findOrderInvoice(order);
    const { montantPaye, statut, datePaiement } = this.resolveOrderPayment(
      montant,
      order,
      existing,
      payment,
    );

    if (existing) {
      await this.syncInvoiceAmount(existing.id, montant, {
        clientTierId: order.clientId,
        clientOrderId: order.id,
        factureClientLibelle: libelle,
        notes: notes ?? existing.notes,
        montantPaye,
        statut,
        datePaiement,
      });
      if (!order.invoiceId || order.invoiceId !== existing.id) {
        await this.orderRepo.update(order.id, { invoiceId: existing.id });
      }
      return;
    }

    const inv = this.invoiceRepo.create({
      id: uuidv4(),
      numero: await this.nextInvoiceNum('FAC-CMD'),
      clientOrderId: order.id,
      clientTierId: order.clientId,
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
    if (this.isTransportBilledBySupplier(delivery)) {
      if (!delivery.transportFournisseurId) {
        throw new BadRequestException('Indiquez le fournisseur qui vous facture le transport.');
      }
      if (this.deliveryTransportMontant(delivery) <= 0) {
        throw new BadRequestException(
          'Indiquez le montant transport refacturé au client (FAC-LIV) lorsque le fournisseur vous facture le transport.',
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

  /** Supprime la FAC-LIV lorsqu’il n’y a plus de montant transport à facturer au client. */
  private async clearDeliveryTransportInvoice(delivery: ClientDelivery): Promise<void> {
    if (!delivery.invoiceId) return;
    const inv = await this.invoiceRepo.findOne({ where: { id: delivery.invoiceId } });
    if (!inv || inv.clientDeliveryId !== delivery.id) return;
    await this.invoiceRepo.delete(delivery.invoiceId);
    await this.deliveryRepo.update(delivery.id, { invoiceId: undefined });
  }

  private buildTransportInvoiceNotes(delivery: ClientDelivery, order: ClientOrder): string {
    const parts = [
      `Transport — ${delivery.lieuLivraison}`,
      `Commande : ${order.designation}`,
    ];
    const fournisseur = delivery.transportFournisseur;
    if (fournisseur?.nom) {
      parts.push(`Transport fournisseur : ${fournisseur.nom}`);
    }
    const ch = delivery.chauffeur;
    const tr = delivery.tracteur;
    if (ch) parts.push(`Chauffeur : ${ch.prenom} ${ch.nom}`.trim());
    if (tr) parts.push(`Camion : ${tr.immatriculation}`);
    return parts.join(' · ');
  }

  /** Facture transport (FAC-LIV) distincte de la facture marchandise (FAC-CMD). */
  private async ensureDeliveryInvoice(
    delivery: ClientDelivery,
    order: ClientOrder,
  ): Promise<void> {
    const montant = this.deliveryTransportMontant(delivery);
    if (montant <= 0) {
      await this.clearDeliveryTransportInvoice(delivery);
      return;
    }
    const bySupplier = this.isTransportBilledBySupplier(delivery);
    if (!bySupplier && !this.hasTransportMission(delivery)) {
      await this.clearDeliveryTransportInvoice(delivery);
      return;
    }

    const full = await this.findDelivery(delivery.id);
    const libelle = `${order.designation} — transport`;
    const notes = this.buildTransportInvoiceNotes(full, order);
    const dateCreation = full.datePrevue ?? full.dateLivraison ?? order.dateCommande;

    if (full.invoiceId) {
      const inv = await this.invoiceRepo.findOne({ where: { id: full.invoiceId } });
      if (inv) {
        await this.syncInvoiceAmount(full.invoiceId, montant, {
          clientTierId: order.clientId,
          clientOrderId: order.id,
          clientDeliveryId: full.id,
          factureClientLibelle: libelle,
          notes,
        });
        return;
      }
    }

    const inv = this.invoiceRepo.create({
      id: uuidv4(),
      numero: await this.nextInvoiceNum('FAC-LIV'),
      clientOrderId: order.id,
      clientDeliveryId: full.id,
      clientTierId: order.clientId,
      statut: 'en_attente',
      montantHT: montant,
      montantHTApresRemise: montant,
      montantTTC: montant,
      montantPaye: 0,
      dateCreation,
      factureClientLibelle: libelle,
      notes,
    });
    const saved = await this.invoiceRepo.save(inv);
    await this.deliveryRepo.update(full.id, { invoiceId: saved.id });
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

  async createOrder(dto: CreateClientOrderDto): Promise<ClientOrder> {
    await this.assertClient(dto.clientId);
    const built = await this.buildOrderPayloadAsync(dto);
    const designation = (dto.designation?.trim() || built.designation || '').trim();
    if (!designation) {
      throw new BadRequestException('La désignation de la commande est obligatoire.');
    }
    const row = this.orderRepo.create({
      id: uuidv4(),
      clientId: dto.clientId,
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
    await this.ensureOrderInvoice(saved, {
      montantPaye: dto.montantPaye,
      datePaiement: dto.datePaiement,
    });
    return this.findOrder(saved.id);
  }

  async findOrders(query?: QueryClientOrdersDto): Promise<ClientOrder[]> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.client', 'client')
      .leftJoinAndSelect('o.deliveries', 'deliveries')
      .orderBy('o.dateCommande', 'DESC');
    if (query?.clientId) {
      qb.andWhere('o.clientId = :clientId', { clientId: query.clientId });
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

  async updateOrder(id: string, dto: UpdateClientOrderDto): Promise<ClientOrder> {
    const existing = await this.findOrder(id);
    if (existing.statut === 'livree' || existing.statut === 'annulee') {
      throw new BadRequestException(
        'Une commande livrée ou annulée ne peut plus être modifiée.',
      );
    }
    if (dto.clientId !== undefined) await this.assertClient(dto.clientId);

    const built = await this.buildOrderPayloadAsync(dto, existing);
    const patch: Partial<ClientOrder> = {};

    if (dto.clientId !== undefined) patch.clientId = dto.clientId;
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
    if (dto.clientId !== undefined && dto.clientId !== existing.clientId) {
      await this.deliveryRepo.update({ clientOrderId: id }, { clientId: dto.clientId });
    }

    const updated = await this.findOrder(id);
    const payment =
      dto.montantPaye !== undefined
        ? {
            montantPaye: dto.montantPaye,
            datePaiement: dto.datePaiement,
          }
        : undefined;
    await this.ensureOrderInvoice(updated, payment);
    return updated;
  }

  async removeOrder(id: string): Promise<void> {
    const existing = await this.findOrder(id);
    if (existing.statut === 'livree' || existing.statut === 'annulee') {
      throw new BadRequestException(
        'Une commande livrée ou annulée ne peut pas être supprimée.',
      );
    }
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
  }

  async createDelivery(dto: CreateClientDeliveryDto): Promise<ClientDelivery> {
    const order = await this.findOrder(dto.clientOrderId);
    if (order.statut === 'annulee') {
      throw new BadRequestException('Impossible d’ajouter une livraison à une commande annulée.');
    }
    const lieu = dto.lieuLivraison.trim();
    if (!lieu) throw new BadRequestException('Le lieu de livraison est obligatoire.');
    const statut: ClientDeliveryStatus = dto.statut ?? 'planifiee';
    const transportFactureParFournisseur = dto.transportFactureParFournisseur === true;
    if (transportFactureParFournisseur) {
      await this.assertTransportFournisseur(dto.transportFournisseurId);
    }
    const row = this.deliveryRepo.create({
      id: uuidv4(),
      clientOrderId: order.id,
      clientId: order.clientId,
      lieuLivraison: lieu,
      statut,
      datePrevue: dto.datePrevue || undefined,
      dateLivraison:
        statut === 'livree' ? dto.dateLivraison || dto.datePrevue || undefined : dto.dateLivraison,
      chauffeurId: dto.chauffeurId || undefined,
      tracteurId: dto.tracteurId || undefined,
      montantTransport:
        dto.montantTransport != null ? Number(dto.montantTransport) : undefined,
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
    await this.ensureOrderInvoice(freshOrder);
    await this.ensureDeliveryInvoice(saved, freshOrder);
    return this.findDelivery(saved.id);
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

  async updateDelivery(id: string, dto: UpdateClientDeliveryDto): Promise<ClientDelivery> {
    const existing = await this.findDelivery(id);
    const patch: Partial<ClientDelivery> = {};
    if (dto.clientOrderId !== undefined && dto.clientOrderId !== existing.clientOrderId) {
      const order = await this.findOrder(dto.clientOrderId);
      patch.clientOrderId = order.id;
      patch.clientId = order.clientId;
    }
    if (dto.lieuLivraison !== undefined) {
      const l = dto.lieuLivraison.trim();
      if (!l) throw new BadRequestException('Le lieu de livraison ne peut pas être vide.');
      patch.lieuLivraison = l;
    }
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
    this.assertTransportBilling(merged);
    await this.deliveryRepo.update(id, patch);
    await this.syncOrderStatusFromDeliveries(
      patch.clientOrderId ?? existing.clientOrderId,
    );
    const updated = await this.findDelivery(id);
    const order = await this.findOrder(updated.clientOrderId);
    await this.ensureOrderInvoice(order);
    await this.ensureDeliveryInvoice(updated, order);
    return updated;
  }

  async removeDelivery(id: string): Promise<void> {
    const existing = await this.findDelivery(id);
    await this.deliveryRepo.delete(id);
    await this.syncOrderStatusFromDeliveries(existing.clientOrderId);
  }
}
