import { BrowseSkusQuery, ISkuRepository } from '../ports/outbound/sku-repository.port';

export class BrowseSkusService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(query: Omit<BrowseSkusQuery, 'limit'> & { limit?: number }) {
    return this.skuRepository.browseSkus({
      ...query,
      stockStatus: query.stockStatus || 'ALL',
      channel: query.channel || 'ALL',
      limit: query.limit || 20,
    });
  }
}

