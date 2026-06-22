import {
  SalesChannelType,
  StockLocationType,
} from '../domain/models/product.domain';
import {
  ILinnworksClient,
  LinnworksChannelSku,
  LinnworksStockItem,
} from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';

export interface CatalogSyncResult {
  products: number;
  stockRows: number;
  channels: number;
}

interface LinnworksStockLocation {
  LocationName?: string;
  LocationTag?: string;
  IsFulfillmentCenter?: boolean;
  IsWarehouseManaged?: boolean;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export class SyncLinnworksCatalogService {
  constructor(
    private readonly linnworksClient: ILinnworksClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(): Promise<CatalogSyncResult> {
    const stockItems = await this.fetchAllStockItems();
    const channelSkuRows = await this.fetchChannelSkuRows(stockItems);
    const channelSkuRowsByStockId = new Map<string, LinnworksChannelSku[]>();

    for (const row of channelSkuRows) {
      if (!row.StockItemId) continue;
      const rows = channelSkuRowsByStockId.get(row.StockItemId) || [];
      rows.push(row);
      channelSkuRowsByStockId.set(row.StockItemId, rows);
    }

    const products = stockItems.map((item) => this.toProduct(item));
    const stock = stockItems.flatMap((item) => this.toStockRows(item));
    const channels = stockItems.flatMap((item) =>
      this.toChannelRows(item, channelSkuRowsByStockId.get(item.StockItemId || '') || []),
    );

    const productCount = await this.skuRepository.upsertProducts(products);
    const stockCount = await this.skuRepository.upsertStock(stock);
    const channelCount = await this.skuRepository.upsertChannels(channels);

    return {
      products: productCount,
      stockRows: stockCount,
      channels: channelCount,
    };
  }

  private async fetchAllStockItems(): Promise<LinnworksStockItem[]> {
    const items: LinnworksStockItem[] = [];

    for (let page = 1; page <= 1000; page += 1) {
      const pageItems = await this.linnworksClient.getStockItemsFull(page);
      if (!Array.isArray(pageItems) || pageItems.length === 0) break;
      items.push(...pageItems.filter((item) => item.ItemNumber));
    }

    return items;
  }

  private async fetchChannelSkuRows(
    stockItems: LinnworksStockItem[],
  ): Promise<LinnworksChannelSku[]> {
    const ids = stockItems
      .map((item) => item.StockItemId)
      .filter((id): id is string => Boolean(id));
    const rows: LinnworksChannelSku[] = [];

    for (const idBatch of chunk(ids, 100)) {
      const result = await this.linnworksClient.getChannelSkus(idBatch);
      if (Array.isArray(result)) rows.push(...result);
    }

    return rows;
  }

  private toProduct(item: LinnworksStockItem): UpsertProductInput {
    const mainImage =
      item.Images?.find((image) => image.IsMain) || item.Images?.[0] || null;

    return {
      sku: item.ItemNumber || '',
      title: item.ItemTitle || item.ItemNumber || 'Untitled Linnworks item',
      status: 'ACTIVE',
      cost: item.PurchasePrice ?? null,
      currency: 'USD',
      weight: item.Weight ?? null,
      length: item.Depth ?? null,
      width: item.Width ?? null,
      height: item.Height ?? null,
      imageUrl: mainImage?.FullSource || mainImage?.Source || null,
      lastSyncedAt: new Date(),
    };
  }

  private toStockRows(item: LinnworksStockItem): UpsertStockInput[] {
    const sku = item.ItemNumber || '';

    return (item.StockLevels || []).map((level) => {
      const location = level.Location;
      const locationName = location?.LocationName || location?.LocationTag || null;
      const reserved = level.InOrders ?? level.InOrderBook ?? 0;
      const quantity = level.StockLevel ?? 0;

      return {
        sku,
        country: this.inferCountry(locationName),
        locationType: this.inferLocationType(location),
        warehouse: locationName,
        quantity,
        reserved,
        inbound: level.Due ?? 0,
        available: level.Available ?? Math.max(0, quantity - reserved),
      };
    });
  }

  private toChannelRows(
    item: LinnworksStockItem,
    channelSkuRows: LinnworksChannelSku[],
  ): UpsertChannelInput[] {
    const rows = new Map<string, UpsertChannelInput>();
    const sku = item.ItemNumber || '';

    for (const price of item.ItemChannelPrices || []) {
      const channel = this.toSalesChannel(price.Source);
      const country = this.inferCountry(price.SubSource || price.Source || null);
      const key = `${channel}:${country}:price:${price.SubSource || ''}`;

      rows.set(key, {
        sku,
        channel,
        country,
        listingId: price.SubSource || null,
        price: price.Price ?? item.RetailPrice ?? null,
        currency: 'USD',
        isActive: true,
      });
    }

    for (const channelSku of channelSkuRows) {
      const channel = this.toSalesChannel(channelSku.Source);
      const country = this.inferCountry(
        channelSku.SubSource || channelSku.Source || null,
      );
      const listingId =
        channelSku.ChannelSKU || channelSku.SKU || channelSku.SubSource || null;
      const asin = channelSku.ASIN || this.inferAsin(listingId);
      const key = `${channel}:${country}:${asin || ''}:${listingId || ''}`;

      rows.set(key, {
        sku,
        channel,
        country,
        asin,
        listingId,
        currency: 'USD',
        isActive: true,
      });
    }

    return Array.from(rows.values());
  }

  private toSalesChannel(value?: string | null): SalesChannelType {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('AMAZON')) return 'AMAZON';
    if (normalized.includes('EBAY')) return 'EBAY';
    if (normalized.includes('WALMART')) return 'WALMART';
    if (normalized.includes('SHOPIFY')) return 'SHOPIFY';
    if (normalized.includes('DANDU') || normalized.includes('DISTINCT')) {
      return 'WEBSITE';
    }
    return 'OTHER';
  }

  private inferLocationType(location?: LinnworksStockLocation): StockLocationType {
    if (location?.IsFulfillmentCenter) return 'FBA';
    if (location?.IsWarehouseManaged) return 'WAREHOUSE';
    return 'FBM';
  }

  private inferCountry(value?: string | null): string {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('CA') || normalized.includes('CANADA')) return 'CA';
    if (normalized.includes('UK') || normalized.includes('GB')) return 'UK';
    if (normalized.includes('AU')) return 'AU';
    return 'US';
  }

  private inferAsin(value?: string | null): string | null {
    const match = (value || '').match(/\bB0[A-Z0-9]{8}\b/i);
    return match ? match[0].toUpperCase() : null;
  }
}
