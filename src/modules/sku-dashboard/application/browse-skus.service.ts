import { ISkuRepository, SkuBrowseFilters, SkuBrowsePage } from '../ports/outbound/sku-repository.port';

export class BrowseSkusService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(filters: SkuBrowseFilters): Promise<SkuBrowsePage> {
    return this.skuRepository.browseSkus({
      q:           filters.q?.trim() || undefined,
      stockStatus: filters.stockStatus ?? 'ALL',
      channel:     filters.channel ?? 'ALL',
      cursor:      filters.cursor,
      limit:       filters.limit ?? 20,
    });
  }
}
