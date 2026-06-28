
import { Logger } from '@nestjs/common';
import {
  LinnworksApiClient,
  LinnworksStockItem,
  LinnworksStockLevel,
  LinnworksChannelListing,
  LinnworksSalesMetric,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import { ISkuRepository, UpsertProductInput, UpsertStockInput, UpsertChannelInput } from '../ports/outbound/sku-repository.port';

export interface SyncResult {
  status: 'COMPLETED' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  updatedSalesMetrics: number;
  syncedAt: string;
  durationMs: number;
}

type ChannelType = 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';

export function mapChannelSource(source: string, subSource?: string): ChannelType {
  const s = (source + ' ' + (subSource ?? '')).toUpperCase().trim();
  if (s.includes('AMAZON')) return 'AMAZON';
  if (s.includes('EBAY'))   return 'EBAY';
  if (s.includes('WALMART')) return 'WALMART';
  if (s.includes('SHOPIFY')) return 'SHOPIFY';
  if (s.includes('WEB') || s.includes('DANDU') || s.includes('BIGCOMMERCE') || s.includes('DISTINCT')) return 'WEBSITE';
  return 'OTHER';
}

export function extractCountryFromLocation(location: { LocationName: string; CountryName?: string }): string {
  if (location.CountryName) {
    // Map country name → ISO code
    const MAP: Record<string, string> = {
      'United Kingdom': 'GB', 'United States': 'US', 'Canada': 'CA',
      'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES',
      'Australia': 'AU', 'Japan': 'JP',
    };
    return MAP[location.CountryName] ?? location.CountryName.slice(0, 2).toUpperCase();
  }

  const name = location.LocationName.toUpperCase();
  if (name.includes('US') || name.includes('UNITED STATES') || name.includes('AMERICA')) return 'US';
  if (name.includes('FLORIDA') || name === 'DEFAULT') return 'US';
  if (name.includes('UK') || name.includes('UNITED KINGDOM') || name.includes('BRITAIN')) return 'GB';
  if (name.includes('CA') || name.includes('CANADA')) return 'CA';
  if (name.includes('DE') || name.includes('GERMANY')) return 'DE';
  if (name.includes('AU') || name.includes('AUSTRALIA')) return 'AU';
  return 'US';
}

export function extractCountryFromSubSource(subSource?: string | null): string | null {
  if (!subSource) return null;
  const value = subSource.toUpperCase();
  if (value === 'US' || value.includes('AMAZON.COM') || value.includes('USA') || value.endsWith('_US')) return 'US';
  if (value === 'CA' || value.includes('AMAZON.CA') || value.includes('CANADA')) return 'CA';
  if (value === 'GB' || value === 'UK' || value.includes('AMAZON.CO.UK') || value.endsWith('_UK')) return 'GB';
  if (/^[A-Z]{2}$/.test(value)) return value;
  return null;
}

export function normalizeCountry(country?: string | null): string | null {
  if (!country) return null;
  const value = country.trim();
  const upper = value.toUpperCase();
  const MAP: Record<string, string> = {
    'UNITED STATES': 'US',
    USA: 'US',
    US: 'US',
    CANADA: 'CA',
    CA: 'CA',
    'UNITED KINGDOM': 'GB',
    UK: 'GB',
    GB: 'GB',
  };
  return MAP[upper] ?? (upper.length === 2 ? upper : upper.slice(0, 2));
}

export function mapLocationType(location: { IsFulfillmentCenter: boolean; LocationName: string }): 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY' {
  const name = location.LocationName.toUpperCase();
  if (location.IsFulfillmentCenter || name.includes('FBA') || name.includes('AMAZON')) return 'FBA';
  if (name.includes('3PL') || name.includes('THIRD')) return 'THIRD_PARTY';
  if (name.includes('WHOLESALE')) return 'WAREHOUSE';
  if (name.includes('FBM') || name.includes('MFN') || name === 'DEFAULT' || name.includes('FLORIDA')) return 'FBM';
  return 'WAREHOUSE';
}

