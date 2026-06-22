import AppError from '../../../common/errors/app.error';
import { ISkuRepository, UpsertProductInput } from '../ports/outbound/sku-repository.port';

export class UpdateProductService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(sku: string, fields: Partial<UpsertProductInput>): Promise<void> {
    const normalized = sku.trim();
    if (!normalized) throw AppError.badRequest('SKU is required');

    // Verify product exists first
    const existing = await this.skuRepository.findMetricsBySku(normalized);
    if (!existing) throw AppError.notFound(`SKU not found: ${normalized}`);

    await this.skuRepository.updateProduct(normalized, fields);
  }
}
