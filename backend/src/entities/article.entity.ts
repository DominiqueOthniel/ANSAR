import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { ArticleSupplierPrice } from './article-supplier-price.entity';

/** Article / produit du catalogue (ex. sac de ciment). */
@Entity('articles')
export class Article {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  libelle: string;

  @Column({ type: 'varchar', length: 64, default: 'unité' })
  unite: string;

  @Column({ type: 'boolean', default: true })
  actif: boolean;

  /** Prix de vente unitaire par défaut (commandes clients). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  prixVente?: number;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @OneToMany(() => ArticleSupplierPrice, (p) => p.article)
  supplierPrices?: ArticleSupplierPrice[];
}