export function findChannelPrice(
  prices: LinnworksStockItem['ItemChannelPrices'] | undefined,
  source: string,
  subSource?: string,
): number | null {
  if (!prices?.length) return null;

  const normalizedSource = source.toUpperCase();
  const normalizedSubSource = subSource?.toUpperCase();
  const candidates = prices.filter((price) => price.Source.toUpperCase() === normalizedSource);
  const exact = candidates.find(
    (price) => price.SubSource?.toUpperCase() === normalizedSubSource,
  );
  if (exact?.Price != null) return exact.Price;

  const fuzzy = candidates.find((price) => {
    const priceSubSource = price.SubSource?.toUpperCase() ?? '';
    return (
      Boolean(normalizedSubSource) &&
      (priceSubSource.includes(normalizedSubSource!) || normalizedSubSource!.includes(priceSubSource))
    );
  });
  if (fuzzy?.Price != null) return fuzzy.Price;

  return candidates.find((price) => price.Price != null)?.Price ?? null;
}

export function readExtendedProperty(item: LinnworksStockItem, names: string[]): string | null {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const properties = item.ItemExtendedProperties ?? item.ExtendedProperties ?? [];
  const match = properties.find((property) => {
    const name = (property.ProperyName ?? property.PropertyName ?? '').toLowerCase();
    return normalizedNames.includes(name);
  });
  return match?.PropertyValue ?? null;
}

