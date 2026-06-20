import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SKU_REPOSITORY_TOKEN,
} from '../ports/outbound/sku-repository.port';
import type { ISkuRepository } from '../ports/outbound/sku-repository.port';
import { UpdateProductDto } from '../dto/update-product.dto';

@Injectable()
export class UpdateProductService {
  constructor(
    @Inject(SKU_REPOSITORY_TOKEN)
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(sku: string, dto: UpdateProductDto): Promise<void> {
    const existing = await this.skuRepository.findMetricsBySku(sku);
    if (!existing) {
      throw new NotFoundException(`Product with SKU ${sku} not found`);
    }

    await this.skuRepository.updateProduct(sku, dto);
  }
}
