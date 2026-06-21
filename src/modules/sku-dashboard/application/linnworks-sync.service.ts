import { Logger } from '@nestjs/common';
import {
  LinnworksApiClient,
  LinnworksStockItem,
  LinnworksStockLevel,
  LinnworksChannelListing,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import { ISkuRepository, UpsertProductInput, UpsertStockInput, UpsertChannelInput } from '../ports/outbound/sku-repository.port';

export interface SyncResult {
  status: 'COMPLETED' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
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
  if (s.includes('WEB') || s.includes('DANDU')) return 'WEBSITE';
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
  if (name.includes('UK') || name.includes('UNITED KINGDOM') || name.includes('BRITAIN')) return 'GB';
  if (name.includes('CA') || name.includes('CANADA')) return 'CA';
  if (name.includes('DE') || name.includes('GERMANY')) return 'DE';
  if (name.includes('AU') || name.includes('AUSTRALIA')) return 'AU';
  return 'GB'; // sensible default for UK-based sellers
}

function mapLocationType(location: { IsFulfillmentCenter: boolean; LocationName: string }): 'FBA' | 'FBM' | 'WAREHOUSE' | 'THIRD_PARTY' {
  const name = location.LocationName.toUpperCase();
  if (location.IsFulfillmentCenter || name.includes('FBA') || name.includes('AMAZON')) return 'FBA';
  if (name.includes('3PL') || name.includes('THIRD')) return 'THIRD_PARTY';
  if (name.includes('FBM')) return 'FBM';
  return 'WAREHOUSE';
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
      const stockLevels: LinnworksStockLevel[] = await this.linnworksClient
        .getStockLevelsBulk(stockItemIds)
        .catch(async () => {
          // Fallback: fetch one by one
          const all: LinnworksStockLevel[] = [];
          for (const id of stockItemIds) {
            const levels = await this.linnworksClient.getStockLevels([id]).catch(() => []);
            all.push(...levels);
          }
          return all;
        });

      for (const level of stockLevels) {
        const sku = idToSku.get(level.StockItemId);
        if (!sku) continue;

        const stockInput: UpsertStockInput = {
          sku,
          country:     extractCountryFromLocation(level.Location),
          locationType: mapLocationType(level.Location),
          warehouse:   level.Location.LocationName,
          quantity:    level.StockLevel,
          reserved:    level.InOrders,
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

        const channelInput: UpsertChannelInput = {
          sku,
          channel:   mapChannelSource(listing.Source, listing.SubSource),
          country:   listing.SubSource?.length === 2 ? listing.SubSource.toUpperCase() : null,
          asin:      listing.ChannelReferenceId ?? null,
          listingId: listing.ListingId ?? null,
          price:     listing.Price ?? null,
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

      const durationMs = Date.now() - startedAt;

      // 5. Write sync log
      await this.skuRepository.createSyncLog({
        provider: 'linnworks',
        processedRows: updatedSkus,
        failedRows,
        status: failedRows === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        durationMs,
        metadata: { updatedSkus, updatedStock, updatedListings },
      });

      this.logger.log(
        `Linnworks sync complete: ${updatedSkus} SKUs, ${updatedStock} stock lines, ${updatedListings} listings — ${durationMs}ms`,
      );

      return {
        status: 'COMPLETED',
        updatedSkus,
        updatedStock,
        updatedListings,
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
        syncedAt: new Date().toISOString(),
        durationMs,
      };
    }
  }
}