export function parseNullableNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class LinnworksSyncService {
  private readonly logger = new Logger(LinnworksSyncService.name);

  constructor(
    private readonly linnworksClient: LinnworksApiClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async sync(): Promise<SyncResult> {
    const startedAt = Date.now();
    let updatedSkus = 0;
    let updatedStock = 0;
    let updatedListings = 0;
    let updatedSalesMetrics = 0;
    let failedRows = 0;

    this.logger.log('Linnworks sync started');

    try {
      // 1. Fetch all stock items (products)
      const stockItems: LinnworksStockItem[] = await this.linnworksClient.getAllStockItems();
      this.logger.log(`Fetched ${stockItems.length} stock items`);

      // Build index: stockItemId → sku
      const idToSku = new Map<string, string>();

      // 2. Upsert products
      for (const item of stockItems) {
        if (!item.ItemNumber) continue;
        idToSku.set(item.StockItemId, item.ItemNumber);

        const mainImage = item.Images?.find((img) => img.IsMain) ?? item.Images?.[0];

        const productInput: UpsertProductInput = {
          sku:      item.ItemNumber,
          title:    item.ItemTitle ?? item.ItemNumber,
          brand:    null,
          cost:     item.PurchasePrice ?? null,
          currency: 'USD',
          weight:   item.Weight ?? null,
          length:   item.Depth ?? null,
          width:    item.Width ?? null,
          height:   item.Height ?? null,
          imageUrl: mainImage?.Source ?? null,
          material: readExtendedProperty(item, ['Material', 'MaterialType', 'ProductMaterial']),
          thickness: readExtendedProperty(item, ['Thickness', 'ProductThickness', 'ThicknessGauge']),
          packQty: parseNullableNumber(readExtendedProperty(item, ['PackQty', 'Pack Qty', 'PackQuantity', 'QuantityPerPack'])),
        };

        try {
          await this.skuRepository.upsertProduct(productInput);
          updatedSkus++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert product ${item.ItemNumber}: ${(err as Error).message}`);
        }
      }

      // 3. Fetch and upsert stock levels
      const stockItemIds = [...idToSku.keys()];

      // Batch fetch stock levels
      const embeddedStockLevels = stockItems.flatMap((item) =>
        (item.StockLevels ?? []).map((level) => ({
          ...level,
          StockItemId: level.StockItemId ?? item.StockItemId,
        })),
      );

      const stockLevels: LinnworksStockLevel[] = embeddedStockLevels.length > 0
        ? embeddedStockLevels
        : await this.linnworksClient
            .getStockLevelsBulk(stockItemIds)
            .catch(async () => this.linnworksClient.getStockLevels(stockItemIds).catch(() => []));

      for (const level of stockLevels) {
        const sku = idToSku.get(level.StockItemId);
        if (!sku) continue;

        const stockInput: UpsertStockInput = {
          sku,
          country:     extractCountryFromLocation(level.Location),
          locationType: mapLocationType(level.Location),
          warehouse:   level.Location.LocationName,
          quantity:    level.StockLevel,
          reserved:    level.InOrders ?? level.InOrderBook ?? 0,
          inbound:     level.Due,
          available:   level.Available,
        };

        try {
          await this.skuRepository.upsertStock(stockInput);
          updatedStock++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert stock for ${sku}: ${(err as Error).message}`);
        }
      }

      // 4. Fetch and upsert channel listings
      const channelListings: LinnworksChannelListing[] = await this.linnworksClient
        .getAllChannelListings(stockItemIds)
        .catch(() => []);

      for (const listing of channelListings) {
        const sku = idToSku.get(listing.StockItemId) ?? listing.SKU;
        if (!sku) continue;

        const stockItem = stockItems.find((item) => item.StockItemId === listing.StockItemId);
        const channelPrice = findChannelPrice(stockItem?.ItemChannelPrices, listing.Source, listing.SubSource);

        const channelInput: UpsertChannelInput = {
          sku,
          channel:   mapChannelSource(listing.Source, listing.SubSource),
          country:   extractCountryFromSubSource(listing.SubSource),
          asin:      listing.ChannelReferenceId ?? null,
          listingId: listing.ListingId ?? listing.ChannelSKURowId ?? null,
          price:     listing.Price ?? channelPrice ?? stockItem?.RetailPrice ?? null,
          currency:  'USD',
          isActive:  true,
        };

        try {
          await this.skuRepository.upsertChannel(channelInput);
          updatedListings++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert listing for ${sku}: ${(err as Error).message}`);
        }
      }

      // 5. Fetch and upsert sales metrics from processed order details
      const salesMetrics: LinnworksSalesMetric[] = await this.linnworksClient
        .getSalesMetrics([7, 30, 90, 365])
        .catch((err) => {
          this.logger.warn(`Failed to fetch sales metrics: ${(err as Error).message}`);
          return [];
        });

      for (const metric of salesMetrics) {
        if (!metric.sku) continue;

        try {
          await this.skuRepository.upsertSalesMetric({
            sku: metric.sku,
            channel: mapChannelSource(metric.channelSource, metric.subSource),
            country: extractCountryFromSubSource(metric.subSource) ?? normalizeCountry(metric.country),
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
            unitsSold: metric.unitsSold,
            revenue: metric.revenue,
            currency: 'USD',
          });
          updatedSalesMetrics++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert sales metrics for ${metric.sku}: ${(err as Error).message}`);
        }
      }

      const durationMs = Date.now() - startedAt;

      // 6. Write sync log
      await this.skuRepository.createSyncLog({
        provider: 'linnworks',
        processedRows: updatedSkus,
        failedRows,
        status: failedRows === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        durationMs,
        metadata: { updatedSkus, updatedStock, updatedListings, updatedSalesMetrics },
      });

      this.logger.log(
        `Linnworks sync complete: ${updatedSkus} SKUs, ${updatedStock} stock lines, ${updatedListings} listings, ${updatedSalesMetrics} sales metrics — ${durationMs}ms`,
      );

      return {
        status: 'COMPLETED',
        updatedSkus,
        updatedStock,
        updatedListings,
        updatedSalesMetrics,
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error(`Linnworks sync failed: ${message}`);

      await this.skuRepository.createSyncLog({
        provider: 'linnworks',
        processedRows: updatedSkus,
        failedRows: failedRows + 1,
        status: 'FAILED',
        errorMessage: message,
        durationMs,
      }).catch(() => {}); // don't throw if log fails

      return {
        status: 'FAILED',
        updatedSkus,
        updatedStock,
        updatedListings,
        updatedSalesMetrics,
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    }
  }
}

import { Logger } from '@nestjs/common';
import {
  LinnworksApiClient,
  LinnworksStockItem,
  LinnworksStockLevel,
  LinnworksChannelListing,
  LinnworksSalesMetric,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import { ISkuRepository, UpsertProductInput, UpsertStockInput, UpsertChannelInput } from '../ports/outbound/sku-repository.port';

export interface SyncResult {
  status: 'COMPLETED' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  updatedSalesMetrics: number;
  syncedAt: string;
  durationMs: number;
}

type ChannelType = 'AMAZON' | 'EBAY' | 'WALMART' | 'SHOPIFY' | 'WEBSITE' | 'OTHER';

function mapChannelSource(source: string, subSource?: string): ChannelType {
  const s = (source + ' ' + (subSource ?? '')).toUpperCase().trim();
  if (s.includes('AMAZON')) return 'AMAZON';
  if (s.includes('EBAY'))   return 'EBAY';
  if (s.includes('WALMART')) return 'WALMART';
  if (s.includes('SHOPIFY')) return 'SHOPIFY';
  if (s.includes('WEB') || s.includes('DANDU') || s.includes('BIGCOMMERCE') || s.includes('DISTINCT')) return 'WEBSITE';
  return 'OTHER';
}

function extractCountryFromLocation(location: { LocationName: string; CountryName?: string }): string {
  if (location.CountryName) {
    // Map country name → ISO code
    const MAP: Record<string, string> = {
      'United Kingdom': 'GB', 'United States': 'US', 'Canada': 'CA',
      'Germany': 'DE', 'France': 'FR', 'Italy': 'IT', 'Spain': 'ES',
      'Australia': 'AU', 'Japan': 'JP',
    };
    return MAP[location.CountryName] ?? location.CountryName.slice(0, 2).toUpperCase();
  }

  const name = location.LocationName.toUpperCase();
  if (name.includes('US') || name.includes('UNITED STATES') || name.includes('AMERICA')) return 'US';
  if (name.includes('FLORIDA') || name === 'DEFAULT') return 'US';
  if (name.includes('UK') || name.includes('UNITED KINGDOM') || name.includes('BRITAIN')) return 'GB';
  if (name.includes('CA') || name.includes('CANADA')) return 'CA';
  if (name.includes('DE') || name.includes('GERMANY')) return 'DE';
  if (name.includes('AU') || name.includes('AUSTRALIA')) return 'AU';
  return 'US';
}

function extractCountryFromSubSource(subSource?: string | null): string | null {
  if (!subSource) return null;
  const value = subSource.toUpperCase();
  if (value === 'US' || value.includes('AMAZON.COM') || value.includes('USA') || value.endsWith('_US')) return 'US';
  if (value === 'CA' || value.includes('AMAZON.CA') || value.includes('CANADA')) return 'CA';
  if (value === 'GB' || value === 'UK' || value.includes('AMAZON.CO.UK') || value.endsWith('_UK')) return 'GB';
  if (/^[A-Z]{2}$/.test(value)) return value;
  return null;
}

function normalizeCountry(country?: string | null): string | null {
  if (!country) return null;
  const value = country.trim();
  const upper = value.toUpperCase();
  const MAP: Record<string, string> = {
    'UNITED STATES': 'US',
    USA: 'US',
    US: 'US',
    CANADA: 'CA',
    CA: 'CA',
    'UNITED KINGDOM': 'GB',
    UK: 'GB',
    GB: 'GB',
  };
  return MAP[upper] ?? (upper.length === 2 ? upper : upper.slice(0, 2));
}

function mapLocationType(location: { IsFulfillmentCenter: boolean; LocationName: string }): 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY' {
  const name = location.LocationName.toUpperCase();
  if (location.IsFulfillmentCenter || name.includes('FBA') || name.includes('AMAZON')) return 'FBA';
  if (name.includes('3PL') || name.includes('THIRD')) return 'THIRD_PARTY';
  if (name.includes('WHOLESALE')) return 'WAREHOUSE';
  if (name.includes('FBM') || name.includes('MFN') || name === 'DEFAULT' || name.includes('FLORIDA')) return 'FBM';
  return 'WAREHOUSE';
}

function findChannelPrice(
  prices: LinnworksStockItem['ItemChannelPrices'] | undefined,
  source: string,
  subSource?: string,
): number | null {
  if (!prices?.length) return null;

  const normalizedSource = source.toUpperCase();
  const normalizedSubSource = subSource?.toUpperCase();
  const candidates = prices.filter((price) => price.Source.toUpperCase() === normalizedSource);
  const exact = candidates.find(
    (price) => price.SubSource?.toUpperCase() === normalizedSubSource,
  );
  if (exact?.Price != null) return exact.Price;

  const fuzzy = candidates.find((price) => {
    const priceSubSource = price.SubSource?.toUpperCase() ?? '';
    return (
      Boolean(normalizedSubSource) &&
      (priceSubSource.includes(normalizedSubSource!) || normalizedSubSource!.includes(priceSubSource))
    );
  });
  if (fuzzy?.Price != null) return fuzzy.Price;

  return candidates.find((price) => price.Price != null)?.Price ?? null;
}

function readExtendedProperty(item: LinnworksStockItem, names: string[]): string | null {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const properties = item.ItemExtendedProperties ?? item.ExtendedProperties ?? [];
  const match = properties.find((property) => {
    const name = (property.ProperyName ?? property.PropertyName ?? '').toLowerCase();
    return normalizedNames.includes(name);
  });
  return match?.PropertyValue ?? null;
}

function parseNullableNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class LinnworksSyncService {
  private readonly logger = new Logger(LinnworksSyncService.name);

  constructor(
    private readonly linnworksClient: LinnworksApiClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async sync(): Promise<SyncResult> {
    const startedAt = Date.now();
    let updatedSkus = 0;
    let updatedStock = 0;
    let updatedListings = 0;
    let updatedSalesMetrics = 0;
    let failedRows = 0;

    this.logger.log('Linnworks sync started');

    try {
      // 1. Fetch all stock items (products)
      const stockItems: LinnworksStockItem[] = await this.linnworksClient.getAllStockItems();
      this.logger.log(`Fetched ${stockItems.length} stock items`);

      // Build index: stockItemId → sku
      const idToSku = new Map<string, string>();

      // 2. Upsert products
      for (const item of stockItems) {
        if (!item.ItemNumber) continue;
        idToSku.set(item.StockItemId, item.ItemNumber);

        const mainImage = item.Images?.find((img) => img.IsMain) ?? item.Images?.[0];

        const productInput: UpsertProductInput = {
          sku:      item.ItemNumber,
          title:    item.ItemTitle ?? item.ItemNumber,
          brand:    null,
          cost:     item.PurchasePrice ?? null,
          currency: 'GBP',
          weight:   item.Weight != null ? item.Weight / 1000 : null, // Linnworks stores grams
          length:   item.Depth ?? null,
          width:    item.Width ?? null,
          height:   item.Height ?? null,
          imageUrl: mainImage?.Source ?? null,
          material: readExtendedProperty(item, ['Material', 'MaterialType', 'ProductMaterial']),
          thickness: readExtendedProperty(item, ['Thickness', 'ProductThickness', 'ThicknessGauge']),
          packQty: parseNullableNumber(readExtendedProperty(item, ['PackQty', 'Pack Qty', 'PackQuantity', 'QuantityPerPack'])),
        };

        try {
          await this.skuRepository.upsertProduct(productInput);
          updatedSkus++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert product ${item.ItemNumber}: ${(err as Error).message}`);
        }
      }

      // 3. Fetch and upsert stock levels
      const stockItemIds = [...idToSku.keys()];

      // Batch fetch stock levels
      const embeddedStockLevels = stockItems.flatMap((item) =>
        (item.StockLevels ?? []).map((level) => ({
          ...level,
          StockItemId: level.StockItemId ?? item.StockItemId,
        })),
      );

      const stockLevels: LinnworksStockLevel[] = embeddedStockLevels.length > 0
        ? embeddedStockLevels
        : await this.linnworksClient
            .getStockLevelsBulk(stockItemIds)
            .catch(async () => this.linnworksClient.getStockLevels(stockItemIds).catch(() => []));

      for (const level of stockLevels) {
        const sku = idToSku.get(level.StockItemId);
        if (!sku) continue;

        const stockInput: UpsertStockInput = {
          sku,
          country:     extractCountryFromLocation(level.Location),
          locationType: mapLocationType(level.Location),
          warehouse:   level.Location.LocationName,
          quantity:    level.StockLevel,
          reserved:    level.InOrders ?? level.InOrderBook ?? 0,
          inbound:     level.Due,
          available:   level.Available,
        };

        try {
          await this.skuRepository.upsertStock(stockInput);
          updatedStock++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert stock for ${sku}: ${(err as Error).message}`);
        }
      }

      // 4. Fetch and upsert channel listings
      const channelListings: LinnworksChannelListing[] = await this.linnworksClient
        .getAllChannelListings(stockItemIds)
        .catch(() => []);

      for (const listing of channelListings) {
        const sku = idToSku.get(listing.StockItemId) ?? listing.SKU;
        if (!sku) continue;

        const stockItem = stockItems.find((item) => item.StockItemId === listing.StockItemId);
        const channelPrice = findChannelPrice(stockItem?.ItemChannelPrices, listing.Source, listing.SubSource);

        const channelInput: UpsertChannelInput = {
          sku,
          channel:   mapChannelSource(listing.Source, listing.SubSource),
          country:   extractCountryFromSubSource(listing.SubSource),
          asin:      listing.ChannelReferenceId ?? null,
          listingId: listing.ListingId ?? listing.ChannelSKURowId ?? null,
          price:     listing.Price ?? channelPrice ?? stockItem?.RetailPrice ?? null,
          currency:  listing.CurrencyCode ?? 'GBP',
          isActive:  true,
        };

        try {
          await this.skuRepository.upsertChannel(channelInput);
          updatedListings++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert listing for ${sku}: ${(err as Error).message}`);
        }
      }

      // 5. Fetch and upsert sales metrics from processed order details
      const salesMetrics: LinnworksSalesMetric[] = await this.linnworksClient
        .getSalesMetrics([7, 30, 90, 365])
        .catch((err) => {
          this.logger.warn(`Failed to fetch sales metrics: ${(err as Error).message}`);
          return [];
        });

      for (const metric of salesMetrics) {
        if (!metric.sku) continue;

        try {
          await this.skuRepository.upsertSalesMetric({
            sku: metric.sku,
            channel: mapChannelSource(metric.channelSource, metric.subSource),
            country: extractCountryFromSubSource(metric.subSource) ?? normalizeCountry(metric.country),
            periodStart: metric.periodStart,
            periodEnd: metric.periodEnd,
            unitsSold: metric.unitsSold,
            revenue: metric.revenue,
            currency: metric.currency ?? 'GBP',
          });
          updatedSalesMetrics++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to upsert sales metrics for ${metric.sku}: ${(err as Error).message}`);
        }
      }

      const durationMs = Date.now() - startedAt;

      // 6. Write sync log
      await this.skuRepository.createSyncLog({
        provider: 'linnworks',
        processedRows: updatedSkus,
        failedRows,
        status: failedRows === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        durationMs,
        metadata: { updatedSkus, updatedStock, updatedListings, updatedSalesMetrics },
      });

      this.logger.log(
        `Linnworks sync complete: ${updatedSkus} SKUs, ${updatedStock} stock lines, ${updatedListings} listings, ${updatedSalesMetrics} sales metrics — ${durationMs}ms`,
      );

      return {
        status: 'COMPLETED',
        updatedSkus,
        updatedStock,
        updatedListings,
        updatedSalesMetrics,
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error(`Linnworks sync failed: ${message}`);

      await this.skuRepository.createSyncLog({
        provider: 'linnworks',
        processedRows: updatedSkus,
        failedRows: failedRows + 1,
        status: 'FAILED',
        errorMessage: message,
        durationMs,
      }).catch(() => {}); // don't throw if log fails

      return {
        status: 'FAILED',
        updatedSkus,
        updatedStock,
        updatedListings,
        updatedSalesMetrics,
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    }
  }
}

