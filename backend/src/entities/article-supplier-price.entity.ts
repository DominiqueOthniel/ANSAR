import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Article } from './article.entity';
import { ThirdParty } from './third-party.entity';

/** Prix unitaire forfaitaire d’un article chez un fournisseur (ex. ciment chez Dangote). */
@Entity('article_supplier_prices')
@Unique(['articleId', 'fournisseurId'])
export class ArticleSupplierPrice {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  articleId: string;

  @Column({ type: 'uuid' })
  fournisseurId: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  prixUnitaire: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  notes?: string;

  @ManyToOne(() => Article, (a) => a.supplierPrices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'articleId' })
  article?: Article;

  @ManyToOne(() => ThirdParty)
  @JoinColumn({ name: 'fournisseurId' })
  fournisseur?: ThirdParty;
}
