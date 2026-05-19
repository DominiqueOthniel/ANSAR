import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { CreateArticleSupplierPriceDto } from './dto/create-article-supplier-price.dto';
import { UpdateArticleSupplierPriceDto } from './dto/update-article-supplier-price.dto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly service: ArticlesService) {}

  @Post()
  create(@Body() dto: CreateArticleDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post(':articleId/supplier-prices')
  createSupplierPrice(
    @Param('articleId', ParseUUIDPipe) articleId: string,
    @Body() dto: CreateArticleSupplierPriceDto,
  ) {
    return this.service.createSupplierPrice(articleId, dto);
  }

  @Patch('supplier-prices/:priceId')
  updateSupplierPrice(
    @Param('priceId', ParseUUIDPipe) priceId: string,
    @Body() dto: UpdateArticleSupplierPriceDto,
  ) {
    return this.service.updateSupplierPrice(priceId, dto);
  }

  @Delete('supplier-prices/:priceId')
  @HttpCode(204)
  async removeSupplierPrice(@Param('priceId', ParseUUIDPipe) priceId: string): Promise<void> {
    await this.service.removeSupplierPrice(priceId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
