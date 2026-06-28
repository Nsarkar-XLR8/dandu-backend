import { Logger } from '@nestjs/common';
import {
  LinnworksApiClient,
  LinnworksChannelListing,
  LinnworksStockItem,
  LinnworksStockLevel,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';
import {
  extractCountryFromLocation,
  extractCountryFromSubSource,
  findChannelPrice,
  mapChannelSource,
  mapLocationType,
  parseNullableNumber,
  readExtendedProperty,
} from './linnworks-sync.service';

export interface InventoryRefreshResult {
  status: 'COMPLETED' | 'FAILED';
  remainingSkus: string[];
  remainingSkuCount: number;
  deletedSkus: number;
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  refreshedAt: string;
  durationMs: number;
  errorMessage?: string;
}

export class LinnworksInventoryRefreshService {
  private readonly logger = new Logger(LinnworksInventoryRefreshService.name);

  constructor(
    private readonly linnworksClient: LinnworksApiClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async refreshInventory(): Promise<InventoryRefreshResult> {
    const startedAt = Date.now();
    let updatedSkus = 0;
    let updatedStock = 0;
    let updatedListings = 0;
    let deletedSkus = 0;
    let failedRows = 0;

    this.logger.log('Linnworks inventory refresh started');

    try {
      const stockItems: LinnworksStockItem[] = await this.linnworksClient.getAllStockItems();
      const remainingSkus = [...new Set(stockItems.map((item) => item.ItemNumber).filter(Boolean))];
      const idToSku = new Map<string, string>();

      for (const item of stockItems) {
        if (!item.ItemNumber) continue;
        idToSku.set(item.StockItemId, item.ItemNumber);

        const mainImage = item.Images?.find((img) => img.IsMain) ?? item.Images?.[0];
        const productInput: UpsertProductInput = {
          sku: item.ItemNumber,
          title: item.ItemTitle ?? item.ItemNumber,
          brand: null,
          cost: item.PurchasePrice ?? null,
          currency: 'USD',
          weight: item.Weight ?? null,
          length: item.Depth ?? null,
          width: item.Width ?? null,
          height: item.Height ?? null,
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
          this.logger.warn(`Failed to refresh product ${item.ItemNumber}: ${(err as Error).message}`);
        }
      }

      const stockItemIds = [...idToSku.keys()];
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
          country: extractCountryFromLocation(level.Location),
          locationType: mapLocationType(level.Location),
          warehouse: level.Location.LocationName,
          quantity: level.StockLevel,
          reserved: level.InOrders ?? level.InOrderBook ?? 0,
          inbound: level.Due,
          available: level.Available,
        };

        try {
          await this.skuRepository.upsertStock(stockInput);
          updatedStock++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to refresh stock for ${sku}: ${(err as Error).message}`);
        }
      }

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
          channel: mapChannelSource(listing.Source, listing.SubSource),
          country: extractCountryFromSubSource(listing.SubSource),
          asin: listing.ChannelReferenceId ?? null,
          listingId: listing.ListingId ?? listing.ChannelSKURowId ?? null,
          price: listing.Price ?? channelPrice ?? stockItem?.RetailPrice ?? null,
          currency: 'USD',
          isActive: true,
        };

        try {
          await this.skuRepository.upsertChannel(channelInput);
          updatedListings++;
        } catch (err) {
          failedRows++;
          this.logger.warn(`Failed to refresh listing for ${sku}: ${(err as Error).message}`);
        }
      }

      const cleanup = await this.skuRepository.deleteProductsNotInSkus(remainingSkus);
      deletedSkus = cleanup.deleted;
      const durationMs = Date.now() - startedAt;

      await this.skuRepository.createSyncLog({
        provider: 'linnworks-refresh-inventory',
        processedRows: remainingSkus.length,
        failedRows,
        status: failedRows === 0 ? 'SUCCESS' : 'PARTIAL_SUCCESS',
        durationMs,
        metadata: { remainingSkuCount: remainingSkus.length, deletedSkus, updatedSkus, updatedStock, updatedListings },
      });

      this.logger.log(
        `Linnworks inventory refresh complete: ${remainingSkus.length} remaining SKUs, ${deletedSkus} deleted, ${durationMs}ms`,
      );

      return {
        status: 'COMPLETED',
        remainingSkus,
        remainingSkuCount: remainingSkus.length,
        deletedSkus,
        updatedSkus,
        updatedStock,
        updatedListings,
        refreshedAt: new Date().toISOString(),
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);

      this.logger.error(`Linnworks inventory refresh failed: ${message}`);
      await this.skuRepository.createSyncLog({
        provider: 'linnworks-refresh-inventory',
        processedRows: updatedSkus,
        failedRows: failedRows + 1,
        status: 'FAILED',
        errorMessage: message,
        durationMs,
      }).catch(() => {});

      return {
        status: 'FAILED',
        remainingSkus: [],
        remainingSkuCount: 0,
        deletedSkus,
        updatedSkus,
        updatedStock,
        updatedListings,
        refreshedAt: new Date().toISOString(),
        durationMs,
        errorMessage: message,
      };
    }
  }
}
