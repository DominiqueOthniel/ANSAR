import { Entity, PrimaryColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { SupplierLoading } from './supplier-loading.entity';
import { ClientOrder } from './client-order.entity';

/** Affectation d’un bon de chargement à une commande client. */
@Entity('supplier_loading_assignments')
export class SupplierLoadingAssignment {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loadingId: string;

  @Column({ type: 'uuid' })
  clientOrderId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quantiteAffectee?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => SupplierLoading, (l) => l.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loadingId' })
  loading?: SupplierLoading;

  @ManyToOne(() => ClientOrder)
  @JoinColumn({ name: 'clientOrderId' })
  clientOrder?: ClientOrder;
}
